using System.Diagnostics;
using PtzBridge.Nvr;
using PtzBridge.Sdk;
using PtzBridge.Streaming;

namespace PtzBridge.VirtualCamera
{
    /// <summary>
    /// Orquestra a câmera virtual nas duas plataformas. A origem é sempre o mesmo vídeo
    /// I420 do <see cref="VideoHub"/>; o destino é Media Foundation no Windows e
    /// v4l2loopback no Linux.
    /// </summary>
    internal sealed class VirtualCameraService : IDisposable
    {
        public const string CameraName = "SC PTZ Virtual Cam";
        private static readonly TimeSpan ConsumerWindow = TimeSpan.FromSeconds(2);
        private static readonly TimeSpan NoSignalPeriod = TimeSpan.FromMilliseconds(200);
        private const double NoSignalAfterMs = 1000;

        private readonly VideoHub _hub;
        private readonly IVirtualCameraSink _sink;
        private readonly YuvScaler _scaler = new(VirtualCameraFormat.Width);
        private readonly object _writeGate = new();
        private readonly SemaphoreSlim _gate = new(1, 1);

        private IDisposable _subscription;
        private Timer _timer;
        private long _lastLiveTicks;
        private bool _lastNoSignal = true;
        private volatile bool _running;
        private volatile int _channel;
        private volatile string _error;
        private bool _disposed;

        public static bool IsSupported => OperatingSystem.IsWindowsVersionAtLeast(10, 0, 22000)
            || OperatingSystem.IsLinux();

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

        public VirtualCameraService(VideoHub hub, Func<AppConfig> config)
        {
            _hub = hub;
            _sink = OperatingSystem.IsWindows()
                ? new WindowsVirtualCameraSink()
                : OperatingSystem.IsLinux()
                    ? new V4l2LoopbackSink(config().VcamDevice)
                    : new UnsupportedVirtualCameraSink();
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

                if (!_sink.IsSupported)
                    throw new InvalidOperationException("A câmera virtual não é suportada neste sistema operacional.");

                await _sink.StartAsync().ConfigureAwait(false);
                _channel = channel;
                _error = null;
                _lastNoSignal = true;
                Interlocked.Exchange(ref _lastLiveTicks, 0);
                _running = true;
                _timer = new Timer(OnTick, null, TimeSpan.Zero, NoSignalPeriod);
                TrySubscribe(channel);
                Log.Info($"câmera virtual ligada no canal {channel} ({_sink.GetType().Name})");
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
                _timer?.Dispose();
                _timer = null;
                _subscription?.Dispose();
                _subscription = null;
                await _sink.StopAsync().ConfigureAwait(false);
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

        private void OnDecodedFrame(IntPtr i420, int width, int height)
        {
            if (!_running) return;
            Interlocked.Exchange(ref _lastLiveTicks, Stopwatch.GetTimestamp());
            try
            {
                if (!_sink.ConsumerActive(ConsumerWindow)) return;
                lock (_writeGate)
                    if (_scaler.Convert(i420, width, height)) _sink.WriteFrame(_scaler.Frame);
            }
            catch { /* callback de decoder nunca pode propagar */ }
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
            try { if (_running) _sink.WriteFrame(NoSignalFrame.Frame); }
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
            _timer?.Dispose();
            _subscription?.Dispose();
            _sink.Dispose();
            _gate.Dispose();
        }

        private sealed class UnsupportedVirtualCameraSink : IVirtualCameraSink
        {
            public string CameraName => VirtualCameraService.CameraName;
            public bool IsSupported => false;
            public Task StartAsync() => throw new InvalidOperationException("Câmera virtual não suportada neste sistema.");
            public Task StopAsync() => Task.CompletedTask;
            public bool ConsumerActive(TimeSpan within) => false;
            public void WriteFrame(byte[] nv12) { }
            public void Dispose() { }
        }
    }
}
