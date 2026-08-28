using System.Text.Json;
using PtzBridge.NetSdk;
using PtzBridge.Nvr;
using PtzBridge.Sdk;
using PtzBridge.Streaming;
using PtzBridge.VirtualCamera;

namespace PtzBridge.Server
{
    /// <summary>
    /// Orquestra tudo que o canal de controle expõe: sessão com o equipamento, configuração,
    /// presets, PTZ (com watchdog) e os streams de vídeo.
    ///
    /// <para>É a única porta de entrada para o <see cref="INvrBackend"/>. As chamadas são
    /// serializadas por <c>_sdkGate</c> porque comandos chegam de várias threads de WebSocket
    /// ao mesmo tempo e o NetSDK não documenta reentrância.</para>
    /// </summary>
    internal sealed class NvrService : IDisposable
    {
        private readonly object _sdkGate = new();
        private readonly AppConfig _config = ConfigStore.Load();
        private readonly INvrBackend _backend;
        private readonly VideoHub _hub;
        private readonly PtzWatchdog _watchdog;
        private readonly VirtualCameraService _vcam;

        private NvrDeviceInfo _device;
        private volatile bool _connected;

        /// <summary>Evento a ser transmitido a todos os clientes de controle: nome + payload.</summary>
        public event Action<string, object> Event;

        public VideoHub Hub => _hub;

        public NvrService()
        {
            // Na v6 o caminho de baixa latência do NetSDK é obrigatório no Windows.
            // Falhas de carregamento são explícitas; nunca caímos silenciosamente em FFmpeg.
            _backend = new NvrClient();

            _hub = new VideoHub(_backend, () => _config);
            _watchdog = new PtzWatchdog(StopAxis);
            _vcam = new VirtualCameraService(_hub);

            // Os dois callbacks chegam em threads NATIVAS do SDK. Reentrar no SDK a partir
            // delas pode travar, então o trabalho pesado vai para o pool.
            _backend.Disconnected += () => Task.Run(() =>
            {
                _connected = false;
                _hub.SuspendAll();
                Raise("connection", new { state = "disconnected" });
            });

            _backend.Reconnected += () => Task.Run(() =>
            {
                _connected = true;
                _hub.ResumeAll();
                // Ligar a câmera com o NVR fora do ar deixa a assinatura pendente; é aqui que ela pega.
                _vcam.EnsureSubscribed();
                Raise("connection", new { state = "reconnected" });
            });

            _hub.FormatChanged += format => Raise("stream", Describe(format));
            _vcam.StateChanged += () => Raise("vcam", VcamStatus());
        }

        private void Raise(string name, object payload)
        {
            try { Event?.Invoke(name, payload); } catch { }
        }

        // ------------------------------------------------------------------
        // Configuração
        // ------------------------------------------------------------------

        /// <summary>Configuração sem a senha — ela nunca volta para o renderer.</summary>
        public object ConfigGet()
        {
            lock (_sdkGate)
                return new
                {
                    ip = _config.Ip,
                    port = _config.Port,
                    user = _config.User,
                    hasPassword = !string.IsNullOrEmpty(_config.PasswordProtected),
                    channel = _config.Channel,
                    presetCount = _config.PresetCount,
                    homePreset = _config.HomePreset,
                    ptzSpeed = _config.PtzSpeed,
                    maxVideoWidth = _config.MaxVideoWidth,
                    useSubStream = _config.UseSubStream,
                };
        }

        public object ConfigSet(JsonElement? p)
        {
            bool needsRelogin, needsStreamRestart;
            int channel;

            lock (_sdkGate)
            {
                var before = (_config.Ip, _config.Port, _config.User, _config.Password);
                var beforeStream = (_config.MaxVideoWidth, _config.UseSubStream);

                if (Params.Has(p, "ip")) _config.Ip = Params.Str(p, "ip", _config.Ip).Trim();
                if (Params.Has(p, "port")) _config.Port = Math.Clamp(Params.Int(p, "port", _config.Port), 1, 65535);
                if (Params.Has(p, "user")) _config.User = Params.Str(p, "user", _config.User).Trim();
                // Campo ausente preserva a senha salva; string vazia explícita a apaga.
                if (Params.Has(p, "password")) _config.Password = Params.Str(p, "password");
                if (Params.Has(p, "channel")) _config.Channel = Math.Max(1, Params.Int(p, "channel", _config.Channel));
                if (Params.Has(p, "presetCount")) _config.PresetCount = Math.Clamp(Params.Int(p, "presetCount", _config.PresetCount), 1, 255);
                if (Params.Has(p, "homePreset")) _config.HomePreset = Math.Max(1, Params.Int(p, "homePreset", _config.HomePreset));
                if (Params.Has(p, "ptzSpeed")) _config.PtzSpeed = Math.Clamp(Params.Int(p, "ptzSpeed", _config.PtzSpeed), 1, 8);
                if (Params.Has(p, "maxVideoWidth")) _config.MaxVideoWidth = Math.Clamp(Params.Int(p, "maxVideoWidth", _config.MaxVideoWidth), 160, 1920);
                if (Params.Has(p, "useSubStream")) _config.UseSubStream = Params.Bool(p, "useSubStream", _config.UseSubStream);

                ConfigStore.Save(_config);

                channel = _config.Channel;
                needsRelogin = _connected && before != (_config.Ip, _config.Port, _config.User, _config.Password);
                needsStreamRestart = !needsRelogin && beforeStream != (_config.MaxVideoWidth, _config.UseSubStream);
            }

