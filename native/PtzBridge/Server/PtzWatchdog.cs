namespace PtzBridge.Server
{
    /// <summary>Eixos de PTZ que se movem enquanto o botão está pressionado.</summary>
    internal enum PtzAxis
    {
        Move,
        Zoom,
        Focus,
        Iris,
    }

    /// <summary>
    /// Rede de segurança para o PTZ contínuo.
    ///
    /// <para>Todo comando com <c>stop:false</c> só continua valendo por um tempo curto: se o
    /// "soltar" não chegar — renderer travou, WebSocket caiu, máquina do operador desligou —
    /// o watchdog emite a parada sozinho. Sem isso o motor gira indefinidamente, que é o
    /// comportamento do play-nvr e um risco real quando o comando vem pela rede.</para>
    ///
    /// <para>O controle é por (canal, eixo) para que soltar o zoom não desarme o pan que
    /// ainda está pressionado.</para>
    /// </summary>
    internal sealed class PtzWatchdog : IDisposable
    {
        /// <summary>Tempo sem re-armar até a parada automática. O cliente re-arma a cada 500 ms.</summary>
        public static readonly TimeSpan Timeout = TimeSpan.FromMilliseconds(1200);

        private static readonly TimeSpan TickInterval = TimeSpan.FromMilliseconds(200);

        private readonly Action<int, PtzAxis> _stop;
        private readonly Dictionary<(int Channel, PtzAxis Axis), long> _deadlines = new();
        private readonly object _gate = new();
        private readonly Timer _timer;

        public PtzWatchdog(Action<int, PtzAxis> stop)
        {
            _stop = stop;
            _timer = new Timer(_ => Tick(), null, TickInterval, TickInterval);
        }

        /// <summary>Marca o eixo como "em movimento"; renova o prazo se já estiver armado.</summary>
        public void Arm(int channel, PtzAxis axis)
        {
            lock (_gate)
                _deadlines[(channel, axis)] = Environment.TickCount64 + (long)Timeout.TotalMilliseconds;
        }

        /// <summary>O cliente mandou o stop na mão — não há mais o que vigiar.</summary>
        public void Disarm(int channel, PtzAxis axis)
        {
            lock (_gate) _deadlines.Remove((channel, axis));
        }

        /// <summary>
        /// Devolve tudo que está armado e limpa o estado. Usado quando o cliente de controle
        /// some: o chamador emite a parada de cada item.
        /// </summary>
        public List<(int Channel, PtzAxis Axis)> DrainAll()
        {
            lock (_gate)
            {
                var all = _deadlines.Keys.ToList();
                _deadlines.Clear();
                return all;
            }
        }

        private void Tick()
        {
            List<(int Channel, PtzAxis Axis)> expired = null;

            lock (_gate)
            {
                if (_deadlines.Count == 0) return;

                var now = Environment.TickCount64;
                foreach (var (key, deadline) in _deadlines)
                {
                    if (deadline > now) continue;
                    (expired ??= new()).Add(key);
                }

                if (expired == null) return;
                foreach (var key in expired) _deadlines.Remove(key);
            }

            foreach (var (channel, axis) in expired)
            {
                try { _stop(channel, axis); } catch { /* melhor esforço: seguir parando o resto */ }
            }
        }

        public void Dispose() => _timer.Dispose();
    }
}
