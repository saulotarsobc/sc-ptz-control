using PtzBridge.Sdk;

namespace PtzBridge.Streaming
{
    /// <summary>
    /// Dono dos <see cref="ChannelStream"/>, um por canal, com contagem de assinantes:
    /// o stream sobe no primeiro assinante e cai quando o último sai. Sem audiência,
    /// nenhum frame é decodificado nem convertido.
    /// </summary>
    internal sealed class VideoHub : IDisposable
    {
        private readonly NvrClient _client;
        private readonly Func<AppConfig> _config;
        private readonly object _gate = new();
        private readonly Dictionary<int, Entry> _entries = new();

        private sealed class Entry
        {
            public ChannelStream Stream;
            // Array trocado por cópia sob lock e lido sem lock pela thread de decode.
            public volatile Action<VideoFrame>[] Subs = Array.Empty<Action<VideoFrame>>();
            public StreamFormat Format;
        }

        /// <summary>Formato de um canal mudou.</summary>
        public event Action<StreamFormat> FormatChanged;

        public VideoHub(NvrClient client, Func<AppConfig> config)
        {
            _client = client;
            _config = config;
        }

        /// <summary>
        /// Assina os frames de um canal (1-based). Descartar o retorno cancela a assinatura
        /// e, se for a última, derruba o stream.
        /// </summary>
        public IDisposable Subscribe(int channel, Action<VideoFrame> onFrame)
        {
            lock (_gate)
            {
                if (!_entries.TryGetValue(channel, out var entry))
                {
                    entry = new Entry();
                    _entries[channel] = entry;
                }

                entry.Subs = entry.Subs.Append(onFrame).ToArray();

                if (entry.Stream == null)
                {
                    var cfg = _config();
                    var stream = new ChannelStream(_client, channel, cfg.MaxVideoWidth, cfg.UseSubStream);
                    stream.FrameReady += f => Dispatch(entry, f);
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
                        entry.Subs = entry.Subs.Where(s => s != onFrame).ToArray();
                        if (entry.Subs.Length == 0) _entries.Remove(channel);
                        throw;
                    }

                    entry.Stream = stream;
                }

                return new Subscription(this, channel, onFrame);
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

        private void Unsubscribe(int channel, Action<VideoFrame> onFrame)
        {
            ChannelStream toDispose = null;
            lock (_gate)
            {
                if (!_entries.TryGetValue(channel, out var entry)) return;

                entry.Subs = entry.Subs.Where(s => s != onFrame).ToArray();
                if (entry.Subs.Length > 0) return;

                toDispose = entry.Stream;
                _entries.Remove(channel);
            }
            toDispose?.Dispose();
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
            private bool _done;

            public Subscription(VideoHub hub, int channel, Action<VideoFrame> onFrame)
            {
                _hub = hub;
                _channel = channel;
                _onFrame = onFrame;
            }

            public void Dispose()
            {
                if (_done) return;
                _done = true;
                _hub.Unsubscribe(_channel, _onFrame);
            }
        }
    }
}
