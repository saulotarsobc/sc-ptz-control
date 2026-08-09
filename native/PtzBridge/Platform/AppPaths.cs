namespace PtzBridge.Platform
{
    /// <summary>
    /// Caminhos do aplicativo em disco, num lugar só. Existe porque o Linux e o Windows
    /// discordam em dois pontos que estavam espalhados pelo código.
    ///
    /// <para>A configuração usa <c>ApplicationData</c>, que o .NET já resolve certo nos dois
    /// (<c>%APPDATA%</c> / <c>$XDG_CONFIG_HOME</c> ou <c>~/.config</c>). O buffer da câmera
    /// virtual não: <c>CommonApplicationData</c> aponta para <c>/usr/share</c> no Linux, que
    /// não é gravável pelo usuário — e lá o buffer nem existe, porque o v4l2loopback recebe
    /// os frames por <c>write()</c> no dispositivo em vez de por arquivo compartilhado.</para>
    /// </summary>
    internal static class AppPaths
    {
        /// <summary>Pasta de dados do usuário: <c>%APPDATA%\sc-ptz-control</c> ou <c>~/.config/sc-ptz-control</c>.</summary>
        public static string ConfigDir => Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "sc-ptz-control");

        public static string ConfigFile => Path.Combine(ConfigDir, "config.json");

        public static string ThumbsDir => Path.Combine(ConfigDir, "thumbs");

        /// <summary>
        /// Chave AES da cifra de senha fora do Windows (lá quem cuida disso é o DPAPI).
        /// Fica junto da configuração de propósito: as duas coisas têm o mesmo dono e o
        /// mesmo ciclo de vida — apagar a pasta invalida as duas de uma vez.
        /// </summary>
        public static string SecretKeyFile => Path.Combine(ConfigDir, "secret.key");

        /// <summary>Buffer NV12 lido pela media source nativa. Só usado no Windows.</summary>
        public static string VcamBufferFile => Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
            "ScPtzControl", "vcam-frames.bin");
    }
}
