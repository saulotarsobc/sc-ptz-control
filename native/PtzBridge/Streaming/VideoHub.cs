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
            // Arrays trocados por cópia sob lock e lidos sem lock nos caminhos de frame.
            public volatile Action<VideoFrame>[] Subs = Array.Empty<Action<VideoFrame>>();
            public volatile Action<I420Frame>[] RawSubs = Array.Empty<Action<I420Frame>>();
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
        public IDisposable SubscribeRaw(int channel, Action<I420Frame> onRaw)
            => Attach(channel, null, onRaw);

        private IDisposable Attach(int channel, Action<VideoFrame> onFrame, Action<I420Frame> onRaw)
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
                    var stream = CreateStream(channel, entry);

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

                UpdateDemand(entry);

                return new Subscription(this, channel, onFrame, onRaw);
            }
        }

        private IChannelSource CreateStream(int channel, Entry entry)
        {
            var cfg = _config();
            var stream = _backend.CreateStream(channel, cfg.MaxVideoWidth, cfg.UseSubStream);
            stream.FrameReady += frame => Dispatch(entry, frame);
            stream.I420Ready += frame => DispatchRaw(entry, frame);
            stream.FormatChanged += format =>
            {
                entry.Format = format;
                try { FormatChanged?.Invoke(format); } catch { }
            };
            stream.SetDemand(entry.Subs.Length > 0, entry.RawSubs.Length > 0);
            return stream;
        }

        private static void UpdateDemand(Entry entry)
            => entry.Stream?.SetDemand(entry.Subs.Length > 0, entry.RawSubs.Length > 0);

        private static void Dispatch(Entry entry, VideoFrame frame)
        {
            // Worker de preview: cada assinante deve copiar o buffer durante a chamada.
            foreach (var sub in entry.Subs)
            {
                try { sub(frame); } catch { }
            }
        }

        private static void DispatchRaw(Entry entry, I420Frame frame)
        {
            // Thread nativa: assinantes só podem copiar para seu próprio worker.
            foreach (var sub in entry.RawSubs)
            {
                try { sub(frame); } catch { }
            }
        }

        private void Unsubscribe(int channel, Action<VideoFrame> onFrame, Action<I420Frame> onRaw)
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
        private IChannelSource Detach(Entry entry, int channel, Action<VideoFrame> onFrame, Action<I420Frame> onRaw)
        {
            if (onFrame != null) entry.Subs = entry.Subs.Where(s => s != onFrame).ToArray();
            if (onRaw != null) entry.RawSubs = entry.RawSubs.Where(s => s != onRaw).ToArray();

            if (!entry.Idle)
            {
                UpdateDemand(entry);
                return null;
            }

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

        /// <summary>
        /// Recria os pipelines usando a configuração de vídeo atual. Um simples Restart
        /// preservaria maxWidth/substream capturados no construtor do stream antigo.
        /// </summary>
        public void ReconfigureAll()
        {
            lock (_gate)
            {
                foreach (var pair in _entries)
                {
                    int channel = pair.Key;
                    Entry entry = pair.Value;
                    IChannelSource previous = entry.Stream;

                    try { previous?.Stop(); } catch { }

                    IChannelSource replacement = CreateStream(channel, entry);
                    entry.Format = default;
                    try
                    {
                        replacement.Start();
                    }
                    catch
                    {
                        replacement.Dispose();
                        try { previous?.Start(); } catch { }
                        throw;
                    }

                    entry.Stream = replacement;
                    previous?.Dispose();
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
            private readonly Action<I420Frame> _onRaw;
            private bool _done;

            public Subscription(VideoHub hub, int channel, Action<VideoFrame> onFrame, Action<I420Frame> onRaw)
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
