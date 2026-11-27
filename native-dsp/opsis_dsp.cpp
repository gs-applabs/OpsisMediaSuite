#include "opsis_dsp.h"
#include <algorithm>
#include <array>
#include <cmath>
#include <new>
#include <limits>

namespace {
constexpr double pi=3.14159265358979323846;
constexpr std::array<double,10> freq{32,64,125,250,500,1000,2000,4000,8000,16000};
enum class Kind { peak,low,high };
struct Coeff { double b0=1,b1=0,b2=0,a1=0,a2=0; };
struct Memory { double z1=0,z2=0; };
double clean(double x){return std::isfinite(x)&&std::abs(x)>=1e-25?x:0;}
bool bounded(float v,float lo,float hi){return std::isfinite(v)&&v>=lo&&v<=hi;}
Coeff make(Kind type,double hz,double q,double db,double rate){
    if(db==0||hz>=rate*.49)return {};
    const double A=std::pow(10.,db/40.),w=2*pi*hz/rate,c=std::cos(w),s=std::sin(w);
    const double alpha=s/(2*q);
    double b0,b1,b2,a0,a1,a2;
    if(type==Kind::peak){
        b0=1+alpha*A;b1=-2*c;b2=1-alpha*A;a0=1+alpha/A;a1=-2*c;a2=1-alpha/A;
    }else{
        // RBJ shelf, slope S=1. The existing WebAudio shelf Q is ignored.
        const double beta=std::sqrt(2*A)*s;
        if(type==Kind::low){
            b0=A*((A+1)-(A-1)*c+beta);b1=2*A*((A-1)-(A+1)*c);b2=A*((A+1)-(A-1)*c-beta);
            a0=(A+1)+(A-1)*c+beta;a1=-2*((A-1)+(A+1)*c);a2=(A+1)+(A-1)*c-beta;
        }else{
            b0=A*((A+1)+(A-1)*c+beta);b1=-2*A*((A-1)+(A+1)*c);b2=A*((A+1)+(A-1)*c-beta);
            a0=(A+1)-(A-1)*c+beta;a1=2*((A-1)-(A+1)*c);a2=(A+1)-(A-1)*c-beta;
        }
    }
    return {b0/a0,b1/a0,b2/a0,a1/a0,a2/a0};
}
double filter(double in,const Coeff& c,Memory& m){
    const double out=clean(c.b0*in+m.z1);
    m.z1=clean(c.b1*in-c.a1*out+m.z2);
    m.z2=clean(c.b2*in-c.a2*out);
    return out;
}
// Fixed-capacity delay state at 96 kHz; cleared outside processing.
constexpr size_t delayCapacity=6144;
struct Dynamics {
    unsigned mode=0,tick=0;
    double threshold=-24,ratio=8,knee=30,attack=.99,release=.999;
    double envelope=0,gain=1,target=1;
    double process(double peak){
        if(!mode)return 1;
        const double a=peak>envelope?attack:release;
        envelope=clean(a*envelope+(1-a)*peak);
        if((tick++&15u)==0){
            const double level=20*std::log10(std::max(envelope,1e-12)), over=level-threshold;
            double reduction=0;
            if(over>=knee*.5)reduction=(1-1/ratio)*over;
            else if(over> -knee*.5)reduction=(1-1/ratio)*(over+knee*.5)*(over+knee*.5)/(2*knee);
            target=std::pow(10.,-std::max(0.,reduction)/20.);
        }
        const double k=target<gain?attack:release;
        gain=k*gain+(1-k)*target;return gain;
    }
};
struct Bank {
    std::array<Coeff,12> c{};
    std::array<std::array<Memory,12>,2> state{};
    double gain=1,width=1,balance=0,leftBalance=1,rightBalance=1;
    bool enabled=false,limiter=false;
    Dynamics dynamics{};
    double ambience=0,exciter=0,exciterAlpha=0,limiterRelease=.999,limiterGain=1;
    std::array<double,2> low{};
    std::array<std::array<float,delayCapacity>,2> delays{};
    std::array<size_t,2> delayLength{1,1},cursor{};
    void effects(double& l,double& r,uint32_t channels){
        if(dynamics.mode){
            const double g=dynamics.process(std::max(std::abs(l),channels==2?std::abs(r):0.));
            l*=g;r*=g;
        }
        if(ambience>0||exciter>0){
            double* values[2]{&l,&r};
            for(uint32_t ch=0;ch<channels;++ch){
                double v=*values[ch];
                if(ambience>0){
                    const double tail=delays[ch][cursor[ch]];
                    delays[ch][cursor[ch]]=float(std::clamp(clean(v+tail*.42),-4.,4.));
                    cursor[ch]=(cursor[ch]+1)%delayLength[ch];
                    v+=tail*ambience;
                }
                if(exciter>0){
                    low[ch]=clean(low[ch]+exciterAlpha*(v-low[ch]));
                    const double high=std::clamp(v-low[ch],-1.,1.);
                    // Odd, bounded harmonic shaping of the high-frequency component.
                    v+=exciter*(high*high*high);
                }
                *values[ch]=clean(v);
            }
        }
        if(limiter){
            constexpr double ceiling=.8912509381337456; // -1 dBFS sample peak
            const double peak=std::max(std::abs(l),channels==2?std::abs(r):0.);
            const double requested=peak>ceiling?ceiling/peak:1.;
            limiterGain=std::min(requested,limiterRelease*limiterGain+(1-limiterRelease));
            l*=limiterGain;r*=limiterGain;
        }
    }
    void sample(double& l,double& r,uint32_t channels){
        if(!enabled)return;
        for(size_t i=0;i<c.size();++i){l=filter(l,c[i],state[0][i]);if(channels==2)r=filter(r,c[i],state[1][i]);}
        l*=gain;r*=gain;
        if(channels==2){
            const double mid=(l+r)*.5,side=(l-r)*.5*width;
            l=(mid+side)*leftBalance;
            r=(mid-side)*rightBalance;
        }
        effects(l,r,channels);
        l=std::clamp(clean(l),-1.,1.);r=std::clamp(clean(r),-1.,1.);
    }
};
}
struct opsis_dsp {
    uint32_t rate,channels;
    std::array<Bank,2> banks{};
    unsigned active=0;
    uint32_t fade=0,length=0;
};
extern "C" opsis_dsp* opsis_dsp_create(uint32_t rate,uint32_t channels){
    if(rate<44100||rate>96000||(channels!=1&&channels!=2))return nullptr;
    auto* p=new(std::nothrow) opsis_dsp{};
    if(p){p->rate=rate;p->channels=channels;p->length=rate/100;}
    return p;
}
extern "C" void opsis_dsp_destroy(opsis_dsp* p){delete p;}
extern "C" int opsis_dsp_configure(opsis_dsp* p,const opsis_dsp_config* cfg){
    if(!p||!cfg||cfg->version!=1||cfg->enabled>1||p->fade!=0)return 0;
    for(float db:cfg->eq_db)if(!bounded(db,-12,12))return 0;
    if(!bounded(cfg->bass_db,-12,12)||!bounded(cfg->presence_percent,0,100)||
       !bounded(cfg->balance_percent,-100,100)||!bounded(cfg->surround_percent,0,100)||!bounded(cfg->preamp_db,-24,12))return 0;
    Bank next{};
    next.enabled=cfg->enabled!=0;
    for(size_t i=0;i<freq.size();++i)next.c[i]=make(i==0?Kind::low:i==9?Kind::high:Kind::peak,freq[i],1.4,cfg->eq_db[i],p->rate);
    next.c[10]=make(Kind::low,90,.7,cfg->bass_db,p->rate);
    next.c[11]=make(Kind::peak,2800,.85,cfg->presence_percent*.06,p->rate);
    next.gain=std::pow(10.,cfg->preamp_db/20.);
    next.width=1+cfg->surround_percent*.006;
    next.balance=cfg->balance_percent/100.;
    next.leftBalance=next.balance>0?std::cos(next.balance*pi/2):1;
    next.rightBalance=next.balance<0?std::cos(next.balance*pi/2):1;
    p->banks[1-p->active]=next;p->fade=p->length;return 1;
}
extern "C" int opsis_dsp_configure_v2(opsis_dsp* p,const opsis_dsp_config_v2* cfg){
    if(!p||!cfg||cfg->version!=2||cfg->compressor_mode>3||cfg->limiter>1||
       !bounded(cfg->ambience_percent,0,100)||!bounded(cfg->exciter_percent,0,100))return 0;
    if(!opsis_dsp_configure(p,&cfg->base))return 0;
    auto& next=p->banks[1-p->active];
    next.ambience=cfg->ambience_percent*.0028;
    next.exciter=cfg->exciter_percent*.0035;
    next.delayLength={size_t(p->rate*.037),size_t(p->rate*.053)};
    next.exciterAlpha=1-std::exp(-2*pi*3500/p->rate);
    next.limiter=cfg->limiter==1;
    next.limiterRelease=std::exp(-1./(.05*p->rate));
    auto& comp=next.dynamics;
    comp.mode=cfg->compressor_mode;
    double attack=.003,release=.25;
    if(comp.mode==1){comp.threshold=-18;comp.ratio=2;comp.knee=20;attack=.015;release=.35;}
    else if(comp.mode==3){comp.threshold=-32;comp.ratio=12;comp.knee=24;attack=.005;release=.4;}
    comp.attack=std::exp(-1./(attack*p->rate));
    comp.release=std::exp(-1./(release*p->rate));
    return 1;
}
extern "C" void opsis_dsp_reset(opsis_dsp* p){
    if(!p)return;
    if(p->fade)p->active=1-p->active;
    p->fade=0;
    auto& bank=p->banks[p->active];
    bank.state={};bank.delays={};bank.cursor={};bank.low={};bank.limiterGain=1;
    bank.dynamics.envelope=0;bank.dynamics.gain=1;bank.dynamics.target=1;bank.dynamics.tick=0;
    p->banks[1-p->active]={};
}
extern "C" int opsis_dsp_process(opsis_dsp* p,float* samples,uint32_t frames){
    if(!p||(!samples&&frames)||frames>65536)return 0;
    for(uint32_t i=0;i<frames;++i){
        auto* f=samples+size_t(i)*p->channels;
        // Exact finite bypass, sanitizes invalid PCM. Not a recording path.
        double l=std::isfinite(f[0])?f[0]:0,r=p->channels==2&&std::isfinite(f[1])?f[1]:0;
        double a=l,b=r;
        p->banks[p->active].sample(a,b,p->channels);
        if(p->fade){
            p->banks[1-p->active].sample(l,r,p->channels);
            const double mix=double(p->length-p->fade+1)/p->length;
            a=a*(1-mix)+l*mix;b=b*(1-mix)+r*mix;
            if(--p->fade==0)p->active=1-p->active;
        }
        f[0]=float(a);if(p->channels==2)f[1]=float(b);
    }
    return 1;
}
