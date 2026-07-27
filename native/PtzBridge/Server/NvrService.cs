using System.Text.Json;
using PtzBridge.Sdk;
using PtzBridge.Streaming;

namespace PtzBridge.Server
{
    /// <summary>
    /// Orquestra tudo que o canal de controle expõe: sessão do SDK, configuração, presets,
    /// PTZ (com watchdog) e os streams de vídeo.
    ///
    /// <para>É a única porta de entrada para o <see cref="NvrClient"/>. As chamadas ao SDK
    /// são serializadas por <c>_sdkGate</c> porque comandos chegam de várias threads de
    /// WebSocket ao mesmo tempo e o NetSDK não documenta reentrância.</para>
    /// </summary>
    internal sealed class NvrService : IDisposable
    {
        private readonly object _sdkGate = new();
        private readonly NvrClient _client = new();
        private readonly AppConfig _config = ConfigStore.Load();
        private readonly VideoHub _hub;
        private readonly PtzWatchdog _watchdog;

        private NvrDeviceInfo _device;
        private volatile bool _connected;

        /// <summary>Evento a ser transmitido a todos os clientes de controle: nome + payload.</summary>
        public event Action<string, object> Event;

        public VideoHub Hub => _hub;

        public NvrService()
        {
            _hub = new VideoHub(_client, () => _config);
            _watchdog = new PtzWatchdog(StopAxis);

            // Os dois callbacks chegam em threads NATIVAS do SDK. Reentrar no SDK a partir
            // delas pode travar, então o trabalho pesado vai para o pool.
            _client.Disconnected += () => Task.Run(() =>
            {
                _connected = false;
                _hub.SuspendAll();
                Raise("connection", new { state = "disconnected" });
            });

            _client.Reconnected += () => Task.Run(() =>
            {
                _connected = true;
                _hub.ResumeAll();
                Raise("connection", new { state = "reconnected" });
            });

            _hub.FormatChanged += format => Raise("stream", Describe(format));
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
                _hub.ResumeAll();
            }

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

                _device = _client.Login(_config.Ip, (ushort)_config.Port, _config.User, _config.Password);
                _connected = true;
            }

            Raise("connection", new { state = "connected" });
            return Status();
        }

        public object Disconnect()
        {
            _hub.SuspendAll();
            lock (_sdkGate)
            {
                _client.Logout();
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
            Invoke(channel, PtzAxis.Move, stop, ch => _client.PtzDirection(ch, dir, Speed(p), stop));
        }

        public void PtzZoom(JsonElement? p)
        {
            int channel = Channel(p);
            bool tele = Params.Bool(p, "tele");
            bool stop = Params.Bool(p, "stop");
            Invoke(channel, PtzAxis.Zoom, stop, ch => _client.PtzZoom(ch, tele, Speed(p), stop));
        }

        public void PtzFocus(JsonElement? p)
        {
            int channel = Channel(p);
            bool far = Params.Bool(p, "far");
            bool stop = Params.Bool(p, "stop");
            Invoke(channel, PtzAxis.Focus, stop, ch => _client.PtzFocus(ch, far, Speed(p), stop));
        }

        public void PtzIris(JsonElement? p)
        {
            int channel = Channel(p);
            bool open = Params.Bool(p, "open");
            bool stop = Params.Bool(p, "stop");
            Invoke(channel, PtzAxis.Iris, stop, ch => _client.PtzIris(ch, open, Speed(p), stop));
        }

        public void PtzStopAll(JsonElement? p)
        {
            int channel = Channel(p);
            foreach (PtzAxis axis in Enum.GetValues<PtzAxis>())
                _watchdog.Disarm(channel, axis);

            lock (_sdkGate)
            {
                EnsureConnected();
                _client.PtzStopAll(channel - 1);
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
                    case PtzAxis.Move: _client.PtzDirection(ch, PtzDir.Up, 0, stop: true); break;
                    case PtzAxis.Zoom: _client.PtzZoom(ch, true, 0, stop: true); break;
                    case PtzAxis.Focus: _client.PtzFocus(ch, true, 0, stop: true); break;
                    case PtzAxis.Iris: _client.PtzIris(ch, true, 0, stop: true); break;
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
                _client.PtzGotoPreset(channel - 1, preset);
            }
        }

        public void PresetSet(JsonElement? p)
        {
            int channel = Channel(p), preset = Preset(p);
            lock (_sdkGate)
            {
                EnsureConnected();
                _client.PtzSetPreset(channel - 1, preset);
                if (Params.Has(p, "name"))
                {
                    _config.SetPresetName(channel, preset, Params.Str(p, "name"));
                    ConfigStore.Save(_config);
                }
            }
        }

        /// <summary>Apaga o preset NO EQUIPAMENTO, mais o nome e a miniatura locais.</summary>
        public void PresetDelete(JsonElement? p)
        {
            int channel = Channel(p), preset = Preset(p);
            lock (_sdkGate)
            {
                EnsureConnected();
                _client.PtzDeletePreset(channel - 1, preset);
                _config.SetPresetName(channel, preset, "");
                ConfigStore.Save(_config);
            }

            try { File.Delete(ConfigStore.ThumbPath(channel, preset)); } catch { }
        }

        public void PresetRename(JsonElement? p)
        {
            int channel = Channel(p), preset = Preset(p);
            lock (_sdkGate)
            {
                _config.SetPresetName(channel, preset, Params.Str(p, "name"));
                ConfigStore.Save(_config);
            }
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
                        name = _config.GetPresetName(channel, n),
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
            _hub.Dispose();
            _client.Dispose();
        }
    }
}
