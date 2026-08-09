using System.Diagnostics;
using PtzBridge.Sdk;
using PtzBridge.Streaming;

namespace PtzBridge.Nvr.RtspCgi
{
    /// <summary>
    /// Um canal de vídeo por RTSP: <c>ffmpeg</c> decodifica o H.264 e despeja I420 cru no
    /// stdout, que esta classe lê e entrega no mesmo formato que o pipeline do NetSDK produz.
    ///
    /// <para>Do <see cref="YuvScaler"/> em diante nada muda — preview NV12 e câmera virtual
    /// enxergam exatamente o mesmo contrato dos dois backends. É o que permite ter dois
    /// transportes sem duplicar o resto do aplicativo.</para>
    ///
    /// <para>A saída do ffmpeg é limitada a <see cref="PipeWidthCap"/> de propósito: 1080p
    /// cru são ~3 MB por frame, 75 MB/s a 25 fps atravessando um pipe. Reduzir na swscale
    /// (mais rápida que o nosso scaler) corta isso para um terço sem perda visível, já que o
    /// maior consumidor é a câmera virtual em 720p.</para>
    ///
    /// <para>O ffmpeg pode morrer a qualquer momento — rede caindo, NVR reiniciando. O laço
    /// de leitura o reergue sozinho com espera entre tentativas, que é o papel que o
    /// <c>CLIENT_SetAutoReconnect</c> cumpre no outro backend.</para>
    /// </summary>
    internal sealed class FfmpegChannelStream : IChannelSource
    {
        /// <summary>Teto da resolução que trafega no pipe; a câmera virtual precisa de 1280.</summary>
        private const int PipeWidthCap = 1280;

        private static readonly TimeSpan RetryDelay = TimeSpan.FromSeconds(2);

        private readonly string _ip;
        private readonly int _rtspPort;
        private readonly string _user;
        private readonly string _password;
        private readonly int _channel;      // 1-based
        private readonly bool _preferSubStream;
        private readonly int _maxWidth;
        private readonly YuvScaler _scaler;

        private readonly object _procLock = new();
        private Process _proc;
        private Thread _reader;
        private volatile bool _pumping;
        private uint _sequence;

        private int _srcW, _srcH, _srcFps;   // o que o equipamento entrega (diagnóstico)
        private int _outW, _outH;            // o que sai do ffmpeg e entra no scaler

        public event Action<StreamFormat> FormatChanged;
        public event Action<VideoFrame> FrameReady;
        public event Action<IntPtr, int, int> I420Ready;

        public bool IsRunning => _pumping;

        public StreamFormat Format =>
            new(_channel, _scaler.Width, _scaler.Height, _srcFps, _srcW, _srcH);

        public FfmpegChannelStream(
            string ip, int rtspPort, string user, string password,
            int channel, int maxWidth, bool preferSubStream)
        {
            _ip = ip;
            _rtspPort = rtspPort;
            _user = user;
            _password = password;
            _channel = channel;
            _maxWidth = maxWidth;
            _preferSubStream = preferSubStream;
            _scaler = new YuvScaler(maxWidth);
        }

        public void Start()
        {
            if (_pumping) return;

            if (!Ffmpeg.IsAvailable)
                throw new InvalidOperationException(Ffmpeg.MissingMessage);

            // O ffprobe informa o formato real para o diagnóstico e para dimensionar o pipe.
            // Falhar aqui não é fatal: 1280×720 é uma aposta segura e o vídeo costuma vir.
            var probed = Ffmpeg.Probe(BuildUrl(_preferSubStream));
            if (probed is { } fmt)
            {
                _srcW = fmt.Width;
                _srcH = fmt.Height;
                _srcFps = fmt.Fps;
            }
            else
            {
                _srcW = 0;
                _srcH = 0;
                _srcFps = 0;
            }

            (_outW, _outH) = PipeSize(_srcW, _srcH);

            _pumping = true;
            _reader = new Thread(PumpLoop)
            {
                IsBackground = true,
                Name = $"rtsp-ch{_channel}",
            };
            _reader.Start();
        }

        public void Stop()
        {
            if (!_pumping) return;
            _pumping = false;

            KillProcess();

            // Não espera para sempre: a thread pode estar parada num read do pipe que só
            // desbloqueia quando o SO fecha o descritor do processo morto.
            var reader = _reader;
            _reader = null;
            if (reader != null && reader != Thread.CurrentThread)
                reader.Join(TimeSpan.FromSeconds(3));

            _srcW = _srcH = _srcFps = 0;
        }

        public void Restart()
        {
            Stop();
            Start();
        }

        // ------------------------------------------------------------------

        /// <summary>
        /// <c>rtsp://user:senha@ip:554/cam/realmonitor?channel=N&amp;subtype=S</c> — o caminho
        /// padrão dos NVR Dahua/Intelbras. Usuário e senha vão escapados: senha com <c>@</c>
        /// ou <c>/</c> quebraria a URL no meio.
        /// </summary>
        private string BuildUrl(bool subStream)
        {
            var user = Uri.EscapeDataString(_user ?? "");
            var pass = Uri.EscapeDataString(_password ?? "");
            int subtype = subStream ? 1 : 0;
            return $"rtsp://{user}:{pass}@{_ip}:{_rtspPort}/cam/realmonitor?channel={_channel}&subtype={subtype}";
        }

