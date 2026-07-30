// Media source da câmera virtual: uma única stream de vídeo. Orquestra o modelo de eventos do
// Media Foundation (MENewStream/MESourceStarted/…) e delega os frames ao MediaStream.
#pragma once

#include "Common.h"
#include "MediaStream.h"
#include <wrl/wrappers/corewrappers.h>

class MediaSource : public RuntimeClass<
    RuntimeClassFlags<ClassicCom>,
    ChainInterfaces<IMFMediaSourceEx, IMFMediaSource, IMFMediaEventGenerator>,
    IMFGetService,
    IKsControl,
    IMFSampleAllocatorControl,
    IMFAttributes>
{
public:
    MediaSource();
    ~MediaSource();

    HRESULT Initialize(IMFAttributes* activatorAttributes);

    // IMFMediaEventGenerator
    STDMETHODIMP BeginGetEvent(IMFAsyncCallback* pCallback, IUnknown* punkState) override;
    STDMETHODIMP EndGetEvent(IMFAsyncResult* pResult, IMFMediaEvent** ppEvent) override;
    STDMETHODIMP GetEvent(DWORD dwFlags, IMFMediaEvent** ppEvent) override;
    STDMETHODIMP QueueEvent(MediaEventType met, REFGUID guid, HRESULT hr, const PROPVARIANT* pv) override;

    // IMFMediaSource
    STDMETHODIMP GetCharacteristics(DWORD* pdwCharacteristics) override;
    STDMETHODIMP CreatePresentationDescriptor(IMFPresentationDescriptor** ppPresentationDescriptor) override;
    STDMETHODIMP Start(IMFPresentationDescriptor* pPD, const GUID* pguidTimeFormat, const PROPVARIANT* pvarStart) override;
    STDMETHODIMP Stop() override;
    STDMETHODIMP Pause() override;
    STDMETHODIMP Shutdown() override;

    // IMFMediaSourceEx
    STDMETHODIMP GetSourceAttributes(IMFAttributes** ppAttributes) override;
    STDMETHODIMP GetStreamAttributes(DWORD dwStreamIdentifier, IMFAttributes** ppAttributes) override;
    STDMETHODIMP SetD3DManager(IUnknown* pManager) override;

    // IMFGetService
    STDMETHODIMP GetService(REFGUID guidService, REFIID riid, LPVOID* ppvObject) override;

    // IKsControl (mínimo)
    STDMETHODIMP KsProperty(PKSPROPERTY, ULONG, LPVOID, ULONG, ULONG*) override { return E_NOTIMPL; }
    STDMETHODIMP KsMethod(PKSMETHOD, ULONG, LPVOID, ULONG, ULONG*) override { return E_NOTIMPL; }
    STDMETHODIMP KsEvent(PKSEVENT, ULONG, LPVOID, ULONG, ULONG*) override { return E_NOTIMPL; }

    // IMFSampleAllocatorControl
    STDMETHODIMP SetDefaultAllocator(DWORD dwOutputStreamID, IUnknown* pAllocator) override;
    STDMETHODIMP GetAllocatorUsage(DWORD dwOutputStreamID, DWORD* pdwInputStreamID, MFSampleAllocatorUsage* peUsage) override;

    FORWARD_IMFATTRIBUTES(_attributes)

private:
    Microsoft::WRL::Wrappers::SRWLock _lock;
    ComPtr<IMFAttributes> _attributes;
    ComPtr<IMFMediaEventQueue> _queue;
    ComPtr<IMFPresentationDescriptor> _descriptor;
    ComPtr<MediaStream> _stream;
};
