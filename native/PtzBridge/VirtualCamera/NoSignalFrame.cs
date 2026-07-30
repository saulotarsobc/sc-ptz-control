using System.Runtime.InteropServices;

namespace PtzBridge.VirtualCamera
{
    /// <summary>
    /// Gera o quadro que a câmera virtual transmite quando não há imagem do NVR: fundo preto
    /// com um discreto "Sem sinal!" no centro.
    ///
    /// <para>Quem desenha é o produtor, não a media source: só aqui sabemos a diferença entre
    /// "o aplicativo está fechado" e "o aplicativo está aberto mas o canal não entrega imagem".
    /// A media source nativa só tem o preto liso como último recurso.</para>
    ///
    /// <para>O texto é rasterizado uma única vez pelo GDI (sem dependência de NuGet) em um DIB
    /// 32bpp e convertido para NV12. Como o desenho é neutro (cinza sobre preto), o plano de
    /// croma inteiro fica em 128 e só o plano Y carrega a imagem.</para>
    /// </summary>
    internal static class NoSignalFrame
    {
        private const string Message = "Sem sinal!";
        private const int FontHeight = 34;          // ~4,7% da altura: legível sem chamar atenção
        private const int TextLevel = 0x78;         // cinza médio; o fundo é preto puro
        private static readonly object Gate = new();
        private static byte[] _cached;

        /// <summary>
        /// Buffer NV12 1280×720 com o quadro de "sem sinal". A mesma instância é devolvida
        /// sempre — é somente leitura para quem chama.
        /// </summary>
        public static byte[] Frame
        {
            get
            {
                lock (Gate)
                    return _cached ??= Render();
            }
        }

        private static byte[] Render()
        {
            int w = SharedFrameProtocol.Width, h = SharedFrameProtocol.Height;
            var nv12 = new byte[SharedFrameProtocol.FrameBytes];

            // Preto da faixa limitada (16..235) anunciada no tipo de mídia, croma neutra.
            nv12.AsSpan(0, w * h).Fill(16);
            nv12.AsSpan(w * h).Fill(128);

            try
            {
                DrawMessage(nv12, w, h);
            }
            catch
            {
                // GDI indisponível por qualquer motivo: preto liso ainda é um quadro válido.
            }

            return nv12;
        }

        private static void DrawMessage(byte[] nv12, int w, int h)
        {
            IntPtr dc = IntPtr.Zero, bitmap = IntPtr.Zero, font = IntPtr.Zero;
            IntPtr oldBitmap = IntPtr.Zero, oldFont = IntPtr.Zero;

            try
            {
                dc = CreateCompatibleDC(IntPtr.Zero);
                if (dc == IntPtr.Zero) return;

                var header = new BITMAPINFOHEADER
                {
                    biSize = Marshal.SizeOf<BITMAPINFOHEADER>(),
                    biWidth = w,
                    biHeight = -h, // negativo = top-down, na mesma ordem das linhas do NV12
                    biPlanes = 1,
                    biBitCount = 32,
                    biCompression = 0, // BI_RGB
                };

                bitmap = CreateDIBSection(dc, ref header, 0 /* DIB_RGB_COLORS */, out IntPtr bits, IntPtr.Zero, 0);
                if (bitmap == IntPtr.Zero || bits == IntPtr.Zero) return;

                oldBitmap = SelectObject(dc, bitmap);

                // O DIB nasce zerado (preto), que é exatamente o fundo desejado.
                font = CreateFont(-FontHeight, 0, 0, 0, FW_SEMIBOLD, 0, 0, 0,
                    DEFAULT_CHARSET, OUT_DEFAULT_PRECIS, CLIP_DEFAULT_PRECIS,
                    ANTIALIASED_QUALITY, DEFAULT_PITCH | FF_DONTCARE, "Segoe UI");
                if (font == IntPtr.Zero) return;
                oldFont = SelectObject(dc, font);

                SetBkMode(dc, TRANSPARENT);
                SetTextColor(dc, (uint)(TextLevel | (TextLevel << 8) | (TextLevel << 16)));

                var rect = new RECT { left = 0, top = 0, right = w, bottom = h };
                DrawText(dc, Message, Message.Length, ref rect, DT_CENTER | DT_VCENTER | DT_SINGLELINE);

                GdiFlush();
                BlendLuma(bits, nv12, w, h);
            }
            finally
            {
                if (oldFont != IntPtr.Zero) SelectObject(dc, oldFont);
                if (oldBitmap != IntPtr.Zero) SelectObject(dc, oldBitmap);
                if (font != IntPtr.Zero) DeleteObject(font);
                if (bitmap != IntPtr.Zero) DeleteObject(bitmap);
                if (dc != IntPtr.Zero) DeleteDC(dc);
            }
        }

