// Offline, bounded PCM adapter; stdin/stdout only. No path or command arguments.
#include "opsis_dsp.h"
#include <cstdint>
#include <cstring>
#include <iostream>
#include <memory>
#include <vector>
#include <algorithm>
#ifdef _WIN32
#include <fcntl.h>
#include <io.h>
#endif
namespace {
bool readExact(void* dst,size_t n){return bool(std::cin.read(static_cast<char*>(dst),static_cast<std::streamsize>(n)));}
template<class T> bool read(T& v){return readExact(&v,sizeof(v));}
}
int main(int argc,char**){
    if(argc!=1)return 2;
#ifdef _WIN32
    if(_setmode(_fileno(stdin),_O_BINARY)<0||_setmode(_fileno(stdout),_O_BINARY)<0)return 2;
#endif
    static_assert(sizeof(float)==4&&sizeof(uint32_t)==4,"PCM wire format");
    std::ios::sync_with_stdio(false);
    char magic[4]{};uint32_t rate=0,channels=0,frames=0;
    opsis_dsp_config_v2 cfg{};cfg.version=2;cfg.base.version=1;
    if(!readExact(magic,4)||std::memcmp(magic,"ODP2",4)!=0||!read(rate)||!read(channels)||!read(frames)||!read(cfg.base.enabled))return 2;
    if((channels!=1&&channels!=2)||rate<44100||rate>96000||frames==0||frames>30u*rate)return 2;
    for(float& x:cfg.base.eq_db)if(!read(x))return 2;
    if(!read(cfg.base.bass_db)||!read(cfg.base.presence_percent)||!read(cfg.base.balance_percent)||
       !read(cfg.base.surround_percent)||!read(cfg.base.preamp_db)||!read(cfg.compressor_mode)||
       !read(cfg.ambience_percent)||!read(cfg.exciter_percent)||!read(cfg.limiter))return 2;
    std::unique_ptr<opsis_dsp,decltype(&opsis_dsp_destroy)> dsp(opsis_dsp_create(rate,channels),opsis_dsp_destroy);
    if(!dsp||!opsis_dsp_configure_v2(dsp.get(),&cfg))return 2;
    opsis_dsp_reset(dsp.get());
    try{
        std::vector<float> pcm(size_t(frames)*channels);
        if(!readExact(pcm.data(),pcm.size()*sizeof(float))||std::cin.peek()!=std::char_traits<char>::eof())return 2;
        for(uint32_t offset=0;offset<frames;offset+=4096)
            if(!opsis_dsp_process(dsp.get(),pcm.data()+size_t(offset)*channels,std::min(4096u,frames-offset)))return 3;
        std::cout.write(reinterpret_cast<const char*>(pcm.data()),static_cast<std::streamsize>(pcm.size()*sizeof(float)));
        std::cout.flush();return std::cout?0:3;
    }catch(...){return 3;}
}
