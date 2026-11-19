# Opsis Media Suite — Opsis plugin (bridge)

Small .NET plugin (contract `OpsisNewsCrawler.Plugin.Abstractions` **1.0.0.0**, requires **Opsis 2.6.0**, which runs on **.NET 11**: the plugin targets net11.0-windows and needs the .NET 11 Desktop Runtime; a net11 plugin does not load in a net10 host) that lets the Electron-based Opsis Media Suite appear in Opsis:
a card/page ("Media Suite"), a widget with the same card, and a tray entry that launches the installed app (path from `suite-apps.json` known paths, then the uninstall registry key; existence checked at click time).

- Implements `IOpsisNewsCrawlerPlugin`, `IPluginWidgetProvider`, `IPluginUpdateSource` (`gs-applabs/OpsisMediaSuite`, asset `MediaSuite-Plugin.zip`), `IPluginHostSettingsAware` (language).
- **No "now playing"**: the Media Suite exposes no such information (no IPC/file/API), so it is intentionally omitted.
- `libs\OpsisNewsCrawler.Plugin.Abstractions.dll` is the canonical contract copy (SHA-256 in `libs\contract.sha256`), referenced `Private=false`.
- Build + zip: `powershell -File opsis-plugin\build.ps1`. Tests: `dotnet test opsis-plugin\tests\MediaSuite.OpsisPlugin.Tests`.
- Install for testing: copy `dist\plugin` to `<OPSIS_APPDATA>\plugins\MediaSuite` (use a temp `OPSIS_APPDATA`, never the real one); Opsis asks to approve the SHA-256.
- Release asset needs a PUBLIC releases page on `gs-applabs/OpsisMediaSuite` (checked by Opsis without a token).
