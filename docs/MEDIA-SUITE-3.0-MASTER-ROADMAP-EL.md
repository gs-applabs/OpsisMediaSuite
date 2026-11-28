# OPSIS Media Suite 3.0.0 — Ενιαίο Master Roadmap

Αναθεώρηση R6 / R5-AUDIT • 28 Νοεμβρίου 2026 • Draft PR #3 • βάση κώδικα `0c9e15bef830beb144844eea3b2875d66455cb89`
Στόχος: ασφαλές, αποδοτικό και ολοκληρωμένο 3.0.0 για Windows 10/11 x64, με Inno Setup και συμβατότητα plugin 1.0.0.0. Το master παραμένει 2.4.2 μέχρι την εγκεκριμένη έκδοση.
R6 υπερισχύει στη σειρά εργασιών, R5-AUDIT στην πύλη ελέγχου, χωρίς να επανεκκινούν υλοποιημένες εργασίες. Το παρόν αρχείο είναι το μοναδικό ενεργό σχέδιο προτεραιοτήτων. Το παλαιό σχέδιο και το ιστορικό παραμένουν στο τέλος ως αρχείο αναφοράς, όχι ως δεύτερη ουρά υλοποίησης.

## R6 — ΟΛΕΣ οι εκκρεμότητες, από τις εύκολες στις δύσκολες (δεσμευτική οδηγία χρήστη)

**«Εκκρεμότητες» = το σύνολο, χωρίς εξαιρέσεις:** σφάλματα, διορθώσεις, βελτιώσεις, ημιτελείς ενσωματώσεις, διπλότυπα/αλληλοκαλύψεις, νέες δυνατότητες, παλιές απαιτήσεις, UI/μεταφράσεις/Help, tests, ασφάλεια, απόδοση, συμβατότητα, builds/installer/παραδοτέα, blocked και optional/deferred scope. Σε κάθε ερώτηση για εκκρεμότητες παρουσιάζεται όλο το μητρώο κατά κατηγορία και κατάσταση, όχι μόνο το τρέχον pass. Οι R5-AUDIT, R4, P0–P9 και παραρτήματα παραμένουν αναλυτικές απαιτήσεις· κανένα στοιχείο δεν διαγράφεται χωρίς τεκμηριωμένο κλείσιμο. Οι παρακάτω ομάδες είναι ενιαίος δείκτης προς αυτά, όχι δεύτερη ουρά με διπλά tasks.

Προτεραιότητα: αποτυχημένο CI/κίνδυνος ασφάλειας ή απώλειας δεδομένων πρώτα· στη συνέχεια εύκολες προς δύσκολες εργασίες, με προτεραιότητα στην ολοκλήρωση των μερικώς υλοποιημένων λειτουργιών πριν από νέες δυνατότητες, με σεβασμό στις εξαρτήσεις. Οι υπόλοιπες ομάδες 01–16 παραμένουν στο scope. Οι έλεγχοι που είναι αναγκαίοι για ασφαλή συνέχεια γίνονται ανά αλλαγή, η εξαντλητική πιστοποίηση στο τέλος σε frozen SHA. Κανένα merge/release μόνο επειδή ολοκληρώθηκαν κώδικας ή μεμονωμένα tests.

| Σειρά / ID | Όλες οι ομάδες εκκρεμοτήτων (ανοιχτές μέχρι τεκμηρίωση κλεισίματος) | Αναφορές / acceptance |
|---|---|---|
| 01 | Ενεργές αποτυχίες CI, προηγούμενες διορθώσεις που δεν πιστοποιήθηκαν, ακριβής απογραφή head/branches/PR και έλεγχος δέσμης | P1, R5-AUDIT, OV-01–25· CI ανά SHA, όχι εκτίμηση |
| 02 | Μικρές διορθώσεις: κοινή ταυτότητα διαδρομής, διπλά controls/listeners, ελληνικά tags, encoding, FFmpeg discovery, guide/Help entries, έλεγχος νέων settings στο Backup | OV-03/05/07/08/10/14/18/22· reuse, targeted tests· μερικά ήδη υλοποιημένα, όχι επανάληψη |
| 03 | Ενοποίηση IPC/path/media types, renderer origin, ασφαλής εγγραφή/stores/recovery, malformed inputs, cancellation και παλιές security fixes | OV-04/05/13/14/19/25, P1· διατήρηση αυστηρότερων contracts, test migration |
| 04 | Photo EXIF ημερομηνία opt-in, προσανατολισμός, ICC/alpha/GPS privacy, preview/export, collision, non-destructive undo, worker/large files, διασταύρωση παλιού photo helper | OV-11/12, 3F/P6· πραγματικά exports, originals intact |
| 05 | Ενοποίηση κοινής προεπισκόπησης/HTTPS clients, error/cancel/auth/limits, provider registry integration (trusted key/source, artifact contract, rollback, failure detection), Bandcamp και SoundCloud collections, OAuth onboarding, playlist selection/authorized download/metadata και covers/subtitles, queue recovery | OV-06/07/09/10/15, 3D.9A–J· πραγματικές επιτρεπόμενες πηγές, no DRM, explicit blocked if unavailable |
| 06 | Μουσική: metadata preview/undo, WMA και ευρύτερες διατάξεις υπάρχοντος writer, output tags/cover linkage, library indexing, smart collections, album/artist/genre, history, import/export, search/filter, duplicate review, crossfade/gapless, optional lyrics feasibility | 3E/P2, OV-10/11· byte integrity, backup, live MusicBrainz/AcoustID |
| 07 | Video/player: υπόλοιπα shortcuts/mouse/OSD, movie/series info opt-in, safe application exit, chapter/track/metadata preservation, HLS/RTSP/authorized IPTV/reconnect, delay, output device/channels, frame/seek/rate/fullscreen, native/Chromium parity, actual codec/decoder evidence | 3D/P3, OV-01/17/19· ήδη implemented controls audit not duplicate |
| 08 | Υπότιτλοι: OpenSubtitles/SubDL live/auth, ελληνικά fallback links, encoding, compressed RAR/RAR5, ranking/episode/hash, forced/default/SDH, ASS styling/PGS/VobSub/dual language, saved naming, sync/preview/dirty/actual displayed cues | P4, OV-18· real UI and provider fixtures |
| 09 | DSP: native/web/worklet/FxSound exclusive routing, audio/video/export parity, 15/31/parametric feasibility, headphone/device profiles, dialogue/dynamic boost, de-esser/gate, LUFS/headroom/true peak, compressor, latency, Bluetooth/HDMI, physical outputs | P5/3E, OV-16· signal and device tests |
| 10 | Photo advanced: zoom/pan, free crop/straighten/perspective, curves/HSL/dehaze/texture, grading/WB/red-eye, masks/healing/clone, text/watermark/LUT/grain, batch edits/conversion/rename, gallery/albums/slideshow/print/PDF, RAW/DNG/TIFF/HEIC and GPU parity feasibility | 3F/P6/P9· compare existing tools first, explicit feasibility |
| 11 | Desktop and family: reconcile PR1 + build/flyout branches, Windows session/mixer/flyout/volume keys/taskbar/lock/spectrum/monitors, Opsis.UI 6 contract, skins/visualizers/backgrounds/layout/styles, installed Opsis plugin 1.0.0.0, Crawler M3U, Spectrum Sphere metadata, master demo | 4A–C/P7, OV-02/20/23/24· no blind merge, one owner |
| 12 | Whole-app UI/help/history/welcome, 20 locales, control ownership, keyboard/focus/reduced motion/high contrast, DPI, resource panel, pending/dirty state, settings migration, original Waveframe regressions | 4D/P7, OV-22· runtime control matrix |
| 13 | Demand-driven lifecycle/anti-pile-up: leases/epochs/cancel/stop ACK, bounded queue/cache/handles, idle shutdown, independent simultaneous jobs, startup and CPU/RAM/GPU/I/O measurements, same fixture comparisons, 20/120/1200-cycle and 1h/8h/mixed workload | P0, OV-21· no inferred metrics; separate physical tests |
| 14 | Full security/dependencies/license/SBOM, package verification, actual codec pack matrix (K-Lite variants/other packs), Windows 10/11 x64, second authorized free VM if accessible, real display/audio/GPU, all mandatory tests on frozen SHA | P1/P3/P8, 5A–C· blocked explicitly, no false certification |
| 15 | RC 3.0.0 version/help/history/splash/plugin, authentic 2.4.2 migration, Inno Setup repair/uninstall/reinstall/rollback, source archive/portable/hashes/download verification, signing only if authorized/feasible, release acceptance | P8, OV-24· no release before gate |
| 16 | Advanced/conditional scope remains explicitly open: casting/DLNA, system-wide signed DSP/APO, VST3, advanced photo/RAW, HDR, waveform/spectrogram/ABX, optional OCR/STT, x86/ARM64, unprotected optical media, isolated SDK, library interoperability | P9; feasibility/license/security decision, no unsigned workarounds, no premature claim of closure |

