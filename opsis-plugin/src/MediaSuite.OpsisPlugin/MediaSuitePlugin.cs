using System.Drawing;
using OpsisNewsCrawler.Plugin.Abstractions;

namespace MediaSuite.OpsisPlugin;

/// <summary>Bridge between the Opsis plugin mechanism (.NET, contract 1.0.0.0) and the Electron-based Opsis Media Suite: shows a card and launches the installed app.
/// There is no "now playing" feed: the Media Suite exposes no such information (no IPC, file or API), so none is invented here.</summary>
public sealed class MediaSuitePlugin : IOpsisNewsCrawlerPlugin, IPluginWidgetProvider, IPluginUpdateSource, IPluginHostSettingsAware
{
    public const string PluginVersion = "1.0.0";
    private static volatile string _lang = "el";
    private static (Color bg, Color fg, Color muted, Color accent) _colors = (Color.FromArgb(32, 32, 36), Color.White, Color.FromArgb(180, 180, 190), Color.FromArgb(0, 120, 212));
    private readonly List<WeakReference<MediaSuiteCard>> _cards = new();

    public static bool IsGreek => _lang.StartsWith("el", StringComparison.OrdinalIgnoreCase);
    public static (Color bg, Color fg, Color muted, Color accent) Colors => _colors;

    public string Id => "opsis-media-suite";
    public string Name => "Opsis Media Suite";
    public string Version => PluginVersion;

    public void Start() { }
    public void Stop() { }
    public void Pause() { }
    public void Resume() { }
    public void Refresh() => RefreshCards();
    public void SetMode(string mode) { }
    public void SetPosition(string position) { }

    public void SetTheme(bool dark, int background, int surface, int border, int text, int textMuted, int accent, double opacity)
    {
        _colors = (Color.FromArgb(255, Color.FromArgb(background)), Color.FromArgb(255, Color.FromArgb(text)), Color.FromArgb(255, Color.FromArgb(textMuted)), Color.FromArgb(255, Color.FromArgb(accent)));
        RefreshCards();
    }

    public void SetLanguage(string code) { _lang = string.IsNullOrWhiteSpace(code) ? "el" : code; RefreshCards(); }

    /// <summary>Opsis 2.6.0: UI language from the host. The plugin has no updater of its own, so HostManagesUpdates needs no handling; theme colours arrive through SetTheme.</summary>
    public void SetHostSettings(PluginHostSettings settings)
    {
        if (!string.IsNullOrWhiteSpace(settings.Language)) _lang = settings.Language;
        RefreshCards();
    }

    public PluginUpdateSource GetUpdateSource() => new("gs-applabs/OpsisMediaSuite", "MediaSuite-Plugin.zip");

    public PluginAboutInfo GetAboutInfo() => new(Name, Version,
        "Εμφανίζει το Opsis Media Suite και ανοίγει την εγκατεστημένη εφαρμογή.",
        "Shows the Opsis Media Suite and launches the installed app.",
        "gs-applabs", "MIT", Array.Empty<PluginAboutSection>());

    public IReadOnlyList<PluginMenuItem> GetTrayMenuItems() => new List<PluginMenuItem>
    {
        new("mediasuite.launch", "Άνοιγμα Opsis Media Suite", "Open Opsis Media Suite", () => MediaSuiteCard.LaunchInstalled()),
    };

    public IReadOnlyList<PluginNavigationItem> GetNavigationItems() => new List<PluginNavigationItem>
    {
        new("mediasuite", "Media Suite", "Media Suite", CreateCard, 200),
    };

    public IReadOnlyList<PluginWidget> GetWidgets() => new List<PluginWidget>
    {
        new("mediasuite", "Opsis Media Suite", "Opsis Media Suite", CreateCard),
    };

#pragma warning disable CS0067
    public event Action<string>? NavigationRequested;
#pragma warning restore CS0067

    private System.Windows.Forms.Control CreateCard()
    {
        var c = new MediaSuiteCard();
        lock (_cards) { _cards.RemoveAll(w => !w.TryGetTarget(out _)); _cards.Add(new WeakReference<MediaSuiteCard>(c)); }
        return c;
    }

    private void RefreshCards()
    {
        List<MediaSuiteCard> live;
        lock (_cards) live = _cards.Select(w => w.TryGetTarget(out var c) ? c : null).Where(c => c != null).Select(c => c!).ToList();
        foreach (var c in live) { try { c.Apply(); } catch { } }
    }
}
