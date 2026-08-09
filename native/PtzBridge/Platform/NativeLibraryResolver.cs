using System.Reflection;
using System.Runtime.InteropServices;

namespace PtzBridge.Platform
{
    /// <summary>
    /// Faz os <c>DllImport("dhnetsdk.dll")</c> do wrapper NetSDKCS e do
    /// <see cref="Sdk.PlaySdkNative"/> encontrarem as bibliotecas certas fora do Windows.
    ///
    /// <para>Os nomes nos atributos vêm do wrapper OFICIAL da Dahua, que é compilado para
    /// dentro deste assembly — não dá para editá-los sem duplicar o wrapper no repo. Um
    /// resolver de assembly resolve o problema sem tocar em nenhum <c>DllImport</c>:
    /// <c>dhnetsdk.dll</c> vira <c>libdhnetsdk.so</c> no Linux.</para>
    ///
    /// <para>A busca prioriza a pasta do executável porque é lá que o electron-builder
    /// deposita o SDK (<c>resources/ptz-bridge/</c>). Sem isso o loader só olharia
    /// <c>LD_LIBRARY_PATH</c> e as libs da Dahua não estão em nenhum caminho padrão.</para>
    /// </summary>
    internal static class NativeLibraryResolver
    {
        /// <summary>Subpastas onde o SDK costuma vir dentro do pacote da Dahua.</summary>
        private static readonly string[] SearchSubdirs = { "", "libs", "lib" };

        private static bool _installed;

        /// <summary>
        /// Registra o resolver para este assembly. Precisa rodar antes do primeiro P/Invoke —
        /// ou seja, antes de qualquer coisa que toque no <c>NETClient</c>.
        /// </summary>
        public static void Install()
        {
            if (_installed) return;
            _installed = true;

            // No Windows os nomes já batem com os arquivos; um resolver só adicionaria
            // caminho de código sem ganho nenhum.
            if (OperatingSystem.IsWindows()) return;

            NativeLibrary.SetDllImportResolver(typeof(NativeLibraryResolver).Assembly, Resolve);
        }

        private static IntPtr Resolve(string libraryName, Assembly assembly, DllImportSearchPath? searchPath)
        {
            foreach (var candidate in CandidateNames(libraryName))
            {
                foreach (var subdir in SearchSubdirs)
                {
                    var full = Path.Combine(AppContext.BaseDirectory, subdir, candidate);
                    if (File.Exists(full) && NativeLibrary.TryLoad(full, out var fromDisk))
                        return fromDisk;
                }

                // Instalada no sistema (pacote da distro ou LD_LIBRARY_PATH).
                if (NativeLibrary.TryLoad(candidate, assembly, searchPath, out var fromPath))
                    return fromPath;
            }

            // IntPtr.Zero = "não sei resolver": o runtime segue com o comportamento padrão e
            // lança DllNotFoundException com o nome original, que é a mensagem mais útil.
            return IntPtr.Zero;
        }

        /// <summary>
        /// Nomes plausíveis para uma lib pedida como <c>foo.dll</c>: <c>libfoo.so</c> (padrão
        /// dos pacotes Linux da Dahua), <c>foo.so</c> e o nome original.
        /// </summary>
        private static IEnumerable<string> CandidateNames(string libraryName)
        {
            var stem = Path.GetFileNameWithoutExtension(libraryName);

            if (OperatingSystem.IsMacOS())
            {
                yield return $"lib{stem}.dylib";
                yield return $"{stem}.dylib";
            }
            else
            {
                yield return $"lib{stem}.so";
                yield return $"{stem}.so";
            }

            yield return libraryName;
        }

        /// <summary>
        /// Diz se o NetSDK nativo está presente. É o que decide, no Linux, entre usar o SDK
        /// ou cair para o backend RTSP+CGI — sem isso a única forma de descobrir seria deixar
        /// o <c>CLIENT_Init</c> estourar DllNotFoundException.
        /// </summary>
        public static bool NetSdkAvailable => Probe("dhnetsdk") && Probe("dhplay");

        private static bool Probe(string stem)
        {
            foreach (var candidate in CandidateNames($"{stem}.dll"))
            {
                foreach (var subdir in SearchSubdirs)
                {
                    if (File.Exists(Path.Combine(AppContext.BaseDirectory, subdir, candidate)))
                        return true;
                }

                // Já instalada no sistema: TryLoad é o único teste honesto, e o handle fica
                // aberto de propósito — a lib vai ser usada logo em seguida.
                if (NativeLibrary.TryLoad(candidate, out _))
                    return true;
            }

            return false;
        }
    }
}
