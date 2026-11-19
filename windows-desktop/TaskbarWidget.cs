using System.Drawing;
using System.ComponentModel;
using System.IO;
using Microsoft.Win32;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.Runtime.InteropServices;
using System.Windows.Automation;
using Forms = System.Windows.Forms;

sealed class TaskbarWidget : IDisposable
{
    private readonly Action<string> command;
    private readonly Forms.Timer timer;
    private readonly Action<string> status;
    private readonly Dictionary<IntPtr, TaskbarSurface> surfaces = new();
    private readonly Dictionary<IntPtr, Task<Anchors>> queries = new();
    private bool enabled, locating;
    private int generation;
    private string lastStatus = "", locale = "el";
    private string title = "", artist = "", coverData = "", open = "", previous = "", playback = "", next = "";
    private bool playing, canPlay, canPrev, canNext, light, fallbackLight, coverBackground;
    private ImageSource? cover;
    private double[] spectrum = [];
    private Edge position = Edge.End;
    private bool legacyBounds;
    private enum Edge { Start, Center, End }

    public TaskbarWidget(Action<string> command, Action<string> status)
    {
        this.command = command;
        this.status = status;
        timer = new Forms.Timer { Interval = 1500 };
        timer.Tick += async (_, _) => await Relocate();
    }

    public void Configure(bool show, bool lightTheme, string openLabel, string prevLabel, string playLabel, string nextLabel,
        string placement, bool legacy, bool useCoverBackground, string language)
    {
        locale = language.Length == 2 && language.All(char.IsAsciiLetterLower) ? language : "el";
        fallbackLight = lightTheme;
        coverBackground = useCoverBackground;
        ReadTaskbarTheme();
        open = openLabel;
        previous = prevLabel;
        playback = playLabel;
        next = nextLabel;
        var edge = placement switch { "start" => Edge.Start, "center" => Edge.Center, _ => Edge.End };
        bool changed = show != enabled || edge != position || legacy != legacyBounds;
        enabled = show;
        position = edge;
        legacyBounds = legacy;
        if (changed)
        {
            generation++;
            if (enabled)
            {
                Report("CHECKING");
                timer.Start();
                _ = Relocate();
            }
            else
            {
                timer.Stop();
                foreach (var bar in surfaces.Keys.ToArray()) CloseSurface(bar);
                Report("");
            }
        }
        Paint();
    }

    public void Update(string track, string performer, string artwork, bool isPlaying, bool playEnabled, bool prevEnabled, bool nextEnabled, double[] levels)
    {
        title = track;
        artist = performer;
        if (coverData != artwork)
        {
            coverData = artwork;
            cover = ReadCover(artwork);
        }
        playing = isPlaying;
        canPlay = playEnabled;
        canPrev = prevEnabled;
        canNext = nextEnabled;
        spectrum = levels;
        Paint();
    }

    private void Paint()
    {
        foreach (var surface in surfaces.Values)
        {
            surface.SetLanguage(locale);
            surface.UpdateView(title, artist, cover, open, previous, playback, next, playing, canPlay, canPrev, canNext, light, coverBackground, spectrum);
        }
    }

    private void ReadTaskbarTheme()
    {
        try
        {
            using var key = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize");
            light = key?.GetValue("SystemUsesLightTheme") is int value ? value != 0 : fallbackLight;
        }
        catch (Exception e) when (e is UnauthorizedAccessException or System.Security.SecurityException or IOException)
        {
            light = fallbackLight;
        }
    }

    private static ImageSource? ReadCover(string encoded)
    {
        if (string.IsNullOrEmpty(encoded)) return null;
        try
        {
            using var bytes = new MemoryStream(Convert.FromBase64String(encoded));
            var image = new BitmapImage();
            image.BeginInit();
            image.StreamSource = bytes;
            image.CacheOption = BitmapCacheOption.OnLoad;
            image.EndInit();
            image.Freeze();
            return image;
        }
        catch (Exception e) when (e is FormatException or NotSupportedException or IOException or ArgumentException)
        {
            return null;
        }
    }

