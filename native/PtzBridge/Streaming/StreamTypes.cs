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

        public VideoFrame(byte[] data, int length, int width, int height, uint sequence)
        {
            Data = data;
            Length = length;
            Width = width;
            Height = height;
            Sequence = sequence;
        }
    }
}
