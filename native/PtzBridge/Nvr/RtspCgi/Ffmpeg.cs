using System.Diagnostics;

namespace PtzBridge.Nvr.RtspCgi
{
    /// <summary>
    /// Localiza o <c>ffmpeg</c>/<c>ffprobe</c> que o backend RTSP usa para decodificar o vídeo.
    ///
    /// <para>Não é embarcado no pacote de propósito: o ffmpeg é LGPL/GPL conforme a compilação
    /// e redistribuí-lo mudaria as obrigações de licença do aplicativo inteiro. No Ubuntu ele
    /// é <c>apt install ffmpeg</c>; no Windows este backend é só um plano B, então o caminho
    /// normal continua sendo o NetSDK.</para>
    /// </summary>
    internal static class Ffmpeg
    {
        /// <summary>Sobrepõe a busca — útil para apontar um build específico.</summary>
        private const string OverrideVar = "SC_PTZ_FFMPEG_DIR";

        private static readonly string Suffix = OperatingSystem.IsWindows() ? ".exe" : "";

        private static string _ffmpeg;
        private static string _ffprobe;

        public static string FfmpegPath => _ffmpeg ??= Locate("ffmpeg");
        public static string FfprobePath => _ffprobe ??= Locate("ffprobe");

        public static bool IsAvailable => FfmpegPath != null;

        /// <summary>Mensagem pronta para a interface quando o binário não está instalado.</summary>
        public static string MissingMessage =>
            OperatingSystem.IsWindows()
                ? "ffmpeg não encontrado. Instale-o e coloque no PATH, ou defina "
                  + $"{OverrideVar} com a pasta onde ele está."
                : "ffmpeg não encontrado. Instale com: sudo apt install ffmpeg";

        private static string Locate(string tool)
        {
            var exe = tool + Suffix;

            var custom = Environment.GetEnvironmentVariable(OverrideVar);
            if (!string.IsNullOrWhiteSpace(custom))
            {
                var candidate = Path.Combine(custom, exe);
                if (File.Exists(candidate)) return candidate;
            }

            // Ao lado do sidecar: permite empacotar um ffmpeg junto sem mexer no PATH.
            var local = Path.Combine(AppContext.BaseDirectory, exe);
            if (File.Exists(local)) return local;

            foreach (var dir in (Environment.GetEnvironmentVariable("PATH") ?? "")
                     .Split(Path.PathSeparator, StringSplitOptions.RemoveEmptyEntries))
            {
                try
                {
                    var candidate = Path.Combine(dir.Trim(), exe);
                    if (File.Exists(candidate)) return candidate;
                }
                catch { /* entrada inválida no PATH — segue */ }
            }

            return null;
        }

        /// <summary>
        /// Descobre largura, altura e fps do stream. Devolve <c>null</c> se o ffprobe não
        /// existir ou o equipamento não responder no prazo — quem chama assume um formato
        /// padrão em vez de falhar, porque o vídeo ainda pode vir normalmente.
        /// </summary>
        public static (int Width, int Height, int Fps)? Probe(string url, int timeoutMs = 8000)
        {
            if (FfprobePath == null) return null;

            var psi = new ProcessStartInfo(FfprobePath)
            {
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true,
            };
            foreach (var arg in new[]
            {
                "-v", "error",
                "-rtsp_transport", "tcp",
                "-select_streams", "v:0",
                "-show_entries", "stream=width,height,avg_frame_rate",
                "-of", "default=noprint_wrappers=1:nokey=1",
                url,
            })
            {
                psi.ArgumentList.Add(arg);
            }

            try
            {
                using var proc = Process.Start(psi);
                if (proc == null) return null;

                var stdout = proc.StandardOutput.ReadToEnd();
                if (!proc.WaitForExit(timeoutMs))
                {
                    try { proc.Kill(entireProcessTree: true); } catch { }
                    return null;
                }

                var lines = stdout.Split('\n', StringSplitOptions.RemoveEmptyEntries);
                if (lines.Length < 2) return null;

                if (!int.TryParse(lines[0].Trim(), out int w) || w <= 0) return null;
                if (!int.TryParse(lines[1].Trim(), out int h) || h <= 0) return null;

                int fps = lines.Length > 2 ? ParseRational(lines[2].Trim()) : 0;
                return (w, h, fps);
            }
            catch
            {
                return null;
            }
        }

        /// <summary>avg_frame_rate vem como "25/1" (ou "0/0" quando o equipamento não informa).</summary>
        private static int ParseRational(string value)
        {
            var parts = value.Split('/');
            if (parts.Length != 2) return 0;
            if (!int.TryParse(parts[0], out int num) || !int.TryParse(parts[1], out int den)) return 0;
            return den == 0 ? 0 : (int)Math.Round(num / (double)den);
        }
    }
}
