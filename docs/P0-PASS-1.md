# P0 pass 1 — actual changes, pending validation

- Video source generation, subtitle revision, correct TextTrack, stale/manual subtitle selection and SSA discovery, UTF-16BE, live seek/resume guards and clean media-element recreation across CORS changes.
- Opaque random local-media URL tickets with explicit approval for paths not obtained from the file picker, main-frame checks and restricted protocol origin. Media file extension and canonical path checks. No global access granted to renderer; converter still needs per-file approval migration.
- Converter checks on media extensions, bounded asynchronous raw reads, WAV size checks, job concurrency/duplicate ID limits and FFmpeg timeouts, protocol restrictions on audio conversion and probe; full native process sandboxing and all video converter paths remain pending.
- Plugin deterministic path mapping and no debug output, clean build directory. New release archive must be rebuilt and scanned.
- CI production/development dependency audit added as visibility only, not a release gate yet. Electron and builder version upgrade and lockfile regeneration remain pending.
- Tests: actual active Greek cue at seek time, unapproved media URL, local policy, UTF-16BE, VTT, live duration and source guards. Windows CI required; no release.
- Known limits: no actual new LibVLC/DirectShow/Media Foundation engine yet; no true frame stepping; local approval prompt for previously saved or drag/drop/CLI paths; remaining converter/photo IPC capability tokens and network policy to implement. Full security scan still required.
