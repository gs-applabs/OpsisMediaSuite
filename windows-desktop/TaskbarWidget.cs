using System.Drawing;
using System.Runtime.InteropServices;
using System.Windows.Automation;
using Forms = System.Windows.Forms;

sealed class TaskbarWidget : IDisposable
{
    private readonly Action<string> command;
    private readonly Forms.Timer timer;
    private WidgetForm? form;
    private bool enabled;
    private int generation;
    private string title = "", open = "", previous = "", playback = "", next = "";
    private bool playing, canPlay, canPrev, canNext, light;
    private double[] spectrum = [];
    private Edge position = Edge.End;
    private bool legacyBounds;
    private Task<Anchors>? anchorQuery;
    private IntPtr queriedTaskbar;
    private enum Edge { Start, Center, End }

    public TaskbarWidget(Action<string> command)
    {
        this.command = command;
        timer = new Forms.Timer { Interval = 1500 };
        timer.Tick += async (_, _) => await Relocate();
    }

    public void Configure(bool show, bool lightTheme, string openLabel, string prevLabel, string playLabel, string nextLabel,
        string placement, bool legacy)
    {
        light = lightTheme;
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
                timer.Start();
                _ = Relocate();
            }
            else
            {
                timer.Stop();
                CloseForm();
            }
        }
        Paint();
    }

    public void Update(string track, bool isPlaying, bool playEnabled, bool prevEnabled, bool nextEnabled, double[] levels)
    {
        title = track;
        playing = isPlaying;
        canPlay = playEnabled;
        canPrev = prevEnabled;
        canNext = nextEnabled;
        spectrum = levels;
        Paint();
    }

    private void Paint() =>
        form?.UpdateView(title, open, previous, playback, next, playing, canPlay, canPrev, canNext, light, spectrum);

    private void CloseForm()
    {
        form?.Dispose();
        form = null;
    }

    private bool locating;
    private async Task Relocate()
    {
        if (!enabled || locating) return;
        locating = true;
        int request = generation;
        Placement? placement = null;
        try
        {
            placement = await FindPlacement();
        }
        catch (Exception e) when (e is COMException or InvalidOperationException or ArgumentException) { }
        finally { locating = false; }
        if (!enabled || request != generation) return;
        if (placement is null)
        {
            CloseForm();
            return;
        }

        var p = placement.Value;
        if (form is null || form.IsDisposed || !form.IsHandleCreated || !IsWindow(form.Handle))
        {
            CloseForm();
            form = new WidgetForm(command);
            form.CreateControl();
        }

        form.Orient(p.Vertical);
        if (!Attach(form, p))
        {
            CloseForm();
            return;
        }
        Paint();
    }

    private static bool Attach(WidgetForm widget, Placement placement)
    {
        var hwnd = widget.Handle;
        if (!AttachToTaskbar(hwnd, placement.Parent)) return false;
        if (!widget.Visible) widget.Show();
        // WinForms can update its native parent when first made visible.
        if (!AttachToTaskbar(hwnd, placement.Parent)) return false;
        return SetWindowPos(hwnd, IntPtr.Zero, placement.X, placement.Y, placement.Width, placement.Height,
            0x0010 | 0x0020);
    }

    private static bool AttachToTaskbar(IntPtr hwnd, IntPtr taskbar)
    {
        if (GetParent(hwnd) == taskbar) return true;
        // Only the widget HWND belongs to us. Explorer keeps ownership of the taskbar.
        int style = GetWindowLong(hwnd, -16);
        SetWindowLong(hwnd, -16, (style & ~unchecked((int)0x80000000)) | 0x40000000);
        SetParent(hwnd, taskbar);
        return GetParent(hwnd) == taskbar;
    }

    private readonly record struct Placement(IntPtr Parent, int X, int Y, int Width, int Height, bool Vertical);
    private readonly record struct Anchors(Rect? Frame, Rect? Tray, Rect? Widgets);

    private async Task<Placement?> FindPlacement()
    {
        var bar = FindWindow("Shell_TrayWnd", null);
        if (bar == IntPtr.Zero || !GetWindowRect(bar, out var bounds)) return null;

        Anchors anchors = default;
        if (!legacyBounds)
        {
            // A stalled Explorer accessibility provider must not prevent Win32 placement.
            if (anchorQuery is null || (queriedTaskbar != bar && anchorQuery.IsCompleted))
            {
                queriedTaskbar = bar;
                anchorQuery = Task.Run(() => ReadAnchors(bar));
            }
            if (queriedTaskbar == bar)
            {
                try { anchors = await anchorQuery.WaitAsync(TimeSpan.FromMilliseconds(450)); }
                catch (TimeoutException) { }
            }
            if (anchorQuery.IsCompleted) anchorQuery = null;
        }

        Rect? tray = anchors.Tray;
        if (tray is null)
        {
            var trayWindow = FindWindowEx(bar, IntPtr.Zero, "TrayNotifyWnd", null);
            if (trayWindow != IntPtr.Zero && GetWindowRect(trayWindow, out var nativeTray)) tray = nativeTray;
        }
        var origin = new Point(0, 0);
        if (!ClientToScreen(bar, ref origin)) return null;
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
        int thickness = Math.Min(cross - 4, (int)Math.Round(32 * scale));
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
        using var widget = new WidgetForm(_ => { });
        var test = new Placement(host.Handle, 8, 8, 205, 32, false);
        if (!Attach(widget, test) || GetParent(widget.Handle) != host.Handle)
            throw new InvalidOperationException("The widget is not attached to its native parent");
    }

    public void Dispose()
    {
        enabled = false;
        generation++;
        timer.Dispose();
        CloseForm();
    }

    private sealed class WidgetForm : Forms.Form
    {
        private readonly Forms.Button title = new() { FlatStyle = Forms.FlatStyle.Flat, TextAlign = ContentAlignment.MiddleLeft, AutoEllipsis = true };
        private readonly Forms.Button prev = new() { FlatStyle = Forms.FlatStyle.Flat, Text = "⏮" };
        private readonly Forms.Button play = new() { FlatStyle = Forms.FlatStyle.Flat };
        private readonly Forms.Button next = new() { FlatStyle = Forms.FlatStyle.Flat, Text = "⏭" };
        private readonly Forms.Control meter = new();
        private readonly Forms.ToolTip tips = new();
        private readonly Forms.TableLayoutPanel layout = new() { Dock = Forms.DockStyle.Fill, Margin = Forms.Padding.Empty };
        private bool? vertical;
        private double[] spectrum = [];

        public WidgetForm(Action<string> command)
        {
            AutoScaleMode = Forms.AutoScaleMode.None;
            FormBorderStyle = Forms.FormBorderStyle.None;
            ShowInTaskbar = false;
            ShowIcon = false;
            StartPosition = Forms.FormStartPosition.Manual;
            foreach (var (button, action) in new[] { (title, "open"), (prev, "prev"), (play, "playpause"), (next, "next") })
            {
                button.FlatAppearance.BorderSize = 0;
                button.Dock = Forms.DockStyle.Fill;
                button.Margin = Forms.Padding.Empty;
                button.Click += (_, _) => command(action);
            }
            meter.Dock = Forms.DockStyle.Fill;
            meter.Paint += (_, e) =>
            {
                using var brush = new SolidBrush(ForeColor);
                for (int i = 0; i < spectrum.Length; i++)
                {
                    float step = meter.Width / (float)spectrum.Length;
                    float height = (float)Math.Max(2, spectrum[i] * meter.Height * 0.52);
                    e.Graphics.FillRectangle(brush, i * step, (meter.Height - height) / 2, Math.Max(1, step - 1), height);
                }
            };
            Controls.Add(layout);
            Orient(false);
        }

        public void Orient(bool stack)
        {
            if (vertical == stack) return;
            vertical = stack;
            layout.SuspendLayout();
            layout.Controls.Clear();
            layout.ColumnStyles.Clear();
            layout.RowStyles.Clear();
            layout.ColumnCount = stack ? 1 : 5;
            layout.RowCount = stack ? 5 : 1;
            title.TextAlign = stack ? ContentAlignment.MiddleCenter : ContentAlignment.MiddleLeft;
            Forms.Control[] items = [title, meter, prev, play, next];
            for (int i = 0; i < items.Length; i++)
            {
                if (stack) layout.RowStyles.Add(new Forms.RowStyle(Forms.SizeType.Percent, 20));
                else layout.ColumnStyles.Add(new Forms.ColumnStyle(Forms.SizeType.Percent, i == 0 ? 100 : i == 1 ? 15 : 20));
                layout.Controls.Add(items[i], stack ? 0 : i, stack ? i : 0);
            }
            layout.ResumeLayout();
        }

        protected override bool ShowWithoutActivation => true;

        public void UpdateView(string track, string open, string previous, string playback, string following,
            bool playing, bool canPlay, bool canPrev, bool canNext, bool light, double[] levels)
        {
            BackColor = light ? Color.FromArgb(240, 240, 244) : Color.FromArgb(28, 30, 38);
            ForeColor = light ? Color.FromArgb(32, 33, 41) : Color.WhiteSmoke;
            title.Text = vertical == true ? "♫" : string.IsNullOrEmpty(track) ? "Opsis" : track.Replace("&", "&&");
            if (!string.IsNullOrEmpty(track)) open = $"{open} · {track}";
            prev.Enabled = canPrev;
            play.Enabled = canPlay;
            next.Enabled = canNext;
            play.Text = playing ? "⏸" : "▶";
            foreach (var (button, name) in new[] { (title, open), (prev, previous), (play, playback), (next, following) })
            {
                if (button.AccessibleName == name) continue;
                button.AccessibleName = name;
                tips.SetToolTip(button, name);
            }
            spectrum = levels;
            meter.Invalidate();
        }

        protected override void Dispose(bool disposing)
        {
            if (disposing) tips.Dispose();
            base.Dispose(disposing);
        }
    }

    [StructLayout(LayoutKind.Sequential)] private struct Rect { public int Left, Top, Right, Bottom; }
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern IntPtr FindWindow(string name, string? caption);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern IntPtr FindWindowEx(IntPtr parent, IntPtr after, string name, string? caption);
    [DllImport("user32.dll")] private static extern bool GetWindowRect(IntPtr window, out Rect rect);
    [DllImport("user32.dll")] private static extern bool ClientToScreen(IntPtr window, ref Point point);
    [DllImport("user32.dll")] private static extern uint GetDpiForWindow(IntPtr window);
    [DllImport("user32.dll")] private static extern IntPtr GetParent(IntPtr window);
    [DllImport("user32.dll")] private static extern IntPtr SetParent(IntPtr window, IntPtr parent);
    [DllImport("user32.dll")] private static extern bool IsWindow(IntPtr window);
    [DllImport("user32.dll", EntryPoint = "GetWindowLongW")] private static extern int GetWindowLong(IntPtr window, int index);
    [DllImport("user32.dll", EntryPoint = "SetWindowLongW")] private static extern int SetWindowLong(IntPtr window, int index, int value);
    [DllImport("user32.dll")] private static extern bool SetWindowPos(IntPtr window, IntPtr after, int x, int y, int w, int h, uint flags);
}
