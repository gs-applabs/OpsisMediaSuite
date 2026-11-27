# Real application interaction demo / Ζωντανή παρουσίαση λειτουργιών

Source commit: 5ea6ac6027162cedcf755019c2c9aa605469087a
Application version: 2.4.2
Captured frames: 240, unique frames: 238, rate: 8 fps

[Play the 30-second silent MP4](media-suite-live.mp4)

Actual Electron renderer frames with real UI controls activated. Uses a built-in test tone; no licensed external music, no real user data. Video is not a complete acceptance test. CPU and memory samples in capture.json include capture overhead; do not compare them to an idle benchmark.

| Frame | Event | Detail |
|---:|---|---|
| 0 | player-open |  |
| 16 | built-in-test-tone |  |
| 40 | visualizer-picker-open |  |
| 56 | circular-visualizer-selected |  |
| 80 | enhancement-open |  |
| 100 | preset-selected | 🎵ΜουσικήΠλούσιος, ζεστός ήχος με έμφαση στα μεσαία |
| 128 | preset-selected | 🎬ΤαινίεςΚινηματογραφικός ήχος με βαθύ μπάσο και ευρεία στερεοφωνία |
| 156 | converter-open |  |
| 180 | video-open |  |
| 200 | photo-open |  |
| 220 | settings-open |  |