**Αναφορά κάθε pass:** κατάσταση κάθε ομάδας 01–16 (ή σύνδεση προς τον ενημερωμένο πλήρη πίνακα αν δεν ζητήθηκε αναλυτικά), ακριβείς αλλαγές/OV-IDs, πραγματικό CI, επόμενο εύκολο μη ολοκληρωμένο βήμα, blockers (credentials, provider policy, hardware, connector limits). Μην παρουσιάζεις ως πλήρες το σύνολο των εκκρεμοτήτων αν υπάρχει μόνο μερική απογραφή. Δεν χρειάζεται νέο plugin για τις τρέχουσες GitHub αλλαγές· αν απαιτηθεί συγκεκριμένη μη διαθέσιμη δυνατότητα, αναζήτησε κατάλληλο connector και ζήτησε μόνο την αναγκαία σύνδεση. Μη δημιουργείς δεύτερο roadmap.

### R6-04.4 / 02.5 / 06.3 — EXIF εξαγωγή WebP, Backup και κοινές μορφές μουσικής (base 84a01951)
- OV-12 EXTEND: existing date-only writer now supports static metadata-free WebP canvas layouts (VP8, VP8L, VP8X/ALPH), adds/updates VP8X EXIF feature bit and RIFF length, preserves compressed chunks, validates dimensions and rejects animation/unknown or existing metadata layouts. Same opt-in UI/token/IPC and no-overwrite publication, no new editor or GPS copying. New synthetic structure tests and actual Chromium encode/tag/redecode pixel comparison in existing selftest; not yet executed. Late EXIF for dropped files beyond first MiB remains open.
- OV-14 FIX: existing backup restore skips unchanged writes, retains rollback of changed settings and regression fixture; no new storage path.
- R6-06 CONSOLIDATE: music folder scan and main file admission/metadata reader share immutable existing seven-format list; no new codec support, no database. Added contract fixture.
- Base 84a01951 2 PASS, 7 running at first inspection; 8ea811a8 6 PASS, packaged cancelled, General/Inno running; f0f2b109 8 PASS, installer running. No tests executed by connector; new CI required. All 16 groups remain open where not certified, no merge/release.

### R6-04.3 / 02.4 — συμπλήρωση EXIF και lifecycle ανοίγματος φωτογραφίας (base 8ea811a8)
- OV-12 EXTEND: existing WebP date parser skips compressed chunks by length with 4096-header / 1 MiB EXIF bounds; picker already transfers the bounded full image, now uses a zero-copy Buffer view to find late EXIF. JPEG/PNG prefix bounds unchanged. Dropped browser File shares existing date-only parser and token store through a trusted, max-1-MiB byte-only IPC; no disk grant or caller path. No new editor, no GPS copying, WebP output and late drop EXIF still open.
- FIX: prevent overlapping photo picker dialogs, block photo close/save/drop while picker is pending, stop drop bubbling into the global music handler; release guards on cancel/error. Existing decoder/export/history unchanged.
- Added parser and IPC regression fixtures for late EXIF, malformed length, bounded view, denied sender/path, valid token, exclusive export and original preservation. Synthetic fixtures, not real decoder/UI certification. Base f0f2b109 8/9 PASS (installer in progress), base 8ea811a8 2/9 PASS at first inspection, seven in progress. New CI pending. All R6 groups remain tracked; no merge/release.

### R6-02.3 / 04.2 / 06.2 — διαδρομές Backup, εισαγωγή μουσικής, ημερομηνία WebP (base f0f2b109)
- OV-14 FIX: existing backup validator incorrectly accepted only forward slash after drive letter, dropping normal Windows output folders during collection and rejecting restore. Accept both separators, reject device/UNC, ADS, controls/DEL and oversized paths; actual file access remains subject to existing main-process grants. Added positive/negative fixtures.
- R6-06 EXTEND: existing music folder scan no longer reports truncation merely because exact capacity was reached; only reports omission after an extra eligible file/entry or depth limit. Bounded cursor traversal replaces repeated queue shifts. Existing cancellation, no-write and symlink policy preserved. Added exact-limit fixtures.
- OV-12 EXTEND: existing bounded date reader accepts complete WebP RIFF EXIF chunk inside first MiB (bare TIFF or Exif prefix), reuses existing opt-in token and JPEG/PNG export, updates guide. WebP output, EXIF beyond prefix and drag/drop date remain open. No GPS copy, new IPC or parallel pipeline. Synthetic fixtures, not a real decoder certification.
- Base f0f2b109: seven successful workflows; General and Inno pending at inspection. No new tests executed in connector; new CI required. Static tree inventory complete (nontruncated); individual source review targeted, not exhaustive. All R6 01–16 remain active and certification/release gates unchanged. No merge/release.

