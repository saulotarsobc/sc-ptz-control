using NetSDKCS;

namespace PtzBridge.Sdk
{
    /// <summary>Informações do dispositivo retornadas no login.</summary>
    public sealed class NvrDeviceInfo
    {
        public string Serial { get; init; } = "";
        public int ChannelCount { get; init; }
        public string DeviceType { get; init; } = "";
    }

    /// <summary>Direções de movimento do PTZ (4 cardeais + 4 diagonais).</summary>
    public enum PtzDir
    {
        Up, Down, Left, Right,
        UpLeft, UpRight, DownLeft, DownRight,
    }

    /// <summary>
    /// Wrapper amigável sobre o NETClient do NetSDK 3.050.
    ///
    /// <para>Ciclo de vida: <see cref="SdkHost.Acquire"/> (no construtor) → Login →
    /// StartRealPlay/StopRealPlay → Logout → <see cref="SdkHost.Release"/> (no Dispose).</para>
    ///
    /// <para>Quando <c>hWnd</c> é <c>IntPtr.Zero</c> o SDK não desenha nada: o stream vem
    /// cru pelo callback de <c>RAW_DATA</c>, que é como o <see cref="Streaming.ChannelStream"/>
    /// obtém os frames sem precisar de janela.</para>
    /// </summary>
    public sealed class NvrClient : IDisposable
    {
        private IntPtr _loginId = IntPtr.Zero;

        // Vários streams simultâneos (um por canal assistido).
        private readonly object _playLock = new();
        private readonly List<IntPtr> _playHandles = new();

        // Snapshot remoto é assíncrono (chega no callback global); serializamos com um TCS.
        private readonly object _snapLock = new();
        private TaskCompletionSource<byte[]> _snapTcs;

        private bool _disposed;

        /// <summary>Disparado quando o SDK detecta queda de conexão.</summary>
        public event Action Disconnected;

        /// <summary>Disparado quando o SDK reconecta automaticamente.</summary>
        public event Action Reconnected;

        public bool IsLoggedIn => _loginId != IntPtr.Zero;

        public NvrClient()
        {
            SdkHost.Acquire();
            SdkHost.Disconnected += OnSdkDisconnect;
            SdkHost.Reconnected += OnSdkReconnect;
            SdkHost.SnapshotReceived += OnSnapReceived;
        }

        /// <summary>Faz login no NVR/DVR. Lança exceção com o erro do SDK em falha.</summary>
        public NvrDeviceInfo Login(string ip, ushort port, string user, string password)
        {
            if (IsLoggedIn) Logout();

            var di = new NET_DEVICEINFO_Ex();
            _loginId = NETClient.Login(
                ip, port, user, password,
                EM_LOGIN_SPAC_CAP_TYPE.TCP, IntPtr.Zero, ref di);

            if (_loginId == IntPtr.Zero)
                throw new InvalidOperationException($"Falha no login: {NETClient.GetLastError()}");

            return new NvrDeviceInfo
            {
                Serial = di.sSerialNumber ?? "",
                ChannelCount = di.nChanNum,
                DeviceType = di.nDVRType.ToString(),
            };
        }

        /// <summary>
        /// Inicia um stream de vídeo e devolve o handle (use-o em <see cref="StopRealPlay"/>).
        /// Vários streams podem coexistir no mesmo login.
        /// </summary>
        /// <param name="channelIndexZeroBased">Canal (base 0).</param>
        /// <param name="hWnd">Janela de destino, ou <c>IntPtr.Zero</c> para só receber o stream cru.</param>
        /// <param name="subStream">true = stream extra (leve); false = principal.</param>
        public IntPtr StartRealPlay(int channelIndexZeroBased, IntPtr hWnd, bool subStream)
        {
            if (!IsLoggedIn)
                throw new InvalidOperationException("Não conectado. Faça login primeiro.");

            var type = subStream ? EM_RealPlayType.Realplay_1 : EM_RealPlayType.Realplay;
            var handle = NETClient.RealPlay(_loginId, channelIndexZeroBased, hWnd, type);

            if (handle == IntPtr.Zero)
                throw new InvalidOperationException(
                    $"Falha ao iniciar o vídeo do canal {channelIndexZeroBased + 1}: {NETClient.GetLastError()}");

            lock (_playLock) _playHandles.Add(handle);
            return handle;
        }

