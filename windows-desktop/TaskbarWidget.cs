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

    public TaskbarWidget(Action<string> command)
    {
        this.command = command;
        timer = new Forms.Timer { Interval = 1500 };
        timer.Tick += async (_, _) => await Relocate();
    }

    public void Configure(bool show, bool lightTheme, string openLabel, string prevLabel, string playLabel, string nextLabel)
    {
        light = lightTheme;
        open = openLabel;
        previous = prevLabel;
        playback = playLabel;
        next = nextLabel;
        if (show != enabled)
        {
            enabled = show;
            generation++;
            if (show)
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
            placement = await Task.Run(() => FindPlacement());
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

        var handle = form.Handle;
        if (GetParent(handle) != p.Parent)
        {
            // The widget is our own window. Explorer supplies the taskbar parent only.
            int style = GetWindowLong(handle, -16);
            SetWindowLong(handle, -16, (style & ~unchecked((int)0x80000000)) | 0x40000000);
            SetParent(handle, p.Parent);
            if (GetParent(handle) != p.Parent)
            {
                CloseForm();
                return;
            }
        }
        form.Orient(p.Vertical);
        if (!form.Visible) form.Show();
        SetWindowPos(handle, IntPtr.Zero, p.X, p.Y, p.Width, p.Height, 0x0010 | 0x0020);
        Paint();
    }

    private readonly record struct Placement(IntPtr Parent, int X, int Y, int Width, int Height, bool Vertical);

    private static Placement? FindPlacement()
    {
        var bar = FindWindow("Shell_TrayWnd", null);
        if (bar == IntPtr.Zero || !GetWindowRect(bar, out var rect)) return null;
        int barWidth = rect.Right - rect.Left;
        int barHeight = rect.Bottom - rect.Top;
        bool vertical = barHeight > barWidth;
        int cross = vertical ? barWidth : barHeight;
        if (cross < 24) return null;
        uint dpi = GetDpiForWindow(bar);
        int wanted = (int)((vertical ? 156 : 205) * Math.Max(96, dpi) / 96);
        var origin = new Point(rect.Left, rect.Top);
        if (!ScreenToClient(bar, ref origin)) return null;
        int start = vertical ? rect.Top : rect.Left;
        int min = start + 4;
        int max = (vertical ? rect.Bottom : rect.Right) - 4;
        var tray = FindWindowEx(bar, IntPtr.Zero, "TrayNotifyWnd", null);
        if (tray != IntPtr.Zero && GetWindowRect(tray, out var trayRect))
        {
            int trayStart = vertical ? trayRect.Top : trayRect.Left;
            if (trayStart > min) max = Math.Min(max, trayStart - 5);
        }

        var root = AutomationElement.FromHandle(bar);
        var interactive = root.FindAll(TreeScope.Descendants, new OrCondition(
            new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Button),
            new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.ListItem),
            new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.MenuItem)));
        var occupied = new List<(int Left, int Right)>();
        foreach (AutomationElement element in interactive)
        {
            var bounds = element.Current.BoundingRectangle;
            if (element.Current.ProcessId == Environment.ProcessId || element.Current.IsOffscreen || bounds.IsEmpty ||
                bounds.Width <= 0 || bounds.Height <= 0 || bounds.Bottom <= rect.Top || bounds.Top >= rect.Bottom ||
                bounds.Right <= rect.Left || bounds.Left >= rect.Right) continue;
            occupied.Add(((int)(vertical ? bounds.Top : bounds.Left) - 3, (int)Math.Ceiling(vertical ? bounds.Bottom : bounds.Right) + 3));
        }
        if (occupied.Count == 0) return null; // Wait for Explorer's accessible layout.
        var limit = max;
        foreach (var area in occupied.OrderByDescending(x => x.Right))
        {
            if (area.Left >= limit) continue;
            if (limit - Math.Max(min, area.Right) >= wanted) break;
            limit = Math.Min(limit, area.Left);
        }
        if (limit - min < wanted) return null;
        int thickness = Math.Min(cross - 4, (int)(32 * Math.Max(96, dpi) / 96));
        int offset = limit - wanted - start;
        int center = (cross - thickness) / 2;
        return vertical
            ? new Placement(bar, origin.X + center, origin.Y + offset, thickness, wanted, true)
            : new Placement(bar, origin.X + offset, origin.Y + center, wanted, thickness, false);
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
    [DllImport("user32.dll")] private static extern bool ScreenToClient(IntPtr window, ref Point point);
    [DllImport("user32.dll")] private static extern uint GetDpiForWindow(IntPtr window);
    [DllImport("user32.dll")] private static extern IntPtr GetParent(IntPtr window);
    [DllImport("user32.dll")] private static extern IntPtr SetParent(IntPtr window, IntPtr parent);
    [DllImport("user32.dll")] private static extern bool IsWindow(IntPtr window);
    [DllImport("user32.dll", EntryPoint = "GetWindowLongW")] private static extern int GetWindowLong(IntPtr window, int index);
    [DllImport("user32.dll", EntryPoint = "SetWindowLongW")] private static extern int SetWindowLong(IntPtr window, int index, int value);
    [DllImport("user32.dll")] private static extern bool SetWindowPos(IntPtr window, IntPtr after, int x, int y, int w, int h, uint flags);
}
