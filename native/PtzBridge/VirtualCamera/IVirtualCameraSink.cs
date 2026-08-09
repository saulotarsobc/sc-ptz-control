namespace PtzBridge.VirtualCamera
{
    /// <summary>
    /// Formato do quadro que a câmera virtual publica, igual nas duas plataformas.
    ///
    /// <para>720p é o alvo porque é o que o Meet, o Teams e o OBS consomem sem reamostrar, e
    /// porque a fonte destes domos raramente entrega mais que isso de detalhe útil.</para>
    /// </summary>
    internal static class VirtualCameraFormat
    {
        public const int Width = 1280;
        public const int Height = 720;
        public const int Fps = 30;

        /// <summary>NV12: plano Y (w*h) + plano UV entrelaçado (w*h/2).</summary>
        public const int FrameBytes = Width * Height * 3 / 2;
    }

    /// <summary>
    /// Para onde os frames da câmera virtual vão. Duas implementações, uma por plataforma:
    ///
    /// <list type="bullet">
    /// <item><see cref="WindowsVirtualCameraSink"/> — memory-mapped file + media source de
    /// Media Foundation registrada em HKLM (<c>ScPtzVCam.dll</c>).</item>
    /// <item><see cref="V4l2LoopbackSink"/> — <c>write()</c> direto num <c>/dev/videoN</c>
    /// criado pelo módulo v4l2loopback.</item>
    /// </list>
    ///
    /// <para>O <see cref="VirtualCameraService"/> não sabe qual das duas está em uso: ele
    /// converte a fonte para NV12 720p e entrega aqui.</para>
    /// </summary>
    internal interface IVirtualCameraSink : IDisposable
    {
        /// <summary>Nome do dispositivo como os outros aplicativos o enxergam.</summary>
        string CameraName { get; }

        /// <summary>
        /// A plataforma consegue publicar uma câmera virtual? Falso desliga o recurso na
        /// interface em vez de deixar o usuário apertar um botão que sempre falha.
        /// </summary>
        bool IsSupported { get; }

        /// <summary>
        /// Cria o dispositivo. Lança <see cref="InvalidOperationException"/> com uma mensagem
        /// em pt-BR que diz o que fazer — é ela que aparece na tela.
        /// </summary>
        Task StartAsync();

        /// <summary>Remove o dispositivo. Melhor-esforço, não lança.</summary>
        Task StopAsync();

        /// <summary>
        /// Há algum aplicativo consumindo a câmera agora? Serve para não gastar CPU
        /// convertendo frames que ninguém vai ver.
        /// </summary>
        bool ConsumerActive(TimeSpan within);

        /// <summary>Publica um frame NV12 de <see cref="VirtualCameraFormat.FrameBytes"/> bytes.</summary>
        void WriteFrame(byte[] nv12);
    }
}
