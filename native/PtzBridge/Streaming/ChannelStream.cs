using System.Runtime.InteropServices;
using NetSDKCS;
using PtzBridge.Sdk;

namespace PtzBridge.Streaming
{
    /// <summary>
    /// Formato de um canal. <c>Width</c>/<c>Height</c> são o que trafega (sempre 16:9);
    /// <c>SourceWidth</c>/<c>SourceHeight</c> são o que o decodificador informou, guardados
    /// para diagnóstico — estes domos costumam entregar frames anamórficos.
    /// </summary>
    internal readonly record struct StreamFormat(
        int Channel,
        int Width,
        int Height,
        int Fps,
        int SourceWidth,
        int SourceHeight);

    /// <summary>
    /// Frame pronto para envio. <see cref="Data"/> é o buffer REUTILIZADO do scaler e só é
    /// válido durante a chamada do evento — quem precisar guardar tem que copiar.
    /// </summary>
    internal readonly struct VideoFrame
    {
        public readonly byte[] Data;
        public readonly int Length;
        public readonly int Width;
        public readonly int Height;
        public readonly uint Sequence;

        public VideoFrame(byte[] data, int length, int width, int height, uint sequence)
        {
            Data = data;
            Length = length;
            Width = width;
            Height = height;
            Sequence = sequence;
        }
    }

    /// <summary>
    /// Um canal de vídeo: real-play SEM janela (RAW_DATA) → porta de decode da dhplay →
    /// I420 → <see cref="YuvScaler"/> → NV12 publicado em <see cref="FrameReady"/>.
    ///
    /// <para>Mesmo pipeline validado pela câmera virtual do play-nvr, com duas invariantes
    /// que não podem ser perdidas: os delegates de callback ficam em CAMPOS (o SDK guarda o
    /// ponteiro nativo e o GC coletaria um lambda local), e NENHUMA exceção pode escapar dos
    /// callbacks para o código nativo.</para>
    /// </summary>
    internal sealed class ChannelStream : IDisposable
    {
        private readonly NvrClient _client;
        private readonly int _channel;      // 1-based
        private readonly bool _preferSubStream;
        private readonly YuvScaler _scaler;

        // Campos, não lambdas locais: o SDK nativo segura o ponteiro para eles.
        private readonly PlaySdkNative.fDecCBFun _decCb;
        private readonly fRealDataCallBackEx2 _rawCb;

        private readonly object _portLock = new();
        private int _port = -1;
        private IntPtr _playHandle = IntPtr.Zero;
        private volatile bool _pumping;
        private uint _sequence;

        private int _srcW, _srcH, _srcFps;

        /// <summary>Formato descoberto ou alterado.</summary>
        public event Action<StreamFormat> FormatChanged;

        /// <summary>Frame NV12 pronto. Chamado numa thread NATIVA — seja rápido e não bloqueie.</summary>
        public event Action<VideoFrame> FrameReady;

        public int Channel => _channel;
        public bool IsRunning => _pumping;

        public StreamFormat Format =>
            new(_channel, _scaler.Width, _scaler.Height, _srcFps, _srcW, _srcH);

        public ChannelStream(NvrClient client, int channel, int maxWidth, bool preferSubStream)
        {
            _client = client;
            _channel = channel;
            _preferSubStream = preferSubStream;
            _scaler = new YuvScaler(maxWidth);
            _decCb = OnDecodedFrame;
            _rawCb = OnRawData;
        }

