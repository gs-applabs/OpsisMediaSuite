# OPSIS Media Suite 3.0.0 — Ενιαίο Master Roadmap

Αναθεώρηση R3 • 27 Νοεμβρίου 2026 • Draft PR #3 • βάση κώδικα `0c9e15bef830beb144844eea3b2875d66455cb89`
Στόχος: ασφαλές, αποδοτικό και ολοκληρωμένο 3.0.0 για Windows 10/11 x64, με Inno Setup και συμβατότητα plugin 1.0.0.0. Το master παραμένει 2.4.2 μέχρι την εγκεκριμένη έκδοση.
R3 ανακατανέμει τις προτεραιότητες R2 χωρίς να επανεκκινεί υλοποιημένες εργασίες. Αυτό το τμήμα είναι το μοναδικό ενεργό σχέδιο προτεραιοτήτων. Το παλαιό σχέδιο και το ιστορικό παραμένουν στο τέλος ως αρχείο αναφοράς, όχι ως δεύτερη ουρά υλοποίησης.

## R4 — ανακτημένες εκκρεμότητες και πρωτόκολλο συνέχειας (28 Νοεμβρίου 2026)

Η R4 υπερισχύει της σειράς R3 όπου αλλάζει τη σειρά των επόμενων περασμάτων. Δεν ακυρώνει τις πύλες P0–P8. Πηγές: MPP-MIGRATION-LEDGER.md, WAVEFRAME_ROADMAP.md, PR #1/#2/#3, αρχικό παράρτημα Α και διαθέσιμες συζητήσεις. Τα ακόλουθα είναι κατάλογος προς διασταύρωση με τον κώδικα, όχι ισχυρισμός ότι κάθε λειτουργία απουσιάζει. Πριν από υλοποίηση: reuse/extend/replace/defer, έλεγχος διπλοτύπων, πραγματική δοκιμή.

| Pass | Ανακτημένο scope / εκκρεμότητες |
|---|---|
| 3D | MPP: URL από πρόχειρο με consent, go-to-time, elapsed/remaining, frame stats, chapters MKV, aspect/zoom/crop, mini/PiP, video sleep/exit (όχι shutdown υπολογιστή), screenshot clipboard, shortcuts και mouse buttons, playlist sort/reorder/reveal/copy path/M3U export, HLS/RTSP/authorized IPTV/reconnect, movie/series info opt-in. Converter: frame sequence, poster, contact sheet, lossless A-B/remux, gamma/deinterlace/sharpen, metadata/track preservation, queue recovery. |
| 3D.9 | Online Media Converter — explicit URL or playlist import, provider capability detection, preview title/duration/count and selected items, audio/video output options using existing FFmpeg queues. YouTube/YouTube Music/Vimeo/Dailymotion/SoundCloud/Bandcamp and direct authorized media: investigate maintained optional adapters and provider terms; only permitted downloads, no DRM bypass. Spotify and other protected subscription sources: authorized metadata/playlist import only, match to user-owned local media or separately licensed downloadable sources, no extraction of protected audio. No credential capture, no silent installs, no automatic network activity; bounded sequential jobs, cancellation, disk quota and owned temp cleanup, safe filenames, no shell invocation, explicit consent, provider error reporting and licenses. Real tests with local HTTP fixtures and authorized provider samples before marking supported. |
| 3E | Music: smart collections, album/artist/genre grouping, history, portable import/export, optional lyrics feasibility, WMA write and broader WAV/M4A/Ogg/Opus layouts only after integrity proof, metadata preview/undo, gapless/crossfade. DSP: 15/31 band or genuine parametric only if no duplicate chain, headphone/device profiles, dialogue/dynamic boost, de-esser/noise gate, true-peak/headroom, video output device/channel mapping/delay, LUFS/compressor/visualizer parity, native/external physical validation. |
| 3F | Photo: zoom/pan, free crop, straighten/perspective, curves/HSL, dehaze/texture, grading/split toning, WB picker, red-eye, masks/healing/clone, text/watermark, LUT/grain, batch edits/conversion/rename, gallery/albums/slideshow/print/PDF, ICC/EXIF/GPS privacy/alpha, RAW/DNG/TIFF/HEIC decoder feasibility, GPU parity. Advanced tools may be deferred under P9; never claim complete. |
| 4A | Opsis.UI 6: PR #2 merged; correct upstream gs-applabs/Opsis.UI accessible, local tokens already imported. Validate released contract, keep 20 skins, 20 visualizations, 10 animated backgrounds, Classic layout and 4 button styles; all windows, language/focus/accessibility, reduced motion and physical DPI. No duplicate theme engine. |
| 4B | PR #1 open: 64 changed files, 27 overlap with PR #3 (122 at audit). Selective integration of flyout, other Windows media sessions, mixer/session volumes, volume-key overlay, lock status toasts, taskbar widget/spectrum and monitor positioning; keep existing Inno and newer core/IPC. Read-only inspection then compatibility tests; no blind merge. |
| 4C | Opsis plugin 1.0.0.0, installed Opsis host, Crawler M3U real playback, shared playback metadata for desktop visualization/Spectrum Sphere (verify host requirements), one owner/no duplicate player, no automatic always-on helper. |
| 4D | Full control/capability ownership, all help/history/welcome locales, settings migration, resource panel, pending/dirty state, regression of original Waveframe features; update ledger and exact evidence. |
| 5A–C | Security scan/SBOM/licenses, same-SHA 1h/8h/mixed workload, measured CPU/RAM/GPU/SSD I/O, second authorized Windows VM if accessible, real Windows display/audio/codec packs, authentic 2.4.2 migration and Inno Setup installer, source/portable/hash/download verification. |
| P9 | Explicit feasibility/scope decision for casting/DLNA, system-wide signed DSP/APO, VST3, advanced photo/RAW, HDR, optional OCR/STT, x86/ARM64, unprotected optical media. No insecure workarounds, DRM bypass or silent installation. |

Additional P3/P4 unresolved: actual LibVLC/DirectShow/MF parity (A/V, track/seek/rate/chapter/fullscreen), trust/bitness/actual connected filters, clean vs installed K-Lite variants and other packs; real authenticated OpenSubtitles/SubDL, authorized Greek source fallback links, encodings, compressed RAR/RAR5, forced/default/SDH, ASS styling/PGS/VobSub/dual language, saved naming/folder, live visible sync verification. Existing local/online subtitle mechanisms are reused. Unsupported native/format behavior must remain explicit.

