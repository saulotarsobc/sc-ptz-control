#include "MediaStream.h"
#include "SharedFrame.h"

using Microsoft::WRL::Wrappers::SRWLock;

static const UINT32 kWidth = SCVCAM_WIDTH;
static const UINT32 kHeight = SCVCAM_HEIGHT;
static const LONGLONG kFrameDuration = 10000000LL * SCVCAM_FPS_DEN / SCVCAM_FPS_NUM; // 100ns

MediaStream::MediaStream()
{
    g_objectCount.fetch_add(1);
}

MediaStream::~MediaStream()
{
    g_objectCount.fetch_sub(1);
}

HRESULT MediaStream::Initialize(IMFMediaSource* source, int index)
{
    _source = source;
    _index = index;

    HRESULT hr = MFCreateAttributes(&_attributes, 8);
    if (FAILED(hr)) return hr;

    _attributes->SetGUID(MF_DEVICESTREAM_STREAM_CATEGORY, PINNAME_VIDEO_CAPTURE);
    _attributes->SetUINT32(MF_DEVICESTREAM_STREAM_ID, index);
    _attributes->SetUINT32(MF_DEVICESTREAM_FRAMESERVER_SHARED, 1);
    _attributes->SetUINT32(MF_DEVICESTREAM_ATTRIBUTE_FRAMESOURCE_TYPES, MFFrameSourceTypes_Color);

    hr = MFCreateEventQueue(&_queue);
    if (FAILED(hr)) return hr;

    // Tipo de mídia único: NV12 1280x720@30, BT.709 faixa limitada (casa com o produtor C#).
    ComPtr<IMFMediaType> nv12;
    hr = MFCreateMediaType(&nv12);
    if (FAILED(hr)) return hr;

    nv12->SetGUID(MF_MT_MAJOR_TYPE, MFMediaType_Video);
    nv12->SetGUID(MF_MT_SUBTYPE, MFVideoFormat_NV12);
    nv12->SetUINT32(MF_MT_INTERLACE_MODE, MFVideoInterlace_Progressive);
    nv12->SetUINT32(MF_MT_ALL_SAMPLES_INDEPENDENT, TRUE);
    MFSetAttributeSize(nv12.Get(), MF_MT_FRAME_SIZE, kWidth, kHeight);
    nv12->SetUINT32(MF_MT_DEFAULT_STRIDE, kWidth);
    MFSetAttributeRatio(nv12.Get(), MF_MT_FRAME_RATE, SCVCAM_FPS_NUM, SCVCAM_FPS_DEN);
    MFSetAttributeRatio(nv12.Get(), MF_MT_PIXEL_ASPECT_RATIO, 1, 1);
    nv12->SetUINT32(MF_MT_VIDEO_NOMINAL_RANGE, MFNominalRange_16_235);
    nv12->SetUINT32(MF_MT_YUV_MATRIX, MFVideoTransferMatrix_BT709);

    IMFMediaType* types[] = { nv12.Get() };
    hr = MFCreateStreamDescriptor(_index, 1, types, &_descriptor);
    if (FAILED(hr)) return hr;

    ComPtr<IMFMediaTypeHandler> handler;
    hr = _descriptor->GetMediaTypeHandler(&handler);
    if (FAILED(hr)) return hr;

    return handler->SetCurrentMediaType(nv12.Get());
}

HRESULT MediaStream::GetStreamDescriptor(IMFStreamDescriptor** ppDescriptor)
{
    if (!ppDescriptor) return E_POINTER;
    if (!_descriptor) return MF_E_NOT_INITIALIZED;
    return _descriptor.CopyTo(ppDescriptor);
}

