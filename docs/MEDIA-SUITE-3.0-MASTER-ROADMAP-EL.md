# OPSIS Media Suite 3.0.0 — Unified implementation roadmap (EL)

Status: proposal, not a release or completion certificate. Baseline master 1e0c99f02aad07023e61fd3a28c09a0e1d42c812 (2.4.2). Draft PR #3 adds creative photo controls and advisory FxSound coexistence; its Windows CI was still in progress at review. This roadmap supersedes the earlier planning portions of PHOTO-AUDIO-ENHANCER-3.0.md and consolidates the playback/subtitle/security audit. Existing features and user settings must be preserved unless an explicit migration is documented. Target: Windows 10/11 x64 (other architectures only after validation), OpsisUI integration and existing plugin contract 1.0.0.0.

## P0 — Security, baseline, regressions (release blocker)
- Inventory UI actions, IPC channels, dependencies, media capabilities, installer/update paths and migration ledger; establish feature/test traceability.
- Upgrade Electron and builder to supported compatible versions; audit npm production/dev, NuGet and native dependencies, SBOM, licenses and pinned verified artifacts.
- Authorize local files using scoped opaque handles; enforce origin/main-frame checks, schema, sizes, safe redirects, file canonicalization, bounded reads; restrict wfmedia protocol and remove broad cross-origin access. Reject unapproved UNC/reparse/network paths; explicit consent for network media.
- Harden FFmpeg/native process paths, args, environment, protocol restrictions, timeouts, quotas, cancellation and temp cleanup; no arbitrary DLL load or shell commands from renderer.
- Fix subtitle stale loads/track selection, local-to-network audio loss, A-B state, invalid seek/time and misleading errors. Verify actual cues/audio rather than DOM presence.
- Address security scan build-path leakage in plugin, deterministic build/path mapping; fail release on missing or failed security checks (secrets, dependency, Defender or equivalent, checksum, trace). Preserve plugin identity.
Gate: reproducible build, existing tests green, new negative tests pass, no unmitigated critical/high security findings, no secrets/build paths in deliverables. Security scan 45749343192 previously failed; CI 45749413262 passed 152/152 on baseline only.

## P1 — Playback foundation and reliable subtitles
- Extract engine-neutral session API: probe/open/play/pause/stop/seek/rate/tracks/subtitles/events/diagnostics/dispose. Session IDs, generation guards and typed IPC.
- Native isolated playback host; evaluate reuse of OpsisMediaPlayerPro LibVLCSharp without wholesale UI rewrite. Pin supported LibVLC runtime and validate distribution obligations; keep Electron shell and existing converter.
- Default LibVLC for local video; Chromium only where compatible and needed for existing Web Audio. Do not silently transcode during playback.
- Real A/V clock, resume, multi-audio track selection, audio delay, chapters, per-file settings, frame handling, audio output and safe hardware/software fallback.
- Baseline subtitle fix: embedded text/bitmap tracks via native engine, external SRT/VTT/ASS/SSA and encoding selection (Greek UTF-8/1253, UTF-16 LE/BE), explicit track selection, signed delay, style preservation when supported.
Gate: MKV HEVC + multi-audio + subtitles, MP4 H.264/AAC, WebM, local Greek subtitle cue timing, seek/reopen, error recovery, no stale events; verify decoded frames and audible signal.

## P2 — Full subtitle system
- Unified catalog of internal/external tracks; language aliases, forced/default/SDH, preference ranking and manual override.
- ASS styling via supported native renderer, PGS/VobSub bitmap pairs, MicroDVD FPS and TTML support where tested. Prevent double rendering.
- Subtitle delay, FPS/time stretching, editor, save/export, dual language display where feasible; clear capability limits on each backend.
- Optional authorized online subtitle providers (official API/ToS, no scraping bypass), safe archive handling, hash/episode matching, consent and local cache; offline core remains functional. Optional sync analysis, not guaranteed accuracy.
Gate: text actually visible at expected time and positions; Unicode/Greek, ASS styling, PGS, VobSub, track switching, seek, malformed input, negative delays and cancellation.