    private void Report(string value)
    {
        if (lastStatus == value) return;
        lastStatus = value;
        status(value);
    }

    private void CloseSurface(IntPtr bar)
    {
        if (surfaces.Remove(bar, out var surface)) surface.Dispose();
    }

    private static List<IntPtr> FindTaskbars()
    {
        var result = new List<IntPtr>();
        var primary = FindWindow("Shell_TrayWnd", null);
        if (primary != IntPtr.Zero) result.Add(primary);
        IntPtr current = IntPtr.Zero;
        while ((current = FindWindowEx(IntPtr.Zero, current, "Shell_SecondaryTrayWnd", null)) != IntPtr.Zero)
            result.Add(current);
        return result;
    }

    private async Task Relocate()
    {
        if (!enabled || locating) return;
        locating = true;
        int request = generation;
        try
        {
            ReadTaskbarTheme();
            var bars = FindTaskbars();
            var placements = await Task.WhenAll(bars.Select(FindPlacement));
            if (!enabled || request != generation) return;
            foreach (var bar in surfaces.Keys.Where(bar => !bars.Contains(bar)).ToArray()) CloseSurface(bar);
            foreach (var bar in queries.Keys.Where(bar => !bars.Contains(bar)).ToArray()) queries.Remove(bar);
            string failure = bars.Count == 0 ? "NO-TASKBAR" : "NO-BOUNDS";
            int attached = 0;
            for (int i = 0; i < bars.Count; i++)
            {
                var bar = bars[i];
                if (placements[i] is not { } p) { CloseSurface(bar); continue; }
                try
                {
                    if (surfaces.TryGetValue(bar, out var surface) && (!surface.IsAlive || surface.Vertical != p.Vertical))
                    {
                        CloseSurface(bar);
                        surface = null;
                    }
                    if (surface is null)
                    {
                        surface = new TaskbarSurface(bar, p.Vertical, p.Width, p.Height, command);
                        surfaces.Add(bar, surface);
                    }
                    surface.Place(p.X, p.Y, p.Width, p.Height);
                    if (surface.IsExposed) attached++;
                    else failure = "NOT-VISIBLE";
                }
                catch (Win32Exception e)
                {
                    failure = $"WIN32-{e.NativeErrorCode}";
                    CloseSurface(bar);
                }
                catch (Exception e) when (e is InvalidOperationException or ArgumentException or COMException)
                {
                    failure = "ATTACH-FAILED";
                    CloseSurface(bar);
                }
            }
            Paint();
            Report(attached == 0 ? failure : attached == bars.Count ? $"ATTACHED-{attached}" : $"PARTIAL-{attached}");
        }
        catch (Exception e) when (e is Win32Exception or InvalidOperationException or ArgumentException or COMException)
        {
            if (enabled && request == generation) Report("ATTACH-FAILED");
        }
        finally { locating = false; }
    }

    private readonly record struct Placement(IntPtr Parent, int X, int Y, int Width, int Height, bool Vertical);
    private readonly record struct Anchors(Rect? Frame, Rect? Tray, Rect? Widgets);

