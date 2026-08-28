using PtzBridge.Nvr;
using PtzBridge.Sdk;

namespace PtzBridge.Streaming
{
    /// <summary>
    /// Dono dos <see cref="IChannelSource"/>, um por canal, com contagem de assinantes:
    /// o stream sobe no primeiro assinante e cai quando o último sai. Sem audiência,
    /// nenhum frame é decodificado nem convertido.
    ///
    /// <para>O NetSDK constrói o pipeline por <see cref="INvrBackend.CreateStream"/>.</para>
    /// </summary>
    internal sealed class VideoHub : IDisposable
    {
        private readonly INvrBackend _backend;
        private readonly Func<AppConfig> _config;
        private readonly object _gate = new();
        private readonly Dictionary<int, Entry> _entries = new();

        private sealed class Entry
        {
            public IChannelSource Stream;
            // Arrays trocados por cópia sob lock e lidos sem lock pela thread de decode.
            public volatile Action<VideoFrame>[] Subs = Array.Empty<Action<VideoFrame>>();
            public volatile Action<IntPtr, int, int>[] RawSubs = Array.Empty<Action<IntPtr, int, int>>();
            public StreamFormat Format;

            public bool Idle => Subs.Length == 0 && RawSubs.Length == 0;
        }

        /// <summary>Formato de um canal mudou.</summary>
        public event Action<StreamFormat> FormatChanged;

        public VideoHub(INvrBackend backend, Func<AppConfig> config)
        {
            _backend = backend;
            _config = config;
        }

        /// <summary>
        /// Assina os frames NV12 já reduzidos de um canal (1-based). Descartar o retorno
        /// cancela a assinatura e, se for a última, derruba o stream.
        /// </summary>
        public IDisposable Subscribe(int channel, Action<VideoFrame> onFrame)
            => Attach(channel, onFrame, null);

        /// <summary>
        /// Assina o I420 cru, na resolução da fonte (ver <see cref="ChannelStream.I420Ready"/>).
        /// Conta como assinante para efeito de manter o stream no ar — é o que permite à câmera
        /// virtual seguir transmitindo com o preview escondido.
        /// </summary>
        public IDisposable SubscribeRaw(int channel, Action<IntPtr, int, int> onRaw)
            => Attach(channel, null, onRaw);

        private IDisposable Attach(int channel, Action<VideoFrame> onFrame, Action<IntPtr, int, int> onRaw)
        {
            lock (_gate)
            {
                if (!_entries.TryGetValue(channel, out var entry))
                {
                    entry = new Entry();
                    _entries[channel] = entry;
                }

                if (onFrame != null) entry.Subs = entry.Subs.Append(onFrame).ToArray();
                if (onRaw != null) entry.RawSubs = entry.RawSubs.Append(onRaw).ToArray();

                if (entry.Stream == null)
                {
                    var cfg = _config();
                    var stream = _backend.CreateStream(channel, cfg.MaxVideoWidth, cfg.UseSubStream);
                    stream.FrameReady += f => Dispatch(entry, f);
                    stream.I420Ready += (buf, w, h) => DispatchRaw(entry, buf, w, h);
                    stream.FormatChanged += format =>
                    {
                        entry.Format = format;
                        try { FormatChanged?.Invoke(format); } catch { }
                    };

                    try
                    {
                        stream.Start();
                    }
                    catch
                    {
                        // Não deixa entrada meio-criada para trás: a próxima assinatura
                        // precisa poder tentar de novo do zero.
                        stream.Dispose();
                        Detach(entry, channel, onFrame, onRaw);
                        throw;
                    }

                    entry.Stream = stream;
                }

                return new Subscription(this, channel, onFrame, onRaw);
            }
        }

        private static void Dispatch(Entry entry, VideoFrame frame)
        {
            // Thread NATIVA de decode: um assinante lento não pode derrubar os demais.
            foreach (var sub in entry.Subs)
            {
                try { sub(frame); } catch { }
            }
        }

        private static void DispatchRaw(Entry entry, IntPtr i420, int width, int height)
        {
            foreach (var sub in entry.RawSubs)
            {
                try { sub(i420, width, height); } catch { }
            }
        }

        private void Unsubscribe(int channel, Action<VideoFrame> onFrame, Action<IntPtr, int, int> onRaw)
        {
            IChannelSource toDispose = null;
            lock (_gate)
            {
                if (!_entries.TryGetValue(channel, out var entry)) return;
                toDispose = Detach(entry, channel, onFrame, onRaw);
            }
            toDispose?.Dispose();
        }

        /// <summary>
        /// Remove os callbacks da entrada e, se ninguém mais assiste, tira o canal do mapa.
        /// Chamar sob <c>_gate</c>; devolve o stream a descartar FORA do lock.
        /// </summary>
        private IChannelSource Detach(Entry entry, int channel, Action<VideoFrame> onFrame, Action<IntPtr, int, int> onRaw)
        {
            if (onFrame != null) entry.Subs = entry.Subs.Where(s => s != onFrame).ToArray();
            if (onRaw != null) entry.RawSubs = entry.RawSubs.Where(s => s != onRaw).ToArray();

            if (!entry.Idle) return null;

            _entries.Remove(channel);
            return entry.Stream;
        }

        /// <summary>Formato atual conhecido do canal (zeros se nenhum frame chegou ainda).</summary>
        public StreamFormat GetFormat(int channel)
        {
            lock (_gate)
                return _entries.TryGetValue(channel, out var e)
                    ? e.Format
                    : new StreamFormat(channel, 0, 0, 0, 0, 0);
        }

        /// <summary>Após queda de conexão: derruba os streams, mas preserva os assinantes.</summary>
        public void SuspendAll()
        {
            lock (_gate)
            {
                foreach (var e in _entries.Values)
                {
                    try { e.Stream?.Stop(); } catch { }
                }
            }
        }

        /// <summary>
        /// Após reconexão: reabre os streams de quem continua assistindo. Os handles de
        /// real-play morrem no reconnect mesmo com o login ainda válido.
        /// </summary>
        public void ResumeAll()
        {
            lock (_gate)
            {
                foreach (var e in _entries.Values)
                {
                    try { e.Stream?.Restart(); }
                    catch { /* NVR pode não estar pronto; a próxima reconexão tenta de novo */ }
                }
            }
        }

        public void Dispose()
        {
            lock (_gate)
            {
                foreach (var e in _entries.Values)
                {
                    try { e.Stream?.Dispose(); } catch { }
                }
                _entries.Clear();
            }
        }

        private sealed class Subscription : IDisposable
        {
            private readonly VideoHub _hub;
            private readonly int _channel;
            private readonly Action<VideoFrame> _onFrame;
            private readonly Action<IntPtr, int, int> _onRaw;
            private bool _done;

            public Subscription(VideoHub hub, int channel, Action<VideoFrame> onFrame, Action<IntPtr, int, int> onRaw)
            {
                _hub = hub;
                _channel = channel;
                _onFrame = onFrame;
                _onRaw = onRaw;
            }

            public void Dispose()
            {
                if (_done) return;
                _done = true;
                _hub.Unsubscribe(_channel, _onFrame, _onRaw);
            }
        }
    }
}