        public void Start()
        {
            if (_pumping) return;

            if (!PlaySdkNative.PLAY_GetFreePort(out int port))
                throw new InvalidOperationException("PlaySDK sem porta livre para decodificar o canal.");

            bool ok = PlaySdkNative.PLAY_SetStreamOpenMode(port, PlaySdkNative.STREAME_REALTIME)
                   && PlaySdkNative.PLAY_OpenStream(port, IntPtr.Zero, 0, 4 * 1024 * 1024)
                   && PlaySdkNative.PLAY_SetDecCBStream(port, PlaySdkNative.DECCB_STREAM_VIDEO)
                   && PlaySdkNative.PLAY_SetDecCallBackEx(port, _decCb, IntPtr.Zero)
                   && PlaySdkNative.PLAY_Play(port, IntPtr.Zero); // hWnd=0 → só decodifica
            if (!ok)
            {
                PlaySdkNative.PLAY_CloseStream(port);
                PlaySdkNative.PLAY_ReleasePort(port);
                throw new InvalidOperationException("Falha ao abrir a porta de decode do PlaySDK.");
            }

            IntPtr handle;
            try
            {
                handle = _client.StartRealPlay(_channel - 1, IntPtr.Zero, _preferSubStream);
            }
            catch (InvalidOperationException)
            {
                // Plano B: se o stream preferido não abrir, tenta o outro antes de desistir.
                try
                {
                    handle = _client.StartRealPlay(_channel - 1, IntPtr.Zero, !_preferSubStream);
                }
                catch
                {
                    PlaySdkNative.PLAY_Stop(port);
                    PlaySdkNative.PLAY_CloseStream(port);
                    PlaySdkNative.PLAY_ReleasePort(port);
                    throw;
                }
            }

            if (!NETClient.SetRealDataCallBack(handle, _rawCb, IntPtr.Zero, EM_REALDATA_FLAG.RAW_DATA))
            {
                _client.StopRealPlay(handle);
                PlaySdkNative.PLAY_Stop(port);
                PlaySdkNative.PLAY_CloseStream(port);
                PlaySdkNative.PLAY_ReleasePort(port);
                throw new InvalidOperationException(
                    $"Falha ao registrar o callback de dados do canal {_channel}: {NETClient.GetLastError()}");
            }

            lock (_portLock)
            {
                _port = port;
                _playHandle = handle;
            }
            _pumping = true;
        }

        public void Stop()
        {
            _pumping = false;
            _srcW = _srcH = _srcFps = 0; // formato é redescoberto no próximo start

            IntPtr handle;
            int port;
            lock (_portLock)
            {
                handle = _playHandle;
                port = _port;
                _playHandle = IntPtr.Zero;
                _port = -1;
            }

            if (handle != IntPtr.Zero)
            {
                try { _client.StopRealPlay(handle); }
                catch { /* handle pode já estar morto após queda de conexão */ }
            }

            if (port >= 0)
            {
                lock (_portLock) // garante que nenhum PLAY_InputData está em voo
                {
                    PlaySdkNative.PLAY_Stop(port);
                    PlaySdkNative.PLAY_CloseStream(port);
                    PlaySdkNative.PLAY_ReleasePort(port);
                }
            }
        }

        /// <summary>
        /// Depois de um auto-reconnect o handle de LOGIN continua válido, mas os handles de
        /// real-play estão mortos — daí reiniciar do zero em vez de só religar o callback.
        /// </summary>
        public void Restart()
        {
            Stop();
            Start();
        }

        /// <summary>Thread do NetSDK: repassa o stream bruto (privado Dahua) para a porta de decode.</summary>
        private void OnRawData(IntPtr lRealHandle, uint dwDataType, IntPtr pBuffer, uint dwBufSize, IntPtr param, IntPtr dwUser)
        {
            if (!_pumping || dwDataType != 0 || pBuffer == IntPtr.Zero || dwBufSize == 0)
                return;

            try
            {
                lock (_portLock)
                {
                    if (_port >= 0)
                        PlaySdkNative.PLAY_InputData(_port, pBuffer, dwBufSize); // FALSE = buffer cheio: dropa
                }
            }
            catch { /* exceção jamais pode escapar para o código nativo */ }
        }

        /// <summary>Thread de decode da dhplay: converte I420→NV12 e publica.</summary>
        private void OnDecodedFrame(int nPort, IntPtr pBuf, int nSize, IntPtr pFrameInfo, IntPtr pUserData, int nReserved2)
        {
            if (!_pumping || pBuf == IntPtr.Zero || pFrameInfo == IntPtr.Zero)
                return;

            try
            {
                var info = Marshal.PtrToStructure<PlaySdkNative.FRAME_INFO>(pFrameInfo);
                if (info.nType != PlaySdkNative.T_IYUV || nSize < info.nWidth * info.nHeight * 3 / 2)
                    return;

                bool formatChanged = info.nWidth != _srcW || info.nHeight != _srcH || info.nFrameRate != _srcFps;
                if (formatChanged)
                {
                    _srcW = info.nWidth;
                    _srcH = info.nHeight;
                    _srcFps = info.nFrameRate;
                }

                if (!_scaler.Convert(pBuf, info.nWidth, info.nHeight))
                    return;

                // O evento só dispara depois da conversão, para que Width/Height do scaler
                // já reflitam o formato novo quando o assinante for notificado.
                if (formatChanged)
                    FormatChanged?.Invoke(Format);

                FrameReady?.Invoke(new VideoFrame(
                    _scaler.Frame, _scaler.Width * _scaler.Height * 3 / 2,
                    _scaler.Width, _scaler.Height, ++_sequence));
            }
            catch { /* exceção jamais pode escapar para o código nativo */ }
        }

        public void Dispose() => Stop();
    }
}
