namespace PtzBridge.Sdk
{
    /// <summary>
    /// Converte frames I420 (saída da dhplay.dll) para NV12 reduzido, pronto para ir
    /// pela WebSocket e virar um <c>VideoFrame</c> no renderer.
    ///
    /// <para>O destino é sempre <b>16:9</b> com a largura pedida, e a fonte INTEIRA é
    /// esticada para dentro dele — nunca recortada. É o mesmo comportamento do
    /// <c>Nv12Converter</c> do play-nvr e da janela de vídeo do SDK, que preenche um HWND
    /// 16:9 com o frame completo.</para>
    ///
    /// <para>Isso não é cosmético: estes domos entregam o frame decodificado em formato
    /// anamórfico (960×1080 no canal PTZ testado), então respeitar a proporção informada
    /// renderizaria uma faixa alta e estreita. Esticar para 16:9 é o que devolve a imagem
    /// correta — e recortar perderia campo de visão.</para>
    ///
    /// <para>Os mapas de índice fonte→destino são pré-computados e só reconstruídos quando a
    /// resolução de origem muda, então o custo por frame é uma escrita amostrada do tamanho
    /// do destino, independente da resolução de origem.</para>
    /// </summary>
    internal sealed class YuvScaler
    {
        private readonly int _maxWidth;

        /// <summary>Buffer NV12 de saída, reutilizado entre frames enquanto o formato não muda.</summary>
        public byte[] Frame { get; private set; } = Array.Empty<byte>();

        public int Width { get; private set; }
        public int Height { get; private set; }

        private int _srcW, _srcH;

        // Mapas nearest-neighbor: pixel fonte para cada coluna/linha do destino.
        private int[] _mapYX;      // [Width]    coluna no plano Y fonte
        private int[] _mapYRow;    // [Height]   offset da linha no plano Y fonte (y * srcW)
        private int[] _mapCX;      // [Width/2]  coluna no plano U/V fonte
        private int[] _mapCRow;    // [Height/2] offset da linha no plano U/V fonte (yc * srcW/2)

        public YuvScaler(int maxWidth) => _maxWidth = Math.Clamp(maxWidth, 160, 3840);

        /// <summary>
        /// Converte um frame I420 (ponteiro nativo do callback de decode) para NV12 em
        /// <see cref="Frame"/>. Retorna false se as dimensões forem inválidas.
        /// </summary>
        public unsafe bool Convert(IntPtr i420, int srcW, int srcH)
        {
            if (i420 == IntPtr.Zero || srcW < 2 || srcH < 2)
                return false;

            if (srcW != _srcW || srcH != _srcH)
                Reconfigure(srcW, srcH);

            int dstW = Width, dstH = Height;
            int dstCW = dstW / 2, dstCH = dstH / 2;

            byte* srcY = (byte*)i420;
            byte* srcU = srcY + srcW * srcH;
            byte* srcV = srcU + (srcW / 2) * (srcH / 2);

            fixed (byte* dst = Frame)
            {
                // Plano Y: uma linha fonte amostrada por linha do destino.
                for (int y = 0; y < dstH; y++)
                {
                    byte* srcRow = srcY + _mapYRow[y];
                    byte* dstRow = dst + y * dstW;
                    for (int x = 0; x < dstW; x++)
                        dstRow[x] = srcRow[_mapYX[x]];
                }

                // Plano UV (NV12): pares U,V entrelaçados lidos dos planos separados do I420.
                byte* dstUv = dst + dstW * dstH;
                for (int y = 0; y < dstCH; y++)
                {
                    int srcRowOff = _mapCRow[y];
                    byte* srcRowU = srcU + srcRowOff;
                    byte* srcRowV = srcV + srcRowOff;
                    byte* dstRow = dstUv + y * dstW;
                    for (int x = 0; x < dstCW; x++)
                    {
                        int sx = _mapCX[x];
                        dstRow[2 * x] = srcRowU[sx];
                        dstRow[2 * x + 1] = srcRowV[sx];
                    }
                }
            }

            return true;
        }

        private void Reconfigure(int srcW, int srcH)
        {
            _srcW = srcW;
            _srcH = srcH;

            // Destino 16:9 fixo, com dimensões pares (NV12 tem o plano de croma pela metade).
            int dstW = Even(_maxWidth);
            int dstH = Even(dstW * 9 / 16);

            Width = dstW;
            Height = dstH;
            Frame = new byte[dstW * dstH * 3 / 2];

            _mapYX = new int[dstW];
            for (int x = 0; x < dstW; x++)
                _mapYX[x] = Math.Min(srcW - 1, x * srcW / dstW);

            _mapYRow = new int[dstH];
            for (int y = 0; y < dstH; y++)
                _mapYRow[y] = Math.Min(srcH - 1, y * srcH / dstH) * srcW;

            int srcCW = srcW / 2, srcCH = srcH / 2;
            int dstCW = dstW / 2, dstCH = dstH / 2;

            _mapCX = new int[dstCW];
            for (int x = 0; x < dstCW; x++)
                _mapCX[x] = Math.Min(srcCW - 1, x * srcCW / dstCW);

            _mapCRow = new int[dstCH];
            for (int y = 0; y < dstCH; y++)
                _mapCRow[y] = Math.Min(srcCH - 1, y * srcCH / dstCH) * srcCW;
        }

        private static int Even(int v) => Math.Max(2, v - (v & 1));
    }
}
