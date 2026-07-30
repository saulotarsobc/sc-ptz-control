using System.Net;
using System.Net.Sockets;
using System.Net.WebSockets;
using PtzBridge.Sdk;

namespace PtzBridge.Server
{
    /// <summary>
    /// Servidor local do sidecar. Escuta SÓ em 127.0.0.1 e exige um token que o processo
    /// principal do Electron sorteia a cada execução e repassa ao renderer pelo preload.
    ///
    /// <code>
    /// /ws/control            WebSocket JSON  — comandos e eventos (inclui a câmera virtual)
    /// /ws/video?channel=N    WebSocket bin.  — frames NV12
    /// /api/thumb/{ch}/{n}    GET/PUT/DELETE  — miniaturas JPEG dos presets
    /// </code>
    /// </summary>
    internal sealed class BridgeServer : IDisposable
    {
        private const int MaxThumbBytes = 4 * 1024 * 1024;

        private readonly NvrService _service;
        private readonly string _token;
        private readonly TcpListener _listener;

        private readonly object _controlsGate = new();
        private readonly List<ControlSocket> _controls = new();

        public int Port { get; }

        public BridgeServer(NvrService service, int requestedPort, string token)
        {
            _service = service;
            _token = token;

            // Porta 0 faz o SO escolher uma livre; lemos a escolhida do LocalEndPoint.
            _listener = new TcpListener(IPAddress.Loopback, requestedPort);
            _listener.Start();
            Port = ((IPEndPoint)_listener.LocalEndpoint).Port;

            _service.Event += Broadcast;
        }

        public async Task RunAsync(CancellationToken ct)
        {
            using var registration = ct.Register(() => { try { _listener.Stop(); } catch { } });

            while (!ct.IsCancellationRequested)
            {
                TcpClient client;
                try
                {
                    client = await _listener.AcceptTcpClientAsync(ct).ConfigureAwait(false);
                }
                catch (OperationCanceledException) { break; }
                catch (ObjectDisposedException) { break; }
                catch (SocketException) { break; }

                // Cada conexão é independente: uma falhando não pode parar o accept.
                _ = Task.Run(() => HandleConnectionAsync(client, ct), CancellationToken.None);
            }
        }

        private async Task HandleConnectionAsync(TcpClient client, CancellationToken ct)
        {
            using (client)
            {
                client.NoDelay = true; // comandos de PTZ são minúsculos: Nagle só somaria atraso

                try
                {
                    var stream = client.GetStream();
                    var head = await Http.ReadHeadAsync(stream, ct).ConfigureAwait(false);
                    if (head == null) return;

                    if (head.Method == "OPTIONS")
                    {
                        await Http.WriteAsync(stream, 204, "No Content", ct: ct).ConfigureAwait(false);
                        return;
                    }

                    if (head.QueryValue("token") != _token)
                    {
                        await Http.WriteTextAsync(stream, 401, "Unauthorized", "Token inválido.", ct).ConfigureAwait(false);
                        return;
                    }

                    if (head.IsWebSocketUpgrade)
                        await HandleWebSocketAsync(stream, head, ct).ConfigureAwait(false);
                    else
                        await HandleApiAsync(stream, head, ct).ConfigureAwait(false);
                }
                catch (OperationCanceledException) { }
                catch (Exception ex)
                {
                    Log.Error($"conexão: {ex.Message}");
                }
            }
        }

        // ------------------------------------------------------------------
        // WebSockets
        // ------------------------------------------------------------------

