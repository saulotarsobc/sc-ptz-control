using PtzBridge.Platform;

namespace PtzBridge.VirtualCamera
{
    /// <summary>
    /// Destino da câmera virtual no Windows: os frames vão para um memory-mapped file e a
    /// <c>ScPtzVCam.dll</c> (media source de Media Foundation, registrada em HKLM) os lê e os
    /// entrega aos aplicativos como um dispositivo de captura.
    ///
    /// <para>É o caminho original do projeto — a única mudança é estar agora atrás de
    /// <see cref="IVirtualCameraSink"/> para conviver com o v4l2loopback do Linux.</para>
    /// </summary>
    internal sealed class WindowsVirtualCameraSink : IVirtualCameraSink
    {
        private readonly SharedFrameWriter _writer = new();

        public string CameraName => VirtualCameraService.CameraName;

        /// <summary>MFCreateVirtualCamera existe a partir do Windows 11 (build 22000).</summary>
        public bool IsSupported => OperatingSystem.IsWindowsVersionAtLeast(10, 0, 22000);

        public async Task StartAsync()
        {
            if (!IsSupported)
                throw new InvalidOperationException(
                    "A câmera virtual exige Windows 11 (build 22000) ou mais recente.");

            if (!_writer.Open())
                throw new InvalidOperationException(
                    $"Não foi possível abrir o buffer de vídeo em {AppPaths.VcamBufferFile}. "
                    + "Rode scripts/install-vcam.ps1 como Administrador para criar a pasta com permissão.");

            int hr = await VirtualCameraNative.StartSessionAsync(CameraName).ConfigureAwait(false);
            if (hr != 0)
                throw new InvalidOperationException(VirtualCameraNative.Describe(hr));
        }

        public Task StopAsync() => VirtualCameraNative.StopSessionAsync();

        public bool ConsumerActive(TimeSpan within) => _writer.ConsumerActive(within);

        public void WriteFrame(byte[] nv12) => _writer.WriteFrame(nv12);

        public void Dispose()
        {
            try { VirtualCameraNative.StopSessionAsync().Wait(TimeSpan.FromSeconds(3)); }
            catch { /* melhor-esforço no encerramento */ }

            _writer.Dispose();
        }
    }
}
