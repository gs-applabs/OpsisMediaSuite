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
struct Bank {
    std::array<Coeff,12> c{};
    std::array<std::array<Memory,12>,2> state{};
    double gain=1,width=1,balance=0;
    bool enabled=false;
    void sample(double& l,double& r,uint32_t channels){
        if(!enabled)return;
        for(size_t i=0;i<c.size();++i){l=filter(l,c[i],state[0][i]);if(channels==2)r=filter(r,c[i],state[1][i]);}
        l*=gain;r*=gain;
        if(channels==2){
            const double mid=(l+r)*.5,side=(l-r)*.5*width;
            l=(mid+side)*(balance>0?std::cos(balance*pi/2):1);
            r=(mid-side)*(balance<0?std::cos(balance*pi/2):1);
        }
        l=std::clamp(clean(l),-1.,1.);r=std::clamp(clean(r),-1.,1.);
    }
};
}
struct opsis_dsp {
    uint32_t rate,channels;
    Bank current{},next{};
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
    p->next=next;p->fade=p->length;return 1;
}
extern "C" void opsis_dsp_reset(opsis_dsp* p){
    if(!p)return;
    if(p->fade)p->current=p->next;
    p->fade=0;p->current.state={};p->next={};
}
extern "C" int opsis_dsp_process(opsis_dsp* p,float* samples,uint32_t frames){
    if(!p||(!samples&&frames)||frames>65536)return 0;
    for(uint32_t i=0;i<frames;++i){
        auto* f=samples+size_t(i)*p->channels;
        // Exact finite bypass, sanitizes invalid PCM. Not a recording path.
        double l=std::isfinite(f[0])?f[0]:0,r=p->channels==2&&std::isfinite(f[1])?f[1]:0;
        double a=l,b=r;
        p->current.sample(a,b,p->channels);
        if(p->fade){
            p->next.sample(l,r,p->channels);
            const double mix=double(p->length-p->fade+1)/p->length;
            a=a*(1-mix)+l*mix;b=b*(1-mix)+r*mix;
            if(--p->fade==0)p->current=p->next;
        }
        f[0]=float(a);if(p->channels==2)f[1]=float(b);
    }
    return 1;
}
