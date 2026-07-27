using System.Net.WebSockets;
using System.Text;
using System.Text.Json;

namespace PtzBridge.Server
{
    /// <summary>
    /// Uma conexão em <c>/ws/control</c>: recebe pedidos JSON, despacha para o
    /// <see cref="NvrService"/> e devolve a resposta correlacionada pelo <c>id</c>.
    /// Também recebe os eventos que o serviço empurra.
    /// </summary>
    internal sealed class ControlSocket
    {
        private readonly WebSocket _socket;
        private readonly NvrService _service;

        // Serializa os envios: respostas vêm das threads de leitura e eventos vêm de threads
        // do SDK. Dois SendAsync concorrentes na mesma WebSocket corrompem o frame.
        private readonly SemaphoreSlim _sendLock = new(1, 1);

        public ControlSocket(WebSocket socket, NvrService service)
        {
            _socket = socket;
            _service = service;
        }

        public async Task SendEventAsync(string name, object payload)
        {
            try { await SendAsync(Rpc.Event(name, payload), CancellationToken.None).ConfigureAwait(false); }
            catch { /* cliente sumindo: o laço de leitura encerra a conexão */ }
        }

        public async Task RunAsync(CancellationToken ct)
        {
            var buffer = new byte[64 * 1024];

            while (_socket.State == WebSocketState.Open && !ct.IsCancellationRequested)
            {
                var message = new MemoryStream();
                WebSocketReceiveResult result;

                do
                {
                    result = await _socket.ReceiveAsync(new ArraySegment<byte>(buffer), ct).ConfigureAwait(false);

                    if (result.MessageType == WebSocketMessageType.Close)
                    {
                        await _socket.CloseAsync(WebSocketCloseStatus.NormalClosure, "", ct).ConfigureAwait(false);
                        return;
                    }

                    message.Write(buffer, 0, result.Count);
                }
                while (!result.EndOfMessage);

                if (result.MessageType != WebSocketMessageType.Text) continue;

                var text = Encoding.UTF8.GetString(message.ToArray());
                await HandleAsync(text, ct).ConfigureAwait(false);
            }
        }

        private async Task HandleAsync(string text, CancellationToken ct)
        {
            RpcRequest request;
            try
            {
                request = JsonSerializer.Deserialize<RpcRequest>(text, Rpc.Options);
            }
            catch (JsonException ex)
            {
                await SendAsync(Rpc.Fail(null, $"JSON inválido: {ex.Message}"), ct).ConfigureAwait(false);
                return;
            }

            if (request?.Op == null)
            {
                await SendAsync(Rpc.Fail(request?.Id, "Campo 'op' ausente."), ct).ConfigureAwait(false);
                return;
            }

            try
            {
                var result = Dispatch(request.Op, request.Params);
                await SendAsync(Rpc.Ok(request.Id, result), ct).ConfigureAwait(false);
            }
            catch (Exception ex)
            {
                // Falha de comando é rotina (canal errado, NVR fora do ar, domo sem íris) —
                // vira resposta de erro, nunca derruba a conexão.
                await SendAsync(Rpc.Fail(request.Id, ex.Message), ct).ConfigureAwait(false);
            }
        }

        private object Dispatch(string op, JsonElement? p) => op switch
        {
            "config.get" => _service.ConfigGet(),
            "config.set" => _service.ConfigSet(p),

            "device.connect" => _service.Connect(),
            "device.disconnect" => _service.Disconnect(),
            "device.status" => _service.Status(),

            "ptz.move" => Run(() => _service.PtzMove(p)),
            "ptz.zoom" => Run(() => _service.PtzZoom(p)),
            "ptz.focus" => Run(() => _service.PtzFocus(p)),
            "ptz.iris" => Run(() => _service.PtzIris(p)),
            "ptz.stopAll" => Run(() => _service.PtzStopAll(p)),

            "preset.goto" => Run(() => _service.PresetGoto(p)),
            "preset.set" => Run(() => _service.PresetSet(p)),
            "preset.delete" => Run(() => _service.PresetDelete(p)),
            "preset.rename" => Run(() => _service.PresetRename(p)),
            "preset.list" => _service.PresetList(p),

            "stream.info" => _service.StreamInfo(p),

            _ => throw new ArgumentException($"Operação desconhecida: '{op}'."),
        };

        /// <summary>Adapta um comando sem retorno para a expressão switch acima.</summary>
        private static object Run(Action action)
        {
            action();
            return null;
        }

        private async Task SendAsync(string payload, CancellationToken ct)
        {
            var bytes = Encoding.UTF8.GetBytes(payload);
            await _sendLock.WaitAsync(ct).ConfigureAwait(false);
            try
            {
                if (_socket.State != WebSocketState.Open) return;
                await _socket.SendAsync(bytes, WebSocketMessageType.Text, true, ct).ConfigureAwait(false);
            }
            finally
            {
                _sendLock.Release();
            }
        }
    }
}
