#include "opsis_dsp.h"
#include <cmath>
#include <algorithm>
#include <iostream>
#include <vector>
#include <limits>
#include <cstdlib>
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
        opsis_dsp_destroy(p);std::cout<<"DSP "<<rate<<" Hz: response, bypass, bounds and finite PCM passed\n";
    }
    auto* mono=opsis_dsp_create(48000,1);float signal[]{.2f,.3f};check(mono&&opsis_dsp_process(mono,signal,2)&&signal[1]==.3f,"mono");
    opsis_dsp_destroy(mono);
}
