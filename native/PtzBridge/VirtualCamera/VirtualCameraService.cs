using System.Diagnostics;
using PtzBridge.Sdk;
using PtzBridge.Streaming;

namespace PtzBridge.VirtualCamera
{
    /// <summary>
    /// Orquestra a câmera virtual "SC PTZ Virtual Cam": cria a câmera de sessão (Media
    /// Foundation, Windows 11), assina o I420 cru do canal ativo no <see cref="VideoHub"/> e
    /// publica o resultado em 1280×720 NV12 no memory-mapped file que a media source nativa lê.
    ///
    /// <para>Reaproveita o decode que já roda para o preview — um único real-play por canal,
    /// como o resto do app. O que NÃO é reaproveitado é a escala: o preview reduz para
    /// <c>maxVideoWidth</c> (960 por padrão) e reamostrar aquilo para 720p perderia detalhe,
    /// então a câmera virtual escala a FONTE inteira direto para o seu quadro.</para>
    ///
    /// <para>Sem imagem — NVR fora do ar, canal sem sinal, câmera ligada antes do login — o
    /// que vai ao ar é o quadro preto com "Sem sinal!" (ver <see cref="NoSignalFrame"/>),
    /// publicado por um timer. Assim a câmera nunca "congela" no último frame nem some da
    /// lista de dispositivos dos outros aplicativos.</para>
    ///
    /// <para>Os frames chegam em thread NATIVA de decode: trabalho mínimo e nenhuma exceção
    /// pode escapar. A conversão só acontece quando há um app consumindo a câmera (heartbeat
    /// do consumidor no MMF).</para>
    /// </summary>
    internal sealed class VirtualCameraService : IDisposable
    {
        public const string CameraName = "SC PTZ Virtual Cam";

        /// <summary>Janela do heartbeat do consumidor: sem leitura recente, não há audiência.</summary>
        private static readonly TimeSpan ConsumerWindow = TimeSpan.FromSeconds(2);

        /// <summary>Silêncio da fonte que passa a valer como "sem sinal".</summary>
        private const double NoSignalAfterMs = 1000;

        /// <summary>Cadência do quadro de "sem sinal" — bem abaixo dos 500 ms que a media
        /// source usa para considerar o produtor vivo.</summary>
        private static readonly TimeSpan NoSignalPeriod = TimeSpan.FromMilliseconds(200);

        private readonly VideoHub _hub;
        private readonly SharedFrameWriter _writer = new();

        // 1280 = a largura que o contrato do MMF anuncia; o scaler completa o 16:9 (720p).
        private readonly YuvScaler _scaler = new(SharedFrameProtocol.Width);

        // Serializa as escritas no MMF entre a thread de decode e o timer de "sem sinal".
        private readonly object _writeGate = new();

        // Serializa start/stop/retarget, que vêm do canal de controle.
        private readonly SemaphoreSlim _gate = new(1, 1);

        private IDisposable _subscription;
        private Timer _timer;
        private long _lastLiveTicks;
        private bool _lastNoSignal = true;
        private volatile bool _running;
        private volatile int _channel;   // 1-based, como no resto do protocolo
        private volatile string _error;
        private bool _disposed;

        /// <summary>MFCreateVirtualCamera existe a partir do Windows 11 (build 22000).</summary>
        public static bool IsSupported => OperatingSystem.IsWindowsVersionAtLeast(10, 0, 22000);

        public bool IsRunning => _running;
        public int Channel => _channel;

        /// <summary>Último motivo de falha (nulo quando está tudo bem).</summary>
        public string Error => _error;

        /// <summary>
        /// Verdadeiro quando a câmera está ligada mas nenhum frame do NVR chegou há mais de
        /// um segundo — ou seja, o que está no ar é o quadro "Sem sinal!".
        /// </summary>
        public bool NoSignal
        {
            get
            {
                long last = Interlocked.Read(ref _lastLiveTicks);
                if (last == 0) return true;
                return (Stopwatch.GetTimestamp() - last) * 1000.0 / Stopwatch.Frequency >= NoSignalAfterMs;
            }
        }

        /// <summary>Ligou/desligou. Pode vir de thread de pool.</summary>
        public event Action StateChanged;

        public VirtualCameraService(VideoHub hub) => _hub = hub;

        /// <summary>
        /// Liga a câmera virtual transmitindo o canal informado (1-based). Lança
        /// <see cref="InvalidOperationException"/> com mensagem pronta para a interface se o
        /// Windows não suportar, se o buffer não abrir ou se a parte nativa falhar.
        ///
        /// <para>Falhar ao assinar o vídeo NÃO impede a câmera de subir: o NVR pode estar fora
        /// do ar, e nesse caso o certo é o dispositivo existir mostrando "Sem sinal!".</para>
        /// </summary>
        public async Task StartAsync(int channel)
        {
            await _gate.WaitAsync().ConfigureAwait(false);
            try
            {
                if (_running)
                {
                    if (channel != _channel)
                        Resubscribe(channel);
                    return;
                }

                if (!IsSupported)
                    throw new InvalidOperationException(
                        "A câmera virtual exige Windows 11 (build 22000) ou mais recente.");

                if (!_writer.Open())
                    throw new InvalidOperationException(
                        $"Não foi possível abrir o buffer de vídeo em {SharedFrameWriter.FilePath}. "
                        + "Rode scripts/install-vcam.ps1 como Administrador para criar a pasta com permissão.");

                int hr = await VirtualCameraNative.StartSessionAsync(CameraName).ConfigureAwait(false);
                if (hr != 0)
                    throw new InvalidOperationException(VirtualCameraNative.Describe(hr));

                _channel = channel;
                _error = null;
                _lastNoSignal = true; // até chegar o primeiro frame, é o "Sem sinal!" que vai ao ar
                Interlocked.Exchange(ref _lastLiveTicks, 0);
                _running = true;

                // Antes de assinar: garante o "Sem sinal!" no ar desde o primeiro instante.
                _timer = new Timer(OnTick, null, TimeSpan.Zero, NoSignalPeriod);
                TrySubscribe(channel);

                Log.Info($"câmera virtual ligada no canal {channel}");
            }
            finally
            {
                _gate.Release();
            }

            StateChanged?.Invoke();
        }