        /// <summary>Para um stream específico (obtido em <see cref="StartRealPlay"/>).</summary>
        public void StopRealPlay(IntPtr handle)
        {
            if (handle == IntPtr.Zero) return;
            NETClient.StopRealPlay(handle);
            lock (_playLock) _playHandles.Remove(handle);
        }

        /// <summary>Para todos os streams ativos.</summary>
        public void StopAllRealPlay()
        {
            lock (_playLock)
            {
                foreach (var h in _playHandles) NETClient.StopRealPlay(h);
                _playHandles.Clear();
            }
        }

        // ------------------------------------------------------------------
        // Snapshot remoto (CLIENT_SnapPictureEx + callback global de JPEG).
        //
        // O SDK responde assíncrono num callback de processo sem correlação de
        // requisição, então só cabe UMA requisição em voo por vez.
        // ------------------------------------------------------------------
        #region Snapshot

        /// <summary>Pede um snapshot do canal (base 0) e devolve os bytes JPEG recebidos.</summary>
        public async Task<byte[]> CaptureSnapshotAsync(int channelIndexZeroBased, int timeoutMs = 5000)
        {
            if (!IsLoggedIn)
                throw new InvalidOperationException("Não conectado. Faça login primeiro.");

            var tcs = new TaskCompletionSource<byte[]>(TaskCreationOptions.RunContinuationsAsynchronously);
            lock (_snapLock)
            {
                if (_snapTcs != null)
                    throw new InvalidOperationException("Já existe um snapshot em andamento.");
                _snapTcs = tcs;
            }

            var par = new NET_SNAP_PARAMS
            {
                Channel = (uint)channelIndexZeroBased,
                Quality = 6,   // melhor qualidade
                ImageSize = 2, // 2 = D1 (limite do SnapPictureEx neste SDK)
                mode = 0,      // 0 = uma frame
                InterSnap = 0,
                Reserved = new uint[4],
            };

            if (!NETClient.SnapPictureEx(_loginId, par, IntPtr.Zero))
            {
                lock (_snapLock) { _snapTcs = null; }
                throw new InvalidOperationException($"Falha ao solicitar snapshot: {NETClient.GetLastError()}");
            }

            using var cts = new CancellationTokenSource(timeoutMs);
            using (cts.Token.Register(() =>
                tcs.TrySetException(new TimeoutException("Timeout aguardando o snapshot do dispositivo."))))
            {
                try { return await tcs.Task.ConfigureAwait(false); }
                finally { lock (_snapLock) { if (_snapTcs == tcs) _snapTcs = null; } }
            }
        }

        private void OnSnapReceived(IntPtr loginId, byte[] jpeg)
        {
            if (loginId != _loginId) return;

            TaskCompletionSource<byte[]> tcs;
            lock (_snapLock) { tcs = _snapTcs; }
            tcs?.TrySetResult(jpeg);
        }

        #endregion

        // ------------------------------------------------------------------
        // PTZ (CLIENT_DHPTZControlEx2, mesma API do demo RealPlayAndPTZDemo).
        //
        // Comandos contínuos (mover, zoom, foco, íris): chame com stop=false ao
        // apertar e stop=true ao soltar — o motor se move só enquanto pressionado.
        // Quem garante que o stop sempre chega é o PtzWatchdog, não o cliente.
        // Presets são comandos únicos (não precisam de par apertar/soltar).
        //
        // Todos os métodos recebem o canal em BASE 0.
        // ------------------------------------------------------------------
        #region PTZ

        /// <summary>Move o PTZ numa das 8 direções. speed 1..8.</summary>
        public void PtzDirection(int channel, PtzDir dir, int speed, bool stop)
        {
            var (type, p1, p2) = dir switch
            {
                PtzDir.Up => (EM_EXTPTZ_ControlType.UP_CONTROL, 0, speed),
                PtzDir.Down => (EM_EXTPTZ_ControlType.DOWN_CONTROL, 0, speed),
                PtzDir.Left => (EM_EXTPTZ_ControlType.LEFT_CONTROL, 0, speed),
                PtzDir.Right => (EM_EXTPTZ_ControlType.RIGHT_CONTROL, 0, speed),
                PtzDir.UpLeft => (EM_EXTPTZ_ControlType.LEFTTOP, speed, speed),
                PtzDir.UpRight => (EM_EXTPTZ_ControlType.RIGHTTOP, speed, speed),
                PtzDir.DownLeft => (EM_EXTPTZ_ControlType.LEFTDOWN, speed, speed),
                PtzDir.DownRight => (EM_EXTPTZ_ControlType.RIGHTDOWN, speed, speed),
                _ => throw new ArgumentOutOfRangeException(nameof(dir)),
            };
            Ptz(channel, type, p1, p2, stop);
        }

