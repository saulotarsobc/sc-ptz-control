// Stream de vídeo da câmera virtual. Anuncia NV12 1280x720@30 e, a cada RequestSample do
// pipeline, entrega um IMFSample preenchido com o frame mais recente da memória compartilhada
// (ou um quadro preto quando o sidecar não está publicando).
#pragma once

#include "Common.h"
#include "FrameReader.h"
#include <wrl/wrappers/corewrappers.h>
#include <vector>

class MediaStream : public RuntimeClass<
    RuntimeClassFlags<ClassicCom>,
    ChainInterfaces<IMFMediaStream2, IMFMediaStream, IMFMediaEventGenerator>,
    IMFAttributes,
    IKsControl>
{
public:
    MediaStream();
    ~MediaStream();

    // Uso interno pelo MediaSource (não-COM).
    HRESULT Initialize(IMFMediaSource* source, int index);
    HRESULT Start(IMFMediaType* type);
    HRESULT Stop();
    HRESULT Shutdown();
    HRESULT SetAllocator(IUnknown* allocator);
    MFSampleAllocatorUsage GetAllocatorUsage() const { return MFSampleAllocatorUsage_UsesProvidedAllocator; }

    // IMFMediaEventGenerator
    STDMETHODIMP BeginGetEvent(IMFAsyncCallback* pCallback, IUnknown* punkState) override;
    STDMETHODIMP EndGetEvent(IMFAsyncResult* pResult, IMFMediaEvent** ppEvent) override;
    STDMETHODIMP GetEvent(DWORD dwFlags, IMFMediaEvent** ppEvent) override;
    STDMETHODIMP QueueEvent(MediaEventType met, REFGUID guid, HRESULT hr, const PROPVARIANT* pv) override;

    // IMFMediaStream
    STDMETHODIMP GetMediaSource(IMFMediaSource** ppMediaSource) override;
    STDMETHODIMP GetStreamDescriptor(IMFStreamDescriptor** ppStreamDescriptor) override;
    STDMETHODIMP RequestSample(IUnknown* pToken) override;

    // IMFMediaStream2
    STDMETHODIMP SetStreamState(MF_STREAM_STATE value) override;
    STDMETHODIMP GetStreamState(MF_STREAM_STATE* value) override;

    // IKsControl (mínimo; a câmera virtual não expõe controles KS)
    STDMETHODIMP KsProperty(PKSPROPERTY, ULONG, LPVOID, ULONG, ULONG*) override { return E_NOTIMPL; }
    STDMETHODIMP KsMethod(PKSMETHOD, ULONG, LPVOID, ULONG, ULONG*) override { return E_NOTIMPL; }
    STDMETHODIMP KsEvent(PKSEVENT, ULONG, LPVOID, ULONG, ULONG*) override { return E_NOTIMPL; }

    FORWARD_IMFATTRIBUTES(_attributes)

private:
    HRESULT FillSample(IMFSample* sample);
    void FillPlaceholder(BYTE* dst, LONG pitch);

    Microsoft::WRL::Wrappers::SRWLock _lock;
    ComPtr<IMFAttributes> _attributes;
    ComPtr<IMFMediaEventQueue> _queue;
    ComPtr<IMFStreamDescriptor> _descriptor;
    ComPtr<IMFVideoSampleAllocatorEx> _allocator;
    IMFMediaSource* _source = nullptr; // não-proprietário (o source nos sobrevive)
    int _index = 0;
    MF_STREAM_STATE _state = MF_STREAM_STATE_STOPPED;
    GUID _format = MFVideoFormat_NV12;
    LONGLONG _nextSampleTime = 0;

    FrameReader _reader;
    std::vector<BYTE> _scratch; // frame NV12 empacotado lido da memória compartilhada
};
