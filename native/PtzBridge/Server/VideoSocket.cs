using System.Net.WebSockets;
using PtzBridge.Streaming;

namespace PtzBridge.Server
{
    /// <summary>
    /// Uma conexão em <c>/ws/video?channel=N</c>: envia frames NV12 binários com o
    /// cabeçalho de <see cref="VideoFrameHeader"/>.
    ///
    /// <para>Backpressure por DESCARTE, não por fila: o frame que chega enquanto o anterior
    /// ainda está sendo enviado simplesmente sobrescreve o pendente. Vídeo ao vivo com fila
    /// vira latência acumulada, que é justamente o que não pode acontecer num controle de
    /// PTZ — melhor perder frames e continuar no tempo real.</para>
    /// </summary>
    internal sealed class VideoSocket
    {
        private readonly WebSocket _socket;
        private readonly VideoHub _hub;
        private readonly int _channel;

        private readonly object _slotGate = new();
        private readonly SemaphoreSlim _signal = new(0, 1);

        // Buffer duplo: a thread de decode escreve em _pending enquanto o laço de envio
        // usa _sending. Os dois são trocados na hora de pegar o frame.
        private byte[] _pending = Array.Empty<byte>();
        private byte[] _sending = Array.Empty<byte>();
        private int _pendingLength;

        public VideoSocket(WebSocket socket, VideoHub hub, int channel)
        {
            _socket = socket;
            _hub = hub;
            _channel = channel;
        }

        public async Task RunAsync(CancellationToken ct)
        {
            using var linked = CancellationTokenSource.CreateLinkedTokenSource(ct);

            IDisposable subscription;
            try
            {
                subscription = _hub.Subscribe(_channel, OnFrame);
            }
            catch (Exception ex)
            {
                await CloseAsync(WebSocketCloseStatus.InternalServerError, ex.Message, ct).ConfigureAwait(false);
                return;
            }

            using (subscription)
            {
                // O cliente não manda nada além do close; esta tarefa existe só para
                // perceber a desconexão e derrubar o laço de envio.
                var drain = DrainAsync(linked.Token);

                try
                {
                    await PumpAsync(linked.Token).ConfigureAwait(false);
                }
                catch (OperationCanceledException) { }
                catch (WebSocketException) { /* cliente foi embora */ }
                finally
                {
                    linked.Cancel();
                    try { await drain.ConfigureAwait(false); } catch { }
                }
            }
        }

        /// <summary>Thread NATIVA de decode: copia o frame para o slot e acorda o laço de envio.</summary>
        private void OnFrame(VideoFrame frame)
        {
            int total = VideoFrameHeader.Bytes + frame.Length;

            lock (_slotGate)
            {
                if (_pending.Length < total) _pending = new byte[total];
                VideoFrameHeader.Write(_pending, frame.Width, frame.Height, frame.Sequence);
                Buffer.BlockCopy(frame.Data, 0, _pending, VideoFrameHeader.Bytes, frame.Length);
                _pendingLength = total;
            }

            // Já sinalizado e ainda não consumido: o frame novo substituiu o antigo no slot,
            // então não há nada a somar. SemaphoreFullException aqui é o caso normal.
            try { _signal.Release(); } catch (SemaphoreFullException) { }
        }

        private async Task PumpAsync(CancellationToken ct)
        {
            while (_socket.State == WebSocketState.Open && !ct.IsCancellationRequested)
            {
                await _signal.WaitAsync(ct).ConfigureAwait(false);

                int length;
                lock (_slotGate)
                {
                    if (_pendingLength == 0) continue;
                    (_sending, _pending) = (_pending, _sending);
                    length = _pendingLength;
                    _pendingLength = 0;
                }

                await _socket.SendAsync(_sending.AsMemory(0, length),
                    WebSocketMessageType.Binary, true, ct).ConfigureAwait(false);
            }
        }

        private async Task DrainAsync(CancellationToken ct)
        {
            var buffer = new byte[1024];
            try
            {
                while (_socket.State == WebSocketState.Open && !ct.IsCancellationRequested)
                {
                    var result = await _socket.ReceiveAsync(new ArraySegment<byte>(buffer), ct).ConfigureAwait(false);
                    if (result.MessageType == WebSocketMessageType.Close) return;
                }
            }
            catch { /* fim da conexão */ }
        }

        private async Task CloseAsync(WebSocketCloseStatus status, string reason, CancellationToken ct)
        {
            try
            {
                // O motivo do close é limitado a 123 bytes pelo protocolo.
                if (reason.Length > 100) reason = reason[..100];
                await _socket.CloseAsync(status, reason, ct).ConfigureAwait(false);
            }
            catch { }
        }
    }
}