            if (needsRelogin)
            {
                Disconnect();
                Connect();
            }
            else if (needsStreamRestart)
            {
                _hub.ReconfigureAll();
            }

            // A câmera virtual acompanha o canal ativo — é o canal que o operador está mirando.
            _vcam.Retarget(channel);

            return ConfigGet();
        }

        // ------------------------------------------------------------------
        // Sessão
        // ------------------------------------------------------------------

        public object Connect()
        {
            lock (_sdkGate)
            {
                if (!_config.IsComplete)
                    throw new InvalidOperationException("Configuração incompleta: informe IP, porta e usuário.");

                _device = _backend.Login(_config.Credentials);
                _connected = true;
            }

            _vcam.EnsureSubscribed();
            Raise("connection", new { state = "connected" });
            return Status();
        }

        public object Disconnect()
        {
            _hub.SuspendAll();
            lock (_sdkGate)
            {
                _backend.Logout();
                _connected = false;
                _device = null;
            }
            Raise("connection", new { state = "disconnected" });
            return Status();
        }

        public object Status()
        {
            lock (_sdkGate)
                return new
                {
                    connected = _connected,
                    serial = _device?.Serial ?? "",
                    channelCount = _device?.ChannelCount ?? 0,
                    deviceType = _device?.DeviceType ?? "",
                };
        }

        // ------------------------------------------------------------------
        // PTZ
        // ------------------------------------------------------------------

        public void PtzMove(JsonElement? p)
        {
            int channel = Channel(p);
            var dir = ParseDir(Params.Str(p, "dir"));
            bool stop = Params.Bool(p, "stop");
            Invoke(channel, PtzAxis.Move, stop, ch => _backend.PtzDirection(ch, dir, Speed(p), stop));
        }

        public void PtzZoom(JsonElement? p)
        {
            int channel = Channel(p);
            bool tele = Params.Bool(p, "tele");
            bool stop = Params.Bool(p, "stop");
            Invoke(channel, PtzAxis.Zoom, stop, ch => _backend.PtzZoom(ch, tele, Speed(p), stop));
        }

        public void PtzFocus(JsonElement? p)
        {
            int channel = Channel(p);
            bool far = Params.Bool(p, "far");
            bool stop = Params.Bool(p, "stop");
            Invoke(channel, PtzAxis.Focus, stop, ch => _backend.PtzFocus(ch, far, Speed(p), stop));
        }

        public void PtzIris(JsonElement? p)
        {
            int channel = Channel(p);
            bool open = Params.Bool(p, "open");
            bool stop = Params.Bool(p, "stop");
            Invoke(channel, PtzAxis.Iris, stop, ch => _backend.PtzIris(ch, open, Speed(p), stop));
        }

        public void PtzStopAll(JsonElement? p)
        {
            int channel = Channel(p);
            foreach (PtzAxis axis in Enum.GetValues<PtzAxis>())
                _watchdog.Disarm(channel, axis);

            lock (_sdkGate)
            {
                EnsureConnected();
                _backend.PtzStopAll(channel - 1);
            }
        }

        /// <summary>
        /// Executa o comando e sincroniza o watchdog: <c>stop:false</c> arma (ou renova) o
        /// prazo do eixo, <c>stop:true</c> desarma.
        /// </summary>
        private void Invoke(int channel, PtzAxis axis, bool stop, Action<int> command)
        {
            lock (_sdkGate)
            {
                EnsureConnected();
                command(channel - 1);
            }

            if (stop) _watchdog.Disarm(channel, axis);
            else _watchdog.Arm(channel, axis);
        }

        /// <summary>Parada de um eixo, chamada pelo watchdog e ao perder o cliente.</summary>
        private void StopAxis(int channel, PtzAxis axis)
        {
            lock (_sdkGate)
            {
                if (!_connected) return;
                int ch = channel - 1;
                switch (axis)
                {
                    case PtzAxis.Move: _backend.PtzDirection(ch, PtzDir.Up, 0, stop: true); break;
                    case PtzAxis.Zoom: _backend.PtzZoom(ch, true, 0, stop: true); break;
                    case PtzAxis.Focus: _backend.PtzFocus(ch, true, 0, stop: true); break;
                    case PtzAxis.Iris: _backend.PtzIris(ch, true, 0, stop: true); break;
                }
            }
        }

        /// <summary>
        /// Chamado quando um cliente de controle some. Tudo que estava pressionado é solto
        /// imediatamente, sem esperar o timeout do watchdog.
        /// </summary>
        public void ReleaseAllPtz()
        {
            foreach (var (channel, axis) in _watchdog.DrainAll())
            {
                try { StopAxis(channel, axis); } catch { }
            }
        }