### Handoff rule (user request)
- Every substantial pass: commit changes plus a concise update to this single master roadmap; keep latest `docs/START-HERE-HANDOFF-EL.md` as canonical restart pointer, not a second backlog. Record exact base/head (use PR head to resolve self-referential SHA), completed scope, CI evidence per SHA, failed/pending/blocked items, next pass and instructions.
- Before a conversation becomes too long, and at natural checkpoints, provide the handoff file and current GitHub source link; if user needs offline source, deliver a verified canonical source archive when available. Do not rely on conversation memory, claim knowledge of exact context limit, or delete user data. Old revisions retained in Git history, no redundant patch ZIPs or progress files.
- If access or context fails, disclose it and retrieve this handoff/roadmap before further work. No inferred completion from missing evidence.

### 3D.9D — Adaptive provider compatibility (new requirement)
- Provider Compatibility Manager (3D.9D): independently versioned provider adapters with stable core contract; detect provider protocol/API changes and distinguish network/auth/unsupported failures; opt-in automatic checks only on provider use or manual request, bounded retry/backoff, no resident polling. Update only from explicitly trusted upstream, authenticated signed manifest or pinned verified release hash, bounded downloads, staging, contract/security tests, atomic activation and rollback to last known good; no arbitrary remote scripts, no silent executable installation, no DRM/access-control bypass, no guarantee every provider change is automatically repairable. Preserve queue/settings, expose adapter version and last check, allow manual update/disable. Keep old adapter only for rollback, clean owned staging. Verify with simulated provider changes, failed signatures, failed updates and concurrent jobs. No claims of implementation before actual code and CI.

### ULTRA 3D.9B — direct HTTPS file download
- Explicit consent and user-selected persistent source folder; one cancellable HTTPS transfer, public IPv4 only, no redirects, pinned DNS, 512 MiB limit, 180s deadline, exclusive partial cleanup, existing queue admission. No temporary cache, no auto conversion. Pure admission tests; actual network and packaging verification pending. Provider adapters, playlist retrieval and byte progress remain open.

### ULTRA 3D.9A — online source identification
- Existing lazy converter now identifies HTTP(S) provider and item/playlist/album candidate locally. No network access, no download permission inferred, no persisted URL or raw URL in classification result. Spotify metadata-only, other named providers adapter-required, direct media candidate unverified. Guide 114, pure tests. Base 7b3a2da 8/9 CI PASS, Inno pending; new CI pending. Actual download, playlist enumeration and queue integration remain open.

### ULTRA 3D.7B — subtitle viewport regression
- Packaged job 140853768011 failed actual subtitle pixel comparison: video outside viewport. Restore video tab and scroll decoded video into view before capture; retain original assertion and pixel threshold. CI pending, no release.

### ULTRA 3D.7A — bounded HTTP(S) reconnect (28 Νοεμβρίου 2026)
- Shared URL validation for manual input and playlist admission; reject credentials and malformed URLs. Opt-in bounded 2/5/10-second reconnect after Chromium open/error failure, no background polling. One scoped timer cancelled on full stop, transport stop, park, source change, pause API, toggle or unload. No native network admission, no HLS/RTSP guarantee. Guide 113, pure tests. Actual HTTP failure fixture and CI pending. No merge/release.

### ULTRA 3D.6C — CI ordering and approved video fixture (28 Νοεμβρίου 2026)
- Base ee0ed76 packaged job 140852124461 failed cold converter skeleton because added A-B preparation tests preloaded converter. Moved those tests immediately after unchanged cold assertion in existing converter self-test. No weakening of lazy loading or production logic.
- Added real approved decoded WebM duplicate occurrence reorder identity and A-B dialog transfer to existing media self-test, no automatic conversion. Paused decoded video, not physical continuous playback. New CI pending. No merge/release.

### ULTRA 3D.6B — playlist and converter regression (28 Νοεμβρίου 2026)
- Base `c5d050667a682ef4847191b73fe9e95783d43249`: five workflows PASS, four running at inspection.
- Seven added Electron self-test assertions: actual DOM keyboard/synthetic drag/drop, external drop rejection, invalid/remote range, one-file remux preparation, exact controls and no auto-start, queue isolation. Queue-only admission reuses addPaths; no media opened by fixture. No physical drag, active video identity or end-to-end A-B dialog certification. New CI pending. No merge/release.

### ULTRA 3D.6A — video sleep correction and renderer acceptance (28 Νοεμβρίου 2026)
- Base `6c4b93f27f6294f0bb255878fb922d72b6680e7a`: five CI PASS, four running at inspection. 3D.4 all nine PASS; 3D.5A four PASS, three cancelled, two running.
- Found escaped digit regex in 3D.5B sleep input that rejects ordinary numbers. Extracted pure validation, added boundary tests, timer aria-pressed and stale dialog generation guard. Actual Electron self-test now clicks dialog, arms, rejects invalid without disarming, cancels and closes media. No new service, no app shutdown. New CI pending. Playlist/A-B real interaction and other 3D R4 items still open.

### ULTRA 3D.5B — A–B transfer and video sleep (28 Νοεμβρίου 2026)
- Base `fc7114dbc4b6227e9ed7e5898d1a82ad045b20b9`: RAR/DSP PASS, seven workflows running at inspection.
- Local Chromium complete finite A–B range transfers after explicit confirmation to idle existing converter with empty or matching one-file queue. Uses MKV stream copy; approximate keyframe cut, no automatic execution. No native or network transfer. One explicit video-only sleep timeout (1–480 min, 0 cancels), cleared on full stop/unload; does not quit application or stop independent jobs. Guide 112 and pure range validation test. New Windows CI and real UI checks pending. App exit remains open; no merge/release.

### ULTRA 3D.5A — arbitrary playlist reorder (28 Νοεμβρίου 2026)
- Base `93a5b6594e878575a579ed6746be5c78b2674735`: eight workflows PASS, Inno lifecycle pending at inspection.
- Existing playlist rows accept internal drag/drop and keyboard Alt+Up/Down. Reuse indexed reorder helper, preserve active occurrence and queue persistence, no playback restart. Drag state cleared on redraw; no external file admission or new service. Added pure regression coverage for inactive rows, duplicates, invalid destination and no selection. New CI and actual renderer interaction pending. A-B transfer and video sleep/exit remain open; no merge/release.