### R6-01.3 / 03.2 — διόρθωση εξαγωγής και συμπλήρωση Backup (base 0e8e669)
- R6-01/OV-11: actual General CI failure at be44cd8 and 0e8e669: redirected path in music-tags.complete during staged cover export. Existing local-media-policy explicitly permits safe Windows 8.3 aliases; use its canonical destination for converter scratch and canonical file for tag writes instead of contradictory string comparison. Preserve symlink/UNC/ADS rejection, enforce same canonical path, inode/device/size/mtime/single-link before replacement. Existing real four-format test keeps raw TEMP input to exercise this regression; new hardlink rejection fixture. Root-cause correction implemented, not yet CI verified.
- OV-14: cross-checked literal persisted keys in current video/audio converter and player, all video/converter keys in allowlist; validate actual JSON boolean and native decoder/repeat values plus literal FX/metadata/destination/notification settings. No new store, unknown keys still excluded, full historical settings/migration and UI import/export tests remain open. Added coverage and negative fixtures.
- Base 0e8e669 7 PASS, General FAIL, installer running at inspection. New CI pending. Prioritize partially implemented features to closure, easy-to-hard after failures. All 16 groups remain open where not independently certified; no merge/release.

### R6-05.5 — εξώφυλλα ανά κομμάτι και πρόσθετες μορφές (base be44cd8)
- OV-11 EXTEND: existing validated cover workflow now permits M4A and Opus extraction as well as MP3/FLAC. Shared format/size policy in vidlib (Opus 40 KiB conservative cap; other formats 2 MiB). Existing writer still refuses unsupported MP4 atom and Ogg page layouts, never bypasses verification. No change to source files.
- Per-item cover choice, inherit batch or explicitly none; paths only retained in current queue, no image cache or persistent setting. Same picker, bounded grants and staged writer; expanded grant cap for 200-item queue. Existing cover never replaced. Online artwork permissions/retrieval remain pending.
- Expanded real extraction fixture to four formats, unit checks for shared policy; base be44cd8 7 PASS/2 running at inspection, new CI pending. No new writer, service or release.

### R6-05.4 — τοπικό εξώφυλλο στην εξαγωγή ήχου (base 35bbf6a)
- OV-11 EXTEND: existing music-tags reader/validator/writer reused; bounded picker grant JPEG/PNG, 2 MiB/4096 px and native decode check; optional same local cover for MP3/FLAC batch, no remote image retrieval. Existing source metadata editor now shares local cover reader.
- Existing converter staging calls verified lossless writer before no-overwrite publication; skip user backup only for internal unpublished output, no IPC flag to skip backups on original files. Preserve existing artwork, fail instead of publishing unverified replacement. Cancellation checked before publish. No new writer or engine.
- Prior 35bbf6a verified 9/9 CI PASS including general, packaged and installer. New real extraction fixture added, new CI pending; full physical/provider validation remains deferred. Cover on other formats, per-item choice and rights-aware online artwork remain open. Guide 128. No release.

### R6-01.2 / 05.3 — διορθώσεις παλινδρόμησης και αντιστοιχισμένα tags (base 1c02e89)
- R6-01 first: base CI 6/9 PASS, General failed previewViewport 100% due signed zero, packaged and installer failed welcome 8 pages/next. Fixed zero clamp and missing path-identity script dependency in splash/help (main page already had it); added static dependency regression. Root cause inferred from source/logs, new CI required. No test disabled.
- OV-09/10 EXTEND: existing selected local-file queue retains bounded title, artist/album only where provider explicitly supplies them (Spotify; other uploader names not assumed to be musicians). Optional off-by-default checkbox only in audio extraction; matched tags visible beside file, independently admitted by main using existing music-tags.clean and fixed keys, emitted via existing FFmpeg output arguments, no source modification or second writer. Explicit tags may replace copied fields even when source tags are omitted. Raw options cannot inject outputTags. No automatic download, no tag credentials persisted, no cover import.
- Guide 127, fixtures added. Remaining cover permissions/integration, format-level tests, full R6 work and final certification open. No merge/release.

### R6-07.2 / 05.2 — native χειρισμοί και πολιτική metadata μετατροπής (base b1f50af)
- OV-17 EXTEND existing nativeCommand queue: native keyboard arrows seek/volume, shift 30 s, Home/End, existing play/mute; only supported commands and finite status, no native engine duplication. Real native window focus/key routing, physical backend and acceptance pending.
- OV-10/09 EXTEND existing FFmpeg video/audio extraction/MKV remux options with explicit sourceMetadata boolean; default historical tag/chapter copying unchanged. Opt-out disables global/stream/chapter automatic mapping (not anonymization, attachments/codec-generated data may remain). No duplicate writer, no source modification, no auto online tag injection. GIF/images unaffected. Existing output writer linkage/cover and format-level real tests still open.
- One guide entry (126 total), targeted fixtures added; final CI/physical validation pending. All R6 groups remain tracked. No merge/release.

### R6-07.1 / 10.2 — ελεύθερη περικοπή και πρόσθετοι χειρισμοί βίντεο (base 30c60e6)
- EXTEND group 10: existing photo crop mode adds independent width/height percent and existing X/Y anchor sliders, same normalized crop, history, preview and full-resolution export path. Preset crops retained, no second geometry pipeline; preview zoom independent. Free crop source-relative before edit rotation, not perspective/straighten.
- EXTEND group 07: inspected existing keyboard shortcuts and media event lifecycle; add Chromium middle-click mute and Home/End seeking for loaded non-parked media using existing handlers and shortcut guard. Existing native controls unchanged; native parity pending. No new listeners outside existing lifecycle.
- Guide entry and targeted fixture added; full UI/CI remains pending. All R6 groups remain tracked, no release.

### R6-06.1 / 10.1 — φίλτρα μουσικής και μεγέθυνση φωτογραφίας (base b656a0d)
- EXTEND group 06: existing metadata:read now exposes bounded genre, existing serial music scan populates it, existing feature-guide search and playlist UI support artist/album/genre collections as view filters, preserving original order, indices, current playback, removal and persistence. No second library/database or player, no automatic tag writes. Up to 1000 distinct displayed groups, unknown bucket; full smart collections/history remain pending.
- EXTEND group 10: existing Photo Editor preview gains 100–300% zoom, bounded pointer/keyboard pan, reset on new/closed image, no new pixel buffers or processing loop, view-only transform independent of original/export/history. Shared pure clamp in photolib; existing visibility gate preserved. Advanced free crop, masks, batch etc remain open.
- 2 new guide destinations, 124 total; unit fixtures added, runtime UI/CI pending. All groups 01–16 remain tracked. No release or merge.

