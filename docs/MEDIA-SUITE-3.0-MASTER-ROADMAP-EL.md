# OPSIS Media Suite 3.0.0 — Ενιαίο Master Roadmap

Αναθεώρηση R2 • 27 Νοεμβρίου 2026 • Draft PR #3 • βάση κώδικα `0c9e15bef830beb144844eea3b2875d66455cb89`
Στόχος: ασφαλές, αποδοτικό και ολοκληρωμένο 3.0.0 για Windows 10/11 x64, με Inno Setup και συμβατότητα plugin 1.0.0.0. Το master παραμένει 2.4.2 μέχρι την εγκεκριμένη έκδοση.
Αυτό το τμήμα είναι το μοναδικό ενεργό σχέδιο προτεραιοτήτων. Το παλαιό σχέδιο και το ιστορικό παραμένουν στο τέλος ως αρχείο αναφοράς, όχι ως δεύτερη ουρά υλοποίησης.

## 1. Τεκμηριωμένο σημείο εκκίνησης

| Περιοχή | Κατάσταση | Απόδειξη / περιορισμός |
|---|---|---|
| Γενικό CI 20B.12 | Επαληθευμένο | [46005804273](https://github.com/gs-applabs/OpsisMediaSuite/actions/runs/46005804273), 282/282, Electron PASS, 20/20 πραγματική πρόοδος ήχου |
| Επιλεκτική εκκίνηση και video park/resume | Επαληθευμένο στο VM | Ίδιο CI, selected item/ticket/session/FX/timer assertions |
| CPU/RAM αδράνειας | Μετρημένο | 0.08% CPU, 524143.2 KiB summed working set, 0.05% CPU / 606555.2 KiB post-soak. 5 δείγματα ανά φάση, όχι ελεγχόμενο hardware benchmark |
| 20B.13/14 DSP | Υλοποιημένο, CI εκκρεμεί | [46006371203](https://github.com/gs-applabs/OpsisMediaSuite/actions/runs/46006371203), [46006791066](https://github.com/gs-applabs/OpsisMediaSuite/actions/runs/46006791066) |
| Μακρά soak | Σε εξέλιξη, όχι PASS | [46002506246](https://github.com/gs-applabs/OpsisMediaSuite/actions/runs/46002506246), [46002997615](https://github.com/gs-applabs/OpsisMediaSuite/actions/runs/46002997615), [46003581420](https://github.com/gs-applabs/OpsisMediaSuite/actions/runs/46003581420) σε παλαιότερα commits |
| Εγκαταστάτης | Inno Setup, προηγούμενο lifecycle PASS | [46002998078](https://github.com/gs-applabs/OpsisMediaSuite/actions/runs/46002998078); νέο lifecycle [46006791051](https://github.com/gs-applabs/OpsisMediaSuite/actions/runs/46006791051) εκκρεμεί |
| Native/DSP/RAR/K-Lite/plugin | Εξειδικευμένα CI PASS στο 20B.12 | Όχι εγγύηση λειτουργίας όλων των codecs ή φυσικής συσκευής |
| Οδηγός λειτουργιών | 92 curated routes | Πλήρης απογραφή runtime και μεταφράσεις εκκρεμούν |

Καταστάσεις: BACKLOG / IN PROGRESS / IMPLEMENTED / VERIFIED / BLOCKED / DEFERRED. VERIFIED απαιτεί αποτέλεσμα για συγκεκριμένο commit, πραγματική δοκιμή και σαφές scope. Δεν χρησιμοποιούμε ποσοστά ολοκλήρωσης χωρίς καταμετρημένα κριτήρια. Ακυρωμένο CI δεν είναι PASS ούτε αποτυχία λειτουργίας.

## 2. Νέα σειρά υλοποίησης

### P0 — Σταθεροποίηση υπάρχοντος κώδικα (UMP 21A–21C, release blocker)

- P0.1: Ολοκλήρωση 20B.13–14 CI, ανάγνωση logs, διόρθωση κάθε πραγματικής αποτυχίας, επαλήθευση του package/worklet/installer. Μην προσθέτεις νέο εφέ πριν κλείσει η παλινδρόμηση.
- P0.2: Ενιαίο lifecycle/ownership για μουσική, βίντεο, mic, test tone, offline converter, φωτογραφία. Generation/epoch guards, stop ACK native host, ακύρωση stale opens, bounded shutdown. Διατήρηση playlist, θέσης, υποτίτλων, dirty edits. Explicit user jobs συνεχίζουν ανεξάρτητα.
- P0.3: Audit DSP live/OfflineAudioContext/worklet/native/Video FX: neutral/active/mute/bypass, επιλεκτικά branches, crossfade/re-enable race, ίδιο gain/phase/mono/stereo, limiter. Μετρημένα waveform tests, όχι μόνο DOM. Κάθε EQ band ξεχωριστά μόνον εφόσον υπάρχει μετρήσιμο κέρδος χωρίς clicks ή αλλαγή απόκρισης.
- P0.4: Security: IPC/frame/path/consent, bounded metadata and decoded PCM, oversized images, malicious archives/media, dependencies/secrets/packaging, no arbitrary COM/DLL, no global OS modifications. Audit shutdown before/after. Διόρθωση και επανέλεγχος παλαιότερου security failure.
- P0.5: CI discipline: batch independent changes, no repeated hour-long workflows per push, preserve last verified SHA. Fast syntax/unit/real renderer gate, selected specialist suites on touched paths, all specialist suites on frozen release candidate. Keep already-running hour soaks; do not treat cancelled runs as green. No merge until mandatory checks green.

Gate P0: all baseline + new regressions green on same candidate; no critical/high unmitigated issue; real park/resume/native lifecycle tests; no data loss.

### P1 — Ελαφρύς πυρήνας και Anti-Pile-Up (UMP 22A–22D, release blocker)

- P1.1: Feature registry/lifecycle (cold, initializing, active, parked, disposing, failed), existing settings as source of truth; no duplicate preference store. Dependency graph, idempotent activation/deactivation, cancellation; no hidden tasks from unused features. User-started conversions/export/explicit sync continue and expose status/cancel.
- P1.2: Extend lazy loading: subtitle providers/cache, native host and DSP bridge, archive/codec detection, separate audio/video converter UI work, metadata scans when relevant. Only load selected background/visualizer, suspend inactive live contexts, no polling when idle. Retain unsaved photo content; release disposable preview buffers when safe; no forced working-set trim or GC tricks.
- P1.3: Bound retained cover/thumb bytes, decoded audio/PCM, photos and queues; check large library/import, repeated reopen, stale metadata retry, scratch cleanup with safe owned paths, disk write dedup, handles/threads/child-process lifetime, no deletion of user files. Measure process-tree private bytes and working set separately, I/O deltas (not SSD wear), CPU/GPU with stated scope, actual startup-to-interactive wall time.
- P1.4: Reproducible performance gate: compare same runner/configuration and fixtures against frozen 20B.12 and 2.4.2 where feasible; 20/120/1200-cycle test, separate 8h on appropriate authorized Windows host; 1000 music switches, 100 video switches, 100 photo opens, 100 real small conversions, explicit cancellation/exit and mixed-mode scenarios. No workload counts claimed until executed. Quantify slope after warm-up, no persistent handle/child/temp growth. Report failures per cycle and bounded metrics, no infinite retries.
- P1.5: Provisional engineering targets (not achieved results): idle CPU mean <=1% over 5 min with static background; compare cold startup wall-time and private bytes (aim 20% lower than reproducible baseline, revisit if renderer floor limits it); after warm-up same fixture idle checkpoints within 10% or 64 MiB above plateau, whichever larger, with no sustained rising trend; no leftover app-owned processes after graceful exit; no unnecessary writes from unchanged settings. GPU/audio real-hardware and physical SSD measurements separate. Any threshold miss requires diagnosis/explicit release decision, not metric gaming.

Gate P1: one-hour run completed on candidate plus meaningful mixed-mode tests; 8h validation required for claim of eight-hour stability. If 8h hardware unavailable, release status BLOCKED or explicit user-approved documented limitation, not false certification.

### P2 — Πλήρης λειτουργικότητα και ενοποίηση (UMP 23A–23E)

- P2.1: Playback capability matrix with actual decoded frames, seek, audible route where device available, MKV HEVC/multi-track, H.264/AAC, WebM, audio delay, chapters, native LibVLC/DirectShow/Media Foundation/Chromium fallback. Read-only K-Lite/other packs detection; verify actual connected decoder, no registry/driver alterations; manual choice/controlled fallback.
- P2.2: Subtitle completeness: Greek encodings, external/embedded text/bitmap where backend supports it, sync/offset/stretch, real rendered cues, seek and replay, editor unsaved state, provider consent/official APIs, archive safety and ambiguity, sync cancellation. Record unsupported ASS/PGS/VobSub cases rather than pretend parity.
- P2.3: Metadata completion: current MP3/FLAC explicit batch + backup, MusicBrainz review, optional AcoustID key; add safe local cover art, supported M4A/Ogg/Opus then WAV/WMA only if preservation can be proved. Automatic write only opt-in with clear authorization for selected files, preview/undo/backup; never silent background alteration or overwrite existing fields. Preserve exact audio payload, verify original/backup, ambiguous match review, no scraping.
- P2.4: Converter and photo: cancellation, queue recovery, atomic publication, no overwriting originals, large-file pixel/PCM budget, preview/export parity, actual available encoder, avoid simultaneous heavy work without user request; consolidate duplicate functions rather than invent second implementation.
- P2.5: FxSound/Equalizer APO coexistence, native/external/smart routing, device-change handling, avoid double DSP, preserve existing supported plugin contract and no automatic driver install/kill; real physical endpoint validation separate.

Gate P2: feature-by-feature matrix (supported / partial / unavailable), actual fixture tests and explicit prerequisites. No broad parity claims.

### P3 — Χρηστικότητα, εμφάνιση, ενιαίες ρυθμίσεις (UMP 24A–24C)

- P3.1: Runtime control audit and grouping by owner tab; shared feature finder (92 routes baseline), visible controls, context-aware tooltips, disabled reason/prerequisite, no duplicate switches/keys, search routes to control but does not execute.
- P3.2: Resource management panel with readable Greek/English labels and existing theme tokens: active/suspended/on-demand, currently running explicit jobs, optional read-only live diagnostics only while panel open, stop/release per feature with confirmation for dirty edits. Do not introduce permanent monitor. No misleading resource counts.
- P3.3: Complete EL/EN and 20-language localized controls/help/welcome/history; keyboard, focus, 100/150/200% DPI, narrow windows, glass/readability, high contrast/reduced motion. Help explains actual operations and limitations, not marketing. OpsisUI6 conformance only after access and contract validation (previous lookup 404); preserve common plugin identity and existing layout.
- P3.4: Optional lightweight startup mode preference (last selected or default tab) only if it does not autostart playback or activate unused services. Existing settings migration/rollback and no destructive default changes.

Gate P3: every supported user-facing feature has owner, visible control, help, accessible entry, real test and actual status; no duplicate configuration.

### P4 — Προχωρημένες δυνατότητες με όρους (UMP 25A–25D, not automatic release blockers)

Prioritize user value and reuse existing functionality. Perform overlap/license/resource review before implementing.
- P4.1: Photo masks/healing/curves/HSL and batch processing if not already present; bounded/tiled decode, ICC/EXIF, alpha, originals preserved.
- P4.2: Advanced audio EQ/parametric presets, dialogue/noise features, device profiles, optional native DSP, only after P0/P1 verified; no second parallel DSP chain.
- P4.3: Media library tags/search, playlist enhancements, remux, advanced video controls, authorized network streams; opt-in network discovery/casting separate.
- P4.4: RAW/HEIC, HDR, advanced native codecs, system-wide APO, VST3, offline ML and casting are conditional extensions; require dependency, license, privacy, security, compatibility, actual device tests. Defer unsupported/untested items to 3.1+ or optional plugins rather than inflate 3.0.0.

Gate P4: explicit scope decision before RC; optional unfinished items stay disabled or deferred, not shipped as complete.

### P5 — Release Candidate και τελική 3.0.0 (UMP 26A–26C, release blocker)

- P5.1: Freeze candidate SHA, all mandatory suites on same SHA (general, installer lifecycle, DSP/native/worklet, public subtitle/RAR, K-Lite, plugin, packaged). Windows 10 and 11 x64 where available; separate second free/authorized Windows VM or explicitly blocked; actual physical GPU/audio checks cannot be inferred. No unverified direct merge.
- P5.2: Inno Setup only, existing AppId and legacy NSIS migration only. Real clean 2.4.2 upgrade, repair/uninstall/reinstall, preserve user profile/settings, cleanup owned files, rollback, package/source consistency, version labels/help/history/splash/plugin 1.0.0.0, checksum/SBOM/licenses/security. Signing only if authorized feasible; do not pretend signed.
- P5.3: One canonical source archive, tested installer and optional portable, reproducible build instructions, release notes, artifact hashes and verified downloads. Publish after gates, no source/user-data deletion; no new final release until candidate accepted.

Gate P5: same-SHA evidence, known limitations, user-visible decision for any blocked mandatory check, no false green. Final version 3.0.0 only after gate.

## 3. Επόμενο πρακτικό pass
1. UMP 21A: reconcile 20B.13/14 full CI, fix actual failures, collect completed soak evidence with SHA; audit DSP interrupted transitions and native ownership.
2. UMP 21B: test/repair active feature lifecycle and resource release (including shutdown).
3. UMP 21C: verify security and compatibility, freeze P0 baseline.
4. Proceed P1 then P2/P3 in dependent order; only batch unrelated work if it cannot mask failures. P4 after scope review; P5 on frozen candidate.

## 4. Κανόνες για κάθε Ultra Mega Pass
- Report actual paths/commit, defects discovered vs fixed vs verified, test count and scope, unresolved issues and blocked hardware. No arbitrary percentages or estimated test results.
- Preserve user-selected functionality, data, settings and existing installer. Avoid duplicated controls, code paths, conflicting plugin or OS modifications.
- Activation only on user use or explicitly selected policy; suspend idle services; safe preservation of work in progress. No forced memory trim.
- Separate UI-only checks, real codec/media fixtures, CI metrics and hardware tests. Measure impact rather than infer. Don't count cancelled or pending CI as success.
- Keep one active roadmap and CHANGELOG; historical entries retained below for audit, no redundant progress files. New passes update authoritative status rather than append obsolete priority plans.

---

## Παράρτημα Α — Αρχειακό αρχικό scope P0–P8 (όχι ενεργή σειρά προτεραιοτήτων)
Οι αρχικές λειτουργικές απαιτήσεις διατηρούνται για να μη χαθεί καμία. Οι αναφορές σε προτεραιότητες εδώ είναι ιστορικές. Τυχόν σύγκρουση επιλύεται βάσει του ενεργού σχεδίου R2 και των ρητών οδηγιών χρήστη.

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


---

## Παράρτημα Β — Ιστορικό προηγούμενων περασμάτων (καταστάσεις κατά τον χρόνο καταγραφής)

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

## 20B.9
SSD/temporary resource hygiene: owned scratch directories for WAV/predecode/pass stats, retry cleanup, no indiscriminate temp purge. Crash log cap 512 KiB plus rotated file; up to 12 entries/minute and duplicate suppression. Appearance preference deduplication and 500 ms accent debounce, flush on change/blur/unload. Physical SSD writes not measured. Hour-long prior-commit run 46002506246 in progress; new CI pending.

## 20B.10
Converter shutdown gate, active-run cancellation, bounded cleanup grace (4 seconds), recheck before starting a new pass or publishing, probe/thumb admission guards, progress notification deduplication (100 ms, terminal always). No guarantee of recovery from forced process kill or OS crash; no deletion of completed outputs. New CI pending.

## 20B.11 — Demand-driven core
Live AudioContext/DSP graph not created at cold start; preserve state-only controls, instantiate on playback/mic/tone/worklet, restore preferences; offline conversion independent. Dependency scan only when Settings selected, lazy optional archive/probe/codec modules. Existing CI 282 tests, 281 pass, one obsolete static log assertion corrected; pending new verification. Hourly workflow switched to manual to avoid repeat runs; existing runs unaffected. Not yet full DSP per-node deactivation or full startup certification.

## 20B.12 — Active feature ownership
Music parks video resources without losing selected item/subtitle edits; explicit resume restores position and FX preference for local video. Idle live music context suspended after 1.5 s, photo preview gated by visibility, background converter preview queue stops after current item, user-started export/conversion continues. Native stop remains asynchronous and full overlap/long-duration tests pending.

## 20B.13 — Selective DSP
Optional compressor/reverb/exciter heavy processors created only for selected web effects, disconnect after 350 ms fade (immediate when suspended), restore on re-enable, zero wet and bypass release. Preserve output limiter and offline conversion. Prior 20B.11 CI 282/282, idle CPU 0.13%, mean Electron working set 534761.6 KiB. New CI pending; remaining neutral EQ/surround branches and hardware measurement not certified.

## 20B.14 — Selective tone and width
Independent live EQ bank / bass / presence / stereo-width branches, created only for non-neutral web-route settings and released after 180 ms transition (immediate on suspended context). Retain stereo downmix and safety limiter; offline and video DSP unchanged. Whole ten-band bank active if any EQ band nonzero. Six real renderer assertions added; latest Windows CI pending, no measured saving claimed.

