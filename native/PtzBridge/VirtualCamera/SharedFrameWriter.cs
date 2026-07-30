using System.Diagnostics;
using System.IO.MemoryMappedFiles;

namespace PtzBridge.VirtualCamera
{
    /// <summary>
    /// Produtor do lado do sidecar: escreve frames NV12 no memory-mapped file lido pela media
    /// source nativa da "SC PTZ Virtual Cam". Triplo buffer (sem mutex no caminho quente); a
    /// media source lê sempre o slot completo mais recente.
    ///
    /// <para>O arquivo de respaldo vive em <c>%ProgramData%\ScPtzControl\vcam-frames.bin</c> — o
    /// instalador cria a pasta com ACL permissiva para que o processo do Frame Server (conta de
    /// serviço) também consiga abri-lo. Sem o instalador (execução em dev), tenta-se criar
    /// mesmo assim, o que funciona para o produtor mas pode não bastar para o consumidor.</para>
    /// </summary>
    internal sealed class SharedFrameWriter : IDisposable
    {
        private MemoryMappedFile _mmf;
        private MemoryMappedViewAccessor _view;
        private uint _sequence;
        private bool _disposed;

        /// <summary>Caminho do arquivo de respaldo do MMF (para diagnóstico).</summary>
        public static string FilePath => SharedFrameProtocol.FilePath;

        /// <summary>Largura/altura fixas do frame que a câmera anuncia (o produtor deve compor nesse tamanho).</summary>
        public int Width => SharedFrameProtocol.Width;
        public int Height => SharedFrameProtocol.Height;
        public int FrameBytes => SharedFrameProtocol.FrameBytes;

        public bool IsOpen => _view != null;

        /// <summary>Abre (ou cria) o MMF. Retorna false se o arquivo não pôde ser aberto/criado.</summary>
        public bool Open()
        {
            if (_view != null)
                return true;

            try
            {
                string path = SharedFrameProtocol.FilePath;
                Directory.CreateDirectory(Path.GetDirectoryName(path));

                var fs = new FileStream(path, FileMode.OpenOrCreate, FileAccess.ReadWrite,
                    FileShare.ReadWrite, 4096, FileOptions.None);
                _mmf = MemoryMappedFile.CreateFromFile(fs, null, SharedFrameProtocol.TotalBytes,
                    MemoryMappedFileAccess.ReadWrite, HandleInheritability.None, leaveOpen: false);
                _view = _mmf.CreateViewAccessor(0, SharedFrameProtocol.TotalBytes, MemoryMappedFileAccess.ReadWrite);

                InitHeaderIfNeeded();
                return true;
            }
            catch
            {
                Dispose();
                _disposed = false; // Open pode ser tentado de novo (ex.: após instalar a ACL)
                return false;
            }
        }

        private void InitHeaderIfNeeded()
        {
            MemoryMappedViewAccessor v = _view;
            if (v.ReadUInt32(SharedFrameProtocol.OffMagic) == SharedFrameProtocol.Magic)
                return;

            v.Write(SharedFrameProtocol.OffMagic, SharedFrameProtocol.Magic);
            v.Write(SharedFrameProtocol.OffVersion, SharedFrameProtocol.Version);
            v.Write(SharedFrameProtocol.OffWidth, (uint)SharedFrameProtocol.Width);
            v.Write(SharedFrameProtocol.OffHeight, (uint)SharedFrameProtocol.Height);
            v.Write(SharedFrameProtocol.OffFrameBytes, (uint)SharedFrameProtocol.FrameBytes);
            v.Write(SharedFrameProtocol.OffSlotCount, (uint)SharedFrameProtocol.SlotCount);
            v.Write(SharedFrameProtocol.OffSequence, 0u);
            v.Write(SharedFrameProtocol.OffActiveSlot, 0u);
            v.Write(SharedFrameProtocol.OffProducerQpc, 0L);
            v.Write(SharedFrameProtocol.OffConsumerQpc, 0L);
        }

        /// <summary>
        /// Publica um frame NV12 (tamanho ao menos <see cref="FrameBytes"/>). Escreve o slot,
        /// barreira de memória, então publica activeSlot/sequence e o heartbeat do produtor.
        /// </summary>
        public void WriteFrame(byte[] nv12)
        {
            MemoryMappedViewAccessor v = _view;
            if (v == null || nv12 == null || nv12.Length < SharedFrameProtocol.FrameBytes)
                return;

            uint slot = _sequence % SharedFrameProtocol.SlotCount;
            long offset = SharedFrameProtocol.HeaderBytes + (long)slot * SharedFrameProtocol.FrameBytes;
            v.WriteArray(offset, nv12, 0, SharedFrameProtocol.FrameBytes);

            Thread.MemoryBarrier(); // dados do frame visíveis antes de publicar o índice
            v.Write(SharedFrameProtocol.OffActiveSlot, slot);
            v.Write(SharedFrameProtocol.OffSequence, ++_sequence);
            v.Write(SharedFrameProtocol.OffProducerQpc, Stopwatch.GetTimestamp());
        }

        /// <summary>
        /// Verdadeiro se a media source leu o buffer recentemente — ou seja, algum app está
        /// consumindo a câmera agora. Permite ao produtor só converter/publicar quando há audiência.
        /// </summary>
        public bool ConsumerActive(TimeSpan within)
        {
            MemoryMappedViewAccessor v = _view;
            if (v == null)
                return false;

            long consumer = v.ReadInt64(SharedFrameProtocol.OffConsumerQpc);
            if (consumer == 0)
                return false;

            double ageSeconds = (Stopwatch.GetTimestamp() - consumer) / (double)Stopwatch.Frequency;
            return ageSeconds >= 0 && ageSeconds < within.TotalSeconds;
        }

        public void Dispose()
        {
            if (_disposed)
                return;
            _disposed = true;

            _view?.Dispose();
            _view = null;
            _mmf?.Dispose();
            _mmf = null;
        }
    }
}
