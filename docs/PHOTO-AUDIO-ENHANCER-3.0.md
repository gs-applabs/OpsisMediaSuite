# Photo and Audio Enhancer 3.0 – incremental roadmap

## First draft patch
- Photo: vibrance, sepia, vignette, localised in 20 languages; source/alpha preservation, stale photo-load protection and export snapshots.
- FxSound: read-only registry and available output-device detection; advisory and explicit local DSP bypass. No changes to Windows audio routing, external program state, drivers or export DSP settings. Device labels may be unavailable; installed is not equivalent to processing active. Greek/English advisory; other locales use English pending translations.

## Next stages (not implemented)
- Photo: non-destructive history, free crop and straighten, zoom/pan, RGB histogram, curves, HSL, levels, local masks, healing, red-eye, noise removal, resize, batch presets, metadata policy, RAW/TIFF/HEIC decoding, safe pixel budget before decode and cancellable worker/tiled export.
- Audio: independent DSP with continuous clarity, ambience, surround, dynamic boost and bass controls; EQ frequency/Q, headroom and true-peak limiting, preset import/export, A/B gain matched listening. Preserve offline export and existing project MIT licensing; FxSound code is AGPL-3.0, do not copy it into MIT-only implementation without license review.
- External FxSound: validate supported official CLI version and trusted installation; optional opt-in management, explicit route status (Core Audio), no automatic external process/driver installation or default device change. Distinguish application playback from Windows-wide enhancement; evaluate separate signed APO/virtual-audio solution with opt-in and rollback.
- Test Windows with and without FxSound, default and non-default route, unplug/Bluetooth change, audio/video switching, offline export and no unintended double processing. Test photo large/malformed images, transparent edges, ICC/EXIF, undo and cancellation.