### R6-03.1 — κοινός μηχανισμός ατομικής εγγραφής (base 0d50071)
- OV-13 CONSOLIDATE: old atomic-write.js recovered and extended with exclusive random scratch, fsync, cleanup of owned scratch, regular-file/single-link destination checks before publication. Replaces duplicated state replacement code in suite.js, main.js settings export, provider-compatibility.js. Retains caller-specific sanitization, size checks and provider persistence-before-activation. No change to no-overwrite media output, tag backups or app updater.
- Existing suite state fixed predictable .tmp and accidental overwrite of unrelated scratch. Failure injection regression covers previous state, unrelated scratch, successful replacement and hardlink denial. Single-writer assumption; does not eliminate all concurrent filesystem TOCTOU or guarantee power-loss durability of directory metadata.
- Base 0d50071 six CI PASS, three running. New CI pending; exhaustive tests reserved for final candidate. All R6 groups remain tracked; no merge/release.

### R6-04.1 — opt-in capture-date recovery (base f455363)
- OV-12 EXTEND: recovered old photo-metadata.js, avoids inserting duplicate EXIF when present, bounded JPEG/PNG header scan, date-only export. Existing photo:read returns date and tiny bounded random token; photo:save uses only a valid token, only JPEG/PNG, checks resulting date and max bytes before writing. Existing exclusive no-overwrite publication unchanged.
- Photo UI opt-in off per new document, format-gated, uses existing export job. Drag/drop does not get a date token; WebP unsupported. No GPS/orientation/other EXIF copied by this feature; existing canvas export retained. Added guide entry (122 total), package entry and synthetic date-only tests. Real image decoder/EXIF privacy and full UI acceptance pending. ICC/advanced EXIF still open. No new editor, no merge/release.

### R6-02.2 / 05.1 — κοινός provider transport και preview lifecycle (base 0c06158)
- OV-06 CONSOLIDATE: shared provider-json.js replaces all three repeated HTTPS/JSON transport bodies. Fixed HTTPS origin allowlists per adapter, no redirects, no persistent agents, strict UTF-8/MIME/encoding, size/content-length/deadline/abort. Provider-specific credentials and error codes preserved. Existing suite updater has redirect semantics and music/subtitle use fetch; no blind consolidation with those contracts.
- OV-07 CONSOLIDATE: one main preview consent/controller/cleanup flow, one renderer preview flow; preserve distinct provider validation, no new IPC routes, no new UI controls. Prevent stale response after cancel and serialize preview consent dialogs. Separate independent conversion/download tasks preserved. Added bounded transport tests; exhaustive CI deferred to candidate, existing automatic CI may run.
- Prior 0c06158 4/9 PASS, 5 running when inspected. All 16 R6 groups remain tracked. Actual provider credentials, authorized media sources, trusted update config, physical Windows and final tests remain pending; no claim that all implementation can finish in one hour. No merge/release.

### R6-02.1 — κοινή ταυτότητα διαδρομής και συμπλήρωση guide (base ef14855)
- OV-08 CONSOLIDATE: extracted existing musicPathKey into tiny shared path-identity.js; guide exports same function, vidlib playlist plan and both converters use it for Windows separator/case equality. Preserve video player intentional repeated occurrences and independent audio/video queues. Not a realpath/content identity or new file permission. Regression tests for mixed separator/case, POSIX and URL identity.
- OV-22 EXTEND: 7 existing online controls get EL/EN guide destinations (121 total); no duplicate UI or help engine. Remaining locales/control/runtime verification open. Existing renderer package glob includes shared helper.
- Base ef14855 8/9 CI PASS including General and Packaged; Inno pending. New CI pending. No new provider, no merge/release.

## R5 — υποχρεωτική διασταύρωση κώδικα πριν από κάθε υλοποίηση (28 Νοεμβρίου 2026)

