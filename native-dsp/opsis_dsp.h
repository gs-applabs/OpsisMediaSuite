#pragma once
#include <stdint.h>
#ifdef __cplusplus
extern "C" {
#endif
// Original, experimental PCM core; not a Windows driver/APO.
// Call config/reset only between process calls on the same thread.
typedef struct opsis_dsp opsis_dsp;
typedef struct opsis_dsp_config {
    uint32_t version;       // must be 1
    uint32_t enabled;       // 0/1
    float eq_db[10];        // legacy Media Suite bands, -12..12 dB
    float bass_db;          // 90 Hz low shelf, -12..12
    float presence_percent; // 0..100, 2.8 kHz peaking
    float balance_percent;  // -100..100
    float surround_percent; // 0..100, width 1..1.6
    float preamp_db;        // -24..12
} opsis_dsp_config;
opsis_dsp* opsis_dsp_create(uint32_t rate,uint32_t channels);
void opsis_dsp_destroy(opsis_dsp* dsp);
int opsis_dsp_configure(opsis_dsp* dsp,const opsis_dsp_config* config);
void opsis_dsp_reset(opsis_dsp* dsp);
// In-place interleaved Float32. No allocation, locks, I/O or callbacks.
// Invalid args fail without modification. Enabled path uses sample peak
// clipping protection only (not a true-peak limiter or full DSP parity).
int opsis_dsp_process(opsis_dsp* dsp,float* samples,uint32_t frames);
#ifdef __cplusplus
}
#endif
