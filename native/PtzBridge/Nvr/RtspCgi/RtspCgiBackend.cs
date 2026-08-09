using System.Text.RegularExpressions;

namespace PtzBridge.Nvr.RtspCgi
{
    /// <summary>
    /// Backend sem dependência proprietária: PTZ pela API HTTP CGI e vídeo por RTSP.
    ///
    /// <para>Existe porque o NetSDK é um binário fechado da Dahua que nem sempre está
    /// disponível para a plataforma — no Linux, em particular, ele precisa ser obtido à parte.
    /// Este caminho fala o que qualquer NVR Dahua/Intelbras já expõe de fábrica e depende
    /// apenas do <c>ffmpeg</c> instalado.</para>
    ///
    /// <para>O que se perde em relação ao NetSDK: o snapshot do equipamento (aqui as
    /// miniaturas continuam vindo do frame da tela, que é o caminho normal do app) e a
    /// reconexão automática do SDK. A queda de conexão é detectada por sondagem periódica —
    /// ver <see cref="OnHealthTick"/>.</para>
    /// </summary>
    internal sealed class RtspCgiBackend : INvrBackend
    {
        /// <summary>Intervalo da sondagem de saúde. Igual à cadência do keep-alive do SDK.</summary>
        private static readonly TimeSpan HealthPeriod = TimeSpan.FromSeconds(10);

        private readonly object _gate = new();

        private DahuaCgiClient _cgi;
        private NvrCredentials _credentials;
        private Timer _health;
        private volatile bool _loggedIn;
        private volatile bool _healthy;
        private bool _disposed;

        public event Action Disconnected;
        public event Action Reconnected;

        public bool IsLoggedIn => _loggedIn;

        public string Description => "RTSP + CGI";

        public NvrDeviceInfo Login(NvrCredentials credentials)
        {
            if (_loggedIn) Logout();

            if (!Ffmpeg.IsAvailable)
                throw new InvalidOperationException(Ffmpeg.MissingMessage);

            var cgi = new DahuaCgiClient(credentials.Ip, credentials.HttpPort, credentials.User, credentials.Password);

            NvrDeviceInfo info;
            try
            {
                // Primeira chamada autenticada: é ela que valida usuário e senha.
                var system = DahuaCgiClient.ParseKeyValues(
                    cgi.Get("/cgi-bin/magicBox.cgi?action=getSystemInfo"));

                info = new NvrDeviceInfo
                {
                    Serial = system.GetValueOrDefault("serialNumber", ""),
                    DeviceType = system.GetValueOrDefault("deviceType", ""),
                    ChannelCount = ReadChannelCount(cgi),
                };
            }
            catch
            {
                cgi.Dispose();
                throw;
            }

            lock (_gate)
            {
                _cgi = cgi;
                _credentials = credentials;
                _loggedIn = true;
                _healthy = true;
                _health = new Timer(OnHealthTick, null, HealthPeriod, HealthPeriod);
            }

            return info;
        }

        public void Logout()
        {
            Timer health;
            DahuaCgiClient cgi;

            lock (_gate)
            {
                _loggedIn = false;
                _healthy = false;
                health = _health;
                cgi = _cgi;
                _health = null;
                _cgi = null;
            }

            health?.Dispose();
            cgi?.Dispose();
        }

        public IChannelSource CreateStream(int channel, int maxWidth, bool preferSubStream)
        {
            var c = Credentials();
            return new FfmpegChannelStream(
                c.Ip, c.RtspPort, c.User, c.Password, channel, maxWidth, preferSubStream);
        }

        // ------------------------------------------------------------------
        // PTZ — /cgi-bin/ptz.cgi
        //
        // Contínuos são um par action=start / action=stop com o MESMO code, exatamente como
        // o apertar/soltar do NetSDK. O canal aqui é 1-BASED (o SDK é 0-based), por isso o
        // +1 em Command.
        // ------------------------------------------------------------------

        public void PtzDirection(int channel0, PtzDir dir, int speed, bool stop)
        {
            // Nas diagonais o equipamento espera arg1 = velocidade vertical e arg2 = horizontal;
            // nos eixos puros só arg2 é lido.
            var (code, vertical) = dir switch
            {
                PtzDir.Up => ("Up", 0),
                PtzDir.Down => ("Down", 0),
                PtzDir.Left => ("Left", 0),
                PtzDir.Right => ("Right", 0),
                PtzDir.UpLeft => ("LeftUp", speed),
                PtzDir.UpRight => ("RightUp", speed),
                PtzDir.DownLeft => ("LeftDown", speed),
                PtzDir.DownRight => ("RightDown", speed),
                _ => throw new ArgumentOutOfRangeException(nameof(dir)),
            };

            Command(channel0, code, vertical, speed, stop);
        }

