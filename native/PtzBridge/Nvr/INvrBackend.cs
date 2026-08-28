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
    /// Endereço e credenciais usados pelo NetSDK no Windows.
    /// </summary>
    public sealed record NvrCredentials(
        string Ip,
        int SdkPort,
        string User,
        string Password);

    /// <summary>
    /// Contrato interno do pipeline NetSDK usado pelo serviço e pelo hub de vídeo.
    ///
    /// <para><b>Todos os canais aqui são BASE 0</b>, como no NetSDK. A conversão a partir do
    /// 1-based do protocolo acontece na borda do <c>NvrService</c>, e cada backend converte de
    /// 1-based do protocolo acontece na borda do <c>NvrService</c>.</para>
    /// </summary>
    internal interface INvrBackend : IDisposable
    {
        /// <summary>Conexão caiu.</summary>
        event Action Disconnected;

        /// <summary>Reconectou sozinho.</summary>
        event Action Reconnected;

        bool IsLoggedIn { get; }

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
    /// <para>Os dois eventos disparam numa thread nativa de decode do NetSDK: o assinante tem que ser rápido e nenhuma
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
