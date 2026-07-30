// Lê frames NV12 do memory-mapped file preenchido pelo sidecar PtzBridge.
// Vive no processo do Frame Server (dentro da media source). Thread-safe para um único leitor.
#pragma once

#include <windows.h>
#include <stdint.h>

class FrameReader {
public:
    FrameReader() = default;
    ~FrameReader();

    // Abre (ou cria) o MMF em %ProgramData%\ScPtzControl\vcam-frames.bin. Idempotente.
    // Retorna false se o arquivo não pôde ser aberto — nesse caso ReadLatest sempre dá placeholder.
    bool Open();
    void Close();

    // Copia o frame NV12 completo mais recente para dst (>= SCVCAM_FRAME_BYTES).
    // Retorna true se havia um frame "fresco" do produtor; false se não há produtor ativo
    // (frame antigo/ausente) — o chamador deve então gerar o quadro de placeholder.
    bool ReadLatest(uint8_t* dst, uint32_t dstBytes);

private:
    HANDLE   _file = INVALID_HANDLE_VALUE;
    HANDLE   _mapping = nullptr;
    uint8_t* _view = nullptr;
    int64_t  _qpcFreq = 0;
    uint32_t _lastSeq = 0;
};