## P3 — Codec Manager and alternative playback backends
- Add read-only discovery: registered DirectShow filters, LAV Splitter/Audio/Video, K-Lite variants, other installed packs (e.g. Shark007), ffdshow/Xvid/DivX/VSFilter where registered, Media Foundation MFTs/Windows codec extensions, installed GPU capabilities, FFmpeg and LibVLC versions. Separate installed, compatible, verified-in-use and unavailable.
- Use DirectShow as optional legacy compatibility host, not global primary. Enumerate CLSID, bitness, version, canonical path and publisher/signature/hash where available. Explicit trust policy: approve known filters, do not load arbitrary registry COM objects; unsigned components require explicit trust or stay blocked. Construct controlled filter graph and inspect actual connected filters. No changes to global merit/registry or automatic third-party pack installation.
- Media Foundation adapter for supported transforms/hardware/native formats; no assumption that DirectShow filters are MFTs. x64 by default; optional isolated x86 host only for approved legacy filters after testing. No mixing architectures within a process.
- Auto selection using probe and capabilities: LibVLC default, DirectShow when explicitly preferred or appropriate trusted codec available, Media Foundation for supported paths, Chromium for known-safe web formats. Bounded fallback on actual failure, preserve media time and compatible tracks, no infinite retries. Manual engine selection, per-file override and safe mode.
- Diagnostics: actual decoder/splitter/render path, codec, resolution, FPS, bit depth, GPU or software, reason for fallback, error code. Do not claim pack used unless observed in connected graph. Codec packs do not extend Chromium or LibVLC decoding automatically.
Gate: clean Windows plus K-Lite Basic/Full/Mega and at least one other pack, x64, conflicting filters, unavailable pack, approved filter crash, install/uninstall, driver failure. Assert actual filter graph/decoder, not package presence.
References: https://codecguide.com/features_mega.htm ; https://codecguide.com/download_kl.htm ; https://learn.microsoft.com/en-us/windows/win32/directshow/working-with-codecs ; https://learn.microsoft.com/en-us/windows/win32/directshow/filter-mapper .

## P4 — Audio Enhancer and FxSound
- Verify existing Web Audio DSP before adding effects; fix neutral stereo/mono handling, CORS route changes, gain staging, clipping, export parity and persistent presets.
- Independent DSP: EQ 10/15/31 and parametric, clarity, ambience, surround, dynamic boost, bass, dialogue, de-esser, noise gate, limiter, loudness, headphone/device profiles, spectrum/VU/LUFS; measured response and gain-matched A/B.
- Read-only FxSound discovery already drafted; improve via Core Audio route and documented version-appropriate external interface. Distinguish installed/running/selected/processing active/unknown. Native/External/Smart modes; explicit user consent before routing changes, no automatic driver install or shutdown of FxSound.
- Apply one intended DSP chain to audio/video, maintain unprocessed passthrough where applicable, distinguish live DSP and offline export. Audio passthrough disables incompatible effects. Avoid double processing on virtual audio endpoints; never claim direct native path bypasses OS enhancements if not verified.
- System-wide DSP separate optional signed APO/virtual-audio feasibility, threat model, opt-in and rollback; optional Equalizer APO integration and VST3 isolated host after license/security review. Do not copy AGPL FxSound code into MIT-only project.
Gate: Windows with and without FxSound, active/nonactive/unknown route, Bluetooth/HDMI changes, no double processing and no mute, A/V sync, DSP frequency/level tests and export parity. Real system-wide tests separate from CI.

## P5 — Photo Studio
- Build on existing 12 adjustments and draft PR vibrance/sepia/vignette, stale-load protection and export snapshots.
- Non-destructive history, undo/redo, before/after, zoom/pan, free crop, straighten, perspective, resize, RGB histogram, curves, HSL, levels, clarity/texture/dehaze, split toning, color grading and white balance picker.
- Local masks, healing/clone, red-eye, noise reduction/sharpen, scratch repair, filters/LUTs, grain, text/watermark, collage/layers where feasible; any optional ML models offline and license-reviewed.
- Gallery, albums, batch edits/conversion/rename, metadata opt-in and GPS privacy, duplicate detection, slideshow, print/PDF.
- RAW/DNG/TIFF/HEIC/AVIF support subject to decoder/encoder availability; ICC/EXIF/orientation/alpha, color-managed output, preserve originals. Bound pixel/decoded memory before decode, worker/tiled export, cancellation and progress.
Gate: reference pixel tests, alpha, EXIF orientation, ICC, large and malformed images, preview/export agreement, batch collision handling and cancellation; no source overwrite.

## P6 — Advanced media features and integration
- VLC/MPC-HC feature matrix rather than blanket parity: chapters, playlists/M3U export, URL/HLS/RTSP and authorized IPTV, reconnect, screenshots/contact sheets, playback shortcuts/OSD, deinterlace/filters, aspect/zoom, audio delay/channel routing and passthrough.
- Chromecast/DLNA opt-in discovery and network permissions, unprotected DVD/Blu-ray where supported, subtitles and audio track capability reporting. No DRM circumvention or guarantees for protected media.
- Preserve converters, verified codec availability (LGPL vs optional GPL), lossless remux, progress/cancel and source integrity.
- OpsisUI6 compatibility, Opsis plugin 1.0.0.0, NewsCrawler M3U import, help and accessible controls, 20-language coverage; keep old functionality unless documented.
Gate: UI action traceability, accessible keyboard and display scaling, plugin integration, actual media and network tests, no regressions.

