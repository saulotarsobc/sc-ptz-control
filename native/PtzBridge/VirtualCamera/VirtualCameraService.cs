using System.Diagnostics;
using PtzBridge.Sdk;
using PtzBridge.Streaming;

namespace PtzBridge.VirtualCamera
{
    /// <summary>
    /// Orquestra a câmera virtual Media Foundation do Windows 11. A origem é o mesmo
    /// vídeo I420 do <see cref="VideoHub"/> e o destino é o buffer compartilhado com
    /// a media source nativa.
    /// </summary>
    internal sealed class VirtualCameraService : IDisposable
    {
        public const string CameraName = "SC PTZ Virtual Cam";
        private static readonly TimeSpan ConsumerWindow = TimeSpan.FromSeconds(2);
        private static readonly TimeSpan NoSignalPeriod = TimeSpan.FromMilliseconds(200);
        private const double NoSignalAfterMs = 1000;

        private readonly VideoHub _hub;
        private readonly SharedFrameWriter _writer = new();
        private readonly YuvScaler _scaler = new(SharedFrameProtocol.Width);
        private readonly LatestI420FramePump _framePump;
        private readonly object _writeGate = new();
        private readonly SemaphoreSlim _gate = new(1, 1);

        private IDisposable _subscription;
        private Timer _timer;
        private long _lastLiveTicks;
        private bool _lastNoSignal = true;
        private volatile bool _running;
        private volatile int _channel;
        private volatile string _error;
        private int _generation;
        private bool _disposed;

        public static bool IsSupported => OperatingSystem.IsWindowsVersionAtLeast(10, 0, 22000);

        public bool IsRunning => _running;
        public int Channel => _channel;
        public string Error => _error;

        public bool NoSignal
        {
            get
            {
                long last = Interlocked.Read(ref _lastLiveTicks);
                return last == 0 || (Stopwatch.GetTimestamp() - last) * 1000.0 / Stopwatch.Frequency >= NoSignalAfterMs;
            }
        }

        public event Action StateChanged;

        public VirtualCameraService(VideoHub hub)
        {
            _hub = hub;
            _framePump = new LatestI420FramePump(ProcessFrame);
        }

        public async Task StartAsync(int channel)
        {
            await _gate.WaitAsync().ConfigureAwait(false);
            try
            {
                if (_running)
                {
                    if (channel != _channel) Resubscribe(channel);
                    return;
                }

                if (!IsSupported)
                    throw new InvalidOperationException(
                        "A câmera virtual exige Windows 11 (build 22000) ou mais recente.");

                if (!_writer.Open())
                    throw new InvalidOperationException(
                        $"Não foi possível abrir o buffer de vídeo em {SharedFrameProtocol.FilePath}. "
                        + "Rode scripts/install-vcam.ps1 como Administrador para criar a pasta com permissão.");

                int hr = await VirtualCameraNative.StartSessionAsync(CameraName).ConfigureAwait(false);
                if (hr != 0)
                    throw new InvalidOperationException(VirtualCameraNative.Describe(hr));

                _channel = channel;
                _error = null;
                _lastNoSignal = true;
                Interlocked.Exchange(ref _lastLiveTicks, 0);
                Interlocked.Increment(ref _generation);
                _running = true;
                _timer = new Timer(OnTick, null, TimeSpan.Zero, NoSignalPeriod);
                TrySubscribe(channel);
                Log.Info($"câmera virtual ligada no canal {channel}");
            }
            finally { _gate.Release(); }

            RaiseChanged();
        }

        public async Task StopAsync()
        {
            await _gate.WaitAsync().ConfigureAwait(false);
            try
            {
                if (!_running) return;
                _running = false;
                Interlocked.Increment(ref _generation);
                _framePump.Clear();
                _timer?.Dispose();
                _timer = null;
                _subscription?.Dispose();
                _subscription = null;
                await VirtualCameraNative.StopSessionAsync().ConfigureAwait(false);
                Log.Info("câmera virtual desligada");
            }
            finally { _gate.Release(); }

            RaiseChanged();
        }

        public void Retarget(int channel)
        {
            if (!_running || channel == _channel) return;
            _gate.Wait();
            try { if (_running && channel != _channel) Resubscribe(channel); }
            finally { _gate.Release(); }
        }

        public void EnsureSubscribed()
        {
            if (!_running || _subscription != null) return;
            _gate.Wait();
            try { if (_running && _subscription == null) TrySubscribe(_channel); }
            finally { _gate.Release(); }
        }

        private void Resubscribe(int channel)
        {
            _subscription?.Dispose();
            _subscription = null;
            _channel = channel;
            Interlocked.Increment(ref _generation);
            _framePump.Clear();
            Interlocked.Exchange(ref _lastLiveTicks, 0);
            TrySubscribe(channel);
        }

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

        /// <summary>Thread nativa: heartbeat, teste de audiência e uma cópia para o worker.</summary>
        private void OnDecodedFrame(I420Frame frame)
        {
            if (!_running) return;
            Interlocked.Exchange(ref _lastLiveTicks, Stopwatch.GetTimestamp());
            try
            {
                if (!_writer.ConsumerActive(ConsumerWindow)) return;
                _framePump.Post(frame, Volatile.Read(ref _generation));
            }
            catch { /* callback de decoder nunca pode propagar */ }
        }

        /// <summary>Worker exclusivo da câmera virtual: escala e publica sem segurar o decoder.</summary>
        private void ProcessFrame(I420Frame frame)
        {
            if (!_running || frame.Generation != Volatile.Read(ref _generation)) return;

            lock (_writeGate)
            {
                if (!_running || frame.Generation != Volatile.Read(ref _generation)) return;
                if (_scaler.Convert(frame.Data, frame.Width, frame.Height))
                    _writer.WriteFrame(_scaler.Frame);
            }
        }

        private void OnTick(object _)
        {
            if (!_running) return;
            bool noSignal = NoSignal;
            if (noSignal != _lastNoSignal)
            {
                _lastNoSignal = noSignal;
                RaiseChanged();
            }
            if (!noSignal || !Monitor.TryEnter(_writeGate)) return;
            try { if (_running) _writer.WriteFrame(NoSignalFrame.Frame); }
            catch { }
            finally { Monitor.Exit(_writeGate); }
        }

        private void RaiseChanged()
        {
            try { StateChanged?.Invoke(); } catch { }
        }

        public void Dispose()
        {
            if (_disposed) return;
            _disposed = true;
            _running = false;
            Interlocked.Increment(ref _generation);
            _framePump.Clear();
            _timer?.Dispose();
            _subscription?.Dispose();
            try { VirtualCameraNative.StopSessionAsync().Wait(TimeSpan.FromSeconds(3)); }
            catch { /* melhor-esforço no encerramento */ }
            _framePump.Dispose();
            _writer.Dispose();
            _gate.Dispose();
        }
    }
}
