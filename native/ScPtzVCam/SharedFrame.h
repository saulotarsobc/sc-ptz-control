// Contrato de memória compartilhada entre o sidecar PtzBridge (produtor, C#) e a media
// source da câmera virtual (consumidor, esta DLL, carregada pelo Frame Server do Windows).
//
// Transporte: um memory-mapped file COM RESPALDO EM ARQUIVO em
//   %ProgramData%\ScPtzControl\vcam-frames.bin
// Usar arquivo em ProgramData (com ACL permissiva criada no install) evita a exigência de
// SeCreateGlobalPrivilege do namespace Global\ e funciona entre a sessão do usuário e o
// processo de serviço do Frame Server.
//
// Formato de pixel: NV12 (Y plano seguido de UV entrelaçado), o formato nativo de câmera.
// Resolução fixa nesta versão (o tipo de mídia MF é fixo antes de qualquer consumidor abrir).
// Triplo buffer: o leitor quase nunca lê um slot em escrita; sem mutex no caminho quente.
//
// O lado C# deste contrato é VirtualCamera/SharedFrameProtocol.cs — mexeu num, mexa no outro.
#pragma once

#include <stdint.h>

#define SCVCAM_MMF_RELPATH   L"ScPtzControl\\vcam-frames.bin"
#define SCVCAM_MAGIC         0x31565053u  // 'SPV1' (little-endian)
#define SCVCAM_VERSION       1u

#define SCVCAM_WIDTH         1280u
#define SCVCAM_HEIGHT        720u
#define SCVCAM_FPS_NUM       30u
#define SCVCAM_FPS_DEN       1u
#define SCVCAM_SLOTS         3u

// NV12: plano Y (w*h) + plano UV entrelaçado (w*h/2) = w*h*3/2.
#define SCVCAM_FRAME_BYTES   (SCVCAM_WIDTH * SCVCAM_HEIGHT * 3u / 2u)

// Cabeçalho de tamanho fixo (128 bytes). Os offsets são o contrato binário com o C#;
// não reordenar. Campos "volatile" cruzam a fronteira de processo.
#define SCVCAM_HEADER_BYTES  128u
#define SCVCAM_TOTAL_BYTES   (SCVCAM_HEADER_BYTES + (uint64_t)SCVCAM_SLOTS * SCVCAM_FRAME_BYTES)

#pragma pack(push, 4)
struct ScVCamHeader {
    uint32_t magic;              // @0   SCVCAM_MAGIC
    uint32_t version;            // @4   SCVCAM_VERSION
    uint32_t width;              // @8
    uint32_t height;             // @12
    uint32_t frameBytes;         // @16  NV12 = width*height*3/2
    uint32_t slotCount;          // @20
    volatile uint32_t sequence;  // @24  incrementado a cada frame escrito
    volatile uint32_t activeSlot;// @28  slot com o frame completo mais recente
    volatile uint64_t producerQpc; // @32 QueryPerformanceCounter do último write (heartbeat do C#)
    volatile uint64_t consumerQpc; // @40 QPC da última leitura (heartbeat da media source)
    uint32_t reserved[20];       // @48..@127
};
#pragma pack(pop)

static_assert(sizeof(ScVCamHeader) == SCVCAM_HEADER_BYTES, "ScVCamHeader deve ter 128 bytes");
