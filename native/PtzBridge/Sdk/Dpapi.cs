using System.Runtime.InteropServices;
using System.Text;

namespace PtzBridge.Sdk
{
    /// <summary>
    /// DPAPI (<c>CryptProtectData</c>/<c>CryptUnprotectData</c>) no escopo do usuário atual,
    /// para não guardar a senha do NVR em texto puro no <c>config.json</c> — que é o que o
    /// play-nvr e o sc-ptz-control faziam até aqui.
    ///
    /// <para>É P/Invoke direto em vez do pacote <c>System.Security.Cryptography.ProtectedData</c>
    /// para o projeto continuar sem nenhuma dependência NuGet, como o play-nvr.</para>
    ///
    /// <para>Protege contra leitura casual do arquivo por outro usuário da máquina; não
    /// protege contra código rodando como o próprio usuário.</para>
    /// </summary>
    internal static class Dpapi
    {
        [StructLayout(LayoutKind.Sequential)]
        private struct DATA_BLOB
        {
            public int cbData;
            public IntPtr pbData;
        }

        private const int CRYPTPROTECT_UI_FORBIDDEN = 0x1;

        [DllImport("crypt32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
        private static extern bool CryptProtectData(
            ref DATA_BLOB pDataIn, string szDataDescr, IntPtr pOptionalEntropy,
            IntPtr pvReserved, IntPtr pPromptStruct, int dwFlags, out DATA_BLOB pDataOut);

        [DllImport("crypt32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
        private static extern bool CryptUnprotectData(
            ref DATA_BLOB pDataIn, IntPtr ppszDataDescr, IntPtr pOptionalEntropy,
            IntPtr pvReserved, IntPtr pPromptStruct, int dwFlags, out DATA_BLOB pDataOut);

        [DllImport("kernel32.dll")]
        private static extern IntPtr LocalFree(IntPtr hMem);

        /// <summary>Cifra e devolve em base64. String vazia entra e sai vazia.</summary>
        public static string Protect(string plain)
        {
            if (string.IsNullOrEmpty(plain)) return "";
            return System.Convert.ToBase64String(Transform(Encoding.UTF8.GetBytes(plain), protect: true));
        }

        /// <summary>
        /// Decifra um base64 produzido por <see cref="Protect"/>. Devolve "" se o valor for
        /// inválido ou tiver sido cifrado por outro usuário/máquina (config copiada, por exemplo).
        /// </summary>
        public static string Unprotect(string base64)
        {
            if (string.IsNullOrEmpty(base64)) return "";
            try
            {
                return Encoding.UTF8.GetString(Transform(System.Convert.FromBase64String(base64), protect: false));
            }
            catch
            {
                return "";
            }
        }

        private static byte[] Transform(byte[] input, bool protect)
        {
            var inBlob = new DATA_BLOB();
            var outBlob = new DATA_BLOB();
            try
            {
                inBlob.cbData = input.Length;
                inBlob.pbData = Marshal.AllocHGlobal(input.Length);
                Marshal.Copy(input, 0, inBlob.pbData, input.Length);

                bool ok = protect
                    ? CryptProtectData(ref inBlob, "sc-ptz-control", IntPtr.Zero, IntPtr.Zero, IntPtr.Zero,
                                       CRYPTPROTECT_UI_FORBIDDEN, out outBlob)
                    : CryptUnprotectData(ref inBlob, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero,
                                         CRYPTPROTECT_UI_FORBIDDEN, out outBlob);

                if (!ok)
                    throw new InvalidOperationException(
                        $"DPAPI falhou (erro {Marshal.GetLastWin32Error()}).");

                var result = new byte[outBlob.cbData];
                Marshal.Copy(outBlob.pbData, result, 0, outBlob.cbData);
                return result;
            }
            finally
            {
                if (inBlob.pbData != IntPtr.Zero) Marshal.FreeHGlobal(inBlob.pbData);
                if (outBlob.pbData != IntPtr.Zero) LocalFree(outBlob.pbData); // alocado pelo crypt32
            }
        }
    }
}
