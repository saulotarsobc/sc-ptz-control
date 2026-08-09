using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;

namespace PtzBridge.Platform
{
    /// <summary>
    /// Cifra a senha do NVR para ela não ficar em texto puro no <c>config.json</c> — que é o
    /// que o play-nvr e as versões anteriores do sc-ptz-control faziam.
    ///
    /// <para>No Windows continua sendo DPAPI no escopo do usuário, P/Invoke direto em
    /// <c>crypt32.dll</c> para o projeto seguir sem nenhuma dependência NuGet.</para>
    ///
    /// <para>Fora do Windows não existe DPAPI. O equivalente aqui é AES-GCM com uma chave
    /// aleatória de 32 bytes guardada em <see cref="AppPaths.SecretKeyFile"/> com permissão
    /// <c>0600</c>. A garantia é a mesma que o DPAPI dá e não mais que isso: protege contra
    /// leitura casual do arquivo por outro usuário da máquina, não contra código rodando
    /// como o próprio usuário.</para>
    ///
    /// <para>Blob cifrado em uma plataforma não abre na outra. Isso é intencional e já era o
    /// comportamento do DPAPI ao copiar a config entre máquinas: <see cref="Unprotect"/>
    /// devolve "" e a interface pede a senha de novo.</para>
    /// </summary>
    internal static class SecretProtector
    {
        /// <summary>Cifra e devolve em base64. String vazia entra e sai vazia.</summary>
        public static string Protect(string plain)
        {
            if (string.IsNullOrEmpty(plain)) return "";

            var bytes = Encoding.UTF8.GetBytes(plain);
            var blob = OperatingSystem.IsWindows() ? Dpapi(bytes, protect: true) : AesEncrypt(bytes);
            return Convert.ToBase64String(blob);
        }

        /// <summary>
        /// Decifra um base64 produzido por <see cref="Protect"/>. Devolve "" se o valor for
        /// inválido, tiver sido cifrado por outro usuário/máquina ou em outra plataforma.
        /// </summary>
        public static string Unprotect(string base64)
        {
            if (string.IsNullOrEmpty(base64)) return "";
            try
            {
                var blob = Convert.FromBase64String(base64);
                var bytes = OperatingSystem.IsWindows() ? Dpapi(blob, protect: false) : AesDecrypt(blob);
                return Encoding.UTF8.GetString(bytes);
            }
            catch
            {
                return "";
            }
        }

        // ------------------------------------------------------------------ AES-GCM (Linux/macOS)

        private const int NonceBytes = 12;   // tamanho canônico do GCM
        private const int TagBytes = 16;
        private const int KeyBytes = 32;

        private static byte[] AesEncrypt(byte[] plain)
        {
            var nonce = RandomNumberGenerator.GetBytes(NonceBytes);
            var cipher = new byte[plain.Length];
            var tag = new byte[TagBytes];

            using (var aes = new AesGcm(LoadOrCreateKey(), TagBytes))
                aes.Encrypt(nonce, plain, cipher, tag);

            // nonce || tag || ciphertext
            var blob = new byte[NonceBytes + TagBytes + cipher.Length];
            nonce.CopyTo(blob, 0);
            tag.CopyTo(blob, NonceBytes);
            cipher.CopyTo(blob, NonceBytes + TagBytes);
            return blob;
        }

        private static byte[] AesDecrypt(byte[] blob)
        {
            if (blob.Length < NonceBytes + TagBytes)
                throw new CryptographicException("Blob cifrado truncado.");

            var nonce = blob.AsSpan(0, NonceBytes);
            var tag = blob.AsSpan(NonceBytes, TagBytes);
            var cipher = blob.AsSpan(NonceBytes + TagBytes);
            var plain = new byte[cipher.Length];

            using (var aes = new AesGcm(LoadOrCreateKey(), TagBytes))
                aes.Decrypt(nonce, cipher, tag, plain); // tag inválida lança CryptographicException

            return plain;
        }

        private static byte[] LoadOrCreateKey()
        {
            var path = AppPaths.SecretKeyFile;

            if (File.Exists(path))
            {
                var existing = File.ReadAllBytes(path);
                if (existing.Length == KeyBytes) return existing;
                // Chave corrompida: recriar é melhor que travar o app para sempre. A senha
                // salva vira ilegível e a interface pede outra — mesmo caminho do DPAPI.
            }

            Directory.CreateDirectory(AppPaths.ConfigDir);
            var key = RandomNumberGenerator.GetBytes(KeyBytes);

            // Cria com 0600 ANTES de escrever: criar 0644 e ajustar depois deixaria uma
            // janela em que outro usuário da máquina consegue ler a chave.
            using (var fs = new FileStream(path, new FileStreamOptions
            {
                Mode = FileMode.Create,
                Access = FileAccess.Write,
                Share = FileShare.None,
                UnixCreateMode = UnixFileMode.UserRead | UnixFileMode.UserWrite,
            }))
            {
                fs.Write(key);
            }

            return key;
        }

        // ------------------------------------------------------------------ DPAPI (Windows)

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

        private static byte[] Dpapi(byte[] input, bool protect)
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
