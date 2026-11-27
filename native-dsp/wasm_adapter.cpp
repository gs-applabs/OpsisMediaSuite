// Standalone WASM bridge for isolated AudioWorklet experiments only.
#include "opsis_dsp.h"
#include <cmath>
#include <cstdint>
namespace {
opsis_dsp* engine=nullptr;
alignas(16) float planes[2][2048]{};
alignas(16) float settings[20]{};
bool integer(float x,int max){return std::isfinite(x)&&x>=0&&x<=max&&std::floor(x)==x;}
}
extern "C" {
int opsis_wasm_init(uint32_t rate){
    if(engine)return 0;
    engine=opsis_dsp_create(rate,2);return engine?1:0;
}
float* opsis_wasm_settings(){return settings;}
float* opsis_wasm_plane(uint32_t index){return index<2?planes[index]:nullptr;}
int opsis_wasm_configure(){
    if(!engine||!integer(settings[0],1)||!integer(settings[16],3)||!integer(settings[19],1))return 0;
    opsis_dsp_config_v2 cfg{};cfg.version=2;cfg.base.version=1;
    cfg.base.enabled=uint32_t(settings[0]);
    for(unsigned i=0;i<10;++i)cfg.base.eq_db[i]=settings[i+1];
    cfg.base.bass_db=settings[11];cfg.base.presence_percent=settings[12];
    cfg.base.balance_percent=settings[13];cfg.base.surround_percent=settings[14];
    cfg.base.preamp_db=settings[15];cfg.compressor_mode=uint32_t(settings[16]);
    cfg.ambience_percent=settings[17];cfg.exciter_percent=settings[18];cfg.limiter=uint32_t(settings[19]);
    return opsis_dsp_configure_v2(engine,&cfg);
}
void opsis_wasm_reset(){opsis_dsp_reset(engine);}
int opsis_wasm_process(uint32_t frames){
    float* channels[]{planes[0],planes[1]};
    return opsis_dsp_process_planar(engine,channels,frames);
}
}
