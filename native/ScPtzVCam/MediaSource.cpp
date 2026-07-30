#include "MediaSource.h"

MediaSource::MediaSource()
{
    g_objectCount.fetch_add(1);
}

MediaSource::~MediaSource()
{
    g_objectCount.fetch_sub(1);
}

HRESULT MediaSource::Initialize(IMFAttributes* activatorAttributes)
{
    HRESULT hr = MFCreateAttributes(&_attributes, 8);
    if (FAILED(hr)) return hr;

    if (activatorAttributes)
        activatorAttributes->CopyAllItems(_attributes.Get());

    // Perfil de sensor: uma stream de vídeo até 30fps (perfil legado é suficiente).
    ComPtr<IMFSensorProfileCollection> profiles;
    hr = MFCreateSensorProfileCollection(&profiles);
    if (FAILED(hr)) return hr;

    ComPtr<IMFSensorProfile> legacy;
    hr = MFCreateSensorProfile(KSCAMERAPROFILE_Legacy, 0, nullptr, &legacy);
    if (FAILED(hr)) return hr;
    legacy->AddProfileFilter(0, L"((RES==;FRT<=30,1;SUT==))");
    profiles->AddProfile(legacy.Get());
    _attributes->SetUnknown(MF_DEVICEMFT_SENSORPROFILE_COLLECTION, profiles.Get());

    // Cria a stream e monta o descritor de apresentação.
    _stream = Make<MediaStream>();
    if (!_stream) return E_OUTOFMEMORY;
    hr = _stream->Initialize(this, 0);
    if (FAILED(hr)) return hr;

    ComPtr<IMFStreamDescriptor> sd;
    hr = _stream->GetStreamDescriptor(&sd);
    if (FAILED(hr)) return hr;

    IMFStreamDescriptor* descriptors[] = { sd.Get() };
    hr = MFCreatePresentationDescriptor(1, descriptors, &_descriptor);
    if (FAILED(hr)) return hr;
    _descriptor->SelectStream(0);

    return MFCreateEventQueue(&_queue);
}

// ------------------------------------------------------------ IMFMediaEventGenerator

STDMETHODIMP MediaSource::BeginGetEvent(IMFAsyncCallback* cb, IUnknown* state)
{
    auto lock = _lock.LockExclusive();
    if (!_queue) return MF_E_SHUTDOWN;
    return _queue->BeginGetEvent(cb, state);
}

STDMETHODIMP MediaSource::EndGetEvent(IMFAsyncResult* result, IMFMediaEvent** ev)
{
    auto lock = _lock.LockExclusive();
    if (!_queue) return MF_E_SHUTDOWN;
    return _queue->EndGetEvent(result, ev);
}

STDMETHODIMP MediaSource::GetEvent(DWORD flags, IMFMediaEvent** ev)
{
    ComPtr<IMFMediaEventQueue> q;
    {
        auto lock = _lock.LockExclusive();
        if (!_queue) return MF_E_SHUTDOWN;
        q = _queue;
    }
    return q->GetEvent(flags, ev);
}

STDMETHODIMP MediaSource::QueueEvent(MediaEventType met, REFGUID guid, HRESULT status, const PROPVARIANT* pv)
{
    auto lock = _lock.LockExclusive();
    if (!_queue) return MF_E_SHUTDOWN;
    return _queue->QueueEventParamVar(met, guid, status, pv);
}

// ------------------------------------------------------------ IMFMediaSource

STDMETHODIMP MediaSource::GetCharacteristics(DWORD* pdw)
{
    if (!pdw) return E_POINTER;
    *pdw = MFMEDIASOURCE_IS_LIVE;
    return S_OK;
}

STDMETHODIMP MediaSource::CreatePresentationDescriptor(IMFPresentationDescriptor** ppPD)
{
    auto lock = _lock.LockExclusive();
    if (!ppPD) return E_POINTER;
    if (!_descriptor) return MF_E_SHUTDOWN;
    return _descriptor->Clone(ppPD);
}

