using System.Drawing;
using System.ComponentModel;
using System.IO;
using Microsoft.Win32;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.Runtime.InteropServices;
using System.Windows.Automation;
using Windows.UI.ViewManagement;
using Color = System.Windows.Media.Color;
using Forms = System.Windows.Forms;

readonly record struct TaskbarRange(int Start, int End)
{
    public static int Snap(int desired, TaskbarRange[] ranges)
    {
        int nearest = ranges[0].Start;
        foreach (var range in ranges)
        {
            int candidate = Math.Clamp(desired, range.Start, range.End);
            if (candidate == desired) return candidate;
            if (Math.Abs(candidate - desired) < Math.Abs(nearest - desired)) nearest = candidate;
        }
        return nearest;
    }
}

sealed class TaskbarWidget : IDisposable
{
    private readonly Action<string> command;
    private readonly Forms.Timer timer;
    private readonly Action<string> status;
    private readonly Action<double>? positionChanged;
    private readonly Forms.Timer meterTimer;
    private readonly TaskbarSpectrum taskbarSpectrum = new();
    private UISettings? uiSettings;
    private Color? accent;
    private string drag = "";
    private double offset;
    private readonly double[] smoothed = new double[8];
    private readonly Dictionary<IntPtr, TaskbarSurface> surfaces = new();
    private readonly Dictionary<IntPtr, Task<Anchors>> queries = new();
    private readonly Dictionary<IntPtr, Anchors> measuredAnchors = new();
    private bool enabled, locating;
    private int generation;
    private string lastStatus = "", locale = "el";
    private string title = "", artist = "", coverData = "", open = "", previous = "", playback = "", next = "";
    private bool playing, canPlay, canPrev, canNext, light, fallbackLight, coverBackground;
    private ImageSource? cover;
    private double[] spectrum = [];
    private Edge position = Edge.End;
    private bool legacyBounds;
    private enum Edge { Start, Center, End, Manual }

    public TaskbarWidget(Action<string> command, Action<string> status, Action<double>? positionChanged = null)
    {
        this.command = command;
        this.status = status;
        this.positionChanged = positionChanged;
        meterTimer = new Forms.Timer { Interval = 40 };
        meterTimer.Tick += (_, _) => PaintSpectrum();
        timer = new Forms.Timer { Interval = 1500 };
        timer.Tick += async (_, _) => await Relocate();
    }

