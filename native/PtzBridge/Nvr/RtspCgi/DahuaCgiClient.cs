using System.Net;
using System.Text;

namespace PtzBridge.Nvr.RtspCgi
{
    /// <summary>
    /// Cliente da API HTTP CGI dos equipamentos Dahua/Intelbras — o mesmo conjunto de
    /// endpoints que a interface web do NVR usa.
    ///
    /// <para>A autenticação é Digest (alguns firmwares antigos aceitam Basic), tratada pelo
    /// <see cref="HttpClientHandler"/> a partir de um <see cref="CredentialCache"/>. É por
    /// isso que este backend só funciona no sidecar: no navegador o Digest exigiria desligar
    /// o <c>webSecurity</c>, que foi justamente o que a arquitetura atual eliminou.</para>
    ///
    /// <para>As respostas são texto simples no formato <c>chave=valor</c> por linha.</para>
    /// </summary>
    internal sealed class DahuaCgiClient : IDisposable
    {
        private readonly HttpClient _http;
        private readonly string _baseUrl;

        public DahuaCgiClient(string ip, int httpPort, string user, string password)
        {
            _baseUrl = $"http://{ip}:{httpPort}";

            var credentials = new CredentialCache();
            var uri = new Uri(_baseUrl);
            // Digest é o que os firmwares atuais usam; Basic fica como reserva para os antigos.
            credentials.Add(uri, "Digest", new NetworkCredential(user, password));
            credentials.Add(uri, "Basic", new NetworkCredential(user, password));

            _http = new HttpClient(new HttpClientHandler
            {
                Credentials = credentials,
                PreAuthenticate = true,
            })
            {
                // Curto de propósito: um comando de PTZ que demora 5 s já não serve para nada,
                // e o watchdog precisa que a chamada retorne para soltar o eixo.
                Timeout = TimeSpan.FromSeconds(5),
            };
        }

        /// <summary>
        /// Executa um CGI e devolve o corpo. Lança <see cref="InvalidOperationException"/> com
        /// mensagem em pt-BR — é o que chega à interface.
        /// </summary>
        public string Get(string pathAndQuery)
        {
            try
            {
                using var response = _http.GetAsync(_baseUrl + pathAndQuery).GetAwaiter().GetResult();

                if (response.StatusCode == HttpStatusCode.Unauthorized)
                    throw new InvalidOperationException("Usuário ou senha incorretos.");

                if (!response.IsSuccessStatusCode)
                    throw new InvalidOperationException(
                        $"O equipamento respondeu {(int)response.StatusCode} em {pathAndQuery}.");

                return response.Content.ReadAsStringAsync().GetAwaiter().GetResult();
            }
            catch (InvalidOperationException)
            {
                throw;
            }
            catch (TaskCanceledException)
            {
                throw new InvalidOperationException("O equipamento não respondeu a tempo.");
            }
            catch (HttpRequestException ex)
            {
                throw new InvalidOperationException($"Não foi possível falar com o equipamento: {ex.Message}");
            }
        }

        /// <summary>
        /// Como <see cref="Get"/>, mas engole a falha. Para comandos em que desistir em
        /// silêncio é melhor que estourar — por exemplo soltar um eixo que o domo não tem.
        /// </summary>
        public bool TryGet(string pathAndQuery)
        {
            try { Get(pathAndQuery); return true; }
            catch { return false; }
        }

        /// <summary>Quebra a resposta <c>chave=valor</c> num dicionário (chave sem diferenciar caixa).</summary>
        public static Dictionary<string, string> ParseKeyValues(string body)
        {
            var result = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            if (string.IsNullOrEmpty(body)) return result;

            foreach (var raw in body.Split('\n'))
            {
                var line = raw.Trim();
                if (line.Length == 0) continue;

                int eq = line.IndexOf('=');
                if (eq <= 0) continue;

                result[line[..eq].Trim()] = line[(eq + 1)..].Trim();
            }

            return result;
        }

        /// <summary>Monta a query escapando os valores (senhas com <c>&amp;</c> quebrariam a URL).</summary>
        public static string Query(string path, params (string Key, object Value)[] parameters)
        {
            var sb = new StringBuilder(path);
            for (int i = 0; i < parameters.Length; i++)
            {
                sb.Append(i == 0 ? '?' : '&')
                  .Append(Uri.EscapeDataString(parameters[i].Key))
                  .Append('=')
                  .Append(Uri.EscapeDataString(parameters[i].Value?.ToString() ?? ""));
            }
            return sb.ToString();
        }

        public void Dispose() => _http.Dispose();
    }
}