HRESULT MediaStream::Start(IMFMediaType* type)
{
    auto lock = _lock.LockExclusive();
    if (!_queue || !_allocator) return MF_E_SHUTDOWN;

    // Chamado via SetStreamState(RUNNING) pode vir sem tipo: usa o tipo atual do descritor.
    ComPtr<IMFMediaType> current;
    if (!type && _descriptor)
    {
        ComPtr<IMFMediaTypeHandler> handler;
        if (SUCCEEDED(_descriptor->GetMediaTypeHandler(&handler)))
            handler->GetCurrentMediaType(&current);
        type = current.Get();
    }

    if (type)
        type->GetGUID(MF_MT_SUBTYPE, &_format);

    _reader.Open();
    _scratch.resize(SCVCAM_FRAME_BYTES);

    HRESULT hr = _allocator->InitializeSampleAllocator(10, type);
    if (FAILED(hr)) return hr;

    hr = _queue->QueueEventParamVar(MEStreamStarted, GUID_NULL, S_OK, nullptr);
    _state = MF_STREAM_STATE_RUNNING;
    return hr;
}

HRESULT MediaStream::Stop()
{
    auto lock = _lock.LockExclusive();
    if (!_queue) return MF_E_SHUTDOWN;

    if (_allocator)
        _allocator->UninitializeSampleAllocator();

    HRESULT hr = _queue->QueueEventParamVar(MEStreamStopped, GUID_NULL, S_OK, nullptr);
    _state = MF_STREAM_STATE_STOPPED;
    return hr;
}

HRESULT MediaStream::Shutdown()
{
    auto lock = _lock.LockExclusive();
    if (_queue)
    {
        _queue->Shutdown();
        _queue.Reset();
    }
    _allocator.Reset();
    _descriptor.Reset();
    _attributes.Reset();
    _source = nullptr;
    _reader.Close();
    return S_OK;
}

HRESULT MediaStream::SetAllocator(IUnknown* allocator)
{
    if (!allocator) return E_POINTER;
    _allocator.Reset();
    return allocator->QueryInterface(IID_PPV_ARGS(&_allocator));
}

// ------------------------------------------------------------ IMFMediaEventGenerator

STDMETHODIMP MediaStream::BeginGetEvent(IMFAsyncCallback* cb, IUnknown* state)
{
    auto lock = _lock.LockExclusive();
    if (!_queue) return MF_E_SHUTDOWN;
    return _queue->BeginGetEvent(cb, state);
}

STDMETHODIMP MediaStream::EndGetEvent(IMFAsyncResult* result, IMFMediaEvent** ev)
{
    auto lock = _lock.LockExclusive();
    if (!_queue) return MF_E_SHUTDOWN;
    return _queue->EndGetEvent(result, ev);
}

STDMETHODIMP MediaStream::GetEvent(DWORD flags, IMFMediaEvent** ev)
{
    ComPtr<IMFMediaEventQueue> q;
    {
        auto lock = _lock.LockExclusive();
        if (!_queue) return MF_E_SHUTDOWN;
        q = _queue;
    }
    return q->GetEvent(flags, ev);
}

STDMETHODIMP MediaStream::QueueEvent(MediaEventType met, REFGUID guid, HRESULT status, const PROPVARIANT* pv)
{
    auto lock = _lock.LockExclusive();
    if (!_queue) return MF_E_SHUTDOWN;
    return _queue->QueueEventParamVar(met, guid, status, pv);
}

// ------------------------------------------------------------ IMFMediaStream / 2

STDMETHODIMP MediaStream::GetMediaSource(IMFMediaSource** ppMediaSource)
{
    auto lock = _lock.LockExclusive();
    if (!ppMediaSource) return E_POINTER;
    if (!_source) return MF_E_SHUTDOWN;
    _source->AddRef();
    *ppMediaSource = _source;
    return S_OK;
}