        /// <summary>Desliga a câmera virtual (o dispositivo some da lista do sistema).</summary>
        public async Task StopAsync()
        {
            await _gate.WaitAsync().ConfigureAwait(false);
            try
            {
                if (!_running)
                    return;

                _running = false;
                _timer?.Dispose();
                _timer = null;
                _subscription?.Dispose();
                _subscription = null;

                await VirtualCameraNative.StopSessionAsync().ConfigureAwait(false);
                Log.Info("câmera virtual desligada");
            }
            finally
            {
                _gate.Release();
            }

            StateChanged?.Invoke();
        }

        /// <summary>
        /// Passa a transmitir outro canal (chamado quando o canal ativo muda na interface).
        /// Não faz nada se a câmera estiver desligada.
        /// </summary>
        public void Retarget(int channel)
        {
            if (!_running || channel == _channel)
                return;

            _gate.Wait();
            try
            {
                if (!_running || channel == _channel) return;
                Resubscribe(channel);
            }
            finally
            {
                _gate.Release();
            }
        }

        /// <summary>
        /// Nova tentativa de assinar o vídeo. Chamado quando a sessão com o NVR sobe: ligar a
        /// câmera com o equipamento fora do ar deixa a assinatura pendente, e é aqui que ela
        /// se resolve. Reconexão automática do SDK NÃO passa por aqui — quem trata é o
        /// <see cref="VideoHub.ResumeAll"/>, que preserva os assinantes.
        /// </summary>
        public void EnsureSubscribed()
        {
            if (!_running || _subscription != null)
                return;

            _gate.Wait();
            try
            {
                if (!_running || _subscription != null) return;
                TrySubscribe(_channel);
            }
            finally
            {
                _gate.Release();
            }
        }

        // ------------------------------------------------------------------

        /// <summary>Troca de canal sob <c>_gate</c>.</summary>
        private void Resubscribe(int channel)
        {
            _subscription?.Dispose();
            _subscription = null;
            _channel = channel;
            Interlocked.Exchange(ref _lastLiveTicks, 0); // volta ao "Sem sinal!" até o canal novo chegar
            TrySubscribe(channel);
        }

        /// <summary>
        /// Assina o canal, tolerando falha. Sem NVR no ar o stream não abre — a câmera segue
        /// ligada com o quadro de "sem sinal" e <see cref="EnsureSubscribed"/> tenta de novo.
        /// </summary>
        private void TrySubscribe(int channel)
        {
            try
            {
                _subscription = _hub.SubscribeRaw(channel, OnDecodedFrame);
                _error = null;
            }
            catch (Exception ex)
            {
                _subscription = null;
                _error = ex.Message;
                Log.Info($"câmera virtual sem vídeo do canal {channel}: {ex.Message}");
            }
        }

        /// <summary>Thread NATIVA de decode: escala a fonte para 720p e publica no MMF.</summary>
        private void OnDecodedFrame(IntPtr i420, int width, int height)
        {
            if (!_running)
                return;

            // Marcado antes do teste de audiência: a fonte está viva mesmo que ninguém assista,
            // e é isso que impede o quadro de "sem sinal" de entrar por engano.
            Interlocked.Exchange(ref _lastLiveTicks, Stopwatch.GetTimestamp());

            try
            {
                // Sem audiência não há trabalho — o decode continua rodando para retomar na hora.
                if (!_writer.ConsumerActive(ConsumerWindow))
                    return;

                lock (_writeGate)
                {
                    if (_scaler.Convert(i420, width, height))
                        _writer.WriteFrame(_scaler.Frame);
                }
            }
            catch { /* exceção jamais pode escapar para o código nativo */ }
        }

        /// <summary>Publica o quadro "Sem sinal!" enquanto a fonte estiver muda.</summary>
        private void OnTick(object _)
        {
            if (!_running)
                return;

            // Entrar ou sair do "sem sinal" é mudança de estado: a interface mostra isso no
            // botão sem precisar ficar perguntando.
            bool noSignal = NoSignal;
            if (noSignal != _lastNoSignal)
            {
                _lastNoSignal = noSignal;
                try { StateChanged?.Invoke(); } catch { }
            }

            if (!noSignal)
                return;

            // Frames de verdade têm prioridade: se o decode está publicando agora, pula a vez.
            if (!Monitor.TryEnter(_writeGate))
                return;
            try
            {
                if (_running)
                    _writer.WriteFrame(NoSignalFrame.Frame);
            }
            catch { /* buffer pode ter sido fechado no meio do encerramento */ }
            finally
            {
                Monitor.Exit(_writeGate);
            }
        }

        public void Dispose()
        {
            if (_disposed)
                return;
            _disposed = true;

            _running = false;
            _timer?.Dispose();
            _subscription?.Dispose();

            try { VirtualCameraNative.StopSessionAsync().Wait(TimeSpan.FromSeconds(3)); }
            catch { /* melhor-esforço no encerramento */ }

            _writer.Dispose();
            _gate.Dispose();
        }
    }
}