### ULTRA 3D.4 — converter frame exports and stream copy (28 Νοεμβρίου 2026)
- 3D.2 all nine workflows PASS. 3D.3 final follow-up `d7f5f08547c41709d4fca9b4990429a317cf654e`: general and seven specialists PASS, installer pending at inspection.
- Existing Video Converter operation selector: MKV remux or approximate keyframe-based range cut (all streams, no silent codec conversion), PNG poster at chosen start time (bounded 1920x1080), 4x3 contact sheet (12 samples), PNG sequence in an exclusive new directory (1–60 frames, interval 1–60s, 640x360 cap, output count, reveal first frame). No separate queue or FFmpeg registry; stream-copy/image modes do not require video encoder discovery in the main job. Cancellable existing jobs; sequence owned generated frame files removed on failure when directory remains valid; never recursively delete unrelated files. No claim of exact frame-accurate lossless cuts, native A-B UI transfer, or support for arbitrary container/stream combination.
- Added real remux/image tests and option/argument tests; guide 110 entries. New CI pending. Full 3D still includes arbitrary playlist reorder, direct player A-B transfer, video sleep/exit, HLS/RTSP and authorized IPTV, additional keyboard controls, media info, subtitle/native parity and others in R4. Next 3D.5, then 3E/3F/4/5. No merge/release.