STDMETHODIMP MediaStream::RequestSample(IUnknown* pToken)
{
    auto lock = _lock.LockExclusive();
    if (!_allocator || !_queue) return MF_E_SHUTDOWN;

    ComPtr<IMFSample> sample;
    HRESULT hr = _allocator->AllocateSample(&sample);
    if (FAILED(hr)) return hr;

    sample->SetSampleTime(MFGetSystemTime());
    sample->SetSampleDuration(kFrameDuration);

    hr = FillSample(sample.Get());
    if (FAILED(hr)) return hr;

    if (pToken)
        sample->SetUnknown(MFSampleExtension_Token, pToken);

    return _queue->QueueEventParamUnk(MEMediaSample, GUID_NULL, S_OK, sample.Get());
}

STDMETHODIMP MediaStream::SetStreamState(MF_STREAM_STATE value)
{
    switch (value)
    {
    case MF_STREAM_STATE_RUNNING:
        return Start(nullptr);
    case MF_STREAM_STATE_STOPPED:
        return Stop();
    default:
        return E_INVALIDARG;
    }
}

STDMETHODIMP MediaStream::GetStreamState(MF_STREAM_STATE* value)
{
    auto lock = _lock.LockExclusive();
    if (!value) return E_POINTER;
    *value = _state;
    return S_OK;
}

// ------------------------------------------------------------ preenchimento do frame

HRESULT MediaStream::FillSample(IMFSample* sample)
{
    ComPtr<IMFMediaBuffer> buffer;
    HRESULT hr = sample->GetBufferByIndex(0, &buffer);
    if (FAILED(hr)) return hr;

    bool haveFrame = _reader.ReadLatest(_scratch.data(), (uint32_t)_scratch.size());

    ComPtr<IMF2DBuffer2> buffer2D;
    if (SUCCEEDED(buffer.As(&buffer2D)))
    {
        BYTE* scanline = nullptr; LONG pitch = 0; BYTE* start = nullptr; DWORD length = 0;
        hr = buffer2D->Lock2DSize(MF2DBuffer_LockFlags_Write, &scanline, &pitch, &start, &length);
        if (FAILED(hr)) return hr;

        if (haveFrame)
        {
            const BYTE* srcY = _scratch.data();
            const BYTE* srcUV = srcY + (size_t)kWidth * kHeight;
            for (UINT32 y = 0; y < kHeight; y++)
                memcpy(scanline + (size_t)y * pitch, srcY + (size_t)y * kWidth, kWidth);
            for (UINT32 r = 0; r < kHeight / 2; r++)
                memcpy(scanline + (size_t)(kHeight + r) * pitch, srcUV + (size_t)r * kWidth, kWidth);
        }
        else
        {
            FillPlaceholder(scanline, pitch);
        }

        buffer2D->Unlock2D();
        return S_OK;
    }

    // Fallback 1D contíguo (pitch = largura).
    BYTE* data = nullptr; DWORD maxLen = 0;
    hr = buffer->Lock(&data, &maxLen, nullptr);
    if (FAILED(hr)) return hr;

    if (haveFrame && maxLen >= SCVCAM_FRAME_BYTES)
        memcpy(data, _scratch.data(), SCVCAM_FRAME_BYTES);
    else
        FillPlaceholder(data, kWidth);

    buffer->SetCurrentLength(SCVCAM_FRAME_BYTES);
    buffer->Unlock();
    return S_OK;
}

// Quadro preto. Só aparece quando o sidecar NÃO está publicando (app fechado, buffer
// inacessível): com ele vivo, quem desenha o "Sem sinal!" é o produtor, que sabe a
// diferença entre "sem vídeo do NVR" e "sem aplicativo". Y=16 é o preto da faixa
// limitada (16..235) anunciada no tipo de mídia; croma neutra em 128.
void MediaStream::FillPlaceholder(BYTE* dst, LONG pitch)
{
    for (UINT32 y = 0; y < kHeight; y++)
        memset(dst + (size_t)y * pitch, 16, kWidth);
    for (UINT32 r = 0; r < kHeight / 2; r++)
        memset(dst + (size_t)(kHeight + r) * pitch, 128, kWidth);
}