Audit baseline: `9447ded478b6755dec6d249eee971bf608651479` (PR #3, General + Packaged + six other workflows PASS, Inno pending; 8/9 total). Static cross-check of all 134 changed-file names and patch availability (132 textual patch entries; package-lock.json and renderer/app.js lack patch in connector response, app.js separately read), all 9 discovered branches, 3 PRs, targeted source/IPC/package/test inspection. Not an exhaustive line-by-line proof or runtime certification. No blind merge, no release, no deletion.

### Branch reconciliation ledger
| Branch | Ahead / behind active audit SHA | Changed on branch side from merge base | Decision |
|---|---:|---:|---|
| master | 13 / 156 | 46 | Preserve presentation/demo/workflows; actual master advanced after PR base. |
| claude/full-audit | 1 / 187 | 3 | Recheck semantic mitigations; active navigation deny, offline decode, blob revoke and visibility gating already present; do not copy old methods wholesale. |
| claude/hardening | 2 / 169 | 2 | CI lines already present; active m3u.js already uses path.win32.resolve (equivalent with different spacing). Reuse. |
| feat/p0-electron45-candidate | 4 / 148 | 3 | Active Electron 45.5.0; compare dependency/workflow differences before importing. |
| build/opsis-2.4.2-review-installer | 26 / 164 | 74 | Newly prioritized selective reconciliation; see below. |
| codex/flyout-test-download | 23 / 168 | 61 | Overlapping desktop development; reconcile against PR #1 and build branch rather than merge separately. |
| integration/opsis-ui6-design-tokens | 3 / 164 | 3 | PR #2 merged; exact token blob 1514558f1a96905cce7fa98765b9e2980b06b369 matches active, styles.css imports it. No duplicate theme. |
| codex/opsis-media-flyout | PR #1 open | 64 | 27 shared changed files with PR #3. Selective Windows desktop integration only. |
| feat/photo-tools-fxsound-coexistence | active | 134 vs historical PR base | Canonical development branch, package remains 2.4.2 until approved 3.0.0. |

PR1 shared files (27): .github/workflows/ci.yml, .github/workflows/security-scan.yml, CHANGELOG.md, README.md, conv-main.js, installer/OpsisMediaSuite.iss, m3u.js, main.js, media-main.js, package-lock.json, package.json, preload.js, renderer/app.js, renderer/audiolib.js, renderer/backgrounds.js, renderer/help.html, renderer/help.js, renderer/i18n.js, renderer/index.html, renderer/styles.css, renderer/videoplayer.js, renderer/vplib.js, test/audiolib.test.js, test/i18n.test.js, test/photosave.test.js, test/security.test.js, test/videoplayer.test.js. PR1 introduces vp:stream-url and own protocol/range streaming; current media-stream.js + vp:open-source/release-source are canonical unless evidence proves a required gap. PR1 flyout-main/preload, windows-desktop, taskbar/mixer/session features remain selective integration candidates, not current PR3 runtime.

### Real implementation/ownership ledger
| Area | Evidence in active source | Status / next decision |
|---|---|---|
| Main / IPC | main.js initializes conv-main and media-main; preload routes inspected. | Reuse local-media-policy, existing grants and main-frame checks. No extra generic IPC layer until old branch compared. |
| Lazy modules / resources | app.js loadScripts for converter, video, photo; resource-diagnostics.js; visibility guards; exclusive DSP route. | Reuse, extend soak/physical measurements. No second loader or always-on engine. |
| Converter | renderer/converter.js and video.js both use convlib.createQueue; conv-main -> conv-engine/conv-video, one FFmpeg resolver main.js. | Two task-specific queue instances share implementation; not duplicate engine. Reuse for all online media. |
| Video playback / playlists / streaming | media-main.js, media-stream.js, playback-core.js, renderer/videoplayer.js + vplib.js; native-host and codec-inventory. | Existing controls, M3U, subtitle, resume, native and Chromium paths; native parity/real stream/physical codec checks still open. PR1 vp:stream-url must not introduce second streaming path. |
| Audio DSP / FxSound | renderer/audiolib.js, dsp-routing.js, native-dsp-bridge, native-dsp sources and media-main audio IPC. | Preserve explicit exclusive web/dry/worklet routing, no duplicated enhancer. Physical endpoint validation remains. |
| Music tags and lookup | main.js metadata:complete/read/cancel, music-tags.complete/validateCover, music-lookup MusicBrainz/AcoustID, music-library.scanFolder. | MP3, FLAC, WAV, M4A, Ogg Vorbis, Opus already have restricted writer layouts; test/music-tags.test.js contains real preservation/backup fixtures for these and rejects M4A faststart. Do not reimplement writers. WMA, broader layouts, output tags linkage, review/undo are distinct gaps. Local cover MP3/FLAC path exists, no arbitrary online cover write. |
| Photo | media-main photo:pick/read/save, renderer/photo.js/photolib.js/photo-worker.js. | Existing editor/worker/history/export; compare missing advanced features and old photo-metadata capture-date preservation before new metadata work. |
| Suite updater | suite.js createStore/httpGet/downloadVerified, suite-main update IPC. | Existing app updater is not provider updater. Reuse applicable transport/storage primitives only after security contracts checked; do not replace signed provider manifests with plain settings. |
| Online direct download | online-media-download.js -> conv-main IPC -> preload -> video.js addPaths -> existing converter. | Connected and packaged/test-listed; live HTTPS UI acceptance still pending. |
| YouTube/Spotify/oEmbed | youtube-metadata.js, spotify-metadata.js, provider-oembed.js -> conv-main -> preload -> video.js shared selection and local mapping. | Connected metadata preview only, no protected media extraction or provider downloads. Live credentials/API and UI acceptance pending. SoundCloud collection summary only, Bandcamp missing. |
| Provider auto-adaptation | provider-compatibility.js, provider-update-source.js in build.files and npm test; no require/call in main.js, conv-main.js, media-main.js, suite-main.js, preload or inspected renderer entry points. | Library/test only, not a running production feature. Trusted source/key, adapter artifact verification, activation/rollback of actual adapter, integration and failure detection pending. |
| Installer / Opsis.UI | Inno existing installer AppId, package.json 2.4.2, exact imported UI token blob. | Retain Inno and identity, no duplicate installer/theme; final migration and physical DPI checks. |
| Help / feature inventory | renderer/feature-guide.js 114 destinations with vidOnlineAnalyze only; 18 online control IDs in video.js; existing inventory was 19C. | Update inventory here; guide/localization/runtime coverage must be extended rather than build a second help system. |

### Confirmed overlaps, integration gaps and decisions
1. Three provider metadata adapters independently implement HTTPS JSON retrieval, status/MIME/size limits and timeout; provider-update-source and music-lookup also have transport logic. Extract/reuse a single bounded metadata transport only after comparing suite.httpGet and subtitle-provider boundedBody/request contracts; maintain host-specific auth, error mapping, abort, redirect and quota tests. Media streaming/download and signed update transport have different contracts and must not be blindly merged.
2. conv-main has repeated preview lifecycle/dialog/cancel code for three provider entry points; video.js has repeated preview display/reset/busy code. Consolidate common preview orchestration without changing provider-specific capabilities; rename youtubePreview shared controller once, avoid parallel service. Verify rebuilt panels do not leak event listeners or apply stale responses.
3. Path dedup inconsistency: feature-guide.musicPathKey normalizes Windows separators/case; playlistQueuePlan lowercases only and addPaths compares raw path. Reuse one canonical local-path identity rule for music and video queue (keep distinct playlist occurrences intentionally); test slash/case variants, existing queue, path grant and repeat tracks. Do not equate path identity with content identity.
4. Existing music-tags writer supports six audio formats and has preservation tests. 3D.9I must use it or existing FFmpeg output metadata path with user approval, no duplicate tag engine and no silent overwrite. Keep input file untouched; test output format capability, metadata/cover rights and actual bytes.
5. Older build branch contains ten modules confirmed 404 by same path at active SHA: atomic-write.js, audio-tags.js, decode-text.js, ffmpeg-path.js, ipc-trust.js, local-path.js, media-types.js, photo-metadata.js, renderer-protocol.js, renderer/backup.js. Missing filenames do not prove missing functionality. Inspect/reuse semantics: current resolveFfmpegPath/local-media-policy/settings backup and trusted IPC already exist; compare Greek mojibake repair, EXIF capture-date handling, encoding, safe renderer origin and backup allowlist. Preserve stricter current rules, add missing tests. No wholesale copy. Audit old branches before all new features.
6. No duplicate literal IPC declarations observed across inspected main.js, conv-main.js, media-main.js, suite-main.js. This is static pattern inspection, not proof for dynamically registered routes/other branches. All 8 observed online renderer API methods have preload declarations; all 6 online/provider modules packaged and test-listed. Passing General CI is not live-provider acceptance.

### R5-AUDIT — μόνιμο μητρώο διπλοτύπων, αλληλοκαλύψεων και συγκρούσεων

**Δεσμευτική απαίτηση χρήστη:** πλήρης διασταύρωση πριν από κάθε νέα λειτουργία, συμπεριλαμβανομένων λειτουργιών με διαφορετική ονομασία, κώδικα, UI, branch ή plugin που παράγουν το ίδιο αποτέλεσμα ή χρησιμοποιούν ανταγωνιστικά τον ίδιο πόρο. Το παρόν Master Roadmap αποτελεί τη μοναδική πηγή των ευρημάτων και εκκρεμοτήτων. Το HANDOFF είναι δείκτης συνέχειας, όχι δεύτερο μητρώο. Το FEATURE-CONTROL-INVENTORY παραμένει βοηθητική απογραφή UI, όχι ανεξάρτητο roadmap.

#### Κατηγορίες ελέγχου
- D1 — ταυτόσημα αρχεία/blobs, επαναλαμβανόμενα blocks, ίδια imports/dependencies και assets.
- D2 — σημασιολογικά διπλότυπα: διαφορετικά ονόματα με ίδιο αποτέλεσμα, validators, adapters, helpers, parsers, writers, queues.
- D3 — λειτουργικές αλληλοκαλύψεις: διαφορετικά εργαλεία/καρτέλες/ρυθμίσεις για το ίδιο user outcome, κοινά υποσύνολα, διαφορετικές επιλογές με συγκρουόμενη συμπεριφορά.
- D4 — συγκρούσεις runtime: IPC/protocol IDs, DOM IDs, shortcuts, event listeners, timers, workers, subprocesses, audio routes, device ownership, writes, caches, update/install paths.
- D5 — ιστορικές/διακλαδικές αλληλοκαλύψεις: ενεργός κλάδος, master, όλα τα PR/branches, παλαιές διορθώσεις, κοινό Opsis.UI, plugins και εξωτερικοί μηχανισμοί Windows/FxSound.
- D6 — τεκμηρίωση έναντι πραγματικότητας: κώδικας χωρίς call site, IPC χωρίς UI, UI χωρίς handler, package χωρίς test, test χωρίς εκτέλεση, υποσχέσεις roadmap χωρίς κώδικα, παρωχημένο Help/History.

#### Ενιαίο μητρώο λειτουργικών αλληλοκαλύψεων
Κατάσταση στο audit SHA 9447ded, επανέλεγχος κυριολεκτικών IPC στο b0e2115 (μόνο τεκμηρίωση). «Επιβεβαιωμένο» αφορά μόνο το συγκεκριμένο εύρημα, όχι πλήρη πιστοποίηση του υποσυστήματος. Τα IDs μένουν σταθερά· ενημερώνονται εδώ μετά από κάθε pass.

| ID | Περιοχή / υποψήφια αλληλοκάλυψη | Κανονικός ιδιοκτήτης / απόφαση | Κατάσταση |
|---|---|---|---|
| OV-01 | PR1 vp:stream-url έναντι PR3 wfmedia protocol, vp:open-source/release-source | media-main.js + media-stream.js, διατήρηση νεότερων grants/tickets και range tests | Επιβεβαιωμένη διακλαδική αλληλοκάλυψη· επιλεκτική συμφιλίωση εκκρεμεί |
| OV-02 | PR1 desktop flyout / codex/flyout-test-download / build review installer | Ένας desktop host, μία ιδιοκτησία Windows session/mixer/taskbar, bridge προς υπάρχον playback | Επιβεβαιωμένη κοινή περιοχή· σύγκριση δυνατοτήτων εκκρεμεί |
| OV-03 | FFmpeg resolver/install έναντι παλαιού ffmpeg-path.js | main.js resolveFfmpegPath, έλεγχος discovery/validation των παλαιών υποψηφίων | REUSE: active main.js already restricts absolute PATH, validates executable via localPath/-version and verifies downloaded SHA; old ffmpeg-path.js not imported. Further installed-codec tests remain. |
| OV-04 | ipc-trust.js / renderer-protocol.js έναντι υφιστάμενων trusted/fromMain, CSP/navigation και grants | Κοινή πολιτική εμπιστοσύνης, χωρίς χαλάρωση, όχι δεύτερο route registry | Σύγκριση security semantics εκκρεμεί |
| OV-05 | local-path.js / media-types.js έναντι local-media-policy.js και extension sets | Ένας ορισμός αποδοχής ασφαλούς τοπικού αρχείου· διαφορετικές επιτρεπόμενες μορφές ανά εργαλείο | EXTEND: active local-media-policy additionally rejects all ASCII controls/DEL and UNC-style prefixes; regression test added. Extension matrix and shared queue identity still open. |
| OV-06 | Τρεις provider JSON clients, music-lookup, subtitle-provider, suite.httpGet | Ενοποίηση μόνο ισοδύναμων primitives, ειδικά auth/limits/redirect/abort ανά πάροχο | CONSOLIDATE: three provider clients now share bounded HTTPS JSON transport; music-lookup/subtitle/suite different contracts remain separately reviewed. CI pending. |
| OV-07 | Τρεις provider preview handlers και τρία renderer preview flows | conv-main shared controller + video.js κοινή orchestration | CONSOLIDATE: one main preview lifecycle and one renderer orchestration, preserve provider-specific auth/consent/errors. CI pending. |
| OV-08 | Music playlist identity / video converter addPaths / playlistQueuePlan / audio converter / video playlist | Ενιαίο normalization για Windows case/separators όπου είναι local-file identity, διατήρηση intentional occurrences | CONSOLIDATE: common path-identity key now shared by music, playlist plan and both converters; preserve deliberate player repeats; tests added, runtime CI pending. |
| OV-09 | Audio/Video conversion queues, online imports | convlib.createQueue και κοινός FFmpeg engine· χωριστές ενεργές εργασίες επιτρέπονται | Επιβεβαιωμένη επαναχρησιμοποίηση, όχι διπλό engine |
| OV-10 | music-tags / MusicBrainz / AcoustID / online metadata / παλιό audio-tags | Υπάρχων writer και lookup, ανάγνωση/επισκευή ελληνικών tags ως πιθανή συμπλήρωση | EXTEND: music-tags.readTrackText connected to metadata:read and MusicBrainz query; recover strict UTF-8 Greek mojibake in evidenced ID3 fields, never write originals. Ambiguous legacy code pages and output linkage remain open. |
| OV-11 | Εξώφυλλα από metadata, τοπικό JPEG/PNG, μετατροπή και photo tools | music-tags.validateCover/complete, υπάρχον photo export για επεξεργασία· διακριτά δικαιώματα χρήσης | EXTEND: shared bounded local-cover read and writer on unpublished MP3/FLAC/M4A/Opus scratch, batch/per-item/none selection, preserves existing art and originals. M4A/Ogg layout restrictions retained; General CI redirected-path failure corrected in R6-01.3, actual four-format CI and online art remain open. |
| OV-12 | Photo metadata / photo-metadata.js παλιού branch / export | media-main photo:save + photolib/worker· ημερομηνία λήψης και EXIF/GPS policy μετά από έλεγχο | EXTEND: recovered date-only JPEG/PNG EXIF helper, bounded picked-source date grant, opt-in export checkbox, no GPS copying, package/test/guide registered. Runtime/CI pending; drag/drop/WebP date unsupported. |
| OV-13 | atomic-write.js / suite.createStore / provider registry persistence / tag backups / output publish | Κοινές primitives μόνο αν ίδια guarantees, ξεχωριστή πολιτική overwrite/rollback ανά δεδομένα | CONSOLIDATE: atomic-write recovered, stronger exclusive temp/fsync/rename contract shared by suite store, settings export and provider registry. Photo/converter no-overwrite contract retained separately; other output/recovery audits open. |
| OV-14 | Settings export/import έναντι renderer/backup.js παλαιού branch | Υπάρχον settings IPC + έλεγχος allowlist/restore, migration | CONSOLIDATE: shared sanitizer and rollback; current literal video/converter key coverage checked and enum/boolean validation extended in R6-03.2. Remaining whole-app migration/runtime certification pending. |
| OV-15 | Suite updater έναντι provider updater και dependency installer | suite.js για app updates, provider-compatibility/update-source για υπογεγραμμένο μητρώο· όχι δεύτερος app updater | Διακριτά contracts· transport overlap προς έλεγχο, provider updater μη συνδεδεμένος |
| OV-16 | Web Audio / native DSP / AudioWorklet / FxSound / video audio / Windows mixer | dsp-routing, audiolib, native bridge και σαφής ιδιοκτήτης ανά session/device | Έλεγχος αποκλειστικότητας και φυσικών endpoints εκκρεμεί· επιτρεπτή παράλληλη ανεξάρτητη εργασία |
| OV-17 | Chromium/native video, codec packs, player controls, sleep/shortcuts | playback-core, native-host, media-main και υπάρχον player UI· ίδιο control contract, engine-specific capabilities | Σκόπιμη εναλλακτική engine, όχι αυτόματη διαγραφή· parity/ownership tests |
| OV-18 | Subtitle parsers/providers/download/archive/sync και παλιό decode-text.js | Υπάρχον subtitle pipeline, σύγκριση encoding helpers· όχι δεύτερος subtitle manager | REUSE: media-main.decodeText already covers UTF-8 BOM, UTF-16LE/BE and Windows-1253; old decode-text.js adds no coverage. Other parser/format/live tests remain. |
| OV-19 | M3U import/export και hardening branch | m3u.js και υφιστάμενο path.win32.resolve | Επιβεβαιωμένη σημασιολογική κάλυψη παλιάς διόρθωσης· reuse |
| OV-20 | Theme/skins/visualizer/backgrounds και Opsis.UI 6 | Ήδη εισαγμένο ακριβές token blob + υπάρχον theme engine | Επιβεβαιωμένο blob· όχι δεύτερο theme engine· φυσικό UI/DPI προς έλεγχο |
| OV-21 | Lazy loader, preview cache, resource timers και παλιές audit διορθώσεις | app.js loadScripts, resource-diagnostics, visibility gating, υπάρχον bounded cache | Μερική επιβεβαιωμένη κάλυψη· soak, listener counts, cancellation |
| OV-22 | Help / Feature Guide / inventory / localization | renderer/feature-guide.js και i18n.js, υπάρχον inventory ως evidence | EXTEND: 7 added direct guide destinations (8 online total, 121 overall), EL/EN; remaining control/locales/runtime verification pending. |
| OV-23 | Opsis host / plugin / desktop visualizer / Crawler | Υφιστάμενο plugin contract, μία ιδιοκτησία playback/IPC, έλεγχος εγκατεστημένων plugins | Διασυστημική αλληλοκάλυψη προς διασταύρωση |
| OV-24 | Installer variants, old AppId, PR1 installer, master showcase | Υφιστάμενο Inno Setup και identity/migration, διατήρηση master demo | Καμία νέα τεχνολογία installer· selective merge/CI |
| OV-25 | IPC registrations σε main.js, conv-main.js, media-main.js, suite-main.js | Υφιστάμενες μοναδικές routes και preload | 112 literal registrations στο b0e2115, 0 duplicate channel names στο συγκεκριμένο σύνολο· δυναμικά/άλλα branches όχι πιστοποιημένα |

#### Υποχρεωτική πύλη κάθε MEGA PASS (πριν από αλλαγές και πριν από παράδοση)
1. Ανάκτηση πραγματικού head SHA και σχετικού baseline, ανανέωση απογραφής branches/PR/αρχειοθετημένων εργασιών. Αναζήτηση ονομάτων, aliases, σκοπού, outputs, UI labels, IPC, tests και callers. Έλεγχος manifest/package, native helpers και plugins όπου αφορούν τη λειτουργία.
2. Έλεγχος D1–D6: ακριβή hashes/κανονικοποιημένα blocks, ομοιότητα και σημασιολογική ανάλυση, UI/function matrix, εξάρτηση/call graph και lifecycle. Αναφορά του scope και των μη διαθέσιμων αρχείων, όχι ισχυρισμός πλήρους σάρωσης χωρίς πρόσβαση.
3. Αντιστοίχιση κάθε νέας εργασίας σε OV-ID ή νέο μοναδικό ID εδώ. Καταγραφή αρχείων και συμβόλων, υπάρχοντος owner, overlap scope, απόφασης REUSE / EXTEND / CONSOLIDATE / REPLACE / KEEP-SEPARATE / DEFER, αιτιολόγησης και acceptance tests. Διάκριση ακριβούς διπλοτύπου από σκόπιμη παράλληλη λειτουργία ή fallback.
4. Προτεραιότητα στην επέκταση/ενοποίηση υπάρχοντος owner. Καμία δεύτερη υπηρεσία, engine, installer, queue implementation, updater ή UI ρύθμιση για το ίδιο αποτέλεσμα χωρίς τεκμηριωμένη ανάγκη. Αφαίρεση παλιού κώδικα μόνο μετά από έλεγχο callers, settings migration, regression και διατήρηση ιστορικού. Όχι διαγραφή δεδομένων χρήστη ή απενεργοποίηση ανεξάρτητων εργασιών.
5. Τελικός έλεγχος νέου diff για διπλότυπα/σύγκρουση, επιβεβαίωση packaging/IPC/UI/caller και πραγματικής συμπεριφοράς, στοχευμένα regression tests, CI ανά SHA, έλεγχος idle και ταυτόχρονης χρήσης. Ενημέρωση OV-ID με evidence: VERIFIED STATIC / CONNECTED / TESTED / LIVE VERIFIED / BLOCKED. Μη συγχέεται ο κώδικας με πιστοποιημένη λειτουργία.
6. Τελική παράδοση μόνο με ακριβή commit, τι αφαιρέθηκε/ενοποιήθηκε/διατηρήθηκε, τι έμεινε ανοιχτό και γιατί. Ενημέρωση **του ίδιου κύριου MD**, όχι νέο παράλληλο αρχείο ελέγχου. Το επόμενο session διαβάζει πρώτα R5-AUDIT και επιλέγει μόνο μη ολοκληρωμένες εργασίες.

**Όριο παρόντος ελέγχου:** η απογραφή καλύπτει τους 9 εντοπισμένους κλάδους, 3 PRs, 134 changed-file paths στο PR3 και τις στοχευμένες διασταυρώσεις που καταγράφηκαν παραπάνω. Δεν εκτελέστηκε πλήρης AST/clone scanner σε ολόκληρο checkout ή πλήρης runtime/physical-device audit. Οι υποψήφιες αλληλοκαλύψεις δεν θεωρούνται αποδεδειγμένα διπλότυπα μέχρι τη διασταύρωση. Ο εξαντλητικός έλεγχος παραμένει υποχρεωτική πύλη πριν από release, και το μητρώο διατηρεί τα ανοιχτά στοιχεία χωρίς να τα αποκρύπτει.

### R5-P0.1 — selective old-branch recovery (base 4715b54)
- OV-03 REUSE: inspected old ffmpeg-path.js and active main.js resolveFfmpegPath/testFfmpeg/installFfmpeg. Existing resolver already requires absolute candidates, localPath, -version, verified SHA and owned staging. No duplicate module.
- OV-18 REUSE: old decode-text.js supports UTF-8/UTF-16LE/Windows-1253; active media-main.decodeText already supports these plus UTF-16BE. No second decoder.
- OV-05 EXTEND: old local-path.js rejects ASCII controls/UNC; current policy also resolves real paths, rejects symlinks/ADS and checks type. Tightened existing policy only, regression test added. Media extension matrix still open.
- OV-10 EXTEND: old audio-tags.js includes Greek recovery. Integrated conservative ID3-evidenced UTF-8 mojibake display recovery in existing music-tags.js, reused in main metadata:read and consented MusicBrainz query. Does not alter existing tags, preserves valid Latin/Greek text, bounds displayed fields. Deliberately excludes ambiguous Windows-1253/ISO-8859-7 guessing without user review. Tests cover UTF-8 mislabelled Latin-1/1252, original preservation and non-ID3. New CI pending.
- No new modules or queues. OV-04/12/13/14/02 and other open overlaps still pending. No merge or release.

### R5-P0.2 — settings backup reconciliation (base 9fa3861)
- OV-14 CONSOLIDATE: recovered and extended existing old-branch renderer/backup.js, replaces active permissive prefix-based backup collect/restore (not a second mechanism). Shared allowlist and schema sanitizer at renderer and main IPC, current FX/metadata/video keys included, bounded byte size, rollback on storage exception, unknown keys ignored. Reuse existing IPC/UI. Static/unit regression added to existing security suite; live restore/migration pending. Validate any omitted settings against actual storage keys before release.
- OV-13 EXTEND: settings export now stages exclusive owned temp, fsync, rename, validates local parent and refuses symlink/hardlink destinations; bounded import reads max 8 MiB + one byte, UTF-8 strict, existing path policy. Photo save already publishes no-overwrite via hardlink; keep separate semantics. Not a complete shared atomic writer audit; local concurrent filesystem changes are not fully eliminated.
- OV-04 read old renderer-protocol and active main/main-frame guards; current navigation blocked; old custom origin needs migration/security review, no blind import. OV-12 old date-only EXIF implementation confirmed, active photo export currently no date propagation; defer to explicit privacy opt-in with verified source/grant and JPEG/PNG fixtures rather than silently copy metadata. Neither marked complete.
- Base 9fa3861 seven CI PASS including packaged, General and Inno pending. New CI pending. No new queue, engine, installer, release or merge.

### Revised next-pass gate (overrides order only, not scope)
- R5-P0: inspect 74-file build branch + PR1/other branch overlap at semantic level; restore only missing stricter fixes (Greek tags, photo dates, backup, IPC, FFmpeg detection, etc.) and regression tests; preserve master demo. Reconcile resource/security regressions before adding features.
- R5-P1: dedup common provider preview transport/orchestration and local path identity, add feature guide/locales/controls evidence, wire actual provider updater only with approved trusted distribution and real adapter contract. No claim of adaptation until live path works.
- R5-P2: existing metadata writer integration with converted outputs; remaining permitted provider sources, playlist flow, then R4 3D/3E/3F/4/5 unchanged. Prioritize user-visible missing capability over new parallel foundations.
- Every pass must start with source search across active owner, relevant branch, existing tests and roadmap; record REUSE / EXTEND / REPLACE / DEFER, exact file/function/IPC, negative evidence if absent, and runtime/CI results at same SHA. Do not add a new module if an existing owner can safely be extended. No percent completion inferred from code existence or partial CI.

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

### ULTRA 3D.9C — package inclusion and bounded streaming progress
- Added download module to explicit package file list and both online suites to npm test. Shared stream writer validates response length/MIME/status, cleans owned partials, emits bounded byte/total/rate updates. Deterministic stream tests for success, size limit, truncation, MIME, redirect, empty, abort. No actual HTTPS or packaged UI certification yet. DNS lookup itself not cancellable. Provider adapters remain open.

### ULTRA 3D.9H.1 — common public oEmbed metadata
- Vimeo/Dailymotion/SoundCloud official endpoints, canonical public links, consent, shared preview mutex/cancel, bounded responses, no returned HTML/media/image execution. Single items can be manually matched; SoundCloud collections are metadata only. Bandcamp and actual authorized provider downloads pending. Tests and package registered; live/UI certification pending. Base e7b28d2 eight PASS, Inno pending.

### ULTRA 3D.9G.1 — Spotify metadata preview
- Official 2026 API routes, temporary token, consent, shared selection/queue and cancel, bounded pagination, source links, no Spotify audio extraction. Tests cover new endpoint, legacy response compatibility, limits and token errors. Actual OAuth onboarding/live credentials, official logo/branding and production policy review, CI pending. No claim of Spotify download support. Base da2bd1a six PASS, three running.

### ULTRA 3D.9F.1 — playlist selection and owned file queue
- Explicit selection by occurrence (including duplicate provider IDs), select all, authorized local-file picker mapping, ordered queue plan rejects unmapped/duplicate/overflow, no auto-start. Existing conversion admission reused; no remote playlist downloads. Fixed repeated online progress subscription on renderer rebuild. Added pure queue plan tests; UI/CI pending. Base 4875860 seven PASS, two pending.

### ULTRA 3D.9E.1 — official YouTube metadata preview
- YouTube Data API v3 metadata only, public item/playlist and compatible music.youtube.com links, transient user API key, explicit consent, fixed Google origin, four-page/200-item limit, cancellation, attributed preview. No downloads or media extraction via API, no private OAuth. Package/test entries added; fixtures only, live API and UI CI pending. Official docs: https://developers.google.com/youtube/data/reference/rest/v3/playlistItems/list and https://developers.google.com/youtube/terms/developer-policies-guide.

### ULTRA 3D.9D.3 — bounded provider update transport
- Main-process-only candidate transport with distribution-supplied trusted HTTPS endpoint, no redirects, bounded JSON signed envelope, 15s deadline, cancellation, on-use/manual update manager and fail-closed unconfigured state. Tests use streams and injected transport. Packaged and registered in npm test. No production endpoint/key or actual adapter contract wired; automatic updates remain disabled. Base 91a84e7 two PASS, seven running.

### ULTRA 3D.9D.2 — durable signed registry foundation
- Optional bounded atomic local storage, reverify signed envelopes at restart, preserve signed high-water evidence after rollback and expiry; reject tampered state, do not switch on disk failure. Added restart/rollback/expiry/tamper/failure tests. Local OS-level deletion or replacement not prevented; not yet wired to production trust key, main process or remote source. Base 5d4b768 6/9 PASS including packaged; new CI pending.

### ULTRA 3D.9D.1 — signed provider registry foundation
- Ed25519 signed bounded data-only manifest; strict fields, expiry, version/digest/contract and provider-mode restrictions; in-memory activation with injected contract test, single update lock, rollback and monotonic high-water sequence; opt-in use-based check policy. Added package entry and tests. Production trust key/source, persistent state, actual adapter verification/execution, networking and UI remain open. No automatic updates enabled yet.

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

