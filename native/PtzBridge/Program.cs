using System.Text.Json;
using PtzBridge.Platform;
using PtzBridge.Server;

namespace PtzBridge
{
    /// <summary>
    /// Ponto de entrada do sidecar.
    ///
    /// <code>
    /// PtzBridge.exe --port 0 --token &lt;hex&gt;
    /// </code>
    ///
    /// <para>Com <c>--port 0</c> o SO escolhe a porta e ela é anunciada na PRIMEIRA linha do
    /// stdout — é assim que o processo principal do Electron descobre onde conectar:</para>
    ///
    /// <code>{"ready":true,"port":51234}</code>
    ///
    /// <para>Sem <c>--token</c> o processo não sobe: um servidor local sem token seria
    /// acessível por qualquer página aberta no navegador da máquina.</para>
    /// </summary>
    internal static class Program
    {
        private static async Task<int> Main(string[] args)
        {
            // Tem de preceder a criação do backend: o wrapper oficial pede *.dll mesmo no
            // Linux, e o resolver os aponta para lib*.so quando o SDK estiver presente.
            NativeLibraryResolver.Install();
            int port = GetInt(args, "--port", 0);
            string token = GetString(args, "--token", "");

            if (string.IsNullOrWhiteSpace(token))
            {
                Log.Error("--token é obrigatório.");
                return 2;
            }

            using var shutdown = new CancellationTokenSource();

            Console.CancelKeyPress += (_, e) =>
            {
                e.Cancel = true;
                shutdown.Cancel();
            };

            NvrService service;
            BridgeServer server;
            try
            {
                service = new NvrService();
                server = new BridgeServer(service, port, token);
            }
            catch (Exception ex)
            {
                // Causa mais comum: as DLLs nativas do NetSDK não estão ao lado do .exe.
                Log.Error($"falha ao iniciar: {ex.Message}");
                Console.Out.WriteLine(JsonSerializer.Serialize(new { ready = false, error = ex.Message }));
                Console.Out.Flush();
                return 1;
            }

            using (service)
            using (server)
            {
                Console.Out.WriteLine(JsonSerializer.Serialize(new { ready = true, port = server.Port }));
                Console.Out.Flush();
                Log.Info($"escutando em http://127.0.0.1:{server.Port}");

                // Fire-and-forget de propósito: a tarefa fica bloqueada em stdin.Read e não
                // tem como ser cancelada. Roda numa thread de background, então não segura
                // a saída do processo.
                _ = WatchParentAsync(shutdown);

                try
                {
                    await server.RunAsync(shutdown.Token).ConfigureAwait(false);
                }
                catch (OperationCanceledException) { }

                Log.Info("encerrando");
            }

            return 0;
        }

        /// <summary>
        /// Encerra junto com o processo pai. No Windows um filho não morre com o pai, e um
        /// sidecar órfão continuaria segurando a sessão do NVR e a porta — inclusive
        /// impedindo o próximo start de logar. O fim do stdin é o sinal de que o Electron
        /// se foi (ele não escreve nada ali; o pipe simplesmente fecha).
        /// </summary>
        private static Task WatchParentAsync(CancellationTokenSource shutdown)
        {
            return Task.Run(() =>
            {
                try
                {
                    using var stdin = Console.OpenStandardInput();
                    var scratch = new byte[64];
                    while (!shutdown.IsCancellationRequested)
                    {
                        if (stdin.Read(scratch, 0, scratch.Length) == 0) break; // pipe fechou
                    }
                }
                catch { /* sem stdin (rodando solto no terminal): só ignora */ }

                if (!shutdown.IsCancellationRequested)
                {
                    Log.Info("processo pai encerrou");
                    shutdown.Cancel();
                }
            });
        }

        private static string GetString(string[] args, string name, string fallback)
        {
            int i = Array.IndexOf(args, name);
            return i >= 0 && i + 1 < args.Length ? args[i + 1] : fallback;
        }

        private static int GetInt(string[] args, string name, int fallback)
            => int.TryParse(GetString(args, name, null), out var value) ? value : fallback;
    }
}