        private async Task HandleWebSocketAsync(Stream stream, HttpRequestHead head, CancellationToken ct)
        {
            if (head.Path is not ("/ws/control" or "/ws/video"))
            {
                await Http.WriteTextAsync(stream, 404, "Not Found", "Rota desconhecida.", ct).ConfigureAwait(false);
                return;
            }

            using var socket = await Http.AcceptWebSocketAsync(stream, head, ct).ConfigureAwait(false);

            if (head.Path == "/ws/video")
            {
                int channel = int.TryParse(head.QueryValue("channel"), out var n) ? n : 1;
                await new VideoSocket(socket, _service.Hub, channel).RunAsync(ct).ConfigureAwait(false);
                return;
            }

            var control = new ControlSocket(socket, _service);
            lock (_controlsGate) _controls.Add(control);

            try
            {
                Log.Info("cliente de controle conectado");
                await control.RunAsync(ct).ConfigureAwait(false);
            }
            catch (OperationCanceledException) { }
            catch (WebSocketException) { /* queda abrupta do cliente é normal */ }
            finally
            {
                bool last;
                lock (_controlsGate)
                {
                    _controls.Remove(control);
                    last = _controls.Count == 0;
                }

                // Sem ninguém no controle, nada garante que o "soltar" de um PTZ contínuo
                // vá chegar — solta tudo agora em vez de esperar o watchdog expirar.
                if (last)
                {
                    Log.Info("último cliente de controle saiu — soltando o PTZ");
                    _service.ReleaseAllPtz();
                }
            }
        }

        private void Broadcast(string name, object payload)
        {
            ControlSocket[] targets;
            lock (_controlsGate) targets = _controls.ToArray();

            foreach (var target in targets)
                _ = target.SendEventAsync(name, payload);
        }

        // ------------------------------------------------------------------
        // /api/thumb/{channel}/{preset}
        // ------------------------------------------------------------------

        private async Task HandleApiAsync(Stream stream, HttpRequestHead head, CancellationToken ct)
        {
            var segments = head.Path.Split('/', StringSplitOptions.RemoveEmptyEntries);

            if (segments is not ["api", "thumb", var chText, var presetText]
                || !int.TryParse(chText, out var channel) || channel < 1
                || !int.TryParse(presetText, out var preset) || preset < 1)
            {
                await Http.WriteTextAsync(stream, 404, "Not Found", "Rota desconhecida.", ct).ConfigureAwait(false);
                return;
            }

            var path = ConfigStore.ThumbPath(channel, preset);

            switch (head.Method)
            {
                case "GET":
                    if (!File.Exists(path))
                    {
                        await Http.WriteTextAsync(stream, 404, "Not Found", "Sem miniatura.", ct).ConfigureAwait(false);
                        return;
                    }
                    // A URL carrega ?v={thumbRev}, então o conteúdo de uma URL nunca muda:
                    // cache longo evita rebaixar 50+ miniaturas a cada render da grade.
                    await Http.WriteAsync(stream, 200, "OK", "image/jpeg",
                        await File.ReadAllBytesAsync(path, ct).ConfigureAwait(false),
                        new[] { ("Cache-Control", "public, max-age=31536000, immutable") }, ct).ConfigureAwait(false);
                    return;

                case "PUT":
                    var body = await Http.ReadBodyAsync(stream, head, MaxThumbBytes, ct).ConfigureAwait(false);
                    if (body.Length == 0)
                    {
                        await Http.WriteTextAsync(stream, 400, "Bad Request", "Corpo vazio.", ct).ConfigureAwait(false);
                        return;
                    }

                    ConfigStore.EnsureThumbDir(channel);
                    // Grava em temporário e move: um GET concorrente nunca vê JPEG pela metade.
                    var tmp = path + ".tmp";
                    await File.WriteAllBytesAsync(tmp, body, ct).ConfigureAwait(false);
                    File.Move(tmp, path, overwrite: true);

                    await Http.WriteJsonAsync(stream, 200, "OK",
                        new { ok = true, rev = new FileInfo(path).LastWriteTimeUtc.Ticks }, ct).ConfigureAwait(false);
                    return;

                case "DELETE":
                    try { File.Delete(path); } catch { }
                    await Http.WriteJsonAsync(stream, 200, "OK", new { ok = true }, ct).ConfigureAwait(false);
                    return;

                default:
                    await Http.WriteTextAsync(stream, 405, "Method Not Allowed", "Método não suportado.", ct).ConfigureAwait(false);
                    return;
            }
        }

        public void Dispose()
        {
            _service.Event -= Broadcast;
            try { _listener.Stop(); } catch { }
        }
    }
}
