namespace PtzBridge
{
    /// <summary>
    /// Log em stderr. O stdout é reservado para o handshake com o processo principal do
    /// Electron (a primeira linha é o JSON com a porta), então qualquer coisa escrita lá
    /// atrapalharia a leitura.
    /// </summary>
    internal static class Log
    {
        private static readonly object Gate = new();

        public static void Info(string message) => Write("info", message);
        public static void Error(string message) => Write("erro", message);

        private static void Write(string level, string message)
        {
            lock (Gate)
                Console.Error.WriteLine($"[{DateTime.Now:HH:mm:ss}] {level}: {message}");
        }
    }
}
