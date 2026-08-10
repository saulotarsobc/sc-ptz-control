using System.Diagnostics;

namespace PtzBridge.VirtualCamera
{
    /// <summary>
    /// Produtor V4L2 para Linux. O módulo v4l2loopback cria um /dev/videoN que aparece
    /// como câmera normal para Chromium, OBS, Meet e aplicações WebRTC. O módulo é
    /// instalado pela distribuição (não é incluído no AppImage, pois contém kernel code).
    /// </summary>
    internal sealed class V4l2LoopbackSink : IVirtualCameraSink
    {
        private readonly string _device;
        private FileStream _stream;

        public V4l2LoopbackSink(string device)
        {
            _device = string.IsNullOrWhiteSpace(device) ? FindDevice() : device;
        }

        public string CameraName => VirtualCameraService.CameraName;

        public bool IsSupported => OperatingSystem.IsLinux();

        public Task StartAsync()
        {
            if (!IsSupported)
                throw new InvalidOperationException("v4l2loopback só é suportado no Linux.");

            if (string.IsNullOrEmpty(_device) || !File.Exists(_device))
                throw new InvalidOperationException(
                    "Não encontrei uma câmera v4l2loopback. No Ubuntu instale e carregue o módulo:\n"
                    + "sudo apt install v4l2loopback-dkms v4l2loopback-utils\n"
                    + "sudo modprobe v4l2loopback devices=1 video_nr=10 card_label=\"SC PTZ Virtual Cam\" exclusive_caps=1");

            ConfigureFormat();
            try
            {
                _stream = new FileStream(_device, FileMode.Open, FileAccess.Write, FileShare.ReadWrite,
                    VirtualCameraFormat.FrameBytes, FileOptions.Asynchronous);
            }
            catch (Exception ex)
            {
                throw new InvalidOperationException($"Não consegui abrir {_device} para a câmera virtual: {ex.Message}");
            }

            return Task.CompletedTask;
        }

        public Task StopAsync()
        {
            _stream?.Dispose();
            _stream = null;
            return Task.CompletedTask;
        }

        // O driver não expõe uma API de heartbeat comparável ao MMF do Windows. Escrever
        // continuamente é barato e impede que o dispositivo suma de apps que ainda não abriram.
        public bool ConsumerActive(TimeSpan within) => _stream != null;

        public void WriteFrame(byte[] nv12)
        {
            if (_stream == null || nv12?.Length < VirtualCameraFormat.FrameBytes)
                return;

            try
            {
                _stream.Write(nv12, 0, VirtualCameraFormat.FrameBytes);
                _stream.Flush();
            }
            catch (IOException)
            {
                // Aplicativos podem fechar o capture fd a qualquer momento. O próximo start
                // da câmera recria o descritor; não deixe essa exceção escapar do decode.
            }
        }

        private void ConfigureFormat()
        {
            try
            {
                using var p = Process.Start(new ProcessStartInfo
                {
                    FileName = "v4l2-ctl",
                    Arguments = $"--device {_device} --set-fmt-video-out=width={VirtualCameraFormat.Width},height={VirtualCameraFormat.Height},pixelformat=NV12",
                    UseShellExecute = false,
                    CreateNoWindow = true,
                    RedirectStandardError = true,
                    RedirectStandardOutput = true,
                });
                p?.WaitForExit(3000);
            }
            catch
            {
                // v4l2-ctl é apenas uma conveniência. Em geral o primeiro consumidor negocia
                // o formato; escrever NV12 continua sendo melhor que deixar de criar a câmera.
            }
        }

        private static string FindDevice()
        {
            const string root = "/sys/class/video4linux";
            if (!Directory.Exists(root)) return null;

            foreach (var entry in Directory.EnumerateDirectories(root).OrderBy(x => x))
            {
                try
                {
                    var name = File.ReadAllText(Path.Combine(entry, "name")).Trim();
                    if (name.Contains("sc ptz", StringComparison.OrdinalIgnoreCase)
                        || name.Contains("v4l2 loopback", StringComparison.OrdinalIgnoreCase))
                        return Path.Combine("/dev", Path.GetFileName(entry));
                }
                catch { /* dispositivo desapareceu durante o scan */ }
            }

            return null;
        }

        public void Dispose() => StopAsync().GetAwaiter().GetResult();
    }
}