## P7 — Performance and release verification
- Windows 10/11 VM CI matrix, clean install/update/uninstall from 2.4.2, x64; separate real GPU/audio hardware tests for D3D11VA/DXVA, HDR, 4K/8K, HDMI, Bluetooth, audio passthrough and protected format limitations. Do not infer real hardware performance from hosted VM.
- Real media corpus generated or licensed for tests: codecs, containers, languages, large files, variable FPS, long playback, damaged inputs, image formats and color profiles. Record backend/decoder and audible/visible outputs.
- Measure baseline and new CPU/RAM/GPU, frame drops, startup, latency, disk writes and 8h soak. Bounded cache, no runaway processes, temp cleanup, no unnecessary periodic writes; publish reproducible benchmarks and acceptance thresholds against baseline.
- Security tests: malformed media, unauthorized IPC/files, network/redirect boundaries, safe filter loading, dependency and malware scans, signing/verification, no sensitive log paths; run all checks even if one fails and gate release.
Gate: all mandatory tests pass; explicit blocked/unsupported hardware cases and manual verification report, not a false green.

## P8 — Release 3.0.0
- One canonical source tree and changelog, installer and portable packages, verified hashes, signed binaries when signing infrastructure is available, SBOM/license notices, help and codec diagnostics. No unapproved third-party redistributions.
- Backup/migrate settings, rollback and updater verification, plugin compatibility. Publish only tested artifacts; no automatic removal of user data.
- Release notes state feature/backend/codec coverage and limitations, actual test evidence and known issues. Do not label unfinished roadmap items as shipped.
Gate: release approval after P0–P7 mandatory gates. Optional experimental system-wide DSP, advanced AI and casting can remain explicitly disabled or separate if validation unavailable.

## Execution rules
One phase or independently testable slice per PR, no direct merge of unverified changes. Every item has implementation + regression tests + evidence or explicit blocked/not supported status. P0 and P1 are highest priority; P2/P3 follow engine contract, P4/P5 can proceed in parallel after common safeguards, P6 integration then P7/P8. Existing draft PR #3 is a partial P4/P5 slice, not completed phases. No claim of universal VLC/MPC/FxSound parity until feature matrix and hardware checks substantiate it.

## 18F — Installer and music metadata
- Inno Setup 7 remains the sole installer for new releases. NSIS handling is legacy migration only. CI must test the actual .iss, same AppId, install/upgrade/uninstall, not substitute a different installer.
- First implementation: local MP3, explicit manual completion or automatic filename-based batch up to 50, no overwrite of existing fields, backups and no re-encoding. Unsupported tag layouts fail closed. Pending: opt-in persistent automation, reliable online identification with privacy consent and ambiguity review, album art and richer formats (FLAC/M4A/Ogg/Opus), complete 20-language UI/help, real-file and installed Windows validation. Do not mark as release-ready until gates pass.

## 18G — Online metadata
MusicBrainz search implemented with consent, fixed HTTPS endpoint, bounded response, release-level candidate review and confirmation. Cover Art Archive viewing only. No fingerprint key bundled; no unreviewed write. Live-provider and Windows UI verification pending.

## 18H — Format foundation
MP3 and FLAC completion share the same explicit confirmation and original backup policy. FLAC comment patching preserves every unrelated metadata block and exact audio payload, rejects unsupported layouts and uses bounded reads. Added composer, lyricist, album artist. Fingerprinting, M4A/Ogg/Opus and live validation remain pending.

## 18I — Batch UX
Preview proposed fields before write, progress and cancellation between files, persistent opt-in filename-derived display suggestions. Automatic writes still require explicit native file selection and confirmation. No background file modifications. Pending: opt-in import-write authorization, richer settings/help translations, fingerprint recognition, embedding cover art, remaining formats and end-to-end testing.

## 18H.1 — Fingerprint identification gate
Experimental integration using the existing resolved FFmpeg (requires Chromaprint muxer) and AcoustID with OPSIS_ACOUSTID_APP_KEY configured externally. The app key is not shipped or logged. Explicit fingerprint/duration consent and candidate review; no file upload. Register an application key and review service terms before release; real-provider and Windows acceptance remain pending.

## 19A — Discoverability release gate
Every user-facing feature must have a documented owner tab, visible entry point or explicit prerequisite, help instructions and release history. Shared feature map is the baseline (26 entries, Greek/English fallback); search opens existing controls without executing actions. No duplicate configuration stores. Keep eight welcome pages, add key routes; no automatic intrusive tutorial. Pending complete inventory of all controls and 20-language translations, keyboard/RTL/zoom and installed UI verification. Do not equate source coverage with functional verification.

## 19B — Feature inventory expansion
68 curated routes, including lazy-built converter targets. Shared Help search, tab names drawn from existing language dictionary, guards against stale navigation and scrollable welcome content. The inventory is not yet a full per-control audit; translated descriptions and installed UI acceptance remain pending.