    private async Task<Placement?> FindPlacement(IntPtr bar)
    {
        if (!GetWindowRect(bar, out var bounds)) return null;

        Anchors anchors = default;
        if (!legacyBounds)
        {
            // Keep at most one query per taskbar if Explorer's accessibility provider stalls.
            if (!queries.TryGetValue(bar, out var query))
                queries[bar] = query = Task.Run(() => ReadAnchors(bar));
            try { anchors = await query.WaitAsync(TimeSpan.FromMilliseconds(450)); }
            catch (TimeoutException) { }
            if (query.IsCompleted) queries.Remove(bar);
        }

        Rect? tray = anchors.Tray;
        if (tray is null)
        {
            var trayWindow = FindWindowEx(bar, IntPtr.Zero, "TrayNotifyWnd", null);
            if (trayWindow != IntPtr.Zero && GetWindowRect(trayWindow, out var nativeTray)) tray = nativeTray;
        }
        var origin = new Point(0, 0);
        if (!ClientToScreen(bar, ref origin)) return null;
        if (GetClientRect(bar, out var client) && client.Right > 0 && client.Bottom > 0)
            bounds = new Rect { Left = origin.X, Top = origin.Y, Right = origin.X + client.Right, Bottom = origin.Y + client.Bottom };
        return CalculatePlacement(bar, bounds, origin, anchors.Frame, tray, anchors.Widgets, GetDpiForWindow(bar), position);
    }

    private static Anchors ReadAnchors(IntPtr taskbar)
    {
        try
        {
            var root = AutomationElement.FromHandle(taskbar);
            return new Anchors(ReadBounds(root, "TaskbarFrame"), ReadBounds(root, "SystemTrayIcon"), ReadBounds(root, "WidgetsButton"));
        }
        catch (Exception e) when (e is COMException or InvalidOperationException or ArgumentException or ElementNotAvailableException)
        {
            return default;
        }
    }

    private static Rect? ReadBounds(AutomationElement root, string id)
    {
        try
        {
            var element = root.FindFirst(TreeScope.Descendants, new PropertyCondition(AutomationElement.AutomationIdProperty, id));
            if (element is null || element.Current.IsOffscreen) return null;
            var bounds = element.Current.BoundingRectangle;
            return bounds.IsEmpty || bounds.Width <= 0 || bounds.Height <= 0
                ? null : new Rect { Left = (int)bounds.Left, Top = (int)bounds.Top, Right = (int)bounds.Right, Bottom = (int)bounds.Bottom };
        }
        catch (Exception e) when (e is COMException or InvalidOperationException or ElementNotAvailableException)
        {
            return null;
        }
    }

    private static Placement? CalculatePlacement(IntPtr bar, Rect bounds, Point origin, Rect? frame, Rect? tray,
        Rect? widgets, uint dpi, Edge edge)
    {
        bool vertical = bounds.Bottom - bounds.Top > bounds.Right - bounds.Left;
        if (frame is { } f && f.Left >= bounds.Left && f.Right <= bounds.Right &&
            f.Top >= bounds.Top && f.Bottom <= bounds.Bottom && f.Right > f.Left && f.Bottom > f.Top)
            bounds = f;

        int start = vertical ? bounds.Top : bounds.Left;
        int end = vertical ? bounds.Bottom : bounds.Right;
        int near = vertical ? bounds.Left : bounds.Top;
        int far = vertical ? bounds.Right : bounds.Bottom;
        int span = end - start;
        int cross = far - near;
        if (span < 50 || cross < 24) return null;

        double scale = (dpi == 0 ? 96 : dpi) / 96.0;
        int gap = Math.Clamp((int)Math.Round(5 * scale), 2, span / 4);
        int inset = (int)Math.Round(20 * scale);
        int extent = Math.Min(span - 2 * gap, (int)Math.Round((vertical ? 156 : 205) * scale));
        int thickness = Math.Min(cross - 4, (int)Math.Round((cross / scale < 40 ? 30 : 42) * scale));
        int midpoint = start + span / 2;
        int? widgetStart = widgets is { } w ? AxisStart(w, vertical) : null;
        int? widgetEnd = widgets is { } lead ? AxisEnd(lead, vertical) : null;
        int? trayStart = tray is { } t ? AxisStart(t, vertical) : null;
        int offset = edge switch
        {
            Edge.Start => widgetStart >= start && widgetEnd is int widgetEdge && widgetEdge > start && widgetEdge <= midpoint
                ? widgetEdge + gap : start + inset,
            Edge.Center => start + (span - extent) / 2,
            _ => EndAnchor() - extent,
        };

        int EndAnchor()
        {
            int anchor = trayStart is int trayEdge && trayEdge >= midpoint && trayEdge <= end ? trayEdge - gap : end - inset;
            if (widgetStart is int widgetEdge && widgetEdge >= midpoint && widgetEdge <= end) anchor = Math.Min(anchor, widgetEdge - gap);
            return anchor;
        }

        offset = Math.Clamp(offset, start + gap, end - extent - gap);
        int center = near + (cross - thickness) / 2;
        return vertical
            ? new Placement(bar, center - origin.X, offset - origin.Y, thickness, extent, true)
            : new Placement(bar, offset - origin.X, center - origin.Y, extent, thickness, false);
    }

