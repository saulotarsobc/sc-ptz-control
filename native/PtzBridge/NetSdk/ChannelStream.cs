using System.Diagnostics;
using System.Runtime.InteropServices;
using NetSDKCS;
using PtzBridge.Nvr;
using PtzBridge.Sdk;
using PtzBridge.Streaming;

namespace PtzBridge.NetSdk
{
    /// <summary>
    /// Um canal de vídeo pelo NetSDK: real-play SEM janela (RAW_DATA) → porta de decode da
    /// dhplay → I420 → <see cref="YuvScaler"/> → NV12 publicado em <see cref="FrameReady"/>.
    ///
    /// <para>Mesmo pipeline validado pela câmera virtual do play-nvr, com duas invariantes
    /// que não podem ser perdidas: os delegates de callback ficam em CAMPOS (o SDK guarda o
    /// ponteiro nativo e o GC coletaria um lambda local), e NENHUMA exceção pode escapar dos
    /// callbacks para o código nativo.</para>
    /// </summary>
    internal sealed class ChannelStream : IChannelSource
    {
        private readonly NvrClient _client;
        private readonly int _channel;      // 1-based
        private readonly bool _preferSubStream;
        private readonly YuvScaler _scaler;
        private readonly LatestI420FramePump _previewPump;

        // Campos, não lambdas locais: o SDK nativo segura o ponteiro para eles.
        private readonly PlaySdkNative.fDecCBFun _decCb;
        private readonly fRealDataCallBackEx2 _rawCb;

        private readonly object _portLock = new();
        private int _port = -1;
        private IntPtr _playHandle = IntPtr.Zero;
        private volatile bool _pumping;
        private volatile bool _previewDemand;
        private volatile bool _rawDemand;
        private uint _sequence;
        private int _generation;
        private readonly long _clockStarted = Stopwatch.GetTimestamp();

        private int _srcW, _srcH, _srcFps;
        private int _publishedW, _publishedH, _publishedFps;

        /// <summary>Formato descoberto ou alterado.</summary>
        public event Action<StreamFormat> FormatChanged;

        /// <summary>Frame NV12 pronto. Chamado no worker de preview, fora da thread nativa.</summary>
        public event Action<VideoFrame> FrameReady;

        /// <summary>
        /// Frame I420 recém-decodificado, na resolução da FONTE e antes da redução do preview
        /// (ponteiro, largura, altura). O ponteiro só vale durante a chamada.
        ///
        /// <para>Existe para a câmera virtual escalar a fonte cheia direto para 1280×720 sem
        /// passar pelo <c>maxVideoWidth</c> do preview — reamostrar duas vezes (1080 → 540 →
        /// 720 linhas) perderia detalhe à toa. Também na thread NATIVA de decode.</para>
        /// </summary>
        public event Action<I420Frame> I420Ready;

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
            _previewPump = new LatestI420FramePump(ProcessPreviewFrame);
            _decCb = OnDecodedFrame;
            _rawCb = OnRawData;
        }

        public void SetDemand(bool preview, bool raw)
        {
            _previewDemand = preview;
            _rawDemand = raw;
            if (!preview) _previewPump.Clear();
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
            Interlocked.Increment(ref _generation);
            _pumping = true;
        }

        public void Stop()
        {
            _pumping = false;
            Interlocked.Increment(ref _generation);
            _previewPump.Clear();
            _srcW = _srcH = _srcFps = 0; // formato é redescoberto no próximo start
            _publishedW = _publishedH = _publishedFps = 0;

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

        /// <summary>
        /// Thread de decode da dhplay: apenas captura metadados e copia o frame para quem
        /// tem demanda. O scaler e o WebSocket nunca podem segurar esta callback.
        /// </summary>
        private void OnDecodedFrame(int nPort, IntPtr pBuf, int nSize, IntPtr pFrameInfo, IntPtr pUserData, int nReserved2)
        {
            if (!_pumping || pBuf == IntPtr.Zero || pFrameInfo == IntPtr.Zero)
                return;

            try
            {
                var info = Marshal.PtrToStructure<PlaySdkNative.FRAME_INFO>(pFrameInfo);
                if (info.nType != PlaySdkNative.T_IYUV || nSize < info.nWidth * info.nHeight * 3 / 2)
                    return;

                int length = info.nWidth * info.nHeight * 3 / 2;
                int fps = Math.Clamp(info.nFrameRate, 0, 240);
                uint sequence = unchecked(++_sequence);
                // nStamp é assinado no wrapper e alguns firmwares alternam a base ao abrir
                // o real-play. Um relógio local monotônico evita timestamps regressivos no
                // WebCodecs sem inventar a cadência: o FPS declarado continua vindo da fonte.
                uint timestampMs = unchecked(
                    (uint)((Stopwatch.GetTimestamp() - _clockStarted) * 1000L / Stopwatch.Frequency));
                int generation = Volatile.Read(ref _generation);

                _srcW = info.nWidth;
                _srcH = info.nHeight;
                _srcFps = fps;

                var frame = new I420Frame(
                    pBuf, length, info.nWidth, info.nHeight,
                    sequence, timestampMs, fps, generation);

                if (_previewDemand)
                    _previewPump.Post(frame, generation);

                // A vista só vale durante a callback. O assinante pode copiar para outro
                // worker, mas não pode escalar nem fazer I/O aqui.
                if (_rawDemand)
                    I420Ready?.Invoke(frame);
            }
            catch { /* exceção jamais pode escapar para o código nativo */ }
        }

        private void ProcessPreviewFrame(I420Frame frame)
        {
            if (!_pumping || !_previewDemand || frame.Generation != Volatile.Read(ref _generation))
                return;

            if (!_scaler.Convert(frame.Data, frame.Width, frame.Height))
                return;

            if (!_pumping || frame.Generation != Volatile.Read(ref _generation))
                return;

            bool formatChanged = frame.Width != _publishedW
                || frame.Height != _publishedH
                || frame.Fps != _publishedFps;
            if (formatChanged)
            {
                _publishedW = frame.Width;
                _publishedH = frame.Height;
                _publishedFps = frame.Fps;
                try
                {
                    FormatChanged?.Invoke(new StreamFormat(
                        _channel,
                        _scaler.Width,
                        _scaler.Height,
                        frame.Fps,
                        frame.Width,
                        frame.Height));
                }
                catch { }
            }

            try
            {
                FrameReady?.Invoke(new VideoFrame(
                    _scaler.Frame,
                    _scaler.Width * _scaler.Height * 3 / 2,
                    _scaler.Width,
                    _scaler.Height,
                    frame.Sequence,
                    frame.TimestampMs,
                    frame.Fps));
            }
            catch { }
        }

        public void Dispose()
        {
            Stop();
            _previewPump.Dispose();
        }
    }
}
