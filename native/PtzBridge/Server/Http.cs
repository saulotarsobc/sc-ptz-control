using System.Net.Sockets;
using System.Net.WebSockets;
using System.Security.Cryptography;
using System.Text;

namespace PtzBridge.Server
{
    /// <summary>Cabeçalho de uma requisição HTTP/1.1, já com rota e query separadas.</summary>
    internal sealed class HttpRequestHead
    {
        public string Method { get; init; } = "";
        public string Path { get; init; } = "";
        public Dictionary<string, string> Query { get; init; } = new(StringComparer.OrdinalIgnoreCase);
        public Dictionary<string, string> Headers { get; init; } = new(StringComparer.OrdinalIgnoreCase);

        /// <summary>Bytes do corpo que já vieram junto com o cabeçalho na mesma leitura.</summary>
        public byte[] BodyPrefix { get; init; } = Array.Empty<byte>();

        public int ContentLength =>
            Headers.TryGetValue("Content-Length", out var v) && int.TryParse(v, out var n) ? n : 0;

        public bool IsWebSocketUpgrade =>
            Headers.TryGetValue("Upgrade", out var u) &&
            u.Contains("websocket", StringComparison.OrdinalIgnoreCase);

        public string QueryValue(string name) => Query.TryGetValue(name, out var v) ? v : "";
    }

    /// <summary>
    /// HTTP/1.1 mínimo sobre <see cref="TcpListener"/>.
    ///
    /// <para>Deliberadamente NÃO usa <c>HttpListener</c>: ele passa pelo http.sys, que exige
    /// uma reserva de URL (<c>netsh http add urlacl</c>) ou processo elevado. Como o sidecar
    /// roda sem privilégio na máquina do operador, isso falharia com "Access is denied".</para>
    ///
    /// <para>Só precisa atender quatro rotas e o handshake de WebSocket, então responde
    /// sempre com <c>Connection: close</c> — sem keep-alive, sem chunked, sem pipelining.</para>
    /// </summary>
    internal static class Http
    {
        private const int MaxHeadBytes = 16 * 1024;
        private const string WebSocketGuid = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

        /// <summary>Lê o cabeçalho até o CRLFCRLF. Devolve null se a conexão fechar ou for inválida.</summary>
        public static async Task<HttpRequestHead> ReadHeadAsync(Stream stream, CancellationToken ct)
        {
            var buffer = new byte[MaxHeadBytes];
            int filled = 0, headEnd = -1;

            while (headEnd < 0)
            {
                if (filled == buffer.Length) return null; // cabeçalho absurdo: descarta

                int read = await stream.ReadAsync(buffer.AsMemory(filled), ct).ConfigureAwait(false);
                if (read == 0) return null;

                // Recomeça a busca 3 bytes antes do novo trecho: o CRLFCRLF pode estar partido.
                int searchFrom = Math.Max(0, filled - 3);
                filled += read;
                headEnd = IndexOfCrLfCrLf(buffer, searchFrom, filled);
            }

            var text = Encoding.ASCII.GetString(buffer, 0, headEnd);
            var lines = text.Split("\r\n", StringSplitOptions.RemoveEmptyEntries);
            if (lines.Length == 0) return null;

            var requestLine = lines[0].Split(' ');
            if (requestLine.Length < 2) return null;

            var (path, query) = SplitTarget(requestLine[1]);

            var headers = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            for (int i = 1; i < lines.Length; i++)
            {
                int colon = lines[i].IndexOf(':');
                if (colon <= 0) continue;
                headers[lines[i][..colon].Trim()] = lines[i][(colon + 1)..].Trim();
            }

            int bodyStart = headEnd + 4;
            return new HttpRequestHead
            {
                Method = requestLine[0].ToUpperInvariant(),
                Path = path,
                Query = query,
                Headers = headers,
                BodyPrefix = buffer[bodyStart..filled],
            };
        }

        /// <summary>Lê o corpo completo, aproveitando o que já veio junto do cabeçalho.</summary>
        public static async Task<byte[]> ReadBodyAsync(Stream stream, HttpRequestHead head, int maxBytes, CancellationToken ct)
        {
            int length = head.ContentLength;
            if (length <= 0) return Array.Empty<byte>();
            if (length > maxBytes) throw new InvalidDataException($"Corpo grande demais ({length} bytes).");

            var body = new byte[length];
            int copied = Math.Min(head.BodyPrefix.Length, length);
            head.BodyPrefix.AsSpan(0, copied).CopyTo(body);

            while (copied < length)
            {
                int read = await stream.ReadAsync(body.AsMemory(copied), ct).ConfigureAwait(false);
                if (read == 0) throw new InvalidDataException("Conexão fechou no meio do corpo.");
                copied += read;
            }

            return body;
        }

