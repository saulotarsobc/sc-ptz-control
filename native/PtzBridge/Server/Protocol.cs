using System.Text.Json;
using System.Text.Json.Serialization;

namespace PtzBridge.Server
{
    /// <summary>
    /// Formato do canal de controle (<c>/ws/control</c>), em texto JSON:
    ///
    /// <code>
    /// pedido:    {"id":7,"op":"ptz.move","params":{...}}
    /// resposta:  {"id":7,"ok":true,"result":{...}}
    ///            {"id":7,"ok":false,"error":"..."}
    /// evento:    {"event":"connection","state":"disconnected"}   (sem id)
    /// </code>
    ///
    /// Canais são sempre 1-based aqui, como na UI; a conversão para a base 0 do SDK
    /// acontece só na borda do <see cref="NvrService"/>.
    /// </summary>
    internal static class Rpc
    {
        public static readonly JsonSerializerOptions Options = new()
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        };

        public static string Serialize(object value) => JsonSerializer.Serialize(value, Options);

        public static string Ok(int? id, object result = null)
            => Serialize(new RpcResponse { Id = id, Ok = true, Result = result });

        public static string Fail(int? id, string error)
            => Serialize(new RpcResponse { Id = id, Ok = false, Error = error });

        public static string Event(string name, object payload = null)
            => Serialize(new RpcEvent { Event = name, Data = payload });
    }

    internal sealed class RpcRequest
    {
        public int? Id { get; set; }
        public string Op { get; set; }
        public JsonElement? Params { get; set; }
    }

    internal sealed class RpcResponse
    {
        public int? Id { get; set; }
        public bool Ok { get; set; }
        public object Result { get; set; }
        public string Error { get; set; }
    }

    internal sealed class RpcEvent
    {
        public string Event { get; set; }
        public object Data { get; set; }
    }

    /// <summary>Leitura tolerante dos <c>params</c>: campo ausente vira o default.</summary>
    internal static class Params
    {
        public static int Int(JsonElement? p, string name, int fallback = 0)
        {
            if (!TryGet(p, name, out var v)) return fallback;
            return v.ValueKind switch
            {
                JsonValueKind.Number when v.TryGetInt32(out var i) => i,
                JsonValueKind.String when int.TryParse(v.GetString(), out var s) => s,
                _ => fallback,
            };
        }

        public static bool Bool(JsonElement? p, string name, bool fallback = false)
        {
            if (!TryGet(p, name, out var v)) return fallback;
            return v.ValueKind switch
            {
                JsonValueKind.True => true,
                JsonValueKind.False => false,
                _ => fallback,
            };
        }

        public static string Str(JsonElement? p, string name, string fallback = "")
        {
            if (!TryGet(p, name, out var v)) return fallback;
            return v.ValueKind == JsonValueKind.String ? v.GetString() ?? fallback : fallback;
        }

        public static bool Has(JsonElement? p, string name) => TryGet(p, name, out _);

        private static bool TryGet(JsonElement? p, string name, out JsonElement value)
        {
            value = default;
            if (p is not { ValueKind: JsonValueKind.Object } obj) return false;
            return obj.TryGetProperty(name, out value) && value.ValueKind != JsonValueKind.Null;
        }
    }

    /// <summary>
    /// Cabeçalho binário de 20 bytes que precede cada frame NV12 em <c>/ws/video</c>.
    /// O renderer é stateless: como largura e altura viajam em TODO frame, uma mudança de
    /// resolução na fonte não exige renegociar nada.
    ///
    /// <code>
    /// offset  tipo   campo
    /// 0       u32    magic 'PNV2' (0x32564E50, little-endian)
    /// 4       u16    width
    /// 6       u16    height
    /// 8       u32    sequence
    /// 12      u32    timestamp da fonte (ms)
    /// 16      u16    FPS informado pelo decoder
    /// 18      u16    reservado (0)
    /// 20..    bytes  NV12: plano Y (w*h) + plano UV entrelaçado (w*h/2)
    /// </code>
    /// </summary>
    internal static class VideoFrameHeader
    {
        public const int Bytes = 20;
        public const uint Magic = 0x32564E50; // 'P','N','V','2'

        public static void Write(
            Span<byte> dst,
            int width,
            int height,
            uint sequence,
            uint timestampMs,
            int fps)
        {
            System.Buffers.Binary.BinaryPrimitives.WriteUInt32LittleEndian(dst[..4], Magic);
            System.Buffers.Binary.BinaryPrimitives.WriteUInt16LittleEndian(dst.Slice(4, 2), (ushort)width);
            System.Buffers.Binary.BinaryPrimitives.WriteUInt16LittleEndian(dst.Slice(6, 2), (ushort)height);
            System.Buffers.Binary.BinaryPrimitives.WriteUInt32LittleEndian(dst.Slice(8, 4), sequence);
            System.Buffers.Binary.BinaryPrimitives.WriteUInt32LittleEndian(dst.Slice(12, 4), timestampMs);
            System.Buffers.Binary.BinaryPrimitives.WriteUInt16LittleEndian(dst.Slice(16, 2), (ushort)Math.Clamp(fps, 0, ushort.MaxValue));
            System.Buffers.Binary.BinaryPrimitives.WriteUInt16LittleEndian(dst.Slice(18, 2), 0);
        }
    }
}