    public void Configure(bool show, bool lightTheme, string openLabel, string prevLabel, string playLabel, string nextLabel,
        string placement, bool legacy, bool useCoverBackground, string language, double manualOffset, string dragLabel)
    {
        locale = language.Length == 2 && language.All(char.IsAsciiLetterLower) ? language : "el";
        fallbackLight = lightTheme;
        coverBackground = useCoverBackground;
        ReadTaskbarTheme();
        open = openLabel;
        drag = dragLabel;
        previous = prevLabel;
        playback = playLabel;
        next = nextLabel;
        var edge = placement switch { "start" => Edge.Start, "center" => Edge.Center, "manual" => Edge.Manual, _ => Edge.End };
        bool changed = show != enabled || edge != position || legacy != legacyBounds || (edge == Edge.Manual && offset != manualOffset);
        enabled = show;
        position = edge;
        offset = manualOffset;
        legacyBounds = legacy;
        if (changed)
        {
            generation++;
            if (enabled)
            {
                Report("CHECKING");
                timer.Start();
                meterTimer.Start();
                _ = Relocate();
            }
            else
            {
                timer.Stop();
                meterTimer.Stop();
                taskbarSpectrum.SetActive(false);
                Array.Clear(smoothed);
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
            surface.UpdateView(title, artist, cover, open, previous, playback, next, playing, canPlay, canPrev, canNext, light, coverBackground, smoothed);
            surface.SetSystemAccent(accent);
            surface.SetDragLabel(drag);
        }
    }

    private void PaintSpectrum()
    {
        bool active = enabled && playing && surfaces.Values.Any(surface => surface.IsExposed);
        taskbarSpectrum.SetActive(active);
        ReadOnlySpan<double> levels = active ? taskbarSpectrum.Levels(spectrum) : [];
        for (int i = 0; i < smoothed.Length; i++)
        {
            double target = i < levels.Length ? levels[i] : 0;
            smoothed[i] += (target - smoothed[i]) * (target > smoothed[i] ? 0.72 : 0.32);
        }
        foreach (var surface in surfaces.Values) surface.SetSpectrum(smoothed);
    }

    private void SavePosition(double value)
    {
        position = Edge.Manual;
        offset = value;
        generation++;
        positionChanged?.Invoke(value);
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
        try
        {
            uiSettings ??= new UISettings();
            var color = uiSettings.GetColorValue(UIColorType.Accent);
            accent = Color.FromRgb(color.R, color.G, color.B);
        }
        catch (Exception e) when (e is COMException or InvalidOperationException or UnauthorizedAccessException)
        {
            accent = null;
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
            var placements = await Task.WhenAll(bars.Select(bar => FindPlacement(bar)));
            if (!enabled || request != generation) return;
            foreach (var bar in surfaces.Keys.Where(bar => !bars.Contains(bar)).ToArray()) CloseSurface(bar);
            foreach (var bar in queries.Keys.Where(bar => !bars.Contains(bar)).ToArray()) queries.Remove(bar);
            foreach (var bar in measuredAnchors.Keys.Where(bar => !bars.Contains(bar)).ToArray()) measuredAnchors.Remove(bar);
            string failure = bars.Count == 0 ? "NO-TASKBAR" : "NO-SPACE";
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
                        surface = new TaskbarSurface(bar, p.Vertical, p.Width, p.Height, command, SavePosition);
                        surfaces.Add(bar, surface);
                    }
                    surface.Place(p.X, p.Y, p.Width, p.Height, p.Min, p.Max, p.Ranges);
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

    private readonly record struct Placement(IntPtr Parent, int X, int Y, int Width, int Height, bool Vertical, int Min, int Max, TaskbarRange[] Ranges);
    private readonly record struct Anchors(bool Available, Rect? Frame, Rect[] Leading, Rect[] Tray, Rect[] Occupied);

    private async Task<Placement?> FindPlacement(IntPtr bar, int queryTimeoutMs = 2000)
    {
        if (!GetWindowRect(bar, out var bounds)) return null;

        // Keep one in-flight query per bar and reuse its last measurement if Explorer temporarily stalls.
        if (!queries.TryGetValue(bar, out var query))
            queries[bar] = query = Task.Run(() => ReadAnchors(bar));
        try
        {
            var measured = await query.WaitAsync(TimeSpan.FromMilliseconds(queryTimeoutMs));
            if (measured.Available) measuredAnchors[bar] = measured;
        }
        catch (TimeoutException) { }
        if (query.IsCompleted) queries.Remove(bar);
        if (!measuredAnchors.TryGetValue(bar, out var anchors)) return null;

        Rect[] leading = anchors.Leading;
        foreach (var windowClass in new[] { "Start", "TraySearchBox", "SearchBox" })
        {
            var control = FindWindowEx(bar, IntPtr.Zero, windowClass, null);
            if (control != IntPtr.Zero && IsWindowVisible(control) && GetWindowRect(control, out var nativeBounds))
                leading = [.. leading, nativeBounds];
        }

        Rect[] tray = anchors.Tray;
        var trayWindow = FindWindowEx(bar, IntPtr.Zero, "TrayNotifyWnd", null);
        if (trayWindow != IntPtr.Zero && IsWindowVisible(trayWindow) && GetWindowRect(trayWindow, out var nativeTray))
            tray = [.. tray, nativeTray];

        var origin = new Point(0, 0);
        if (!ClientToScreen(bar, ref origin)) return null;
        if (GetClientRect(bar, out var client) && client.Right > 0 && client.Bottom > 0)
            bounds = new Rect { Left = origin.X, Top = origin.Y, Right = origin.X + client.Right, Bottom = origin.Y + client.Bottom };
        return CalculatePlacement(bar, bounds, origin, legacyBounds ? null : anchors.Frame,
            leading, tray, anchors.Occupied, GetDpiForWindow(bar), position, offset);
    }

    private static Anchors ReadAnchors(IntPtr taskbar)
    {
        try
        {
            var root = AutomationElement.FromHandle(taskbar);
            var request = new CacheRequest();
            foreach (var property in new[] { AutomationElement.AutomationIdProperty, AutomationElement.ClassNameProperty,
                AutomationElement.ProcessIdProperty, AutomationElement.ControlTypeProperty,
                AutomationElement.IsOffscreenProperty, AutomationElement.BoundingRectangleProperty })
                request.Add(property);
            request.AutomationElementMode = AutomationElementMode.None;
            using var cache = request.Activate();
            var elements = root.FindAll(TreeScope.Descendants, Condition.TrueCondition);
            Rect? frame = null;
            var leading = new List<Rect>();
            var tray = new List<Rect>();
            var occupied = new List<Rect>();
            foreach (AutomationElement element in elements)
            {
                var properties = element.Cached;
                if (properties.ProcessId == Environment.ProcessId || properties.IsOffscreen) continue;
                var bounds = properties.BoundingRectangle;
                if (bounds.IsEmpty || bounds.Width <= 0 || bounds.Height <= 0 ||
                    !double.IsFinite(bounds.Left) || !double.IsFinite(bounds.Top)) continue;
                var rect = new Rect
                {
                    Left = (int)Math.Floor(bounds.Left), Top = (int)Math.Floor(bounds.Top),
                    Right = (int)Math.Ceiling(bounds.Right), Bottom = (int)Math.Ceiling(bounds.Bottom)
                };
                string id = properties.AutomationId;
                string kind = properties.ClassName;
                if (id == "TaskbarFrame" || kind == "Taskbar.TaskbarFrameAutomationPeer") frame = rect;
                else if (kind.StartsWith("SystemTray.", StringComparison.OrdinalIgnoreCase) ||
                    id.StartsWith("SystemTray", StringComparison.OrdinalIgnoreCase) ||
                    id is "TrayNotifyWnd" or "NotificationArea" or "ShowHiddenIconsButton" ||
                    kind == "TrayNotifyWnd") tray.Add(rect);
                else if (id is "Start" or "StartButton" or "SearchButton" or "SearchBox" or "SearchEntryPoint" ||
                    kind.Contains("StartButton", StringComparison.OrdinalIgnoreCase) ||
                    kind.StartsWith("Taskbar.Search", StringComparison.OrdinalIgnoreCase)) leading.Add(rect);
                else if (properties.ControlType == ControlType.Button || properties.ControlType == ControlType.ListItem ||
                    properties.ControlType == ControlType.TabItem || properties.ControlType == ControlType.RadioButton ||
                    kind.Contains("TaskListButton", StringComparison.OrdinalIgnoreCase) || id == "WidgetsButton") occupied.Add(rect);
            }

            return new Anchors(elements.Count > 0, frame, leading.ToArray(), tray.ToArray(), occupied.ToArray());
        }
        catch (Exception e) when (e is COMException or InvalidOperationException or ArgumentException or ElementNotAvailableException)
        {
            return default;
        }
    }

    private static Placement? CalculatePlacement(IntPtr bar, Rect bounds, Point origin, Rect? frame, Rect[] leading,
        Rect[] tray, Rect[] occupied, uint dpi, Edge edge, double fraction = 0)
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
        int extent = Math.Min(span - 2 * gap, (int)Math.Round((vertical ? 156 : 205) * scale));
        int thickness = Math.Min(cross - 4, (int)Math.Round((cross / scale < 40 ? 30 : 42) * scale));
        bool IsOnBar(Rect rect) => AxisEnd(rect, vertical) > start && AxisStart(rect, vertical) < end &&
            (vertical ? rect.Right > near && rect.Left < far : rect.Bottom > near && rect.Top < far) &&
            AxisEnd(rect, vertical) - AxisStart(rect, vertical) < span;

        int minimum = leading.Where(IsOnBar).Select(rect => AxisEnd(rect, vertical)).DefaultIfEmpty(start).Max() + gap;
        int maximum = tray.Where(IsOnBar).Select(rect => AxisStart(rect, vertical)).DefaultIfEmpty(end).Min() - gap - extent;
        if (maximum < minimum) return null;

        int axisOrigin = vertical ? origin.Y : origin.X;
        var ranges = new List<TaskbarRange>();
        int freeStart = minimum;
        foreach (var rect in occupied.Where(IsOnBar).OrderBy(rect => AxisStart(rect, vertical)))
        {
            int freeEnd = Math.Min(maximum, AxisStart(rect, vertical) - gap - extent);
            if (freeEnd >= freeStart) ranges.Add(new TaskbarRange(freeStart - axisOrigin, freeEnd - axisOrigin));
            freeStart = Math.Max(freeStart, AxisEnd(rect, vertical) + gap);
            if (freeStart > maximum) break;
        }
        if (freeStart <= maximum) ranges.Add(new TaskbarRange(freeStart - axisOrigin, maximum - axisOrigin));
        if (ranges.Count == 0) return null;

        int desired = edge switch
        {
            Edge.Start => minimum,
            Edge.Center => start + (span - extent) / 2,
            Edge.Manual => minimum + (int)Math.Round((maximum - minimum) * fraction),
            _ => maximum,
        };
        var available = ranges.ToArray();
        int offset = TaskbarRange.Snap(desired - axisOrigin, available);
        int center = near + (cross - thickness) / 2;
        return vertical
            ? new Placement(bar, center - origin.X, offset, thickness, extent, true, minimum - axisOrigin, maximum - axisOrigin, available)
            : new Placement(bar, offset, center - origin.Y, extent, thickness, false, minimum - axisOrigin, maximum - axisOrigin, available);
    }

    private static int AxisStart(Rect rect, bool vertical) => vertical ? rect.Top : rect.Left;
    private static int AxisEnd(Rect rect, bool vertical) => vertical ? rect.Bottom : rect.Right;

    public static void VerifyPlacement()
    {
        var bounds = new Rect { Left = 0, Top = 1000, Right = 1920, Bottom = 1048 };
        var search = new Rect { Left = 640, Top = 1000, Right = 780, Bottom = 1048 };
        var start = new Rect { Left = 600, Top = 1000, Right = 640, Bottom = 1048 };
        var tray = new Rect { Left = 1690, Top = 1000, Right = 1919, Bottom = 1048 };
        var pinned = new Rect { Left = 790, Top = 1000, Right = 830, Bottom = 1048 };
        var pinnedRight = new Rect { Left = 1110, Top = 1000, Right = 1150, Bottom = 1048 };
        var busy = new Rect { Left = 790, Top = 1000, Right = 1680, Bottom = 1048 };
        var origin = new Point(0, 1000);
        var parent = new IntPtr(1);
        Placement? Place(Edge edge, double fraction = 0) => CalculatePlacement(parent, bounds, origin, null,
            [start, search], [tray], [pinned, pinnedRight], 96, edge, fraction);
        if (Place(Edge.End)?.X != 1480 || Place(Edge.Start)?.X != 835 ||
            Place(Edge.Manual, 0)?.X != 835 || Place(Edge.Manual, 1)?.X != 1480 ||
            Place(Edge.Center) is not { } center || center.X != 857 ||
            TaskbarRange.Snap(1000, center.Ranges) != 900 ||
            TaskbarRange.Snap(1105, center.Ranges) != 1155 ||
            CalculatePlacement(parent, bounds, origin, null, [start, search], [tray], [busy], 96, Edge.End) is not null)
            throw new InvalidOperationException("Taskbar placement must stay between Start/Search and the tray and avoid pinned icons");

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
        using var widget = new TaskbarWidget(_ => { }, _ => { });
        widget.ReadTaskbarTheme();
        var bar = bars[0];
        var result = widget.FindPlacement(bar, 6000).GetAwaiter().GetResult();
        if (result is not { } placement)
        {
            if (!widget.measuredAnchors.TryGetValue(bar, out var anchors))
                throw new InvalidOperationException("Explorer did not return taskbar accessibility bounds");
            throw new InvalidOperationException($"No safe Explorer taskbar space found ({anchors.Leading.Length} leading controls, {anchors.Tray.Length} tray elements and {anchors.Occupied.Length} other controls)");
        }
        using var surface = new TaskbarSurface(placement.Parent, placement.Vertical, placement.Width, placement.Height, _ => { });
        surface.VerifyRenderedPixels(placement.X, placement.Y, placement.Width, placement.Height, widget.light);
        return true;
    }

    public void Dispose()
    {
        enabled = false;
        generation++;
        timer.Dispose();
        meterTimer.Dispose();
        taskbarSpectrum.Dispose();
        foreach (var bar in surfaces.Keys.ToArray()) CloseSurface(bar);
    }

    [StructLayout(LayoutKind.Sequential)] private struct Rect { public int Left, Top, Right, Bottom; }
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern IntPtr FindWindow(string name, string? caption);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern IntPtr FindWindowEx(IntPtr parent, IntPtr after, string name, string? caption);
    [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr window);
    [DllImport("user32.dll")] private static extern bool GetWindowRect(IntPtr window, out Rect rect);
    [DllImport("user32.dll")] private static extern bool GetClientRect(IntPtr window, out Rect rect);
    [DllImport("user32.dll")] private static extern bool ClientToScreen(IntPtr window, ref Point point);
    [DllImport("user32.dll")] private static extern uint GetDpiForWindow(IntPtr window);
}
