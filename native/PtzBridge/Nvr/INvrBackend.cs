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
    /// <para>Os comandos PTZ recebem canais em base 0, como o NetSDK. A criação de stream é
    /// a exceção documentada: o <see cref="CreateStream"/> recebe o canal 1-based do hub e o
    /// backend faz a conversão na borda.</para>
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
    /// (<see cref="FrameReady"/>) e uma vista temporária do I420 na resolução da fonte para
    /// a câmera virtual (<see cref="I420Ready"/>).
    ///
    /// <para><see cref="I420Ready"/> é uma vista temporária na thread nativa e só admite
    /// cópia rápida. <see cref="FrameReady"/> já vem de um worker gerenciado.</para>
    /// </summary>
    internal interface IChannelSource : IDisposable
    {
        event Action<StreamFormat> FormatChanged;
        event Action<VideoFrame> FrameReady;
        event Action<I420Frame> I420Ready;

        StreamFormat Format { get; }
        bool IsRunning { get; }

        void Start();
        void Stop();

        /// <summary>
        /// Informa quais saídas têm audiência. Evita copiar/escalar o preview quando apenas
        /// a câmera virtual está usando o real-play, e vice-versa.
        /// </summary>
        void SetDemand(bool preview, bool raw);

        /// <summary>
        /// Reabre do zero. Depois de um auto-reconnect o handle de LOGIN continua válido mas
        /// os de real-play estão mortos, então religar só o callback não bastaria.
        /// </summary>
        void Restart();
    }
}