    private static int AxisStart(Rect rect, bool vertical) => vertical ? rect.Top : rect.Left;
    private static int AxisEnd(Rect rect, bool vertical) => vertical ? rect.Bottom : rect.Right;

    public static void VerifyPlacement()
    {
        var bounds = new Rect { Left = 0, Top = 1000, Right = 1920, Bottom = 1048 };
        var tray = new Rect { Left = 1690, Top = 1000, Right = 1919, Bottom = 1048 };
        var startWidget = new Rect { Left = 0, Top = 1000, Right = 43, Bottom = 1048 };
        var origin = new Point(0, 1000);
        var parent = new IntPtr(1);
        if (CalculatePlacement(parent, bounds, origin, null, tray, null, 96, Edge.End)?.X != 1480 ||
            CalculatePlacement(parent, bounds, origin, null, null, null, 96, Edge.End)?.X != 1695 ||
            CalculatePlacement(parent, bounds, origin, null, null, startWidget, 96, Edge.Start)?.X != 48 ||
            CalculatePlacement(parent, bounds, origin, null, null, null, 96, Edge.Center)?.X != 857)
            throw new InvalidOperationException("Unexpected taskbar placement");

        using var host = new Forms.Form();
        host.Show();
        using var widget = new TaskbarSurface(host.Handle, false, 205, 32, _ => { });
        using var coveringSibling = new TaskbarSurface(host.Handle, false, 205, 32, _ => { });
        coveringSibling.Place(8, 8, 205, 32);
        widget.Place(8, 8, 205, 32);
        widget.VerifyVisibleChild();
        widget.VerifyAppearance();
    }

    public static bool VerifyExplorer()
    {
        var bars = FindTaskbars();
        if (bars.Count == 0) return false;
        using var widget = new TaskbarWidget(_ => { }, _ => { }) { legacyBounds = true };
        var placement = widget.FindPlacement(bars[0]).GetAwaiter().GetResult()
            ?? throw new InvalidOperationException("Could not calculate placement on the Explorer taskbar");
        using var surface = new TaskbarSurface(placement.Parent, placement.Vertical, placement.Width, placement.Height, _ => { });
        surface.VerifyRenderedPixels(placement.X, placement.Y, placement.Width, placement.Height);
        return true;
    }

    public void Dispose()
    {
        enabled = false;
        generation++;
        timer.Dispose();
        foreach (var bar in surfaces.Keys.ToArray()) CloseSurface(bar);
    }

    [StructLayout(LayoutKind.Sequential)] private struct Rect { public int Left, Top, Right, Bottom; }
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern IntPtr FindWindow(string name, string? caption);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern IntPtr FindWindowEx(IntPtr parent, IntPtr after, string name, string? caption);
    [DllImport("user32.dll")] private static extern bool GetWindowRect(IntPtr window, out Rect rect);
    [DllImport("user32.dll")] private static extern bool GetClientRect(IntPtr window, out Rect rect);
    [DllImport("user32.dll")] private static extern bool ClientToScreen(IntPtr window, ref Point point);
    [DllImport("user32.dll")] private static extern uint GetDpiForWindow(IntPtr window);
}