        // ------------------------------------------------------------------
        // Presets
        // ------------------------------------------------------------------

        public void PresetGoto(JsonElement? p)
        {
            int channel = Channel(p), preset = Preset(p);
            lock (_sdkGate)
            {
                EnsureConnected();
                _backend.PtzGotoPreset(channel - 1, preset);
            }
        }

        public void PresetSet(JsonElement? p)
        {
            int channel = Channel(p), preset = Preset(p);
            lock (_sdkGate)
            {
                EnsureConnected();
                _backend.PtzSetPreset(channel - 1, preset);
            }
        }

        /// <summary>Apaga o preset NO EQUIPAMENTO, mais a miniatura local.</summary>
        public void PresetDelete(JsonElement? p)
        {
            int channel = Channel(p), preset = Preset(p);
            lock (_sdkGate)
            {
                EnsureConnected();
                _backend.PtzDeletePreset(channel - 1, preset);
            }

            try { File.Delete(ConfigStore.ThumbPath(channel, preset)); } catch { }
        }

        public object PresetList(JsonElement? p)
        {
            int channel = Channel(p);
            lock (_sdkGate)
            {
                var list = new List<object>(_config.PresetCount);
                for (int n = 1; n <= _config.PresetCount; n++)
                {
                    var thumb = new FileInfo(ConfigStore.ThumbPath(channel, n));
                    list.Add(new
                    {
                        n,
                        // 0 = sem miniatura. Quando existe, a marca de tempo entra na URL
                        // como ?v= — assim a URL só muda quando a imagem muda e o navegador
                        // pode cachear cada miniatura para sempre.
                        thumbRev = thumb.Exists ? thumb.LastWriteTimeUtc.Ticks : 0L,
                    });
                }
                return list;
            }
        }

        // ------------------------------------------------------------------
        // Vídeo
        // ------------------------------------------------------------------

        public object StreamInfo(JsonElement? p) => Describe(_hub.GetFormat(Channel(p)));

        private static object Describe(StreamFormat format) => new
        {
            channel = format.Channel,
            width = format.Width,
            height = format.Height,
            fps = format.Fps,
            // O que o decodificador informou. Pode não ser 16:9 (estes domos entregam
            // frames anamórficos) — o scaler estica a fonte inteira para o quadro 16:9.
            sourceWidth = format.SourceWidth,
            sourceHeight = format.SourceHeight,
        };

        // ------------------------------------------------------------------
        // Câmera virtual
        // ------------------------------------------------------------------

        /// <summary>
        /// Liga a "SC PTZ Virtual Cam" no canal informado (padrão: o canal ativo). Bloqueia
        /// enquanto a parte nativa cria o dispositivo — são centenas de milissegundos, e a
        /// resposta precisa dizer se deu certo.
        /// </summary>
        public object VcamStart(JsonElement? p)
        {
            _vcam.StartAsync(Channel(p)).GetAwaiter().GetResult();
            return VcamStatus();
        }

        public object VcamStop()
        {
            _vcam.StopAsync().GetAwaiter().GetResult();
            return VcamStatus();
        }

        public object VcamStatus() => new
        {
            supported = VirtualCameraService.IsSupported,
            name = VirtualCameraService.CameraName,
            running = _vcam.IsRunning,
            channel = _vcam.Channel,
            // Ligada, porém sem imagem do NVR: o que vai ao ar é o quadro "Sem sinal!".
            noSignal = _vcam.IsRunning && _vcam.NoSignal,
            error = _vcam.Error,
        };

        // ------------------------------------------------------------------

        private void EnsureConnected()
        {
            if (!_connected) throw new InvalidOperationException("Não conectado ao NVR.");
        }

        private int Channel(JsonElement? p)
        {
            int channel = Params.Int(p, "channel", _config.Channel);
            if (channel < 1) throw new ArgumentException($"Canal inválido: {channel}.");

            int max = _device?.ChannelCount ?? 0;
            if (max > 0 && channel > max)
                throw new ArgumentException($"Canal {channel} não existe (o dispositivo tem {max}).");

            return channel;
        }

        private static int Preset(JsonElement? p)
        {
            int preset = Params.Int(p, "preset");
            if (preset < 1) throw new ArgumentException($"Preset inválido: {preset}.");
            return preset;
        }

        private int Speed(JsonElement? p) => Math.Clamp(Params.Int(p, "speed", _config.PtzSpeed), 1, 8);

        private static PtzDir ParseDir(string dir) => dir?.ToLowerInvariant() switch
        {
            "up" => PtzDir.Up,
            "down" => PtzDir.Down,
            "left" => PtzDir.Left,
            "right" => PtzDir.Right,
            "upleft" => PtzDir.UpLeft,
            "upright" => PtzDir.UpRight,
            "downleft" => PtzDir.DownLeft,
            "downright" => PtzDir.DownRight,
            _ => throw new ArgumentException($"Direção desconhecida: '{dir}'."),
        };

        public void Dispose()
        {
            _watchdog.Dispose();
            _vcam.Dispose();   // antes do hub: segura uma assinatura de canal
            _hub.Dispose();
            _backend.Dispose();
        }
    }
}