        /// <summary>Tamanho que sai do ffmpeg: limitado ao teto do pipe e sempre par (yuv420p exige).</summary>
        private (int Width, int Height) PipeSize(int srcW, int srcH)
        {
            int cap = Math.Max(PipeWidthCap, _maxWidth);

            if (srcW <= 0 || srcH <= 0)
                return (cap, Even(cap * 9 / 16));   // sem probe: assume 16:9

            if (srcW <= cap)
                return (Even(srcW), Even(srcH));

            return (Even(cap), Even((int)Math.Round(srcH * (double)cap / srcW)));
        }

        private static int Even(int value) => value % 2 == 0 ? value : value - 1;

        private void PumpLoop()
        {
            bool preferSub = _preferSubStream;

            while (_pumping)
            {
                try
                {
                    RunOnce(preferSub);
                }
                catch (Exception ex) when (_pumping)
                {
                    Log.Info($"canal {_channel}: stream RTSP caiu ({ex.Message}); tentando de novo");
                }

                if (!_pumping) break;

                // Plano B igual ao do NetSDK: se o stream preferido não vier, tenta o outro.
                preferSub = !preferSub;
                Thread.Sleep(RetryDelay);
            }
        }

        /// <summary>Sobe um ffmpeg e bombeia frames até ele morrer.</summary>
        private unsafe void RunOnce(bool subStream)
        {
            var psi = new ProcessStartInfo(Ffmpeg.FfmpegPath)
            {
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true,
            };

            foreach (var arg in new[]
            {
                "-hide_banner",
                "-loglevel", "error",
                // TCP evita perda de pacote em rede saturada; UDP daria artefato no H.264.
                "-rtsp_transport", "tcp",
                "-fflags", "nobuffer",
                "-flags", "low_delay",
                "-i", BuildUrl(subStream),
                "-an", "-sn",
                "-vf", $"scale={_outW}:{_outH}",
                "-f", "rawvideo",
                "-pix_fmt", "yuv420p",
                "-",
            })
            {
                psi.ArgumentList.Add(arg);
            }

            Process proc = null;
            try
            {
                proc = Process.Start(psi)
                       ?? throw new InvalidOperationException("Não foi possível iniciar o ffmpeg.");

                lock (_procLock) _proc = proc;

                // O stderr precisa ser drenado: cheio, o pipe bloqueia o ffmpeg e o vídeo trava.
                proc.ErrorDataReceived += (_, e) =>
                {
                    if (!string.IsNullOrWhiteSpace(e.Data))
                        Log.Info($"ffmpeg ch{_channel}: {e.Data}");
                };
                proc.BeginErrorReadLine();

                int frameBytes = _outW * _outH * 3 / 2;
                var buffer = new byte[frameBytes];
                var stdout = proc.StandardOutput.BaseStream;
                bool announced = false;

                while (_pumping)
                {
                    // Frame parcial no fim do stream = ffmpeg morreu: EndOfStreamException
                    // sobe para o PumpLoop, que reergue.
                    stdout.ReadExactly(buffer, 0, frameBytes);

                    fixed (byte* pinned = buffer)
                    {
                        var ptr = (IntPtr)pinned;

                        if (_scaler.Convert(ptr, _outW, _outH))
                        {
                            // Só depois da primeira conversão o Format tem Width/Height reais.
                            if (!announced)
                            {
                                announced = true;
                                Raise(() => FormatChanged?.Invoke(Format));
                            }

                            Raise(() => FrameReady?.Invoke(new VideoFrame(
                                _scaler.Frame, _scaler.Width * _scaler.Height * 3 / 2,
                                _scaler.Width, _scaler.Height, ++_sequence)));
                        }

                        // Fonte "crua" para a câmera virtual. Aqui ela já vem reduzida ao teto
                        // do pipe, não na resolução do equipamento como no NetSDK — o destino
                        // é 720p de qualquer forma, então não há perda prática.
                        Raise(() => I420Ready?.Invoke(ptr, _outW, _outH));
                    }
                }
            }
            finally
            {
                lock (_procLock)
                {
                    if (ReferenceEquals(_proc, proc)) _proc = null;
                }
                TryKill(proc);
            }
        }

        /// <summary>
        /// Os assinantes rodam nesta thread de leitura. Um deles falhando não pode derrubar o
        /// stream — mesma regra das threads nativas do outro backend.
        /// </summary>
        private static void Raise(Action action)
        {
            try { action(); } catch { }
        }

        private void KillProcess()
        {
            Process proc;
            lock (_procLock)
            {
                proc = _proc;
                _proc = null;
            }
            TryKill(proc);
        }

        private static void TryKill(Process proc)
        {
            if (proc == null) return;
            try
            {
                if (!proc.HasExited) proc.Kill(entireProcessTree: true);
            }
            catch { /* já morreu sozinho */ }
            finally
            {
                try { proc.Dispose(); } catch { }
            }
        }

        public void Dispose() => Stop();
    }
}
