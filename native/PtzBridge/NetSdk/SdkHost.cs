using System.Runtime.InteropServices;
using NetSDKCS;

namespace PtzBridge.NetSdk
{
    /// <summary>
    /// Ciclo de vida do NetSDK no nível do PROCESSO, com contagem de referência.
    ///
    /// <para><c>CLIENT_Init</c>/<c>CLIENT_Cleanup</c> são globais, e os callbacks de
    /// desconexão, reconexão e snapshot são registrados uma única vez para o processo
    /// inteiro — por isso vivem aqui, e não no <see cref="NvrClient"/>.</para>
    ///
    /// <para>No play-nvr isso morava dentro do NvrClient num campo <c>static bool</c>,
    /// mas o <c>Dispose()</c> de UMA instância chamava <c>Cleanup()</c> e derrubava o SDK
    /// de todas as outras. Aqui o Cleanup só acontece quando o último usuário solta.</para>
    /// </summary>
    internal static class SdkHost
    {
        private static readonly object Gate = new();
        private static int _refCount;

        // Delegates mantidos em campos estáticos para NÃO serem coletados pelo GC
        // enquanto o SDK nativo guarda o ponteiro para eles.
        private static readonly fDisConnectCallBack DisconnectCb = OnDisconnect;
        private static readonly fHaveReConnectCallBack ReconnectCb = OnReconnect;
        private static readonly fSnapRevCallBack SnapCb = OnSnapReceived;

        /// <summary>Conexão caiu. Argumento: handle de login afetado.</summary>
        public static event Action<IntPtr> Disconnected;

        /// <summary>SDK reconectou sozinho. Argumento: handle de login afetado.</summary>
        public static event Action<IntPtr> Reconnected;

        /// <summary>Chegou um JPEG de snapshot. Argumentos: handle de login, bytes.</summary>
        public static event Action<IntPtr, byte[]> SnapshotReceived;

        /// <summary>Inicializa o SDK na primeira chamada; nas seguintes só incrementa.</summary>
        public static void Acquire()
        {
            lock (Gate)
            {
                if (_refCount == 0)
                {
                    if (!NETClient.Init(DisconnectCb, IntPtr.Zero, null))
                        throw new InvalidOperationException(
                            "Falha ao inicializar o NetSDK (CLIENT_Init). " +
                            "Confirme que as DLLs nativas estão ao lado do executável.");

                    NETClient.SetAutoReconnect(ReconnectCb, IntPtr.Zero);
                    NETClient.SetSnapRevCallBack(SnapCb, IntPtr.Zero);
                }
                _refCount++;
            }
        }

        /// <summary>Solta a referência; o <c>Cleanup</c> só roda quando a última sai.</summary>
        public static void Release()
        {
            lock (Gate)
            {
                if (_refCount == 0) return;
                if (--_refCount == 0) NETClient.Cleanup();
            }
        }

        // Os três callbacks abaixo chegam em threads NATIVAS do SDK. Nenhuma exceção
        // pode escapar daqui, sob pena de derrubar o processo sem stack trace útil.

        private static void OnDisconnect(IntPtr loginId, IntPtr ip, int port, IntPtr user)
        {
            try { Disconnected?.Invoke(loginId); } catch { /* nunca propagar p/ nativo */ }
        }

        private static void OnReconnect(IntPtr loginId, IntPtr ip, int port, IntPtr user)
        {
            try { Reconnected?.Invoke(loginId); } catch { /* nunca propagar p/ nativo */ }
        }

        private static void OnSnapReceived(IntPtr loginId, IntPtr pBuf, uint revLen, uint encodeType, uint cmdSerial, IntPtr dwUser)
        {
            try
            {
                if (encodeType != 10 || revLen == 0 || pBuf == IntPtr.Zero) return; // 10 = JPEG

                var data = new byte[revLen];
                Marshal.Copy(pBuf, data, 0, (int)revLen);
                SnapshotReceived?.Invoke(loginId, data);
            }
            catch { /* nunca propagar p/ nativo */ }
        }
    }
}
