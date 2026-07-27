using System.Text.Json;
using System.Text.Json.Serialization;

namespace PtzBridge.Sdk
{
    /// <summary>
    /// Configuração de acesso ao NVR/DVR + preferências, persistida em
    /// <c>%APPDATA%/sc-ptz-control/config.json</c>. O sidecar é o dono desta configuração —
    /// o renderer lê e escreve por <c>config.get</c>/<c>config.set</c> e nunca guarda
    /// credencial no <c>localStorage</c>.
    /// </summary>
    public sealed class AppConfig
    {
        public string Ip { get; set; } = "192.168.1.108";

        /// <summary>Porta do protocolo privado do SDK — 37777, não a 80 da API HTTP.</summary>
        public int Port { get; set; } = 37777;

        public string User { get; set; } = "admin";

        /// <summary>Senha cifrada com DPAPI (base64). Nunca serializada em claro.</summary>
        public string PasswordProtected { get; set; } = "";

        /// <summary>Canal ativo, 1-based (como na UI).</summary>
        public int Channel { get; set; } = 1;

        /// <summary>Quantidade de presets exibidos na grade (24..100).</summary>
        public int PresetCount { get; set; } = 24;

        /// <summary>Preset para onde o botão central do D-pad leva.</summary>
        public int HomePreset { get; set; } = 1;

        /// <summary>Velocidade padrão do PTZ (faixa do SDK: 1..8).</summary>
        public int PtzSpeed { get; set; } = 4;

        /// <summary>Largura máxima do vídeo enviado ao renderer; a altura segue a proporção.</summary>
        public int MaxVideoWidth { get; set; } = 960;

        /// <summary>true = stream extra (leve, baixa resolução); false = principal.</summary>
        public bool UseSubStream { get; set; } = false;

        /// <summary>Canal ativo no formato do SDK (base 0).</summary>
        [JsonIgnore]
        public int SdkChannel => Math.Max(0, Channel - 1);

        [JsonIgnore]
        public bool IsComplete =>
            !string.IsNullOrWhiteSpace(Ip) && Port > 0 && !string.IsNullOrWhiteSpace(User);

        /// <summary>Senha em claro (decifrada sob demanda). Só usada na hora do login.</summary>
        [JsonIgnore]
        public string Password
        {
            get => Dpapi.Unprotect(PasswordProtected);
            set => PasswordProtected = Dpapi.Protect(value ?? "");
        }
    }

    /// <summary>Carrega/salva o <see cref="AppConfig"/> e resolve caminhos de miniatura.</summary>
    public static class ConfigStore
    {
        private static string Dir => Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "sc-ptz-control");

        private static string ConfigPath => Path.Combine(Dir, "config.json");

        private static string ThumbsDir => Path.Combine(Dir, "thumbs");

        private static readonly JsonSerializerOptions Opts = new() { WriteIndented = true };

        public static AppConfig Load()
        {
            try
            {
                if (File.Exists(ConfigPath))
                    return JsonSerializer.Deserialize<AppConfig>(File.ReadAllText(ConfigPath)) ?? new AppConfig();
            }
            catch { /* config corrompida → volta ao padrão */ }
            return new AppConfig();
        }

        public static void Save(AppConfig cfg)
        {
            Directory.CreateDirectory(Dir);
            // Escrita atômica: um Ctrl+C no meio do WriteAllText deixaria o JSON truncado
            // e a config voltaria ao padrão no próximo start, perdendo IP e senha.
            var tmp = ConfigPath + ".tmp";
            File.WriteAllText(tmp, JsonSerializer.Serialize(cfg, Opts));
            File.Move(tmp, ConfigPath, overwrite: true);
        }

        /// <summary>
        /// Caminho da miniatura de um preset. Indexado POR CANAL — no play-nvr o caminho
        /// ignorava o canal e as miniaturas se misturavam ao trocar de câmera.
        /// </summary>
        public static string ThumbPath(int channel, int preset)
            => Path.Combine(ThumbsDir, $"ch{channel:D2}", $"preset_{preset:D3}.jpg");

        public static void EnsureThumbDir(int channel)
            => Directory.CreateDirectory(Path.Combine(ThumbsDir, $"ch{channel:D2}"));
    }
}