        public static Task WriteAsync(Stream stream, int status, string reason,
            string contentType = null, byte[] body = null,
            IEnumerable<(string Name, string Value)> extraHeaders = null,
            CancellationToken ct = default)
        {
            body ??= Array.Empty<byte>();

            var sb = new StringBuilder();
            sb.Append($"HTTP/1.1 {status} {reason}\r\n");
            // Loopback + token, mas o renderer roda em file:// (Origin "null") em produção e
            // em http://localhost:5173 no dev — sem isso o fetch é barrado pelo CORS.
            sb.Append("Access-Control-Allow-Origin: *\r\n");
            sb.Append("Access-Control-Allow-Methods: GET, PUT, DELETE, OPTIONS\r\n");
            sb.Append("Access-Control-Allow-Headers: Content-Type\r\n");
            if (contentType != null) sb.Append($"Content-Type: {contentType}\r\n");
            if (extraHeaders != null)
                foreach (var (name, value) in extraHeaders) sb.Append($"{name}: {value}\r\n");
            sb.Append($"Content-Length: {body.Length}\r\n");
            sb.Append("Connection: close\r\n\r\n");

            var head = Encoding.ASCII.GetBytes(sb.ToString());
            var packet = new byte[head.Length + body.Length];
            head.CopyTo(packet, 0);
            body.CopyTo(packet, head.Length);
            return stream.WriteAsync(packet, ct).AsTask();
        }

        public static Task WriteJsonAsync(Stream stream, int status, string reason, object payload, CancellationToken ct = default)
            => WriteAsync(stream, status, reason, "application/json; charset=utf-8",
                          Encoding.UTF8.GetBytes(Rpc.Serialize(payload)), ct: ct);

        public static Task WriteTextAsync(Stream stream, int status, string reason, string message, CancellationToken ct = default)
            => WriteAsync(stream, status, reason, "text/plain; charset=utf-8", Encoding.UTF8.GetBytes(message), ct: ct);

        /// <summary>
        /// Completa o handshake de WebSocket e entrega um <see cref="WebSocket"/> em modo
        /// servidor sobre o mesmo socket.
        /// </summary>
        public static async Task<WebSocket> AcceptWebSocketAsync(Stream stream, HttpRequestHead head, CancellationToken ct)
        {
            if (!head.Headers.TryGetValue("Sec-WebSocket-Key", out var key) || string.IsNullOrWhiteSpace(key))
                throw new InvalidDataException("Handshake de WebSocket sem Sec-WebSocket-Key.");

            var accept = System.Convert.ToBase64String(
                SHA1.HashData(Encoding.ASCII.GetBytes(key.Trim() + WebSocketGuid)));

            var response = Encoding.ASCII.GetBytes(
                "HTTP/1.1 101 Switching Protocols\r\n" +
                "Upgrade: websocket\r\n" +
                "Connection: Upgrade\r\n" +
                $"Sec-WebSocket-Accept: {accept}\r\n\r\n");

            await stream.WriteAsync(response, ct).ConfigureAwait(false);
            await stream.FlushAsync(ct).ConfigureAwait(false);

            return WebSocket.CreateFromStream(stream, new WebSocketCreationOptions
            {
                IsServer = true,
                KeepAliveInterval = TimeSpan.FromSeconds(30),
            });
        }

        private static (string Path, Dictionary<string, string> Query) SplitTarget(string target)
        {
            var query = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

            int mark = target.IndexOf('?');
            if (mark < 0) return (Uri.UnescapeDataString(target), query);

            foreach (var pair in target[(mark + 1)..].Split('&', StringSplitOptions.RemoveEmptyEntries))
            {
                int eq = pair.IndexOf('=');
                if (eq < 0) query[Uri.UnescapeDataString(pair)] = "";
                else query[Uri.UnescapeDataString(pair[..eq])] = Uri.UnescapeDataString(pair[(eq + 1)..]);
            }

            return (Uri.UnescapeDataString(target[..mark]), query);
        }

        private static int IndexOfCrLfCrLf(byte[] buffer, int from, int to)
        {
            for (int i = from; i + 3 < to; i++)
                if (buffer[i] == '\r' && buffer[i + 1] == '\n' && buffer[i + 2] == '\r' && buffer[i + 3] == '\n')
                    return i;
            return -1;
        }
    }
}
