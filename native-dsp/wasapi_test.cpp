// Explicit developer-only WASAPI playback fixture. No driver installation,
// endpoint policy changes, capture, or modification of system volume.
#define NOMINMAX
#include <windows.h>
#include <mmdeviceapi.h>
#include <audioclient.h>
#include <mmreg.h>
#include <wrl/client.h>
#include "opsis_dsp.h"
#include <algorithm>
#include <chrono>
#include <cmath>
#include <cstring>
#include <iostream>
#include <memory>
#include <vector>
using Microsoft::WRL::ComPtr;
namespace {
constexpr UINT32 rate=48000,frames=48000;
constexpr double pi=3.14159265358979323846;
struct ComScope { ~ComScope(){CoUninitialize();} };
struct Running { IAudioClient* client; ~Running(){if(client)client->Stop();} };
int fail(const char* stage,HRESULT hr){
    std::cerr<<"FAIL "<<stage<<" HRESULT 0x"<<std::hex<<static_cast<unsigned long>(hr)<<"\n";
    return 1;
}
int run(){
    ComPtr<IMMDeviceEnumerator> enumerator;
    HRESULT hr=CoCreateInstance(__uuidof(MMDeviceEnumerator),nullptr,CLSCTX_INPROC_SERVER,IID_PPV_ARGS(enumerator.GetAddressOf()));
    if(FAILED(hr))return fail("enumerator",hr);
    ComPtr<IMMDevice> device;
    hr=enumerator->GetDefaultAudioEndpoint(eRender,eMultimedia,device.GetAddressOf());
    if(hr==HRESULT_FROM_WIN32(ERROR_NOT_FOUND)||hr==AUDCLNT_E_SERVICE_NOT_RUNNING){
        std::cout<<"SKIP: no default multimedia endpoint or audio service unavailable\n";return 77;
    }
    if(FAILED(hr))return fail("default render endpoint",hr);
    ComPtr<IAudioClient> client;
    hr=device->Activate(__uuidof(IAudioClient),CLSCTX_INPROC_SERVER,nullptr,reinterpret_cast<void**>(client.GetAddressOf()));
    if(hr==AUDCLNT_E_SERVICE_NOT_RUNNING){std::cout<<"SKIP: Windows audio service unavailable\n";return 77;}
    if(FAILED(hr))return fail("activate audio client",hr);
    WAVEFORMATEX format{};
    format.wFormatTag=WAVE_FORMAT_IEEE_FLOAT;
    format.nChannels=2;format.nSamplesPerSec=rate;format.wBitsPerSample=32;
    format.nBlockAlign=8;format.nAvgBytesPerSec=rate*8;format.cbSize=0;
    hr=client->Initialize(AUDCLNT_SHAREMODE_SHARED,
        AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM|AUDCLNT_STREAMFLAGS_SRC_DEFAULT_QUALITY|AUDCLNT_STREAMFLAGS_NOPERSIST,
        1000000,0,&format,nullptr);
    if(hr==AUDCLNT_E_SERVICE_NOT_RUNNING){std::cout<<"SKIP: Windows audio service unavailable\n";return 77;}
    if(FAILED(hr))return fail("shared float32 initialization",hr);
    UINT32 capacity=0;
    hr=client->GetBufferSize(&capacity);
    if(FAILED(hr)||capacity==0||capacity>rate*2)return fail("buffer size",FAILED(hr)?hr:E_FAIL);
    ComPtr<IAudioRenderClient> render;
    hr=client->GetService(IID_PPV_ARGS(render.GetAddressOf()));
    if(FAILED(hr))return fail("render service",hr);
    // Generate one second of low-level tone with fade in/out. All PCM is
    // prepared before Start; this test measures delivery, not callback timing.
    std::vector<float> pcm(size_t(frames)*2);
    for(UINT32 i=0;i<frames;++i){
        double envelope=std::min({1.,double(i)/960.,double(frames-1-i)/960.});
        float sample=float(.025*envelope*std::sin(2*pi*1000*i/rate));
        pcm[size_t(i)*2]=sample;pcm[size_t(i)*2+1]=sample;
    }
    std::unique_ptr<opsis_dsp,decltype(&opsis_dsp_destroy)> dsp(opsis_dsp_create(rate,2),opsis_dsp_destroy);
    opsis_dsp_config_v2 cfg{};cfg.version=2;cfg.base.version=1;cfg.base.enabled=1;cfg.base.eq_db[5]=6;cfg.limiter=1;
    if(!dsp||!opsis_dsp_configure_v2(dsp.get(),&cfg))return fail("DSP configure",E_FAIL);
    opsis_dsp_reset(dsp.get());
    if(!opsis_dsp_process(dsp.get(),pcm.data(),frames))return fail("DSP processing",E_FAIL);
    double sum=0;for(UINT32 i=rate/4;i<rate*3/4;++i){const double x=pcm[size_t(i)*2];sum+=x*x;}
    const double rms=std::sqrt(sum/(rate/2));
    const double boost=20*std::log10(rms/(.025/std::sqrt(2.)));
    if(!std::isfinite(boost)||std::abs(boost-6)>.2)return fail("DSP response",E_FAIL);
    UINT32 submitted=0;
    auto fill=[&](UINT32 count)->HRESULT{
        if(!count)return S_OK;
        BYTE* data=nullptr;HRESULT result=render->GetBuffer(count,&data);
        if(FAILED(result))return result;
        if(!data){render->ReleaseBuffer(count,AUDCLNT_BUFFERFLAGS_SILENT);return E_POINTER;}
        std::memcpy(data,pcm.data()+size_t(submitted)*2,size_t(count)*8);
        result=render->ReleaseBuffer(count,0);
        if(SUCCEEDED(result))submitted+=count;
        return result;
    };
    hr=fill(std::min(capacity,frames));if(FAILED(hr))return fail("initial fill",hr);
    hr=client->Start();if(FAILED(hr))return fail("start",hr);
    Running guard{client.Get()};
    const auto deadline=std::chrono::steady_clock::now()+std::chrono::seconds(6);
    UINT32 padding=0;
    for(;;){
        if(std::chrono::steady_clock::now()>=deadline)return fail("render deadline",E_FAIL);
        hr=client->GetCurrentPadding(&padding);
        if(FAILED(hr)||padding>capacity)return fail("padding",FAILED(hr)?hr:E_FAIL);
        if(submitted==frames&&padding==0)break;
        hr=fill(std::min(capacity-padding,frames-submitted));if(FAILED(hr))return fail("render fill",hr);
        Sleep(5);
    }
    hr=client->Stop();guard.client=nullptr;
    if(FAILED(hr))return fail("stop",hr);
    std::cout<<"PASS: WASAPI shared-mode PCM submitted="<<submitted
        <<" frames, drained=true, DSP boost="<<boost<<" dB; physical audibility not measured\n";
    return 0;
}
}
int main(){
    HRESULT hr=CoInitializeEx(nullptr,COINIT_APARTMENTTHREADED);
    if(FAILED(hr))return fail("COM",hr);
    ComScope scope;
    try{return run();}catch(...){return fail("unexpected",E_FAIL);}
}
