using System.Runtime.InteropServices;

namespace PtzBridge.VirtualCamera
{
    /// <summary>
    /// Ponte para a DLL nativa <c>ScPtzVCam.dll</c>. Cria/remove a câmera virtual de
    /// <b>sessão</b> (via MFCreateVirtualCamera, Windows 11) — ela existe enquanto este processo
    /// viver e não exige elevação. Pré-requisito: a DLL precisa estar registrada em HKLM (feito
    /// uma vez pelo instalador, ou por <c>scripts/install-vcam.ps1</c> em dev), senão a criação
    /// falha e nenhum app vê o dispositivo.
    ///
    /// As chamadas rodam em thread de pool (MTA) porque os objetos de Media Foundation preferem
    /// MTA; criar e remover no mesmo apartamento evita problemas de marshaling COM.
    /// </summary>
    internal static class VirtualCameraNative
    {
        private const string Dll = "ScPtzVCam.dll";

        [DllImport(Dll, CallingConvention = CallingConvention.StdCall, CharSet = CharSet.Unicode, ExactSpelling = true)]
        private static extern int SCVCam_StartSession([MarshalAs(UnmanagedType.LPWStr)] string friendlyName);

        [DllImport(Dll, CallingConvention = CallingConvention.StdCall, ExactSpelling = true)]
        private static extern int SCVCam_StopSession();

        /// <summary>Cria a câmera de sessão. Retorna o HRESULT (0 = sucesso); não lança.</summary>
        public static Task<int> StartSessionAsync(string friendlyName)
            => Task.Run(() =>
            {
                try { return SCVCam_StartSession(friendlyName); }
                catch (DllNotFoundException) { return HResultDllMissing; }
                catch (Exception) { return HResultUnexpected; }
            });

        /// <summary>Remove a câmera de sessão. Não lança.</summary>
        public static Task StopSessionAsync()
            => Task.Run(() =>
            {
                try { SCVCam_StopSession(); }
                catch { /* melhor-esforço no encerramento */ }
            });

        /// <summary>DLL não encontrada (componente nativo não implantado).</summary>
        public const int HResultDllMissing = unchecked((int)0x8007007E); // ERROR_MOD_NOT_FOUND

        /// <summary>DLL presente mas sem registro COM em HKLM (o instalador não rodou).</summary>
        public const int HResultClassNotRegistered = unchecked((int)0x80040154); // REGDB_E_CLASSNOTREG

        /// <summary>Falha inesperada na ponte nativa.</summary>
        public const int HResultUnexpected = unchecked((int)0x80004005); // E_FAIL

        /// <summary>Mensagem em pt-BR para os HRESULTs que o usuário pode resolver sozinho.</summary>
        public static string Describe(int hr) => hr switch
        {
            HResultDllMissing =>
                "Componente da câmera virtual (ScPtzVCam.dll) não encontrado junto do serviço de PTZ.",
            HResultClassNotRegistered =>
                "A câmera virtual não está registrada no Windows. Rode scripts/install-vcam.ps1 como "
                + "Administrador (o instalador faz isso automaticamente).",
            _ => $"Falha ao criar a câmera virtual (0x{hr:X8}).",
        };
    }
}