STDMETHODIMP MediaSource::Start(IMFPresentationDescriptor* pPD, const GUID* pguidTimeFormat, const PROPVARIANT*)
{
    if (!pPD) return E_POINTER;
    if (pguidTimeFormat && *pguidTimeFormat != GUID_NULL) return E_INVALIDARG;

    auto lock = _lock.LockExclusive();
    if (!_queue || !_descriptor) return MF_E_SHUTDOWN;

    DWORD count = 0;
    HRESULT hr = pPD->GetStreamDescriptorCount(&count);
    if (FAILED(hr) || count != 1) return E_INVALIDARG;

    BOOL selected = FALSE;
    ComPtr<IMFStreamDescriptor> sd;
    hr = pPD->GetStreamDescriptorByIndex(0, &selected, &sd);
    if (FAILED(hr)) return hr;

    if (selected)
    {
        _descriptor->SelectStream(0);

        ComPtr<IUnknown> unk;
        _stream.As(&unk);
        _queue->QueueEventParamUnk(MENewStream, GUID_NULL, S_OK, unk.Get());

        ComPtr<IMFMediaTypeHandler> handler;
        ComPtr<IMFMediaType> type;
        if (SUCCEEDED(sd->GetMediaTypeHandler(&handler)))
            handler->GetCurrentMediaType(&type);

        hr = _stream->Start(type.Get());
        if (FAILED(hr)) return hr;
    }

    PROPVARIANT time;
    PropVariantInit(&time);
    time.vt = VT_I8;
    time.hVal.QuadPart = MFGetSystemTime();
    hr = _queue->QueueEventParamVar(MESourceStarted, GUID_NULL, S_OK, &time);
    PropVariantClear(&time);
    return hr;
}

STDMETHODIMP MediaSource::Stop()
{
    auto lock = _lock.LockExclusive();
    if (!_queue || !_descriptor) return MF_E_SHUTDOWN;

    if (_stream)
        _stream->Stop();
    _descriptor->DeselectStream(0);

    PROPVARIANT time;
    PropVariantInit(&time);
    time.vt = VT_I8;
    time.hVal.QuadPart = MFGetSystemTime();
    HRESULT hr = _queue->QueueEventParamVar(MESourceStopped, GUID_NULL, S_OK, &time);
    PropVariantClear(&time);
    return hr;
}

STDMETHODIMP MediaSource::Pause()
{
    return MF_E_INVALID_STATE_TRANSITION; // fonte ao vivo: pausa não é suportada
}

STDMETHODIMP MediaSource::Shutdown()
{
    auto lock = _lock.LockExclusive();
    if (_queue)
    {
        _queue->Shutdown();
        _queue.Reset();
    }
    if (_stream)
    {
        _stream->Shutdown();
        _stream.Reset();
    }
    _descriptor.Reset();
    _attributes.Reset();
    return S_OK;
}

// ------------------------------------------------------------ IMFMediaSourceEx

STDMETHODIMP MediaSource::GetSourceAttributes(IMFAttributes** ppAttributes)
{
    auto lock = _lock.LockExclusive();
    if (!ppAttributes) return E_POINTER;
    if (!_attributes) return MF_E_SHUTDOWN;
    return _attributes.CopyTo(ppAttributes);
}

STDMETHODIMP MediaSource::GetStreamAttributes(DWORD, IMFAttributes** ppAttributes)
{
    auto lock = _lock.LockExclusive();
    if (!ppAttributes) return E_POINTER;
    if (!_stream) return MF_E_SHUTDOWN;
    return _stream.CopyTo(IID_PPV_ARGS(ppAttributes));
}

STDMETHODIMP MediaSource::SetD3DManager(IUnknown*)
{
    return S_OK; // CPU-only: ignoramos o gerenciador D3D (usamos buffers de sistema)
}

// ------------------------------------------------------------ IMFGetService

STDMETHODIMP MediaSource::GetService(REFGUID, REFIID riid, LPVOID* ppv)
{
    if (!ppv) return E_POINTER;
    *ppv = nullptr;
    return MF_E_UNSUPPORTED_SERVICE;
}

// ------------------------------------------------------------ IMFSampleAllocatorControl

STDMETHODIMP MediaSource::SetDefaultAllocator(DWORD, IUnknown* pAllocator)
{
    auto lock = _lock.LockExclusive();
    if (!_stream) return MF_E_SHUTDOWN;
    return _stream->SetAllocator(pAllocator);
}

STDMETHODIMP MediaSource::GetAllocatorUsage(DWORD dwOutputStreamID, DWORD* pdwInputStreamID, MFSampleAllocatorUsage* peUsage)
{
    auto lock = _lock.LockExclusive();
    if (!pdwInputStreamID || !peUsage) return E_POINTER;
    if (!_stream) return MF_E_SHUTDOWN;
    *pdwInputStreamID = dwOutputStreamID;
    *peUsage = _stream->GetAllocatorUsage();
    return S_OK;
}
