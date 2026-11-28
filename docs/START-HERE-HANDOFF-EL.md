# START HERE — OPSIS Media Suite 3.0.0
28 Νοεμβρίου 2026 • ULTRA 3D.6C

## Πηγή αλήθειας
- Repo: https://github.com/gs-applabs/OpsisMediaSuite
- Draft PR #3: https://github.com/gs-applabs/OpsisMediaSuite/pull/3
- Branch: feat/photo-tools-fxsound-coexistence
- Τρέχον source: https://github.com/gs-applabs/OpsisMediaSuite/tree/feat/photo-tools-fxsound-coexistence
- Πλήρης μοναδική ενεργή ουρά: docs/MEDIA-SUITE-3.0-MASTER-ROADMAP-EL.md, R4 στην αρχή (P0–P9/R3 και ιστορικά παραρτήματα για κριτήρια και προέλευση).
- Τελευταία πλήρως ελεγμένη βάση CI: 93a5b6594e878575a579ed6746be5c78b2674735 (3D.4), 9/9 workflows PASS.
- 3D.3 final base: d7f5f08547c41709d4fca9b4990429a317cf654e, 8/9 workflows PASS, installer pending.
- Το commit που περιέχει αυτό το αρχείο είναι το 3D.6C. Πάντα επίλυσε το πραγματικό PR head πριν από αλλαγές.

## Τρέχουσα εργασία
3D.6C: packaged candidate ee0ed76 failed cold converter skeleton assertion because new test loaded converter too early. Move A-B preparation tests after existing cold assertion without weakening it. Added approved decoded WebM duplicate reorder identity and full A-B dialog transfer fixture, paused decoded video (not physical running playback). Base six CI PASS, one FAIL, two running. New CI pending; next fix actual failures and network playback R4.

3D.6B: real Electron DOM keyboard and synthetic drag/drop events, external drop rejection, converter A-B preparation/control/queue isolation checks without FFmpeg start; queue-only existing admission API; reject empty/network transfer input. Base c5d0506 five CI PASS, four running at inspection. New CI pending; actual active playback reorder and full player A-B dialog transfer remain open, then network playback R4. No release.

3D.6A: fixed escaped digit regex rejecting numeric sleep input, pure validation, aria-pressed state, stale modal guard, real Electron dialog arm/invalid/cancel/close checks in self-test. Base 3D.5B five CI PASS, four running at inspection; 3D.5A four PASS, three cancelled, two running. New CI pending. Next actual playlist reorder and A-B renderer regression, then remaining 3D R4. No release.

3D.5B: explicit local Chromium A-B transfer to existing MKV remux controls, no auto-start, no mixed queue mutation; one optional 1–480 min video-only close timer, 0 cancels, cleared on full stop/unload. No app/OS exit or interruption of other tools. Guide 112 entries, pure range test. New CI pending; 3D.5A CI 2 PASS, 7 running at inspection. Next renderer interaction tests, app exit feasibility with independent jobs, remaining 3D R4.

3D.5A: arbitrary playlist reorder via internal drag/drop and Alt+Up/Down on focused row, existing pure reorder helper, active duplicate occurrence preserved, no playback restart or new background work. Added pure regression cases; renderer interaction and new CI pending. Base 93a5b65: 8/9 PASS, installer pending at inspection. Next A-B transfer and video sleep/exit; then remaining R4. Earlier 3D.4 context follows.

3D.4: existing converter operation selector, MKV stream-copy remux/keyframe trim, PNG poster/contact sheet/bounded sequence, existing queue/cancel, 110 guide entries, tests added, new CI pending. No new standalone service. Πρώτα έλεγξε CI πραγματικού PR head, διόρθωσε failures. Μετά 3D.5: player A-B transfer, arbitrary playlist reorder, video sleep/exit, remaining 3D R4 items, then 3E/3F/4A–D/5A–C. All older items are preserved in R4 and Git history; no duplicate implementation or premature release.

## Αμετάβλητες απαιτήσεις
Έξυπνος πυρήνας ενεργοποιεί μόνο επιλεγμένες λειτουργίες, χωρίς να εμποδίζει ανεξάρτητες παράλληλες εργασίες. Bounded RAM/CPU/SSD, no pile-up, προστασία πρωτοτύπων και ρυθμίσεων, καμία διπλή DSP/IPC/ρύθμιση. Inno Setup (όχι NSIS εκτός legacy migration), MIT και τρίτες άδειες, plugin 1.0.0.0, στόχος 3.0.0. PR #1 (Windows flyout/mixer/widget) παραμένει ανοικτό, 27 κοινά αρχεία με PR #3 στο audit. PR #2 Opsis.UI tokens ήδη merged. Upstream gs-applabs/Opsis.UI, όχι OpsisUI. Μην κάνεις blind merge ή release. Πιστοποίηση με πραγματικά αποτελέσματα για συγκεκριμένο SHA, όχι εκτιμήσεις.

## Πηγές για ανάκτηση παλαιότερων αιτημάτων
docs/MPP-MIGRATION-LEDGER.md, WAVEFRAME_ROADMAP.md, CHANGELOG.md, docs/OPSIS-UI6-ADOPTION.md, PR #1/#2/#3. Αναδρομικός έλεγχος δεν είχε πλήρη αυτούσια πρόσβαση σε κάθε παλαιά συνομιλία. Αν βρεθεί νέα εκκρεμότητα, πρόσθεσέ την στο R4 του master πριν την υλοποίηση.
Κράτα αυτό το ένα handoff ενημερωμένο σε κάθε ουσιαστικό pass· παρέδωσε σύνδεσμο και αντίγραφο στο χρήστη στα checkpoints. Git history αντί πολλών ZIP. Μην ισχυρίζεσαι πλήρη έλεγχο αν εκκρεμεί CI ή hardware.
