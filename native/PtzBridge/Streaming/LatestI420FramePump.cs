using System.Buffers;

namespace PtzBridge.Streaming
{
    /// <summary>
    /// Copia rapidamente um I420 temporário e processa o frame mais recente fora da thread
    /// produtora. A fila tem tamanho um: se o consumidor atrasar, o pendente antigo é
    /// descartado em vez de acumular latência.
    /// </summary>
    internal sealed class LatestI420FramePump : IDisposable
    {
        private sealed class PendingFrame
        {
            public byte[] Buffer;
            public int Length;
            public int Width;
            public int Height;
            public uint Sequence;
            public uint TimestampMs;
            public int Fps;
            public int Generation;
        }

        private readonly Action<I420Frame> _process;
        private readonly SemaphoreSlim _signal = new(0, 1);
        private readonly CancellationTokenSource _stop = new();
        private readonly Task _worker;

        private PendingFrame _pending;
        private long _dropped;
        private int _disposed;

        public long Dropped => Interlocked.Read(ref _dropped);

        public LatestI420FramePump(Action<I420Frame> process)
        {
            _process = process;
            _worker = Task.Run(ProcessLoopAsync);
        }

        /// <summary>
        /// Deve ser chamado enquanto <paramref name="source"/> ainda é válido. O único
        /// trabalho síncrono é uma cópia contígua; escala, transporte e I/O ficam no worker.
        /// </summary>
        public unsafe void Post(I420Frame source, int generation)
        {
            if (source.Data == IntPtr.Zero || source.Length <= 0 || Volatile.Read(ref _disposed) != 0)
                return;

            byte[] buffer = ArrayPool<byte>.Shared.Rent(source.Length);
            new ReadOnlySpan<byte>((void*)source.Data, source.Length).CopyTo(buffer);

            if (Volatile.Read(ref _disposed) != 0)
            {
                ArrayPool<byte>.Shared.Return(buffer);
                return;
            }

            var next = new PendingFrame
            {
                Buffer = buffer,
                Length = source.Length,
                Width = source.Width,
                Height = source.Height,
                Sequence = source.Sequence,
                TimestampMs = source.TimestampMs,
                Fps = source.Fps,
                Generation = generation,
            };

            var replaced = Interlocked.Exchange(ref _pending, next);
            if (replaced != null)
            {
                Interlocked.Increment(ref _dropped);
                Return(replaced);
            }

            try { _signal.Release(); }
            catch (SemaphoreFullException) { /* já há um despertar para o frame mais recente */ }
            catch (ObjectDisposedException) { }
        }

        public void Clear()
        {
            var pending = Interlocked.Exchange(ref _pending, null);
            if (pending != null) Return(pending);
        }

        private async Task ProcessLoopAsync()
        {
            try
            {
                while (true)
                {
                    await _signal.WaitAsync(_stop.Token).ConfigureAwait(false);
                    var frame = Interlocked.Exchange(ref _pending, null);
                    if (frame == null) continue;

                    try
                    {
                        unsafe
                        {
                            fixed (byte* data = frame.Buffer)
                            {
                                _process(new I420Frame(
                                    (IntPtr)data,
                                    frame.Length,
                                    frame.Width,
                                    frame.Height,
                                    frame.Sequence,
                                    frame.TimestampMs,
                                    frame.Fps,
                                    frame.Generation));
                            }
                        }
                    }
                    catch { /* um frame defeituoso não encerra o worker */ }
                    finally { Return(frame); }
                }
            }
            catch (OperationCanceledException) { }
        }

        private static void Return(PendingFrame frame)
        {
            if (frame.Buffer != null)
            {
                ArrayPool<byte>.Shared.Return(frame.Buffer);
                frame.Buffer = null;
            }
        }

        public void Dispose()
        {
            if (Interlocked.Exchange(ref _disposed, 1) != 0) return;
            Clear();
            _stop.Cancel();
            try { _worker.Wait(TimeSpan.FromSeconds(2)); } catch { }
            Clear();
            _signal.Dispose();
            _stop.Dispose();
        }
    }
}
