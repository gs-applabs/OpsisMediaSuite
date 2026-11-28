# Functional acceptance matrix — RC1 and final
The following is a test specification, not results for the revised SHA. Original RC1 aggregate evidence is in CLAUDE-CODE-RC1-HANDOFF-EL.md. Record per-action exact SHA, inputs, observable output, result and log/artifact.

| Area | Real action/fixture | Required observable outcome | Outstanding evidence |
|---|---|---|---|
| Music transport | open two owned WAV/MP3/FLAC files; play, pause, next, prev, seek, shuffle/repeat, stop/sleep | decoded samples, time advances, correct item, expected timer cancellation, no duplicate slot | each control, real sound device |
| Library | import folder/M3U/M3U8, Greek names, duplicate/path variants, filters, group, reorder, cancel | correct unique entries and order, no unauthorized read, no silent data loss | large library, history/smart playlists/export |
| Tags | original copies of MP3/FLAC/WAV/M4A/Ogg/Opus/WMA | compare audio bytes and unrelated metadata, preview, confirm, undo, backup, cover; reject unsupported layouts | actual WMA, broader layouts, online credentials |
| DSP | calibrated tones/impulse/stereo, each effect switch/slider/profile, bypass/mute/reset | output PCM/frequency/peak/latency matches expected, no double processing, selected nodes only | native/worklet/device parity, advanced EQ/profile |
| FxSound | installed and absent, external/manual/auto | only one active route, original sound/settings restored, no external process modification | real installed-device tests |
| Video | H264/AAC MP4, HEVC MKV, WebM, multiple tracks/chapter and authorized stream | actual decoded visible frames/audio, time/rate/seek/stop/step/track/subtitle, correct native backend | physical codecs/GPU, RTSP/HLS/IPTV, frame accuracy |
| Subtitles | local SRT/ASS/VTT/TTML, RAR/RAR5, Greek encodings, authorized online/embedded | actual pixels and cue times, downloaded SRT beside media, delay/stretch/editor save/cancel/no overwrite | live providers, bitmap/dual-language and sync confidence |
| Converter | audio/video files, remux, trim, cancel, metadata and covers | ffprobe confirms output duration/streams/format/metadata; no overwrite; source unchanged; cancellation leaves no partial output | all supported encoder/decoder combinations, online authorized files |
| Photo | RGB/alpha/ICC/EXIF JPEG/PNG/WebP; each editor slider, crop, rotate, undo, export | pixel comparison and output dimensions/metadata, source hash unchanged, no GPS leakage | advanced tools, batch, RAW/HEIC/TIFF, print |
| Flyout | actual generated WAV and MP4, click local flyout controls | engine and native state, current time, correct item, volume/mute, close destroys renderer, auto-dismiss | new tests pending, video/native physical Windows |
| Windows/OPSIs | install plugin into real Opsis, taskbar/buttons/keyboard, two monitors | real contract handshake and control, no duplicate observer/overlay, clean shutdown | external mixer, lock toast, Spectrum, widget, DeskStrip ownership |
| Settings | each switch and value, save/restart, backup restore, corrupt settings, cancel | actual engine behavior and persist/reload, restore no stale overwrite, no duplicate switch | complete per-setting evidence, locale and accessibility |
| Resources | simultaneous user-selected music/photo/conversion, cancellation, idle, 20/120/1200 cycles, 8h | private bytes trend, CPU, GPU/IO, handles, orphan processes, original state preserved | sustained mixed workload physical Windows |
| Installer/security | actual Inno candidate, authentic old install, repair/reinstall/uninstall/rollback | correct installed version, profile preservation, hashes, real app tests, Defender/secrets/trace/SBOM | authentic 2.4.2, trace review, signing and hardware |
| Conditional proposals | assess each P9 feature on licensed supported devices | explicit supported/partial/blocked result; no unverified activation | feasibility and user-approved scope decision |

## Required record format
One row per distinct operation: feature/control ID, precondition, real fixture, action, expected actual effect, observed actual effect, positive/negative/cancel/reload result, SHA, job/artifact link, limitation, next action. No checkmark based solely on a button or setting existing. CSV source inventory is not a completed functional audit.
