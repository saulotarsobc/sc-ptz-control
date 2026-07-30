// Infra comum da media source: includes de Media Foundation, contagem global de objetos COM
// (para DllCanUnloadNow) e uma macro que reencaminha toda a IMFAttributes para um store interno.
#pragma once

// NB: NÃO incluir <initguid.h> aqui — isso faria cada unidade de tradução alocar os GUIDs
// do Media Foundation (duplicados no link). Os GUIDs do MF vêm de mfuuid.lib; o nosso CLSID
// é definido uma única vez em dllmain.cpp (que inclui Guids.h com initguid.h).
#include <windows.h>
#include <mfapi.h>
#include <mfidl.h>
#include <mferror.h>
#include <mfobjects.h>
#include <mftransform.h>
#include <mfvirtualcamera.h>
#include <ks.h>
#include <ksproxy.h>
#include <ksmedia.h>
#include <wrl/implements.h>
#include <atomic>

using Microsoft::WRL::RuntimeClass;
using Microsoft::WRL::RuntimeClassFlags;
using Microsoft::WRL::ClassicCom;
using Microsoft::WRL::ChainInterfaces;
using Microsoft::WRL::ComPtr;
using Microsoft::WRL::Make;

// Objetos COM vivos no módulo — DllCanUnloadNow só libera quando chega a zero.
extern std::atomic<long> g_objectCount;

// Reencaminha todos os métodos de IMFAttributes para o membro `store` (um ComPtr<IMFAttributes>).
// Usado por MediaSource/MediaStream/Activator, que precisam ser IMFAttributes mas delegam o
// armazenamento a um store criado com MFCreateAttributes.
#define FORWARD_IMFATTRIBUTES(store) \
    STDMETHODIMP GetItem(REFGUID k, PROPVARIANT* v) override { return store->GetItem(k, v); } \
    STDMETHODIMP GetItemType(REFGUID k, MF_ATTRIBUTE_TYPE* t) override { return store->GetItemType(k, t); } \
    STDMETHODIMP CompareItem(REFGUID k, REFPROPVARIANT v, BOOL* r) override { return store->CompareItem(k, v, r); } \
    STDMETHODIMP Compare(IMFAttributes* a, MF_ATTRIBUTES_MATCH_TYPE m, BOOL* r) override { return store->Compare(a, m, r); } \
    STDMETHODIMP GetUINT32(REFGUID k, UINT32* v) override { return store->GetUINT32(k, v); } \
    STDMETHODIMP GetUINT64(REFGUID k, UINT64* v) override { return store->GetUINT64(k, v); } \
    STDMETHODIMP GetDouble(REFGUID k, double* v) override { return store->GetDouble(k, v); } \
    STDMETHODIMP GetGUID(REFGUID k, GUID* v) override { return store->GetGUID(k, v); } \
    STDMETHODIMP GetStringLength(REFGUID k, UINT32* c) override { return store->GetStringLength(k, c); } \
    STDMETHODIMP GetString(REFGUID k, LPWSTR v, UINT32 s, UINT32* c) override { return store->GetString(k, v, s, c); } \
    STDMETHODIMP GetAllocatedString(REFGUID k, LPWSTR* v, UINT32* c) override { return store->GetAllocatedString(k, v, c); } \
    STDMETHODIMP GetBlobSize(REFGUID k, UINT32* s) override { return store->GetBlobSize(k, s); } \
    STDMETHODIMP GetBlob(REFGUID k, UINT8* b, UINT32 s, UINT32* o) override { return store->GetBlob(k, b, s, o); } \
    STDMETHODIMP GetAllocatedBlob(REFGUID k, UINT8** b, UINT32* s) override { return store->GetAllocatedBlob(k, b, s); } \
    STDMETHODIMP GetUnknown(REFGUID k, REFIID i, LPVOID* v) override { return store->GetUnknown(k, i, v); } \
    STDMETHODIMP SetItem(REFGUID k, REFPROPVARIANT v) override { return store->SetItem(k, v); } \
    STDMETHODIMP DeleteItem(REFGUID k) override { return store->DeleteItem(k); } \
    STDMETHODIMP DeleteAllItems() override { return store->DeleteAllItems(); } \
    STDMETHODIMP SetUINT32(REFGUID k, UINT32 v) override { return store->SetUINT32(k, v); } \
    STDMETHODIMP SetUINT64(REFGUID k, UINT64 v) override { return store->SetUINT64(k, v); } \
    STDMETHODIMP SetDouble(REFGUID k, double v) override { return store->SetDouble(k, v); } \
    STDMETHODIMP SetGUID(REFGUID k, REFGUID v) override { return store->SetGUID(k, v); } \
    STDMETHODIMP SetString(REFGUID k, LPCWSTR v) override { return store->SetString(k, v); } \
    STDMETHODIMP SetBlob(REFGUID k, const UINT8* b, UINT32 s) override { return store->SetBlob(k, b, s); } \
    STDMETHODIMP SetUnknown(REFGUID k, IUnknown* v) override { return store->SetUnknown(k, v); } \
    STDMETHODIMP LockStore() override { return store->LockStore(); } \
    STDMETHODIMP UnlockStore() override { return store->UnlockStore(); } \
    STDMETHODIMP GetCount(UINT32* c) override { return store->GetCount(c); } \
    STDMETHODIMP GetItemByIndex(UINT32 i, GUID* k, PROPVARIANT* v) override { return store->GetItemByIndex(i, k, v); } \
    STDMETHODIMP CopyAllItems(IMFAttributes* d) override { return store->CopyAllItems(d); }
