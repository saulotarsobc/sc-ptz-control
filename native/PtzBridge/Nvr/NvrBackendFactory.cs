using PtzBridge.Nvr.RtspCgi;
using PtzBridge.Platform;
using PtzBridge.Sdk;

namespace PtzBridge.Nvr
{
    /// <summary>
    /// Escolhe como falar com o equipamento.
    ///
    /// <para>No Windows o NetSDK vem junto do executável e é sempre o caminho preferido —
    /// nada muda em relação a antes. No Linux as bibliotecas nativas da Intelbras precisam ser
    /// obtidas à parte, então o padrão é sondar: se elas estiverem lá, usa o SDK; senão cai
    /// para RTSP+CGI, que só depende do ffmpeg.</para>
    ///
    /// <para>Quando o NetSDK nem foi compilado (o wrapper NetSDKCS mora em <c>helpers/</c> e
    /// não é versionado), a constante <c>NETSDK</c> não existe e só resta o RTSP+CGI. É o que
    /// permite compilar o sidecar numa máquina que nunca viu o SDK.</para>
    /// </summary>
    internal static class NvrBackendFactory
    {
        public static INvrBackend Create(NvrBackendKind requested)
        {
            switch (requested)
            {
                case NvrBackendKind.NetSdk:
                    return CreateNetSdk()
                        ?? throw new InvalidOperationException(NetSdkUnavailableMessage);

                case NvrBackendKind.RtspCgi:
                    return new RtspCgiBackend();

                default:
                    return CreateNetSdk() ?? CreateRtspFallback();
            }
        }

        /// <summary>Instancia o backend do NetSDK, ou <c>null</c> se ele não estiver disponível.</summary>
        private static INvrBackend CreateNetSdk()
        {
#if NETSDK
            if (!NativeLibraryResolver.NetSdkAvailable)
            {
                Log.Info("NetSDK não encontrado junto do executável");
                return null;
            }

            try
            {
                var backend = new NetSdk.NvrClient();
                Log.Info("backend: NetSDK");
                return backend;
            }
            catch (Exception ex)
            {
                // CLIENT_Init falhando é quase sempre dependência nativa faltando. No modo
                // automático isso não pode ser fatal: o RTSP ainda pode funcionar.
                Log.Info($"NetSDK indisponível ({ex.Message})");
                return null;
            }
#else
            return null;
#endif
        }

        private static INvrBackend CreateRtspFallback()
        {
            Log.Info(Ffmpeg.IsAvailable
                ? "backend: RTSP + CGI"
                : $"backend: RTSP + CGI (atenção: {Ffmpeg.MissingMessage})");

            return new RtspCgiBackend();
        }

        private static string NetSdkUnavailableMessage =>
#if NETSDK
            "As bibliotecas nativas do NetSDK não foram encontradas junto do serviço de PTZ. "
            + "Use o modo automático para cair no RTSP+CGI, ou instale o NetSDK da plataforma.";
#else
            "Este build do serviço de PTZ foi compilado sem o NetSDK. "
            + "Use o backend RTSP+CGI (modo automático) ou recompile com a pasta helpers/ presente.";
#endif
    }
}
