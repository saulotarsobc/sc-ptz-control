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
        public readonly uint TimestampMs;
        public readonly int Fps;

        public VideoFrame(
            byte[] data,
            int length,
            int width,
            int height,
            uint sequence,
            uint timestampMs,
            int fps)
        {
            Data = data;
            Length = length;
            Width = width;
            Height = height;
            Sequence = sequence;
            TimestampMs = timestampMs;
            Fps = fps;
        }
    }

    /// <summary>
    /// Vista temporária de um frame I420. O ponteiro só é válido durante a chamada que o
    /// recebeu; quem precisar processar depois deve copiá-lo para memória própria.
    /// </summary>
    internal readonly struct I420Frame
    {
        public readonly IntPtr Data;
        public readonly int Length;
        public readonly int Width;
        public readonly int Height;
        public readonly uint Sequence;
        public readonly uint TimestampMs;
        public readonly int Fps;
        public readonly int Generation;

        public I420Frame(
            IntPtr data,
            int length,
            int width,
            int height,
            uint sequence,
            uint timestampMs,
            int fps,
            int generation = 0)
        {
            Data = data;
            Length = length;
            Width = width;
            Height = height;
            Sequence = sequence;
            TimestampMs = timestampMs;
            Fps = fps;
            Generation = generation;
        }
    }
}
