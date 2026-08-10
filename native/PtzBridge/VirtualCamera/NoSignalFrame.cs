namespace PtzBridge.VirtualCamera
{
    /// <summary>
    /// Quadro NV12 mostrado quando a fonte não entrega vídeo. É intencionalmente todo
    /// gerenciado: a versão anterior usava GDI e impedia o bridge de sequer carregar no
    /// Linux. A fonte bitmap 5x7 é suficiente para uma mensagem discreta e não adiciona
    /// dependência gráfica ao sidecar.
    /// </summary>
    internal static class NoSignalFrame
    {
        private const int LumaBlack = 16;
        private const int LumaText = 120;
        private static readonly object Gate = new();
        private static byte[] _cached;

        public static byte[] Frame
        {
            get { lock (Gate) return _cached ??= Render(); }
        }

        private static byte[] Render()
        {
            int width = VirtualCameraFormat.Width;
            int height = VirtualCameraFormat.Height;
            var nv12 = new byte[VirtualCameraFormat.FrameBytes];
            nv12.AsSpan(0, width * height).Fill(LumaBlack);
            nv12.AsSpan(width * height).Fill(128);

            const string text = "SEM SINAL";
            const int pixel = 7;
            const int glyphWidth = 5 * pixel;
            const int gap = 2 * pixel;
            int textWidth = text.Length * glyphWidth + (text.Length - 1) * gap;
            int x = (width - textWidth) / 2;
            int y = (height - 7 * pixel) / 2;

            foreach (char ch in text)
            {
                if (ch != ' ' && Glyphs.TryGetValue(ch, out var rows))
                    DrawGlyph(nv12, width, x, y, rows, pixel);
                x += glyphWidth + gap;
            }
            return nv12;
        }

        private static void DrawGlyph(byte[] yPlane, int width, int x, int y, byte[] rows, int pixel)
        {
            for (int row = 0; row < rows.Length; row++)
            for (int col = 0; col < 5; col++)
            {
                if ((rows[row] & (1 << (4 - col))) == 0) continue;
                for (int py = 0; py < pixel; py++)
                for (int px = 0; px < pixel; px++)
                    yPlane[(y + row * pixel + py) * width + x + col * pixel + px] = LumaText;
            }
        }

        private static readonly IReadOnlyDictionary<char, byte[]> Glyphs = new Dictionary<char, byte[]>
        {
            ['A'] = new byte[] { 0x0E, 0x11, 0x11, 0x1F, 0x11, 0x11, 0x11 },
            ['E'] = new byte[] { 0x1F, 0x10, 0x10, 0x1E, 0x10, 0x10, 0x1F },
            ['G'] = new byte[] { 0x0F, 0x10, 0x10, 0x17, 0x11, 0x11, 0x0E },
            ['I'] = new byte[] { 0x1F, 0x04, 0x04, 0x04, 0x04, 0x04, 0x1F },
            ['L'] = new byte[] { 0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x1F },
            ['M'] = new byte[] { 0x11, 0x1B, 0x15, 0x15, 0x11, 0x11, 0x11 },
            ['N'] = new byte[] { 0x11, 0x19, 0x15, 0x13, 0x11, 0x11, 0x11 },
            ['S'] = new byte[] { 0x0F, 0x10, 0x10, 0x0E, 0x01, 0x01, 0x1E },
        };
    }
}