### ULTRA 3D.3 — playback controls and source cleanup (28 Νοεμβρίου 2026)
- 3D.1 all nine workflows PASS. 3D.2 general 46101350992 / job 140844269324: 309/309, Electron SELF-TEST PASSED; seven specialists PASS, installer pending at inspection.
- Explicit clipboard HTTP(S) URL with confirmation and no userinfo, local approved path reveal/copy, bounded PNG Chromium snapshot to clipboard and cleanup; native screenshot remains unavailable. Fit/crop/stretch/zoom and optional Chromium PiP (no native parity claim). On-demand approved MKV chapter probe via existing bounded ffprobe helper, shared embedded admission, generation guards and seek; no new background services.
- Guide 109 entries, new unit tests. New CI pending; actual chapter fixture and physical PiP/clipboard still required. Frame/poster/contact sheet, remux/A-B and arbitrary list reorder remain open.
- Active tree cleanup: retired two obsolete progress/roadmap files, preserving exact original contents in Git history: [P0 pass history](https://github.com/gs-applabs/OpsisMediaSuite/blob/a8b23da3f0716684e8fd3d6a9dac529607076a44/docs/P0-PASS-1.md), [Photo/DSP draft](https://github.com/gs-applabs/OpsisMediaSuite/blob/a8b23da3f0716684e8fd3d6a9dac529607076a44/docs/PHOTO-AUDIO-ENHANCER-3.0.md). README now points to master/handoff. Retain feature-control inventory, MPP ledger, original Waveframe roadmap and all build/test/license assets. Recovered specific DSP requirements: gain-matched A/B, frequency/Q, preset import/export, optional supported official FxSound CLI only after trust/consent validation, no automatic process or default endpoint changes, physical unplug/Bluetooth validation. No history rewriting or user-data deletion.
- Follow-up restores exact baseline pointers in handoff and distinguishes 80MP file snapshot limit from 16MP clipboard limit, with visible limit message.
- Next 3D.4 converter frame/poster/contact sheet and remux/A-B, then remaining 3D and 3E/3F/4/5. No release/merge.

### ULTRA 3D.2 — playlist and converter tools (28 Νοεμβρίου 2026)
- 3D.1 seven specialist CI PASS; general real renderer and installer pending at inspection. Last fully verified base 3C.
- M3U UTF-8 export from existing video queue with explicit consent to disclose paths/URLs, bounded 2000 entries, trusted main frame, local destination, exclusive publication and no overwrite. Import additionally checks local approved file type after picker. Sort and move active item preserve exact occurrence even with duplicates; no playback restart. No watcher or new scheduler.
- Normal video converter: bounded gamma, sharpen and deinterlace filters, default neutral, same FFmpeg arguments/queue/atomic publish, no change to GIF/audio-only. Encoder policy now wired to change event. Added unit and real decode tests, guide 103 entries. New CI pending.
- Still open: arbitrary item reorder, clipboard/reveal, MKV chapters and view modes, frame extraction/poster/contact sheet, lossless remux/A-B, all other R4 items. No merge/release.

### ULTRA 3D.1 — first closure
- 3C base `88eeecc0f7bba6f8b08b58c4215134c91a13b4a5`: all nine workflows PASS, general 46073208388 job 140754791176 logs 303/303, Electron SELF-TEST PASSED.
- Fixed duplicate static ID vpSubLanguage: local preferred subtitle language now independent of online provider language; new static unique-ID regression check. Added bounded timestamp parser, explicit seek dialog for active seekable Chromium/native playback, elapsed/remaining toggle, on-demand Chromium frame stats (no invented native counters). 100 guide routes. Tests added, new CI pending; no merge or release.
- Remaining 3D items above are open until verified; next slice playlist and converter tools, after checking new CI.

## 1. Τεκμηριωμένο σημείο εκκίνησης

| Περιοχή | Κατάσταση | Απόδειξη / περιορισμός |
|---|---|---|
| Γενικό CI 20B.12 | Επαληθευμένο | [46005804273](https://github.com/gs-applabs/OpsisMediaSuite/actions/runs/46005804273), 282/282, Electron PASS, 20/20 πραγματική πρόοδος ήχου |
| Επιλεκτική εκκίνηση και video park/resume | Επαληθευμένο στο VM | Ίδιο CI, selected item/ticket/session/FX/timer assertions |
| CPU/RAM αδράνειας | Μετρημένο | 0.08% CPU, 524143.2 KiB summed working set, 0.05% CPU / 606555.2 KiB post-soak. 5 δείγματα ανά φάση, όχι ελεγχόμενο hardware benchmark |
| 20B.13/14 DSP | Επαληθευμένο στο VM | [46006371203](https://github.com/gs-applabs/OpsisMediaSuite/actions/runs/46006371203), [46006791066](https://github.com/gs-applabs/OpsisMediaSuite/actions/runs/46006791066) |
| Μακρά soak | 3/3 ωριαία PASS σε παλαιότερα commits | [46002506246](https://github.com/gs-applabs/OpsisMediaSuite/actions/runs/46002506246), [46002997615](https://github.com/gs-applabs/OpsisMediaSuite/actions/runs/46002997615), [46003581420](https://github.com/gs-applabs/OpsisMediaSuite/actions/runs/46003581420) σε παλαιότερα commits |
| Εγκαταστάτης | Inno Setup, προηγούμενο lifecycle PASS | [46002998078](https://github.com/gs-applabs/OpsisMediaSuite/actions/runs/46002998078); νέο lifecycle [46006791051](https://github.com/gs-applabs/OpsisMediaSuite/actions/runs/46006791051) PASS |
| Native/DSP/RAR/K-Lite/plugin | Εξειδικευμένα CI PASS στο 20B.12 | Όχι εγγύηση λειτουργίας όλων των codecs ή φυσικής συσκευής |
| Οδηγός λειτουργιών | 92 curated routes | Πλήρης απογραφή runtime και μεταφράσεις εκκρεμούν |

Καταστάσεις: BACKLOG / IN PROGRESS / IMPLEMENTED / VERIFIED / BLOCKED / DEFERRED. VERIFIED απαιτεί αποτέλεσμα για συγκεκριμένο commit, πραγματική δοκιμή και σαφές scope. Δεν χρησιμοποιούμε ποσοστά ολοκλήρωσης χωρίς καταμετρημένα κριτήρια. Ακυρωμένο CI δεν είναι PASS ούτε αποτυχία λειτουργίας.

Τελευταίο ελεγχθέν head πριν την R3: `8ab7b9b475baf0c5d7cbf2ca45902b6f622a0e12` (R2 documentation). Κατά την επιθεώρηση, plugin CI 46007431247 success, οκτώ λοιπά workflows σε εξέλιξη/ουρά. Δεν τεκμηριώνεται νέο συνολικό PASS. Η βάση κώδικα και τα στοιχεία 20B.12 παραπάνω παραμένουν ιστορικά, όχι μετρήσεις του νέου head.

## 2. Ενεργή σειρά υλοποίησης R3 — P0–P9

P0 και P1 είναι αλληλένδετα: η διόρθωση αποτυχημένου CI προηγείται οποιασδήποτε αλλαγής, ακόμη κι αν το P0 έχει την υψηλότερη αρχιτεκτονική προτεραιότητα. P2–P7 κλείνουν υφιστάμενες δυνατότητες πριν προστεθεί προαιρετικό scope. P8 είναι η υποχρεωτική πύλη έκδοσης. P9 δεν μπλοκάρει τον βασικό κορμό. Όλα τα παρακάτω είναι σχέδιο/κριτήρια, όχι νέες ολοκληρωμένες υλοποιήσεις.

### P0 — Έξυπνος πυρήνας και Anti-Pile-Up (UMP 21A–22D, release blocker)

- P0.1: Απογραφή και επαναχρησιμοποίηση demand-driven core 20B.11–14: υπάρχουσα επιλεκτική εκκίνηση AudioContext, park/resume video, lazy probes, επιλεκτικά DSP branches. Καμία δεύτερη preference store ή παράλληλος scheduler. Καταγραφή capability/owner/activation/dependency/cleanup για κάθε υπηρεσία.
- P0.2: Ενιαίος κύκλος cold → initializing → active → parked → disposing → failed με idempotent acquire/release, leases/reference counts για κοινές υπηρεσίες, generation/epoch guards, bounded cancellation και stop ACK native host. UI navigation δεν ξεκινά επεξεργασία χωρίς ανάγκη. Ανεξάρτητες εργασίες που ζήτησε ο χρήστης συνεχίζουν (π.χ. μουσική + φωτογραφία + μετατροπή), ενώ αμοιβαία ασύμβατα live sources αλλάζουν ελεγχόμενα. Preserve playlist, positions, subtitle edits, dirty photo state, settings. No forced working-set trim or GC tricks.
- P0.3: Lazy modules for native hosts, subtitle provider/cache, FFmpeg/probes, archive, metadata and photo workers; selected visualizer/background only; visibility/idle-aware timers, suspend unused contexts. Explicit job queue, priority to interactive playback; bounded concurrency/backpressure without silent cancellation. Optional resource budgets configurable, never arbitrarily block user-initiated work.
- P0.4: Bounded cover/thumb caches, PCM, photo buffers, queues and logs; cleanup owned temp files, child process tree, timers, event listeners, object URLs, handles and worker lifetimes. Deduplicate settings/resume writes, no unchanged-value writes, flush on genuine lifecycle events. No user-data deletion. Restore settings after restart and safe cancellation.
- P0.5: Same-fixture baseline 20B.12 and 2.4.2 where feasible; measure cold startup-to-interactive, private bytes and working set separately, CPU, GPU scope, disk I/O deltas (not physical SSD wear), child/handle count, memory slope after warm-up. 20/120/1200-cycle and 1h candidate soak, separate 8h on authorized Windows host; 1000 music switches, 100 video switches, 100 photo opens, 100 real small conversions and mixed-mode cancellation/exit. No test counts until actually executed.
- P0.6: Provisional engineering targets: idle CPU mean ≤1% over 5 min static; aim 20% lower startup and private bytes vs reproducible baseline, revisit renderer floor; after warm-up within 10% or 64 MiB above plateau (whichever larger) and no sustained rising trend; no orphan app-owned children after graceful exit. Targets not results. Actual GPU/audio/SSD hardware separate.

Gate P0: same-SHA lifecycle and mixed-mode assertions; 1h completed, no data loss, no sustained resource growth. Eight-hour claim requires actual 8h result; unavailable mandatory hardware is BLOCKED or explicit user-approved limitation.

### P1 — Σταθερότητα, ασφάλεια και αποφυγή συγκρούσεων (UMP 21A–21C, continuous release blocker)

- P1.1: Reconcile 20B.13–14 and latest CI; inspect logs, repair actual failures before new changes. Keep long-running soaks; cancelled/pending never PASS. Batch independent changes, fast syntax/unit/real renderer first, specialist suites by scope, all suites on frozen RC.
- P1.2: Inventory existing controls, settings, IPC and plugin/native/codec responsibilities; classify reuse / extend / replace / defer. One owner per feature, one source of truth per setting, no duplicate DSP, controls or jobs. Regression against previous 2.4.2.
- P1.3: Scoped IPC/path/consent, main-frame and origin checks, bounded metadata/decoded PCM/images/archives, safe redirects, validated binaries and fixed arguments, no arbitrary COM/DLL, no global OS modifications. Security scan, SBOM, dependency/license/secret gates; fix earlier scan failure. Native child is not a security sandbox.
- P1.4: Atomic settings/migrations and output publishing, recovery/crash loop protection, corrupt config rollback, interruption cleanup; test shutdown, cancel, stale callbacks, provider rate limits, offline operation, redacted bounded logs. No irreversible actions without consent.

Gate P1: baseline + new regressions green on candidate, no unmitigated critical/high issue, no conflicts or data loss.

### P2 — Μουσική, metadata και βιβλιοθήκη (UMP 23A)

- Preserve current MP3/FLAC explicit batch, original backup, filename suggestions, MusicBrainz review, optional AcoustID/Chromaprint key and consent. Complete live-provider tests with user-owned credentials; no silent or ambiguous auto-write, no scraping or key logging.
- Add preview/undo, local cover embedding, supported M4A/Ogg/Opus then WAV/WMA only after exact audio payload and unrelated metadata preservation proved. Opt-in import-write authorization with per-file scope, cancellation and backup; no background alteration or overwrite of existing fields by default.
- Incremental user-selected library indexing, bounded artwork cache and metadata queue, smart playlists, search/filter, duplicate suggestions (never auto-delete), history and portable import/export. Reuse existing playlist and metadata engine. Gapless/crossfade verification, not duplicate players.

Gate P2: actual files, tag/backup/audio payload integrity, ambiguity and offline/credential/cancellation tests; feature matrix.

### P3 — Αναπαραγωγή και codecs (UMP 23B)

- Engine-neutral session with Chromium/LibVLC/DirectShow/Media Foundation, one active backend per media session, bounded fallback with position/track preservation and manual override. Real decoded frame/A-V clock, seek, audio track, chapters, rate, frame stepping, audio delay, aspect and native fullscreen.
- Read-only trusted installed K-Lite/LAV and other pack detection; actual connected filter, signed/trust/architecture checks and explicit user consent, no global registry/driver alterations. Real clean/installed VM tests; codec packs do not extend every engine.
- Cross-process LibVLC viewport visibility, DPI, monitor/resize, seek/subtitle and fallback. MFPlay experimental; modern presentation only after real tests. GPU/software policy and actual decoder evidence, HDR only if display verified. Preserve unsupported/partial labels.

Gate P3: MKV HEVC/multi-track, H.264/AAC, WebM, decoded/visible and audible where hardware available; no claims of complete backend parity.

### P4 — Υπότιτλοι και συγχρονισμός (UMP 23C)

- Reuse existing OpenSubtitles/SubDL, ZIP/RAR and season batch, language detection, adjacent SRT and cue editor. Validate authenticated live providers, Greek UTF-8/1253/UTF-16, safe archives incl. compressed RAR/RAR5, episode/hash ranking and manual ambiguity review, cooldown/cancel.
- Real displayed external/embedded text and bitmap where backend supports it; ASS styles, PGS/VobSub explicit partial/unsupported status; signed delay, FPS/stretch, seek/replay, editor dirty state, sync preview and duplicate-safe export.
- No second provider pipeline or parallel subtitle rendering; no automated challenge bypass. Offline core remains functional.

Gate P4: real cue rendering/timing, malformed inputs, cancellation, provider and archive fixtures; distinguish live credentials and visual tests from CI acceptance.

### P5 — Native DSP και ποιότητα ήχου (UMP 23D)

- Preserve current Web Audio and existing original C++ DSP / experimental AudioWorklet. Measure neutral/active/bypass/mute, crossfade, interrupted re-enable, channel isolation, headroom/limiter, sample-rate changes, no clicks/double DSP; offline and video parity or explicit limitations. Individual EQ bands only if proven useful and stable.
- Single routing authority native/web/external bypass; existing FxSound/Equalizer APO compatibility remains read-only, no automatic driver install, kill or endpoint changes. Test Bluetooth/HDMI/device changes and real physical audio where available.
- Real-time code no allocations/locks/disk/IPC, bounded buffers, smoothing, finite PCM; actual CPU/latency/dropout measurements. Optional advanced EQ/device profiles after P0/P1. System-wide APO excluded from core release (P9), no unsigned deployment or security weakening.

Gate P5: actual signal/reference tests and route exclusivity; production native route only when validated; developer-only assets remain excluded otherwise.

### P6 — Μετατροπές αρχείων και φωτογραφίες (UMP 23E)

- Reuse existing audio/video queue and photo editor. Explicit jobs continue regardless of navigation; bounded PCM/pixel/queue, cancellation, progress, actual encoder selection, source preservation, safe atomic publication and no overwrites, collision/filesystem compatibility. Metadata/selected tracks, remux vs re-encode, recovery/cleanup.
- Non-destructive recipe and undo/redo, large-file/worker/tiled feasibility, EXIF orientation, ICC/alpha and metadata privacy, before/after, preview/export parity. Reuse existing masks/curves/HSL if present; remaining advanced tools are conditional P9.

Gate P6: actual exports and format/quality/alpha fixtures, cancellation and mixed-mode tests; originals untouched.

### P7 — OpsisUI, Windows, plugins και χρηστικότητα (UMP 24A–24C)

- Runtime control audit and owner tab, existing 92-route feature finder, visible controls, context help, prerequisites/disabled reasons; search navigates, never executes. No duplicate switches or configuration.
- Resource panel on demand: active/parked/on-demand/failed, explicit jobs and cancel, read-only process metrics only while open, no permanent monitor. Confirm dirty edits before release. Optional startup tab preference without autoplay.
- Complete EL/EN and 20-language UI/help/welcome/history, keyboard/focus, high contrast/reduced motion, 100/150/200% DPI, narrow windows, glass/readability. OpsisUI 6 only after actual access/contract validation (prior 404), no unverified shared repo edits.
- Plugin .NET contract 1.0.0.0; installed Opsis host, discovery/handshake/uninstall, no duplicate instance/routing; Crawler M3U and Windows media controls. Audit separate PR #1 for overlaps before cherry-pick/integration; no automatic merge.

Gate P7: actual runtime control coverage, installed host compatibility, UI and accessibility matrix, documented limitations.

### P8 — Release Candidate, Inno Setup και τελική 3.0.0 (UMP 26A–26C, release blocker)

- Freeze candidate SHA, all mandatory suites same SHA: general, installer, DSP/native/worklet, public subtitle/RAR, K-Lite, plugin, packaged. Windows 10/11 x64, second free/authorized Windows VM if accessible; physical GPU/audio cannot be inferred. No unverified direct merge.
- Inno Setup only, existing AppId and legacy NSIS migration only. Actual .iss install, authentic 2.4.2 upgrade, repair/uninstall/reinstall, profile retention, rollback, owned cleanup. Version/help/history/splash/plugin, SHA256/SBOM/licenses/security. Signing only if authorized and feasible; no false signed claim. Earlier synthetic NSIS fixture is not production evidence.
- One canonical source archive, tested installer and optional portable, reproducible build instructions, release notes, artifact hashes and verified downloads. Preserve user data and rollback version. Publish only after mandatory gates; no scope inflation.

Gate P8: same-SHA results, explicit blocked/unsupported hardware and known limitations, user-visible decision for any blocked mandatory check. Final 3.0.0 only after acceptance.

### P9 — Προαιρετικές προηγμένες δυνατότητες (3.1+ ή ξεχωριστά add-ons)

- Review overlap, user value, licensing/security/resource cost before implementation: photo masks/healing/advanced batch/RAW/HEIC, HDR, advanced codec paths, library interoperability, casting/DLNA, waveform/spectrogram/ABX, optional offline STT/OCR, VST3 and ARM64. No blanket parity or dependency installation.
- System-wide DSP/APO only with validated supported zero-cost signed deployment, explicit opt-in/rollback and physical devices; no Secure Boot/HVCI/signature enforcement changes, registry hacks, capture/replay loop or copied AGPL code. If unavailable, BLOCKED; core media-local DSP remains independent. No core release blocker.
- Optional lightweight plugin SDK, network permissions and isolated processing; no arbitrary script execution. No new feature activates by default if it consumes resources.

Gate P9: separate scope decision, feasibility/license/security, actual hardware and resource evidence; unfinished items disabled or deferred.

## 3. Επόμενο πρακτικό pass

| Pass | Εργασία | Προϋπόθεση εξόδου |
|---|---|---|
| UMP 21A | P1 baseline CI + P0 lifecycle inventory, inspect long soaks and repair failures | Exact SHA, actual results; no pending/cancelled as pass |
| UMP 21B | P0 service ownership, leases, simultaneous user jobs, DSP/native stop | Real park/resume and mixed-mode tests |
| UMP 21C | P1 security, shutdown, data retention and conflict audit | Green targeted tests, freeze baseline |
| UMP 22A–22D | P0 remaining lazy modules, bounded caches and measured resource/soak gates | Candidate 1h and documented hardware limitations |
| UMP 23A–23E | P2 music/metadata; P3 playback; P4 subtitles; P5 DSP; P6 conversion/photo | Existing feature closure, real fixture and matrix |
| UMP 24A–24C | P7 UI/20 locales, plugin/installed host, resource panel | Runtime inventory and integration |
| UMP 26A–26C | P8 frozen RC and actual Inno Setup release checks | All mandatory same-SHA evidence |
| Post-core | P9 optional features | Separate scope and gates |

## 4. Κανόνες για κάθε Ultra Mega Pass
- Report actual paths/commit, defects discovered vs fixed vs verified, test count and scope, unresolved issues and blocked hardware. No arbitrary percentages or estimated test results.
- Preserve user-selected functionality, data, settings and existing installer. Avoid duplicated controls, code paths, conflicting plugin or OS modifications. Reuse/extend/replace/defer decision per capability.
- Activation only on user use or explicitly selected policy; suspend idle services; safe preservation of work in progress. Explicit simultaneous jobs are not silently blocked/cancelled; coordinate only genuinely exclusive resources. No forced memory trim.
- Separate UI-only checks, real codec/media fixtures, CI metrics and hardware tests. Measure impact rather than infer. Don't count cancelled or pending CI as success.
- Keep one active roadmap and CHANGELOG; historical entries retained below for audit, no redundant progress files. R2 priority order remains in Git history, not a second active plan. No merge or release solely based on planning.

---

## Παράρτημα Α — Αρχειακό αρχικό scope P0–P8 (όχι ενεργή σειρά προτεραιοτήτων)
Οι αρχικές λειτουργικές απαιτήσεις διατηρούνται για να μη χαθεί καμία. Οι αναφορές σε προτεραιότητες εδώ είναι ιστορικές. Τυχόν σύγκρουση επιλύεται βάσει του ενεργού σχεδίου R3 και των ρητών οδηγιών χρήστη.

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

## ULTRA 3C — exact cropped photo readback, cancellable export, exclusive save (2026-11-27)

- Prior 3A general Electron self-test in progress, 3B general CI in progress; no full green claim beyond 2E.
- Full resolution export reads only the integer crop rectangle before filters; original geometry order and full-resolution effect calculations retained, no premature resize. Budget accounts for resident source bitmap plus crop work surfaces. Neutral colour pass skipped; no GPU filter parity claim. Large unrecognised headers remain subject to decoder/bitmap checks.
- Export cancel terminates existing photo worker during processing; checks before/after canvas encoding and before save IPC. Cannot interrupt synchronous browser readback/encoding or revoke an already admitted save. Main save is single-flight, asynchronous, new-file-only, using exclusive same-volume hardlink publication and owned temporary cleanup; existing targets never overwritten. Unsupported filesystem fails closed. Header preflight before full IPC allocation; shutdown includes image I/O.
- Tests: exact cropped/full pixel parity with geometry and filters, budget for small crop of large source, existing destination protection and temp cleanup. Guide 97 entries, new CI pending. No new GPU benchmark or release/merge.

## ULTRA 3B — pipe-based audio conversion and explicit encoder policy (2026-11-27)

- Prior 3A general and installer CI still running at inspection; DSP and RAR workflows PASS. Last complete baseline remains 2E.
- Processed WAV already in memory is streamed by bounded 64 KiB views into FFmpeg pipe:0; no intermediate WAV disk write for non-WAV outputs. WAV export uses async exclusive write and checks cancellation before publication. Shared existing run registry, source approval and atomic publication retained. Cancellation checked between renderer decode/encode phases, during main preparation and before final publication. No global process kill.
- Auto GPU-first with CPU fallback remains default; strict CPU-only and GPU-only user choices added. Explicit two-pass selects capable encoders only, no silent one-pass substitution. Encoder detection cache includes binary file size/mtime. Timeout and publication failure not retried as hardware fallback. No guarantee of available hardware or speed on physical GPU.
- Hidden video preview stops before thumbnail launch after in-flight probe; resumes without re-probing known info. Existing audio/video job concurrency remains unchanged. Tests for pipe encoding, cancellation before WAV publication and strict encoder choice added. New CI pending; predecode scratch and actual SSD/GPU benchmarks remain open. No release/merge.

## ULTRA 3A — selective video DSP and on-demand FxSound detection (2026-11-27)

- Frozen 2E head `d04d85f449e07a84155907f45e213484330bee9f`: all nine workflows PASS, general 46071056272 298/298, real Electron SELF-TEST PASSED. Five samples startup CPU 0.11% / 535427.2 KiB summed working set, post-soak 0.04% / 564650.4 KiB; not a controlled benchmark.
- Chromium video uses existing shared RouteGate dry/web. EQ/bass/presence/balance processors created only for selected nonneutral supported settings, smoothly bypassed and released after 80ms, or immediately if suspended. MediaElementSource remains in a minimal dry graph until source replacement (cannot detach/recreate it safely). Pause/ended/native handoff suspend context, resume on play. Music EQ/bass changes propagate to video even without live music AudioContext.
- FxSound registry/process/device discovery now only on Enhance tab or explicit auto mode, no native-mode startup scan, coalesced request, no redundant route writes. No change to OS devices, external software or offline export, no claim of actual external DSP proof. Video effect subset remains explicit; native playback and offline parity still pending.
- Added pure config and real Electron branch allocation/external bypass release tests; new CI pending. No release/merge.

## ULTRA 2E — bounded subtitle audio analysis and native handoff safety (2026-11-27)

- Prior 2C general CI 46070309790 PASS and seven specialist workflows PASS; installer pending. Prior 2D still running. No new full green claim.
- Subtitle audio analysis now streams 100ms PCM frames into bounded compact energy storage, no full PCM concatenation. Same activity formula, single partial frame, explicit byte cap. Cancellation during scoring via SharedArrayBuffer atomic flag; FFmpeg cancellation waits for close or reports unconfirmed after four seconds. No physical RAM benchmark yet; worker timeout and child failure limitations retained.
- Chromium resume (click, keyboard, replay, failed native open) uses common stop-ack gate; no fallback resume on unconfirmed native stop. Independent converter/photo tasks unaffected. Explicit codec inventory refresh bypasses TTL but shares in-flight scan, read-only; registry presence is not decoder proof.
- Added chunk-boundary parity, memory-bound and cancellation tests. New CI pending; physical backend/audio and provider credentials still open. No merge/release.

## ULTRA 2D — bounded folder library, duplicate review and subtitle preference (2026-11-27)

- Prior 2B general CI 46070110308 PASS; 2C seven specialist workflows PASS, general/installer still in progress at inspection. No full 2C certification.
- On-demand explicit local folder scan (2000 files, 20000 examined entries, eight directory levels), no watcher, no automatic playback, no file mutation, skip symlinks and duplicate paths on import. Existing playlist/serial metadata scan reused. Duplicate path filter is review-only; no destructive deduplication. Added guide entries (96 total), package inclusion and bounded scanner fixture.
- Preferred sidecar language selector (next media open) shared by renderer and admission ranking; default Greek/English, optional French/German/Italian/Spanish. Revision guards invalidate delayed automatic sync result after manual delay/FPS/cancel. No second subtitle pipeline.
- New CI pending. WMA writing, broader unsupported container layouts, real online credentials, native codec/audio parity and full library smart collections remain open. No merge or release.

## ULTRA 2C — conservative M4A, Ogg Vorbis and Opus metadata (2026-11-27)

- Prior 2B CI still running; no new green aggregate claim. RAR and DSP specialist runs passed at inspection.
- Extend existing transactional tag writer to single-page Ogg Vorbis/Opus comment layouts: validate first two Ogg pages and CRC, preserve remaining laces/setup/audio bytes, recalculate only modified page CRC. Refuse spanning comments, oversized page, malformed headers; optional local cover only if it fits. No remux/re-encode.
- M4A supports conventional moov-last, nonfragmented iTunes metadata with existing udta/meta/ilst and mdir handler; preserve all bytes before moov including mdat and offsets; preserve other atoms, append only missing supported fields and cover. No lyricist mapping for M4A; faststart/fragmented/unsupported layouts refused. No WMA write support yet.
- UI uses same metadata IPC/dialog and guide; fingerprint remains MP3/FLAC. New real FFmpeg tests compare original backup, unchanged encoded payload region, exact decoded PCM, parsed tags and cover, and reject faststart. CI pending; no claim of general format compatibility, online provider credentials or full codec parity. No merge/release.

## ULTRA 2B — conservative WAV metadata, playlist filtering, CI repair (2026-11-27)

- Prior 2A CI 46069429270: 288 passed, one failed because distinct release labels shared the same fixture ID. Correct fixture uses distinct release IDs; production deduplication remains. Real MP3/FLAC cover test passed. Seven specialist workflows PASS, installer pending. ULTRA 1 general CI PASS.
- Existing tag transaction extended to RIFF WAV with exactly one fmt/data and no existing ID3: append text/cover, preserve original chunks byte-for-byte, update RIFF size, verify hash and parsed fields, retain backup. Reject malformed RIFF/RF64/existing ID3. Fingerprint remains MP3/FLAC. Real WAV fixture added, CI pending. M4A/Ogg/Opus/WMA remain read-only.
- Playlist search accent-insensitive over title/artist/album/filename, original order unchanged; no duplicate library or background index. Guide now 94 entries. Default Greek/English sibling subtitle priority before eight-file cap. No full codec parity or actual online provider certification. No release/merge.

## ULTRA 2A — local cover metadata, cancellation and provider robustness (2026-11-27)

- Prior 21C/22A and ULTRA 1 CI still running at inspection; no new green aggregate claim.
- Extend existing lossless MP3 ID3 APIC / FLAC PICTURE implementation, local JPEG/PNG only (2 MiB, 4096 px, 16 MP); validate dimensions and decode in native dialog path; no replace of existing cover, no re-encode, exact payload hash and read-back picture verification, original backup. Explicit file and image selection and confirmation; no network upload. Reuse existing metadata IPC and guide (93 entries). Real MP3/FLAC cover fixtures and cancellation tests added.
- Cancellation checks before online transmission/selection/write and while streaming copy, before replacement; close cancels, read paths use existing local path policy and 512 MiB bound. Atomic rename already underway cannot be undone by cancellation; backup may be retained after cancellation.
- Online candidate parser rejects malformed rows and duplicate recording/release identities; separate release IDs retained. Native video handoff rejects stale generation. Existing subtitle and codec functionality preserved; larger P3/P4 and new format gates still open. No real provider credentials, no M4A/Ogg/Opus writer or full native parity claim. New CI pending.

## ULTRA 1 — shared shutdown and bounded resource trends (2026-11-27)

- Prior head `6333d4836635b13cfc5bf4e2e887717236b7aef2`: RAR, AudioWorklet and plugin CI PASS at inspection, other six pending; 21B.2 remains last complete 9/9. No pending runs counted as green.
- Existing converter graceful quit barrier now also waits (within same four-second deadline) for native video, native DSP, subtitle worker/embedded/provider/batch activity. Media IPC admission closes on before-quit and delayed media authorization cannot grant after shutdown. No second quit coordinator, no termination of external user processes. Deadline is not proof every process exited; worker FFmpeg kill confirmation and all nonregistered auxiliaries remain open.
- Resource diagnostics expose platform-dependent Electron private bytes only when all valid rows have the field; unknown remains unavailable. Test-only 15s sampling during real soak, cap 300 snapshots, robust first/last window medians for working set, private bytes and Electron process count; short runs with fewer than six samples report insufficient evidence. No new production polling, GPU/SSD or physical RAM claims.
- Two unit tests for missing values and robust trend. New CI pending; one-hour candidate, eight-hour hardware, true process-tree private bytes/handle and disk/GPU trends remain open. No release/merge.

## 21C + 22A — integrated stability, selective resource release and independent jobs (2026-11-27)

- Frozen 21B.2 head `6bfd202eaa51bdc709618286f7dc8f3e15520995`: nine of nine CI workflows passed; 46067019821 general 284/284, real Electron PASS, six live ownership checks and keyboard native park passed. Installer 46067019763 PASS. 21A 9/9; 21B.1 six PASS and three cancelled by subsequent commit (not failures). Five-sample 21B.2 startup CPU 0.08%, working set 523680.8 KiB; post-short-soak 0.05% / 563442.4 KiB. No controlled savings claim.
- Consolidated lazy loader: one promise per group, preserve successfully loaded prefix on retry, remove failed script tag, report visible tab load errors; converter uses same loader. Three regression assertions for dedup/retry/cache.
- Native open failure requests and awaits stop ACK before fallback. Loudness queue skips paused source and cannot apply stale results when normalization disabled.
- Photo hidden canvas releases reconstructible rendered surface while retaining source bitmap, preview pixels and edits; render rebuilt when visible. Subtitle batch UI status stops polling when hidden but explicit batch continues; converter preview UI stops hidden renders and resumes on visibility.
- Video converter takes synchronous preparation lock, immutable destination/options, blocks queue mutations/double start, clears cancelled state, shares encoder refresh and always recovers controls. Both converter cards defer language rebuild until both queues idle, preventing loss of active controls. No cross-tool cancellation.
- Added real photo park/restore checks, real audio + FFmpeg conversion with tab changes and decode verification, real video queue double-start/language switch and output decode. New CI pending. Physical native audio timing, long candidate soak, private bytes/handle trend, security and remaining P2–P8 gates still open. No version release or merge. Batch compatible fixes in one commit; use targeted evidence, avoid redundant passes.

## 21B.2 — mutually exclusive live-source ownership (2026-11-27)

- Prior 21A general run 46066296150 passed 282/282, real Electron and new DSP/transport assertions. Five-sample startup CPU 0.08%, working set 533505.6 KiB; post-short-soak 0.05% / 580451.2 KiB. Eight of nine workflows passed; installer 46066296253 was still running. 21B.1 initially four specialist workflows passed, five pending.
- Existing AudioEngine gains a scoped live-start generation gate, only for music/resume/microphone/test tone. Wait for actual native-close acknowledgment, newest request wins, Stop/Pause/new video intent cancels deferred start, removed playlist item/source change invalidates request. No new AudioContext allocation until actual start; no native stop uses synchronous fast path. Timeout denies live start with explicit error.
- Video renderer keeps unconfirmed stop sticky until successful retry, awaits previous native stop before Chromium open as well as native handoff, and requests actual child cleanup after terminal poll. Native sound ownership is announced before launching the host, not only after ready. Selected parked state retained for failed resume. No new permanent polling or background service.
- Six renderer gate assertions cover pending, latest wins, cancellation, failure, stale item and fast path. Controlled promises are not physical active-native playback proof; mixed-mode conversion/photo tests and physical audio timing remain open. No changes to converter/photo/metadata ownership, no release/merge. New CI pending.

## 21B.1 — native process ownership and parked controls (2026-11-27)

- Prior head `238c870e709f26c5c43b6116a0b7d4aa1029b544`: at inspection RAR, DSP, worklet, native, plugin, K-Lite and packaged candidate workflows passed. General 46066296150 and Inno lifecycle 46066296253 still running; do not mark as passed.
- Native host stop now returns a bounded acknowledgement on actual child close (four-second timeout returns false). Repeated stop shares in-flight operation; epoch still invalidates outstanding authorization and stale events; IPC no longer reports success immediately after requesting kill. No OS-wide process kill. Before-quit still requests termination; no claim of forced-crash recovery.
- Renderer retains the in-flight stop acknowledgement and waits before opening another native host; stale generation/handoff checks prevent superseded opens; exposes nativeStopping through existing diagnostics. Park preserves selection/subtitles/FX, keyboard Space resumes parked video and Stop resets parked position. Existing explicit conversion/photo tasks unaffected (no changes to their scheduling).
- Tests: real Node child close, timeout/listener cleanup, real renderer parked keyboard resume and idle native stop IPC. Real active LibVLC/LAV close through the full IPC path and simultaneous music + video stop timing are not yet certified. Music can still start while the old native child is closing; next slice must safely coordinate live source handoff without blocking unrelated user jobs. No new resource manager or release. New CI pending.

## 21A — Baseline reconciliation and lifecycle audit (2026-11-27)

- Frozen R3 baseline `b4c526d0e1703959d102cbbe32f6b1ee89532cb6`: all nine PR workflows completed successfully (general 46007823118, DSP 46007823140, AudioWorklet 46007823108, native 46007823064, plugin 46007823195, RAR 46007823116, K-Lite 46007823315, packaged 46007823237, installer 46007823121). General logs: 282/282, real Electron SELF-TEST PASSED, 20-cycle soak; startup idle 0.09% CPU/529877.6 KiB mean summed Electron working set, post-soak 0.49%/555908 KiB (five samples each, not physical hardware or private bytes).
- 20B.13/14 general 46006371203 and 46006791066 succeeded; real Inno lifecycle 46006791051 succeeded. Three prior hour soaks 46002506246 / 46002997615 / 46003581420 completed with 1200 audio/tab cycles and final cleanup PASS each; startup mean working set 537370.4 / 541096.8 / 540621.6 KiB, post-soak 251079.2 / 245939.2 / 252552.8 KiB. Post-soak CPU 1.91 / 1.77 / 1.23% (five samples each); cannot certify five-minute ≤1% or private bytes, handle slope, native children, mixed-mode or eight-hour stability. These are separate historical runs, not a single three-hour soak or a test of the new code.
- Lifecycle inventory from renderer/app.js: cold AudioContext, parked video, lazy video/photo/converter modules, selected effects, visibility-driven visualizer, metadata queue and explicit sleep timer already exist. Preserve existing settings and owners; do not introduce a parallel scheduler. Remaining always-running player position interval removed in favor of active-slot media events, tab/visibility/audio-activity updates. Idle or inactive Player performs no periodic transport polling; paused seek and source switch refresh supported.
- DSP audit fixes: tone branch closures use current audio clock per parameter change rather than creation-time clock; repeated inactive compressor/reverb/exciter sync no longer postpones disposal. Suspended context can release immediately. Added controlled release-deadline and suspended-disposal self-test, inactive player transport and visible tab return assertions in real soak.
- New candidate CI pending; no measured CPU/RAM saving attributed to this patch. Native shutdown ACK, parallel user jobs, cross-process resource measurement, full 1h on new candidate and physical 8h remain P0/P1. No release or merge. Next 21B after CI, ownership of asynchronous native sessions and explicit independent jobs.


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

