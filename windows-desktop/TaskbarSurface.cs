using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Automation;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Interop;
using System.Windows.Media;
using System.Windows.Media.Effects;
using System.Windows.Threading;
using Brush = System.Windows.Media.Brush;
using Brushes = System.Windows.Media.Brushes;
using Button = System.Windows.Controls.Button;
using Color = System.Windows.Media.Color;
using HorizontalAlignment = System.Windows.HorizontalAlignment;
using Image = System.Windows.Controls.Image;
using SystemColors = System.Windows.SystemColors;

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
    private readonly Border plate = new() { CornerRadius = new CornerRadius(6), BorderThickness = new Thickness(1), IsHitTestVisible = false };
    private readonly Image backdrop = new() { Stretch = Stretch.UniformToFill, Opacity = 0.24, IsHitTestVisible = false, Effect = new BlurEffect { Radius = 15 } };
    private readonly TextBlock track = new() { TextTrimming = TextTrimming.CharacterEllipsis, FontWeight = FontWeights.SemiBold };
    private readonly TextBlock artist = new() { TextTrimming = TextTrimming.CharacterEllipsis, FontSize = 10, Opacity = 0.68 };
    private readonly Image artwork = new() { Stretch = Stretch.UniformToFill };
    private readonly TextBlock musicIcon = new() { Text = "♫", HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center };
    private readonly Border cover = new() { CornerRadius = new CornerRadius(4), Margin = new Thickness(2, 0, 2, 0), VerticalAlignment = VerticalAlignment.Center };
    private readonly Button title = CreateButton();
    private readonly Button previous = CreateButton("⏮");
    private readonly Button playback = CreateButton();
    private readonly Button next = CreateButton("⏭");
    private readonly Border[] meterBars = new Border[8];
    private static readonly Brush Idle = BrushFrom(0, 0, 0, 1);
    private static readonly Brush LightText = BrushFrom(24, 24, 26);
    private static readonly Brush LightHover = BrushFrom(255, 255, 255, 100);
    private static readonly Brush DarkHover = BrushFrom(255, 255, 255, 20);
    private static readonly Brush LightOutline = BrushFrom(24, 24, 26, 30);
    private static readonly Brush DarkOutline = BrushFrom(255, 255, 255, 35);
    private bool light, compact, hasArtist, coverBackground;
    private ImageSource? currentCover;

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
            // Layer the child into Explorer's composition instead of relying on its normal child paint order.
            UsesPerPixelTransparency = true,
        };
        source = new HwndSource(parameters);
        source.AddHook(WindowMessage);
        try
        {
            var coverContent = new Grid { ClipToBounds = true };
            coverContent.Children.Add(artwork);
            coverContent.Children.Add(musicIcon);
            cover.Child = coverContent;
            cover.SizeChanged += (_, _) =>
                coverContent.Clip = new RectangleGeometry(new Rect(0, 0, cover.ActualWidth, cover.ActualHeight), 4, 4);
            var metadata = new StackPanel { VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(6, 0, 3, 0) };
            metadata.Children.Add(track);
            metadata.Children.Add(artist);
            var summary = new DockPanel();
            DockPanel.SetDock(cover, Dock.Left);
            summary.Children.Add(cover);
            if (!vertical) summary.Children.Add(metadata);
            title.Content = summary;
            title.HorizontalContentAlignment = vertical ? HorizontalAlignment.Center : HorizontalAlignment.Stretch;

            var content = new Grid();
            layout.Children.Add(backdrop);
            layout.Children.Add(plate);
            layout.Children.Add(content);
            layout.MouseEnter += (_, _) => RefreshPalette();
            layout.MouseLeave += (_, _) => RefreshPalette();
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
                    content.RowDefinitions.Add(new RowDefinition());
                    Grid.SetRow(elements[i], i);
                }
                else
                {
                    content.ColumnDefinitions.Add(new ColumnDefinition { Width = i == 0 ? new GridLength(1, GridUnitType.Star) : new GridLength(i == 1 ? 20 : 25) });
                    Grid.SetColumn(elements[i], i);
                }
                content.Children.Add(elements[i]);
            }
            source.RootVisual = layout;
            UpdateView("", "", null, "", "", "", "", false, false, false, false, false, false, []);
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
        double scale = VisualTreeHelper.GetDpi(layout).DpiScaleY;
        compact = (Vertical ? width : height) / scale < 36;
        double coverSize = compact || Vertical ? 23 : 32;
        cover.Height = cover.Width = Math.Min((Vertical ? width : height) / scale - 2, coverSize);
        artist.Visibility = !Vertical && !compact && hasArtist ? Visibility.Visible : Visibility.Collapsed;
    }

    public void VerifyVisibleChild()
    {
        if (GetAncestor(source.Handle, 1) != parent || !IsExposed)
            throw new InvalidOperationException("The widget must be a visible top child of its taskbar");
    }

    public void VerifyRenderedPixels()
    {
        VerifyVisibleChild();
        var marker = System.Drawing.Color.FromArgb(222, 37, 149);
        layout.Background = BrushFrom(marker.R, marker.G, marker.B);
        layout.UpdateLayout();
        if (!GetWindowRect(source.Handle, out var rect) || rect.Right - rect.Left < 8 || rect.Bottom - rect.Top < 8)
            throw new InvalidOperationException("The widget has no visible test region");

        var frame = new DispatcherFrame();
        var timer = new DispatcherTimer(DispatcherPriority.Background) { Interval = TimeSpan.FromMilliseconds(120) };
        bool rendered = false;
        int attempts = 0;
        timer.Tick += (_, _) =>
        {
            rendered = ReadScreenPixel(rect.Left + 3, rect.Top + 3).ToArgb() == marker.ToArgb() ||
                ReadScreenPixel(rect.Right - 4, rect.Bottom - 4).ToArgb() == marker.ToArgb();
            if (rendered || ++attempts >= 12) frame.Continue = false;
        };
        timer.Start();
        try { Dispatcher.PushFrame(frame); }
        finally { timer.Stop(); }
        if (!rendered) throw new InvalidOperationException("The widget HWND was visible but its pixels were not on the taskbar");
    }

    private static System.Drawing.Color ReadScreenPixel(int x, int y)
    {
        using var pixel = new System.Drawing.Bitmap(1, 1);
        using var graphics = System.Drawing.Graphics.FromImage(pixel);
        var sourceDc = GetDC(IntPtr.Zero);
        if (sourceDc == IntPtr.Zero) return System.Drawing.Color.Empty;
        var destination = graphics.GetHdc();
        bool copied;
        try
        {
            const uint SourceCopyAndCaptureLayers = 0x00CC0020 | 0x40000000;
            copied = BitBlt(destination, 0, 0, 1, 1, sourceDc, x, y, SourceCopyAndCaptureLayers);
        }
        finally
        {
            graphics.ReleaseHdc(destination);
            ReleaseDC(IntPtr.Zero, sourceDc);
        }
        return copied ? pixel.GetPixel(0, 0) : System.Drawing.Color.Empty;
    }

    private static Button CreateButton(string text = "") => new()
    {
        Content = text, Background = Brushes.Transparent, BorderThickness = new Thickness(0),
        Padding = new Thickness(0), Focusable = false, FontSize = 12, MinWidth = 0,
    };

    private static Brush BrushFrom(byte red, byte green, byte blue, byte alpha = 255)
    {
        var brush = new SolidColorBrush(Color.FromArgb(alpha, red, green, blue));
        brush.Freeze();
        return brush;
    }

    private void RefreshPalette()
    {
        bool highContrast = SystemParameters.HighContrast;
        Brush foreground = highContrast ? SystemColors.WindowTextBrush : light ? LightText : Brushes.WhiteSmoke;
        layout.Background = highContrast ? SystemColors.WindowBrush : Idle;
        plate.Background = layout.IsMouseOver && !highContrast ? light ? LightHover : DarkHover : Brushes.Transparent;
        plate.BorderBrush = highContrast ? SystemColors.WindowTextBrush : layout.IsMouseOver ? light ? LightOutline : DarkOutline : Brushes.Transparent;
        backdrop.Visibility = !highContrast && coverBackground && currentCover is not null ? Visibility.Visible : Visibility.Collapsed;
        cover.Background = highContrast ? SystemColors.WindowBrush : light ? LightHover : DarkHover;
        musicIcon.Foreground = foreground;
        foreach (var button in new[] { title, previous, playback, next }) button.Foreground = foreground;
        foreach (var bar in meterBars) bar.Background = foreground;
    }

    public void UpdateView(string name, string performer, ImageSource? image, string open, string back, string play, string forward,
        bool playing, bool canPlay, bool canPrev, bool canNext, bool lightTheme, bool useCoverBackground, double[] levels)
    {
        light = lightTheme;
        coverBackground = useCoverBackground;
        if (!ReferenceEquals(currentCover, image))
        {
            currentCover = image;
            artwork.Source = backdrop.Source = image;
        }
        musicIcon.Visibility = image is null ? Visibility.Visible : Visibility.Collapsed;
        track.Text = string.IsNullOrEmpty(name) ? "Opsis" : name;
        artist.Text = performer;
        hasArtist = !string.IsNullOrEmpty(performer);
        artist.Visibility = !Vertical && !compact && hasArtist ? Visibility.Visible : Visibility.Collapsed;
        playback.Content = playing ? "⏸" : "▶";
        previous.IsEnabled = canPrev;
        playback.IsEnabled = canPlay;
        next.IsEnabled = canNext;
        foreach (var (button, label) in new[] { (title, string.IsNullOrEmpty(name) ? open : $"{open} · {name}"), (previous, back), (playback, play), (next, forward) })
        {
            AutomationProperties.SetName(button, label);
            button.ToolTip = label;
        }
        for (int i = 0; i < meterBars.Length; i++)
            meterBars[i].Height = 2 + (i < levels.Length ? levels[i] * 12 : 0);
        RefreshPalette();
    }

    public void VerifyAppearance()
    {
        UpdateView("Test title", "Test artist", new DrawingImage(), "", "", "", "",
            false, true, true, true, true, false, []);
        if (musicIcon.Visibility != Visibility.Collapsed || backdrop.Visibility != Visibility.Collapsed)
            throw new InvalidOperationException("Album art should replace the placeholder without adding a backdrop");
        if (SystemParameters.HighContrast) return;
        var lightForeground = title.Foreground;
        if (layout.Background is not SolidColorBrush idle || idle.Color.A > 1)
            throw new InvalidOperationException("The idle widget must blend into the taskbar");
        UpdateView("Test title", "Test artist", currentCover, "", "", "", "",
            false, true, true, true, false, true, []);
        if (Equals(lightForeground, title.Foreground) || backdrop.Visibility != Visibility.Visible)
            throw new InvalidOperationException("Dark text contrast and optional album-art backdrop must update independently");
    }

    private static IntPtr WindowMessage(IntPtr window, int message, IntPtr wParam, IntPtr lParam, ref bool handled)
    {
        if (message != 0x0021) return IntPtr.Zero; // WM_MOUSEACTIVATE
        handled = true;
        return new IntPtr(3); // MA_NOACTIVATE keeps the click and does not focus the widget.
    }

    public void Dispose() => source.Dispose();

    [StructLayout(LayoutKind.Sequential)] private struct ScreenRect { public int Left, Top, Right, Bottom; }
    [DllImport("user32.dll")] private static extern bool GetWindowRect(IntPtr window, out ScreenRect rect);
    [DllImport("user32.dll")] private static extern IntPtr GetDC(IntPtr window);
    [DllImport("user32.dll")] private static extern int ReleaseDC(IntPtr window, IntPtr dc);
    [DllImport("gdi32.dll")] private static extern bool BitBlt(IntPtr destination, int dx, int dy, int w, int h, IntPtr source, int sx, int sy, uint operation);
    [DllImport("user32.dll")] private static extern IntPtr GetAncestor(IntPtr window, uint flags);
    [DllImport("user32.dll")] private static extern IntPtr GetTopWindow(IntPtr window);
    [DllImport("user32.dll")] private static extern bool IsWindow(IntPtr window);
    [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr window);
    [DllImport("user32.dll", EntryPoint = "GetWindowLongW")] private static extern int GetWindowLong(IntPtr window, int index);
    [DllImport("user32.dll", SetLastError = true)] private static extern bool SetWindowPos(IntPtr window, IntPtr after, int x, int y, int width, int height, uint flags);
}
