namespace PtzBridge.Platform
{
    /// <summary>
    /// Caminhos persistentes usados pela configuração, miniaturas e câmera virtual no Windows.
    /// </summary>
    internal static class AppPaths
    {
        /// <summary>Pasta de dados do usuário: <c>%APPDATA%\sc-ptz-control</c>.</summary>
        public static string ConfigDir => Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "sc-ptz-control");

        public static string ConfigFile => Path.Combine(ConfigDir, "config.json");

        public static string ThumbsDir => Path.Combine(ConfigDir, "thumbs");

        /// <summary>Buffer NV12 lido pela media source nativa.</summary>
        public static string VcamBufferFile => Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
            "ScPtzControl", "vcam-frames.bin");
    }
}
