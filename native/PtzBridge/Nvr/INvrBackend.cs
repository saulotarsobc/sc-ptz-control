using PtzBridge.Streaming;

namespace PtzBridge.Nvr
{
    /// <summary>Informações do dispositivo retornadas no login.</summary>
    public sealed class NvrDeviceInfo
    {
        public string Serial { get; init; } = "";
        public int ChannelCount { get; init; }
        public string DeviceType { get; init; } = "";
    }

    /// <summary>Direções de movimento do PTZ (4 cardeais + 4 diagonais).</summary>
    public enum PtzDir
    {
        Up, Down, Left, Right,
        UpLeft, UpRight, DownLeft, DownRight,
    }

    /// <summary>
    /// Endereço e credenciais do equipamento. Carrega as três portas porque cada backend usa
    /// uma: o NetSDK fala na 37777, o CGI na 80 e o RTSP na 554.
    /// </summary>
    public sealed record NvrCredentials(
        string Ip,
        int SdkPort,
        int HttpPort,
        int RtspPort,
        string User,
        string Password);

    /// <summary>
    /// Tudo que o <see cref="Server.NvrService"/> precisa de um equipamento, independente de
    /// como se fala com ele.
    ///
    /// <para>Duas implementações: <c>NetSdkBackend</c> (protocolo privado Dahua na 37777, via
    /// as bibliotecas nativas da Intelbras) e <c>RtspCgiBackend</c> (PTZ pela API HTTP CGI,
    /// vídeo por RTSP). A segunda existe porque o NetSDK é um binário fechado que pode não
    /// estar disponível para a plataforma — no Linux ela costuma ser o caminho real.</para>
    ///
    /// <para><b>Todos os canais aqui são BASE 0</b>, como no NetSDK. A conversão a partir do
    /// 1-based do protocolo acontece na borda do <c>NvrService</c>, e cada backend converte de
    /// novo para o que o seu transporte espera (o CGI da Dahua, por exemplo, é 1-based).</para>
    /// </summary>
    internal interface INvrBackend : IDisposable
    {
        /// <summary>Conexão caiu.</summary>
        event Action Disconnected;

        /// <summary>Reconectou sozinho.</summary>
        event Action Reconnected;

        bool IsLoggedIn { get; }

        /// <summary>Nome curto do transporte, para diagnóstico na interface.</summary>
        string Description { get; }

        /// <summary>Abre sessão. Lança <see cref="InvalidOperationException"/> com mensagem pronta para a UI.</summary>
        NvrDeviceInfo Login(NvrCredentials credentials);

        void Logout();

        void PtzDirection(int channel0, PtzDir dir, int speed, bool stop);
        void PtzZoom(int channel0, bool tele, int speed, bool stop);
        void PtzFocus(int channel0, bool far, int speed, bool stop);
        void PtzIris(int channel0, bool open, int speed, bool stop);

        /// <summary>Solta todos os eixos do canal. Não pode lançar por eixo não suportado.</summary>
        void PtzStopAll(int channel0);

        void PtzGotoPreset(int channel0, int preset);
        void PtzSetPreset(int channel0, int preset);
        void PtzDeletePreset(int channel0, int preset);

        /// <summary>
        /// Cria (sem iniciar) o pipeline de vídeo de um canal <b>1-based</b>. Quem chama é o
        /// <see cref="VideoHub"/>, que cuida do ciclo de vida por contagem de assinantes.
        /// </summary>
        IChannelSource CreateStream(int channel, int maxWidth, bool preferSubStream);
    }

    /// <summary>
    /// Pipeline de vídeo de um canal: entrega NV12 já reduzido para o preview
    /// (<see cref="FrameReady"/>) e o I420 na resolução da fonte para a câmera virtual
    /// (<see cref="I420Ready"/>).
    ///
    /// <para>Os dois eventos disparam numa thread que <b>não é do .NET</b> (decode nativo no
    /// NetSDK, thread de leitura do ffmpeg no RTSP): o assinante tem que ser rápido e nenhuma
    /// exceção pode escapar.</para>
    /// </summary>
    internal interface IChannelSource : IDisposable
    {
        event Action<StreamFormat> FormatChanged;
        event Action<VideoFrame> FrameReady;
        event Action<IntPtr, int, int> I420Ready;

        StreamFormat Format { get; }
        bool IsRunning { get; }

        void Start();
        void Stop();

        /// <summary>
        /// Reabre do zero. Depois de um auto-reconnect o handle de LOGIN continua válido mas
        /// os de real-play estão mortos, então religar só o callback não bastaria.
        /// </summary>
        void Restart();
    }
}