## 19C–19D.1 — Inventory and coexistence
90 guide groups; source inventory in FEATURE-CONTROL-INVENTORY.md (269 literal identifiers, not full runtime DOM). Fixed cross-tab keyboard handling and stale microphone permission result; native successful handoff announces video ownership. Remaining: full arbitration of pending native opening and audio starts, runtime generated controls, real Windows acceptance, all description translations.

## 19D.3 / 19E.1
Source switching cancels pending video opening and native handoff; real process-exit timing still requires Windows acceptance. Existing localized control labels reused as searchable aliases (53 mappings); curated descriptions remain Greek/English. Windows CI at 19D.2: 246 passed, 22 failed on short/long path equality, installer lifecycle succeeded. Updated comparisons use native realpath; separate public subtitle CI now builds required DSP adapter. Retest pending.

## 19E.2 / 19F.1
Eight additional UI/help/welcome phrases in 20 languages; five metadata routes translated in four additional languages. Existing Greek/English catalog retained, fallback language marked. Responsive themed finder and Help, clear button, safer stale-navigation error. No independent OpsisUI 6 conformance claimed (repository lookup returned 404). Full translations and visual acceptance remain open.

## 20A.1 / 20B.1
Bounded live LUFS analysis and serialized metadata queue; 384px retained artwork thumbnails; metadata list redraw coalescing, delayed persistence, unchanged-value write suppression; inactive meter/seek work reduced. Live analysis limit 32 MiB/10 minutes/local files only, chosen as conservative resource guard, not a conversion limit. No measured resource savings claimed before Windows profiling.

## 20B.2
Prior Windows CI: 272/272 and renderer self-test passed. Shutdown cancellation, removed audio source release and hidden frame scheduling improved. Resource profile logs five samples each at startup idle and after existing selftest, CPU and summed working set of Electron processes only. No SSD/GPU or external-process measurements, no before/after comparison yet. New tests pending.

## 20B.3 / 20C.1
Windows test-only process-tree snapshots every four seconds (one in flight) include descendant process names, CPU cumulative time, working set and I/O transfer counters, optional max observed GPU engine percent. No physical SSD write assertion, no full GPU utilization, sampling can miss short-lived processes. Encoder discovery deduplicated and bounded; auxiliary FFmpeg cancellation and real concurrent cancellation regression test added. Pending results and soak testing.

## 20C.2
60-second test-only audio and tab soak with 20 iterations, five removals and final release; repeated FLAC conversion test (six outputs) and post-soak profile. Pending crossfade removed-source race fixed. General and installer CI separated by commit to preserve evidence; this increases concurrent CI consumption if commits are pushed too quickly. No long-duration leak certification yet.

## 20B.4 / 20C.3
Event-driven visualizer, idle equalizer and hue scheduler, cached theme colors and unchanged resize/IPC suppression. Decorative background animations remain user-selected. Idle default background and visualizer intentionally static until active audio. New soak check verifies no scheduled frames while idle. CI and comparable resource measurement pending.

## 20B.5 / 20C.4
Previous CI 275/275; renderer soak 14/20 playback advancement (failure), other soak checks passed. Idle CPU 8.56% -> 0.60%, RAM 584642.4 -> 567681.6 KiB on separate Windows runners; not a controlled hardware benchmark. Direct playback confirmation and source reload fixed; stricter source identity and per-cycle failure diagnostics added. Reverb impulse and exciter curve deferred to first use. Full CI pending.

## 20B.6 — Anti-pile-up
Bound transient image caches (estimated UTF-16 bytes, 16 MiB per cache), serialized preview queue, remove stale previews and completed jobs, prevent overlapping photo reads/decode/export. User content not deleted; cache eviction only. Long-term measurements still pending; remaining metadata queue and large playlist/preset management to audit.

## 20B.7
Prior 20B.5: 275/275 tests, real playback 20/20, idle CPU 0.29%, startup 538746.4 KiB, post-soak 579263.2 KiB. One metadata scan, bounded 64-key queue, active deduplication, remove stale jobs, no-cover memoization. Manual CI 20/120/1200 cycles (minimum 1/6/60 minutes); one-hour run not yet executed, eight-hour certification requires separate runs/runner. No forced memory purge or user-content deletion.

## 20B.8
20B.7 CI 278/278, Electron and 20/20 playback PASS. Startup CPU 0.54%, RAM 550932.8 KiB; post-soak 585504 KiB. Explicit confirmed photo release and video close without deleting playlist, DSP context disposal, guide 92 entries. Dedicated hour-long CI triggered by workflow file change (1200 cycles). Pending full results and 8-hour certification; test labels currently bilingual EL/EN.