        /// <summary>Zoom: tele=true aproxima (+), false afasta (−).</summary>
        public void PtzZoom(int channel, bool tele, int speed, bool stop)
            => Ptz(channel, tele ? EM_EXTPTZ_ControlType.ZOOM_ADD_CONTROL
                                  : EM_EXTPTZ_ControlType.ZOOM_DEC_CONTROL, 0, speed, stop);

        /// <summary>Foco: far=true foco longe (+), false foco perto (−).</summary>
        public void PtzFocus(int channel, bool far, int speed, bool stop)
            => Ptz(channel, far ? EM_EXTPTZ_ControlType.FOCUS_ADD_CONTROL
                                : EM_EXTPTZ_ControlType.FOCUS_DEC_CONTROL, 0, speed, stop);

        /// <summary>Íris/diafragma: open=true abre (+), false fecha (−).</summary>
        public void PtzIris(int channel, bool open, int speed, bool stop)
            => Ptz(channel, open ? EM_EXTPTZ_ControlType.APERTURE_ADD_CONTROL
                                 : EM_EXTPTZ_ControlType.APERTURE_DEC_CONTROL, 0, speed, stop);

        /// <summary>Move a câmera para um preset já gravado.</summary>
        public void PtzGotoPreset(int channel, int preset)
            => Ptz(channel, EM_EXTPTZ_ControlType.POINT_MOVE_CONTROL, 0, preset, false);

        /// <summary>Grava a posição atual como um preset.</summary>
        public void PtzSetPreset(int channel, int preset)
            => Ptz(channel, EM_EXTPTZ_ControlType.POINT_SET_CONTROL, 0, preset, false);

        /// <summary>Apaga o preset NO EQUIPAMENTO (o play-nvr só apagava a miniatura local).</summary>
        public void PtzDeletePreset(int channel, int preset)
            => Ptz(channel, EM_EXTPTZ_ControlType.POINT_DEL_CONTROL, 0, preset, false);

        /// <summary>
        /// Emite o "soltar" de todos os eixos do canal. Usado pelo watchdog e ao perder o
        /// cliente: o SDK não tem um "parar tudo", então mandamos stop em cada eixo e
        /// engolimos falhas individuais (nem todo domo aceita íris/foco).
        /// </summary>
        public void PtzStopAll(int channel)
        {
            EM_EXTPTZ_ControlType[] axes =
            {
                EM_EXTPTZ_ControlType.UP_CONTROL,        // pára o motor de pan/tilt
                EM_EXTPTZ_ControlType.ZOOM_ADD_CONTROL,
                EM_EXTPTZ_ControlType.FOCUS_ADD_CONTROL,
                EM_EXTPTZ_ControlType.APERTURE_ADD_CONTROL,
            };

            foreach (var axis in axes)
            {
                try { Ptz(channel, axis, 0, 0, stop: true); }
                catch { /* eixo não suportado — seguir parando os demais */ }
            }
        }

        private void Ptz(int channel, EM_EXTPTZ_ControlType type, int p1, int p2, bool stop)
        {
            if (!IsLoggedIn)
                throw new InvalidOperationException("Não conectado. Faça login primeiro.");
            if (channel < 0)
                throw new InvalidOperationException("Nenhum canal selecionado.");

            if (!NETClient.PTZControl(_loginId, channel, type, p1, p2, 0, stop, IntPtr.Zero))
                throw new InvalidOperationException($"Falha no comando PTZ: {NETClient.GetLastError()}");
        }

        #endregion

        public void Logout()
        {
            StopAllRealPlay();
            if (_loginId == IntPtr.Zero) return;
            NETClient.Logout(_loginId);
            _loginId = IntPtr.Zero;
        }

        private void OnSdkDisconnect(IntPtr loginId)
        {
            if (loginId == _loginId) Disconnected?.Invoke();
        }

        private void OnSdkReconnect(IntPtr loginId)
        {
            if (loginId == _loginId) Reconnected?.Invoke();
        }

        public void Dispose()
        {
            if (_disposed) return;
            _disposed = true;

            SdkHost.Disconnected -= OnSdkDisconnect;
            SdkHost.Reconnected -= OnSdkReconnect;
            SdkHost.SnapshotReceived -= OnSnapReceived;

            Logout();
            SdkHost.Release();
        }
    }
}
