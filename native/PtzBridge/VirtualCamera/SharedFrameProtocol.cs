namespace PtzBridge.VirtualCamera
{
    /// <summary>
    /// Contrato binário do memory-mapped file compartilhado com a media source nativa
    /// (<c>native/ScPtzVCam/SharedFrame.h</c>). Qualquer mudança aqui deve espelhar o header C++.
    /// </summary>
    internal static class SharedFrameProtocol
    {
        public const uint Magic = 0x31565053; // 'SPV1'
        public const uint Version = 1;

        public const int Width = 1280;
        public const int Height = 720;
        public const int FpsNum = 30;
        public const int SlotCount = 3;

        /// <summary>NV12: plano Y (w*h) + plano UV entrelaçado (w*h/2).</summary>
        public const int FrameBytes = Width * Height * 3 / 2;

        public const int HeaderBytes = 128;
        public const long TotalBytes = HeaderBytes + (long)SlotCount * FrameBytes;

        // Offsets dentro do cabeçalho (little-endian). Não reordenar — contrato com o C++.
        public const int OffMagic = 0;
        public const int OffVersion = 4;
        public const int OffWidth = 8;
        public const int OffHeight = 12;
        public const int OffFrameBytes = 16;
        public const int OffSlotCount = 20;
        public const int OffSequence = 24;
        public const int OffActiveSlot = 28;
        public const int OffProducerQpc = 32;
        public const int OffConsumerQpc = 40;

        /// <summary>Caminho do arquivo de respaldo em %ProgramData%\ScPtzControl\vcam-frames.bin.</summary>
        public static string FilePath => Platform.AppPaths.VcamBufferFile;
    }
}