        public void PtzZoom(int channel0, bool tele, int speed, bool stop)
            => Command(channel0, tele ? "ZoomTele" : "ZoomWide", 0, speed, stop);

        public void PtzFocus(int channel0, bool far, int speed, bool stop)
            => Command(channel0, far ? "FocusFar" : "FocusNear", 0, speed, stop);

        public void PtzIris(int channel0, bool open, int speed, bool stop)
            => Command(channel0, open ? "IrisLarge" : "IrisSmall", 0, speed, stop);

        public void PtzStopAll(int channel0)
        {
            // Um "stop" por eixo, engolindo falhas: nem todo domo tem íris ou foco motorizado.
            foreach (var code in new[] { "Up", "ZoomTele", "FocusFar", "IrisLarge" })
            {
                try { Command(channel0, code, 0, 0, stop: true, tolerant: true); }
                catch { /* eixo não suportado — seguir parando os demais */ }
            }
        }

        public void PtzGotoPreset(int channel0, int preset)
            => Preset(channel0, "GotoPreset", preset);

        public void PtzSetPreset(int channel0, int preset)
            => Preset(channel0, "SetPreset", preset);

        public void PtzDeletePreset(int channel0, int preset)
            => Preset(channel0, "ClearPreset", preset);

        /// <summary>Presets são comandos únicos: sempre <c>action=start</c>, sem par de soltar.</summary>
        private void Preset(int channel0, string code, int preset)
        {
            var url = DahuaCgiClient.Query("/cgi-bin/ptz.cgi",
                ("action", "start"),
                ("channel", channel0 + 1),
                ("code", code),
                ("arg1", 0),
                ("arg2", preset),
                ("arg3", 0));

            Cgi().Get(url);
        }

        private void Command(int channel0, string code, int arg1, int arg2, bool stop, bool tolerant = false)
        {
            var url = DahuaCgiClient.Query("/cgi-bin/ptz.cgi",
                ("action", stop ? "stop" : "start"),
                ("channel", channel0 + 1),
                ("code", code),
                ("arg1", arg1),
                ("arg2", arg2),
                ("arg3", 0));

            var cgi = Cgi();
            if (tolerant) cgi.TryGet(url);
            else cgi.Get(url);
        }

        // ------------------------------------------------------------------

        /// <summary>
        /// Quantos canais o equipamento tem, a partir da tabela de nomes de canal. Devolver 0
        /// (desconhecido) é aceitável: o <c>NvrService</c> só valida a faixa quando o número
        /// é positivo, então um NVR que não expõe a tabela simplesmente não ganha a checagem.
        /// </summary>
        private static int ReadChannelCount(DahuaCgiClient cgi)
        {
            try
            {
                var body = cgi.Get("/cgi-bin/configManager.cgi?action=getConfig&name=ChannelTitle");

                int highest = -1;
                foreach (Match m in Regex.Matches(body, @"ChannelTitle\[(\d+)\]", RegexOptions.IgnoreCase))
                {
                    if (int.TryParse(m.Groups[1].Value, out int index) && index > highest)
                        highest = index;
                }

                return highest + 1; // índices são base 0
            }
            catch
            {
                return 0;
            }
        }

        /// <summary>
        /// Sondagem periódica: o CGI é sem estado, então a única forma de saber que o
        /// equipamento sumiu é perguntar. A transição de estado alimenta os mesmos eventos que
        /// o auto-reconnect do NetSDK dispara, e é o que faz o <c>VideoHub</c> suspender e
        /// retomar os streams.
        /// </summary>
        private void OnHealthTick(object _)
        {
            if (!_loggedIn) return;

            DahuaCgiClient cgi;
            lock (_gate) cgi = _cgi;
            if (cgi == null) return;

            bool ok = cgi.TryGet("/cgi-bin/magicBox.cgi?action=getSystemInfo");
            if (ok == _healthy) return;

            _healthy = ok;
            try
            {
                if (ok) Reconnected?.Invoke();
                else Disconnected?.Invoke();
            }
            catch { /* assinante não pode derrubar o timer */ }
        }

        private DahuaCgiClient Cgi()
        {
            lock (_gate)
                return _cgi ?? throw new InvalidOperationException("Não conectado. Faça login primeiro.");
        }

        private NvrCredentials Credentials()
        {
            lock (_gate)
                return _credentials ?? throw new InvalidOperationException("Não conectado. Faça login primeiro.");
        }

        public void Dispose()
        {
            if (_disposed) return;
            _disposed = true;
            Logout();
        }
    }
}
