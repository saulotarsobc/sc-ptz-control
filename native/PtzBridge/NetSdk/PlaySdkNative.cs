using System.Runtime.InteropServices;

namespace PtzBridge.NetSdk
{
    /// <summary>
    /// P/Invoke mínimo da <c>dhplay.dll</c> (PlaySDK) — o decodificador nativo que o NetSDK
    /// já distribui ao lado do executável. O wrapper NetSDKCS não expõe estas funções; as
    /// assinaturas vêm de <c>helpers\PlaySDK 3.042\...\DLL\dhplay.h</c> (todas __stdcall).
    ///
    /// Uso (padrão do DecCB_demo): GetFreePort → SetStreamOpenMode(REALTIME) → OpenStream →
    /// SetDecCBStream(vídeo) → SetDecCallBackEx → Play(hWnd=Zero, só decodifica) →
    /// InputData(stream bruto do CLIENT_SetRealDataCallBackEx2) → callback entrega I420.
    /// </summary>
    internal static class PlaySdkNative
    {
        private const string Dll = "dhplay.dll";

        /// <summary>Tipo de frame de vídeo I420 (IYUV) em FRAME_INFO.nType.</summary>
        public const int T_IYUV = 3;

        /// <summary>Modo tempo-real de PLAY_SetStreamOpenMode (frames atrasados são descartados).</summary>
        public const uint STREAME_REALTIME = 0;

        /// <summary>PLAY_SetDecCBStream: 1 = só vídeo no callback de decode.</summary>
        public const uint DECCB_STREAM_VIDEO = 1;

        /// <summary>Espelho de FRAME_INFO (dhplay.h): metadados do frame decodificado.</summary>
        [StructLayout(LayoutKind.Sequential)]
        public struct FRAME_INFO
        {
            public int nWidth;      // pixels; 0 para áudio
            public int nHeight;
            public int nStamp;      // timestamp em ms
            public int nType;       // T_IYUV etc.
            public int nFrameRate;
        }

        /// <summary>Callback de decode (thread interna da dhplay). pBuf = dados I420; pFrameInfo = FRAME_INFO*.</summary>
        [UnmanagedFunctionPointer(CallingConvention.StdCall)]
        public delegate void fDecCBFun(int nPort, IntPtr pBuf, int nSize, IntPtr pFrameInfo, IntPtr pUserData, int nReserved2);

        [DllImport(Dll, CallingConvention = CallingConvention.StdCall)]
        public static extern bool PLAY_GetFreePort(out int plPort);

        [DllImport(Dll, CallingConvention = CallingConvention.StdCall)]
        public static extern bool PLAY_ReleasePort(int nPort);

        [DllImport(Dll, CallingConvention = CallingConvention.StdCall)]
        public static extern bool PLAY_SetStreamOpenMode(int nPort, uint nMode);

        [DllImport(Dll, CallingConvention = CallingConvention.StdCall)]
        public static extern bool PLAY_OpenStream(int nPort, IntPtr pFileHeadBuf, uint nSize, uint nBufPoolSize);

        [DllImport(Dll, CallingConvention = CallingConvention.StdCall)]
        public static extern bool PLAY_CloseStream(int nPort);

        [DllImport(Dll, CallingConvention = CallingConvention.StdCall)]
        public static extern bool PLAY_SetDecCBStream(int nPort, uint nStream);

        [DllImport(Dll, CallingConvention = CallingConvention.StdCall)]
        public static extern bool PLAY_SetDecCallBackEx(int nPort, fDecCBFun DecCBFun, IntPtr pUserData);

        [DllImport(Dll, CallingConvention = CallingConvention.StdCall)]
        public static extern bool PLAY_Play(int nPort, IntPtr hWnd);

        [DllImport(Dll, CallingConvention = CallingConvention.StdCall)]
        public static extern bool PLAY_Stop(int nPort);

        [DllImport(Dll, CallingConvention = CallingConvention.StdCall)]
        public static extern bool PLAY_InputData(int nPort, IntPtr pBuf, uint nSize);
    }
}
