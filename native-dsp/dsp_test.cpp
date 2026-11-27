#include "opsis_dsp.h"
#include <cmath>
#include <algorithm>
#include <iostream>
#include <vector>
#include <limits>
#include <cstdlib>
#include <chrono>
#include <array>
constexpr double pi=3.14159265358979323846;
static void check(bool v,const char* name){if(!v){std::cerr<<"FAIL "<<name<<"\n";std::exit(1);}}
static double tone(opsis_dsp* p,unsigned rate,double hz){
    std::vector<float> f(rate*2);
    for(unsigned i=0;i<rate;++i)f[i*2]=f[i*2+1]=float(.05*std::sin(2*pi*hz*i/rate));
    for(unsigned i=0;i<rate;i+=512)check(opsis_dsp_process(p,f.data()+2*i,std::min(512u,rate-i)),"process");
    double s=0;for(unsigned i=rate/2;i<rate;++i)s+=f[i*2]*f[i*2];
    return std::sqrt(s/(rate/2));
}
int main(){
    check(!opsis_dsp_create(8000,2)&&!opsis_dsp_create(48000,6),"unsupported format");
    for(unsigned rate:{44100u,48000u,96000u}){
        auto* p=opsis_dsp_create(rate,2);check(p!=nullptr,"create");
        float bypass[]{.25f,-.5f,1.25f,-1.25f};check(opsis_dsp_process(p,bypass,2)&&bypass[0]==.25f&&bypass[2]==1.25f,"exact bypass");
        opsis_dsp_config cfg{};cfg.version=1;cfg.enabled=1;
        cfg.eq_db[5]=6;
        check(opsis_dsp_configure(p,&cfg),"configure");
        check(!opsis_dsp_configure(p,&cfg),"no overlapping config transition");
        const auto rms=tone(p,rate,1000);
        const double db=20*std::log10(rms/(.05/std::sqrt(2.)));
        check(std::abs(db-6)<.15,"1 kHz boost");
        cfg.eq_db[5]=0;cfg.presence_percent=100;
        check(opsis_dsp_configure(p,&cfg),"presence config");opsis_dsp_reset(p);
        check(std::abs(20*std::log10(tone(p,rate,2800)/(.05/std::sqrt(2.)))-6)<.15,"presence response");
        cfg.presence_percent=0;cfg.preamp_db=12;
        check(opsis_dsp_configure(p,&cfg),"gain config");opsis_dsp_reset(p);
        float bad[]{std::numeric_limits<float>::quiet_NaN(),std::numeric_limits<float>::infinity(),.8f,-.8f};
        check(opsis_dsp_process(p,bad,2)&&bad[0]==0&&bad[1]==0&&bad[2]==1&&bad[3]==-1,"finite sample protection");
        cfg.preamp_db=0;cfg.balance_percent=100;
        check(opsis_dsp_configure(p,&cfg),"balance");opsis_dsp_reset(p);
        float stereo[]{.25f,.25f};check(opsis_dsp_process(p,stereo,1)&&std::abs(stereo[0])<1e-6&&std::abs(stereo[1]-.25f)<1e-6,"channel balance");
        cfg.eq_db[0]=std::numeric_limits<float>::quiet_NaN();check(!opsis_dsp_configure(p,&cfg),"reject invalid settings");
        cfg.eq_db[0]=0;cfg.enabled=0;check(opsis_dsp_configure(p,&cfg),"bypass transition");opsis_dsp_reset(p);
        float again[]{.5f,-.7f};check(opsis_dsp_process(p,again,1)&&again[0]==.5f&&again[1]==-.7f,"restored bypass");
        check(!opsis_dsp_process(p,again,65537),"bounded frames");
        opsis_dsp_config_v2 extended{};extended.version=2;extended.base.version=1;extended.base.enabled=1;
        extended.compressor_mode=3;
        check(opsis_dsp_configure_v2(p,&extended),"v2 compressor");opsis_dsp_reset(p);
        check(tone(p,rate,1000)<.05/std::sqrt(2.)*.8,"night compressor attenuates");
        extended.compressor_mode=0;extended.limiter=1;extended.base.preamp_db=12;
        check(opsis_dsp_configure_v2(p,&extended),"v2 limiter");opsis_dsp_reset(p);
        float peak[]{.8f,.2f};check(opsis_dsp_process(p,peak,1)&&std::abs(peak[0]-.89125094f)<1e-5&&std::abs(peak[1]/peak[0]-.25f)<1e-5,"linked limiter");
        extended.base.preamp_db=0;extended.limiter=0;extended.ambience_percent=100;
        check(opsis_dsp_configure_v2(p,&extended),"v2 ambience");opsis_dsp_reset(p);
        std::vector<float> impulse(size_t(rate/10)*2);impulse[0]=.5f;
        check(opsis_dsp_process(p,impulse.data(),rate/10),"impulse");
        check(std::abs(impulse[size_t(rate*.037)*2]-.14f)<1e-5,"ambience tail");
        for(size_t i=1;i<impulse.size();i+=2)check(impulse[i]==0,"no channel leak");
        extended.ambience_percent=0;extended.exciter_percent=100;
        check(opsis_dsp_configure_v2(p,&extended),"v2 exciter");opsis_dsp_reset(p);
        float high[]{.5f,0,-.5f,0};check(opsis_dsp_process(p,high,2)&&high[0]>.5f&&high[1]==0&&high[2]<-.5f,"exciter harmonics");
        extended.exciter_percent=101;check(!opsis_dsp_configure_v2(p,&extended),"v2 rejects invalid");
        opsis_dsp_destroy(p);std::cout<<"DSP "<<rate<<" Hz: response, bypass, bounds and finite PCM passed\n";
    }
    auto* mono=opsis_dsp_create(48000,1);float signal[]{.2f,.3f};check(mono&&opsis_dsp_process(mono,signal,2)&&signal[1]==.3f,"mono");
    opsis_dsp_destroy(mono);
    check(!opsis_dsp_create_layout(48000,0x33)&&!opsis_dsp_create_layout(48000,0x603),"reject unspecified layouts");
    for(unsigned mask:{0x3fu,0x60fu,0x63fu}){
        const unsigned channels=mask==0x63f?8:6;
        auto* p=opsis_dsp_create_layout(48000,mask);check(p!=nullptr,"explicit layout");
        std::vector<float> raw(channels);
        for(unsigned ch=0;ch<channels;++ch)raw[ch]=float(ch+1)*.1f;
        const auto original=raw;
        check(opsis_dsp_process(p,raw.data(),1)&&raw==original,"multichannel exact bypass");
        opsis_dsp_config_v2 cfg{};cfg.version=2;cfg.base.version=1;cfg.base.enabled=1;
        cfg.base.eq_db[5]=6;cfg.base.bass_db=6;cfg.ambience_percent=100;cfg.exciter_percent=100;
        check(opsis_dsp_configure_v2(p,&cfg),"multichannel config");opsis_dsp_reset(p);
        std::vector<float> impulse(4800*channels);impulse[3]=.25f;
        check(opsis_dsp_process(p,impulse.data(),4800),"LFE process");
        check(impulse[3]==.25f,"LFE bypasses coloration");
        for(size_t i=0;i<impulse.size();++i)if(i!=3)check(impulse[i]==0,"no LFE leakage or tail");
        cfg.base.eq_db[5]=0;cfg.base.bass_db=0;cfg.ambience_percent=0;cfg.exciter_percent=0;cfg.base.balance_percent=100;
        check(opsis_dsp_configure_v2(p,&cfg),"front balance config");opsis_dsp_reset(p);
        raw=original;check(opsis_dsp_process(p,raw.data(),1),"balance frame");
        check(std::abs(raw[0])<1e-6&&std::abs(raw[1]-original[1])<1e-6,"front balance only");
        for(unsigned ch=2;ch<channels;++ch)check(raw[ch]==original[ch],"non-front channels preserved");
        cfg.base.balance_percent=0;cfg.base.preamp_db=12;cfg.limiter=1;
        check(opsis_dsp_configure_v2(p,&cfg),"linked multi limiter");opsis_dsp_reset(p);
        raw.assign(channels,.2f);raw[3]=.8f;
        check(opsis_dsp_process(p,raw.data(),1),"multi limiter frame");
        check(std::abs(raw[3]-.89125094f)<1e-5&&std::abs(raw[0]/raw[3]-.25f)<1e-5,"all channels linked");
        cfg.base.preamp_db=0;cfg.base.eq_db[5]=3;cfg.compressor_mode=2;cfg.ambience_percent=35;cfg.exciter_percent=35;
        check(opsis_dsp_configure_v2(p,&cfg),"stress config");opsis_dsp_reset(p);
        std::vector<float> block(480*channels,.01f);
        const auto begin=std::chrono::steady_clock::now();
        for(unsigned i=0;i<1000;++i){
            std::fill(block.begin(),block.end(),.01f);
            check(opsis_dsp_process(p,block.data(),480),"stress process");
            for(float x:block)check(std::isfinite(x)&&std::abs(x)<=1,"bounded stress");
        }
        const double seconds=std::chrono::duration<double>(std::chrono::steady_clock::now()-begin).count();
        std::cout<<"Layout "<<mask<<" ("<<channels<<" channels) 10 seconds synthetic PCM processed in "<<seconds<<" s including test overhead; not device latency\n";
        opsis_dsp_destroy(p);
    }
}
