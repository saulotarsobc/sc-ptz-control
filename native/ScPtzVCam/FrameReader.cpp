#include "FrameReader.h"
#include "SharedFrame.h"

#include <shlobj.h>
#include <string>

#pragma comment(lib, "shell32.lib")

FrameReader::~FrameReader()
{
    Close();
}

static bool ProgramDataFilePath(std::wstring& out)
{
    PWSTR base = nullptr;
    if (FAILED(SHGetKnownFolderPath(FOLDERID_ProgramData, 0, nullptr, &base)))
        return false;
    out.assign(base);
    CoTaskMemFree(base);
    out += L"\\";
    out += SCVCAM_MMF_RELPATH;
    return true;
}

bool FrameReader::Open()
{
    if (_view)
        return true;

    LARGE_INTEGER f{};
    QueryPerformanceFrequency(&f);
    _qpcFreq = f.QuadPart;

    std::wstring path;
    if (!ProgramDataFilePath(path))
        return false;

    // Garante a pasta (o instalador já deve tê-la criado com ACL permissiva; isto é rede de segurança).
    std::wstring dir = path.substr(0, path.find_last_of(L'\\'));
    SHCreateDirectoryExW(nullptr, dir.c_str(), nullptr);

    _file = CreateFileW(path.c_str(), GENERIC_READ | GENERIC_WRITE,
                        FILE_SHARE_READ | FILE_SHARE_WRITE, nullptr,
                        OPEN_ALWAYS, FILE_ATTRIBUTE_NORMAL, nullptr);
    if (_file == INVALID_HANDLE_VALUE)
        return false;

    _mapping = CreateFileMappingW(_file, nullptr, PAGE_READWRITE,
                                  (DWORD)(SCVCAM_TOTAL_BYTES >> 32),
                                  (DWORD)(SCVCAM_TOTAL_BYTES & 0xFFFFFFFF), nullptr);
    if (!_mapping) {
        Close();
        return false;
    }

    _view = (uint8_t*)MapViewOfFile(_mapping, FILE_MAP_ALL_ACCESS, 0, 0, (SIZE_T)SCVCAM_TOTAL_BYTES);
    if (!_view) {
        Close();
        return false;
    }

    // Inicializa o cabeçalho se ainda não houver produtor (arquivo recém-criado).
    auto* h = (ScVCamHeader*)_view;
    if (h->magic != SCVCAM_MAGIC) {
        ScVCamHeader init{};
        init.magic = SCVCAM_MAGIC;
        init.version = SCVCAM_VERSION;
        init.width = SCVCAM_WIDTH;
        init.height = SCVCAM_HEIGHT;
        init.frameBytes = SCVCAM_FRAME_BYTES;
        init.slotCount = SCVCAM_SLOTS;
        memcpy(_view, &init, sizeof(init));
    }
    return true;
}

void FrameReader::Close()
{
    if (_view) { UnmapViewOfFile(_view); _view = nullptr; }
    if (_mapping) { CloseHandle(_mapping); _mapping = nullptr; }
    if (_file != INVALID_HANDLE_VALUE) { CloseHandle(_file); _file = INVALID_HANDLE_VALUE; }
}

bool FrameReader::ReadLatest(uint8_t* dst, uint32_t dstBytes)
{
    if (!_view || dstBytes < SCVCAM_FRAME_BYTES)
        return false;

    auto* h = (ScVCamHeader*)_view;

    // Heartbeat: registra que há consumidor ativo (o produtor usa isto para saber se deve renderizar).
    LARGE_INTEGER now{};
    QueryPerformanceCounter(&now);
    h->consumerQpc = (uint64_t)now.QuadPart;

    uint32_t seq = h->sequence;
    uint32_t slot = h->activeSlot;

    // Produtor considerado vivo se escreveu nos últimos ~500ms.
    uint64_t prod = h->producerQpc;
    bool fresh = false;
    if (prod != 0 && _qpcFreq > 0) {
        double ageMs = (double)((uint64_t)now.QuadPart - prod) * 1000.0 / (double)_qpcFreq;
        fresh = ageMs >= 0 && ageMs < 500.0;
    }

    if (!fresh || slot >= SCVCAM_SLOTS)
        return false;

    const uint8_t* src = _view + SCVCAM_HEADER_BYTES + (size_t)slot * SCVCAM_FRAME_BYTES;
    memcpy(dst, src, SCVCAM_FRAME_BYTES);

    _lastSeq = seq;
    return true;
}