        /// <summary>
        /// Copia o desenho para o plano Y. Só os pixels que o texto tocou mudam, então o
        /// preto de fundo já gravado é preservado sem precisar de máscara.
        /// </summary>
        private static unsafe void BlendLuma(IntPtr bits, byte[] nv12, int w, int h)
        {
            byte* src = (byte*)bits; // BGRA, top-down, stride = w*4 (32bpp nunca precisa de padding)

            fixed (byte* dst = nv12)
            {
                for (int y = 0; y < h; y++)
                {
                    byte* row = src + (long)y * w * 4;
                    byte* dstRow = dst + (long)y * w;
                    for (int x = 0; x < w; x++)
                    {
                        int b = row[4 * x], g = row[4 * x + 1], r = row[4 * x + 2];
                        if ((b | g | r) == 0) continue; // fundo intocado

                        // Luma de faixa limitada (16..235) — mesma convenção do tipo de mídia.
                        dstRow[x] = (byte)(((66 * r + 129 * g + 25 * b + 128) >> 8) + 16);
                    }
                }
            }
        }

        // ------------------------------------------------------------------ GDI

        private const int TRANSPARENT = 1;
        private const int FW_SEMIBOLD = 600;
        private const uint DEFAULT_CHARSET = 1;
        private const uint OUT_DEFAULT_PRECIS = 0;
        private const uint CLIP_DEFAULT_PRECIS = 0;
        private const uint ANTIALIASED_QUALITY = 4; // e não CLEARTYPE: subpixel deixaria franjas coloridas
        private const uint DEFAULT_PITCH = 0;
        private const uint FF_DONTCARE = 0;
        private const uint DT_CENTER = 0x1;
        private const uint DT_VCENTER = 0x4;
        private const uint DT_SINGLELINE = 0x20;

        [StructLayout(LayoutKind.Sequential)]
        private struct BITMAPINFOHEADER
        {
            public int biSize;
            public int biWidth;
            public int biHeight;
            public short biPlanes;
            public short biBitCount;
            public int biCompression;
            public int biSizeImage;
            public int biXPelsPerMeter;
            public int biYPelsPerMeter;
            public int biClrUsed;
            public int biClrImportant;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct RECT
        {
            public int left, top, right, bottom;
        }

        [DllImport("gdi32.dll", SetLastError = true)]
        private static extern IntPtr CreateCompatibleDC(IntPtr hdc);

        [DllImport("gdi32.dll", SetLastError = true)]
        private static extern IntPtr CreateDIBSection(IntPtr hdc, ref BITMAPINFOHEADER pbmi, uint usage,
            out IntPtr ppvBits, IntPtr hSection, uint offset);

        [DllImport("gdi32.dll", EntryPoint = "CreateFontW", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern IntPtr CreateFont(int height, int width, int escapement, int orientation,
            int weight, uint italic, uint underline, uint strikeOut, uint charSet, uint outPrecision,
            uint clipPrecision, uint quality, uint pitchAndFamily, string faceName);

        [DllImport("gdi32.dll")]
        private static extern IntPtr SelectObject(IntPtr hdc, IntPtr obj);

        [DllImport("gdi32.dll")]
        private static extern bool DeleteObject(IntPtr obj);

        [DllImport("gdi32.dll")]
        private static extern bool DeleteDC(IntPtr hdc);

        [DllImport("gdi32.dll")]
        private static extern int SetBkMode(IntPtr hdc, int mode);

        [DllImport("gdi32.dll")]
        private static extern uint SetTextColor(IntPtr hdc, uint color);

        [DllImport("gdi32.dll")]
        private static extern bool GdiFlush();

        [DllImport("user32.dll", EntryPoint = "DrawTextW", CharSet = CharSet.Unicode)]
        private static extern int DrawText(IntPtr hdc, string text, int count, ref RECT rect, uint format);
    }
}
