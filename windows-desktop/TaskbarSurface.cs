using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Automation;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Interop;
using System.Windows.Media;
using Brush = System.Windows.Media.Brush;
using Brushes = System.Windows.Media.Brushes;
using Button = System.Windows.Controls.Button;
using Color = System.Windows.Media.Color;
using HorizontalAlignment = System.Windows.HorizontalAlignment;

sealed class TaskbarSurface : IDisposable
{
    private const int Child = 0x40000000;
    private const int ClipSiblings = 0x04000000;
    private const int NoActivate = 0x08000000;
    private const int WindowStyle = -16;
    private const uint ShowAtTop = 0x0010 | 0x0040 | 0x0400; // No activate, show, skip position-change notifications.
    private readonly IntPtr parent;
    private readonly HwndSource source;
    private readonly Grid layout = new() { ClipToBounds = true };
    private readonly TextBlock track = new() { TextTrimming = TextTrimming.CharacterEllipsis, VerticalAlignment = VerticalAlignment.Center };
    private readonly Button title = CreateButton();
    private readonly Button previous = CreateButton("⏮");
    private readonly Button playback = CreateButton();
    private readonly Button next = CreateButton("⏭");
    private readonly Border[] meterBars = new Border[8];
    private static readonly Brush LightBackground = BrushFrom(240, 240, 244);
    private static readonly Brush DarkBackground = BrushFrom(28, 30, 38);
    private static readonly Brush LightText = BrushFrom(32, 33, 41);

    public bool Vertical { get; }
    public bool IsAlive => !source.IsDisposed && IsWindow(source.Handle);
    public bool IsExposed => IsAlive && IsWindowVisible(source.Handle) && GetTopWindow(parent) == source.Handle;

    public TaskbarSurface(IntPtr parent, bool vertical, int width, int height, Action<string> command)
    {
        this.parent = parent;
        Vertical = vertical;
        // Create a real child HWND from the start. Turning a top-level window into a child later can change its DPI context.
        var parameters = new HwndSourceParameters("Opsis Media Suite Taskbar Widget", width, height)
        {
            ParentWindow = parent,
            WindowStyle = Child | ClipSiblings,
            ExtendedWindowStyle = NoActivate,
        };
        source = new HwndSource(parameters);
        source.AddHook(WindowMessage);
        try
        {
            title.Content = track;
            title.HorizontalContentAlignment = vertical ? HorizontalAlignment.Center : HorizontalAlignment.Stretch;
            if (!vertical) title.Padding = new Thickness(4, 0, 2, 0);
            var meter = new UniformGrid { Rows = 1, VerticalAlignment = VerticalAlignment.Center, Height = 16, IsHitTestVisible = false };
            for (int i = 0; i < meterBars.Length; i++)
            {
                meterBars[i] = new Border { Height = 2, Margin = new Thickness(0.5, 0, 0.5, 0), VerticalAlignment = VerticalAlignment.Center };
                meter.Children.Add(meterBars[i]);
            }
            foreach (var (button, action) in new[] { (title, "open"), (previous, "prev"), (playback, "playpause"), (next, "next") })
                button.Click += (_, _) => command(action);
            UIElement[] elements = [title, meter, previous, playback, next];
            for (int i = 0; i < elements.Length; i++)
            {
                if (vertical)
                {
                    layout.RowDefinitions.Add(new RowDefinition());
                    Grid.SetRow(elements[i], i);
                }
                else
                {
                    layout.ColumnDefinitions.Add(new ColumnDefinition { Width = i == 0 ? new GridLength(1, GridUnitType.Star) : new GridLength(i == 1 ? 20 : 25) });
                    Grid.SetColumn(elements[i], i);
                }
                layout.Children.Add(elements[i]);
            }
            source.RootVisual = layout;
            UpdateView("", "", "", "", "", false, false, false, false, false, []);
        }
        catch
        {
            source.Dispose();
            throw;
        }
    }

    public void Place(int x, int y, int width, int height)
    {
        if (!IsAlive || GetAncestor(source.Handle, 1) != parent || (GetWindowLong(source.Handle, WindowStyle) & Child) == 0)
            throw new InvalidOperationException("The taskbar widget lost its native parent");
        // Explorer's composition window can cover the entire taskbar. Raise and show the widget as an Explorer child.
        if (!SetWindowPos(source.Handle, IntPtr.Zero, x, y, width, height, ShowAtTop))
            throw new Win32Exception(Marshal.GetLastWin32Error());
    }

    public void VerifyVisibleChild()
    {
        if (GetAncestor(source.Handle, 1) != parent || !IsExposed)
            throw new InvalidOperationException("The widget must be a visible top child of its taskbar");
    }

    private static Button CreateButton(string text = "") => new()
    {
        Content = text, Background = Brushes.Transparent, BorderThickness = new Thickness(0),
        Padding = new Thickness(0), Focusable = false, FontSize = 12, MinWidth = 0,
    };

    private static Brush BrushFrom(byte red, byte green, byte blue)
    {
        var brush = new SolidColorBrush(Color.FromRgb(red, green, blue));
        brush.Freeze();
        return brush;
    }

    public void UpdateView(string name, string open, string back, string play, string forward,
        bool playing, bool canPlay, bool canPrev, bool canNext, bool light, double[] levels)
    {
        layout.Background = light ? LightBackground : DarkBackground;
        Brush foreground = light ? LightText : Brushes.WhiteSmoke;
        track.Text = Vertical ? "♫" : string.IsNullOrEmpty(name) ? "Opsis" : name;
        playback.Content = playing ? "⏸" : "▶";
        previous.IsEnabled = canPrev;
        playback.IsEnabled = canPlay;
        next.IsEnabled = canNext;
        foreach (var (button, label) in new[] { (title, string.IsNullOrEmpty(name) ? open : $"{open} · {name}"), (previous, back), (playback, play), (next, forward) })
        {
            button.Foreground = foreground;
            AutomationProperties.SetName(button, label);
            button.ToolTip = label;
        }
        for (int i = 0; i < meterBars.Length; i++)
        {
            meterBars[i].Background = foreground;
            meterBars[i].Height = 2 + (i < levels.Length ? levels[i] * 12 : 0);
        }
    }

    private static IntPtr WindowMessage(IntPtr window, int message, IntPtr wParam, IntPtr lParam, ref bool handled)
    {
        if (message != 0x0021) return IntPtr.Zero; // WM_MOUSEACTIVATE
        handled = true;
        return new IntPtr(3); // MA_NOACTIVATE keeps the click and does not focus the widget.
    }

    public void Dispose() => source.Dispose();

    [DllImport("user32.dll")] private static extern IntPtr GetAncestor(IntPtr window, uint flags);
    [DllImport("user32.dll")] private static extern IntPtr GetTopWindow(IntPtr window);
    [DllImport("user32.dll")] private static extern bool IsWindow(IntPtr window);
    [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr window);
    [DllImport("user32.dll", EntryPoint = "GetWindowLongW")] private static extern int GetWindowLong(IntPtr window, int index);
    [DllImport("user32.dll", SetLastError = true)] private static extern bool SetWindowPos(IntPtr window, IntPtr after, int x, int y, int width, int height, uint flags);
}
