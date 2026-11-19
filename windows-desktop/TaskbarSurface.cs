using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Automation;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Interop;
using System.Windows.Markup;
using System.Windows.Media;
using System.Windows.Media.Effects;
using System.Windows.Threading;
using Brush = System.Windows.Media.Brush;
using Brushes = System.Windows.Media.Brushes;
using Button = System.Windows.Controls.Button;
using Color = System.Windows.Media.Color;
using Control = System.Windows.Controls.Control;
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
    private readonly Image backdrop = new() { Stretch = Stretch.UniformToFill, Opacity = 1, IsHitTestVisible = false, Effect = new BlurEffect { Radius = 15 } };
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
    private static readonly ControlTemplate ButtonTemplate = CreateButtonTemplate();
    private static readonly Brush HitArea = BrushFrom(255, 255, 255, 1);
    private static readonly Brush LightText = BrushFrom(24, 24, 26);
    private static readonly Brush LightHover = BrushFrom(255, 255, 255, 100);
    private static readonly Brush DarkHover = BrushFrom(255, 255, 255, 20);
    private readonly TextBlock grip = new()
    {
        Text = "⋮", FontSize = 14, Background = HitArea, HorizontalAlignment = HorizontalAlignment.Center,
        VerticalAlignment = VerticalAlignment.Center, Cursor = System.Windows.Input.Cursors.SizeWE,
    };
    private readonly DispatcherTimer dragTimer = new() { Interval = TimeSpan.FromMilliseconds(16) };
    private readonly Action<double>? positionChanged;
    private Brush? accentBrush;
    private Color? systemAccent;
    private int x, y, width, height, min, max, dragOrigin, cursorOrigin;
    private TaskbarRange[] ranges = [];
    private bool light, compact, hasArtist, coverBackground;
    private ImageSource? currentCover;

    public bool Vertical { get; }
    public bool IsAlive => !source.IsDisposed && IsWindow(source.Handle);
    public bool IsExposed => IsAlive && IsWindowVisible(source.Handle) && GetTopWindow(parent) == source.Handle;

    public TaskbarSurface(IntPtr parent, bool vertical, int width, int height, Action<string> command, Action<double>? positionChanged = null)
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
        this.positionChanged = positionChanged;
        source = new HwndSource(parameters);
        dragTimer.Tick += (_, _) => MoveGrip();
        if (Vertical) grip.Cursor = System.Windows.Input.Cursors.SizeNS;
        // The cross-process, layered child needs a reliable software surface even when Explorer uses GPU composition.
        source.CompositionTarget.RenderMode = RenderMode.SoftwareOnly;
        source.AddHook(WindowMessage);
        try
        {
            var coverContent = new Grid { ClipToBounds = true };
            coverContent.Children.Add(artwork);
            coverContent.Children.Add(backdrop);
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
            layout.Children.Add(content);
            grip.MouseLeftButtonDown += (_, e) =>
            {
                if (positionChanged is null || !GetCursorPos(out var point)) return;
                dragOrigin = Vertical ? y : x;
                cursorOrigin = Vertical ? point.Y : point.X;
                dragTimer.Start();
                e.Handled = true;
            };
            var meter = new UniformGrid { Rows = 1, VerticalAlignment = VerticalAlignment.Center, Height = 16, IsHitTestVisible = false };
            for (int i = 0; i < meterBars.Length; i++)
            {
                meterBars[i] = new Border { Height = 2, Margin = new Thickness(0.5, 0, 0.5, 0), VerticalAlignment = VerticalAlignment.Center };
                meter.Children.Add(meterBars[i]);
            }
            foreach (var (button, action) in new[] { (title, "open"), (previous, "prev"), (playback, "playpause"), (next, "next") })
                button.Click += (_, _) => command(action);
            UIElement[] elements = [grip, title, meter, previous, playback, next];
            for (int i = 0; i < elements.Length; i++)
            {
                if (vertical)
                {
                    content.RowDefinitions.Add(i == 0 ? new RowDefinition { Height = new GridLength(13) } : new RowDefinition());
                    Grid.SetRow(elements[i], i);
                }
                else
                {
                    content.ColumnDefinitions.Add(new ColumnDefinition { Width = i == 1 ? new GridLength(1, GridUnitType.Star) : new GridLength(i == 0 ? 11 : i == 2 ? 20 : 25) });
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

    public void SetLanguage(string language)
    {
        if (!string.Equals(layout.Language.IetfLanguageTag, language, StringComparison.OrdinalIgnoreCase))
            layout.Language = XmlLanguage.GetLanguage(language);
    }

    public void SetDragLabel(string label)
    {
        AutomationProperties.SetName(grip, label);
        grip.ToolTip = label;
    }

    public void SetSystemAccent(Color? color)
    {
        if (color == systemAccent) return;
        systemAccent = color;
        accentBrush = color is { } rgb ? BrushFrom(rgb.R, rgb.G, rgb.B) : null;
        RefreshPalette();
    }

    private void MoveGrip()
    {
        if (!IsAlive) { dragTimer.Stop(); return; }
        if (GetCursorPos(out var point))
        {
            int axis = Vertical ? point.Y : point.X;
            int primary = Snap(dragOrigin + axis - cursorOrigin);
            int nextX = Vertical ? x : primary;
            int nextY = Vertical ? primary : y;
            if ((nextX != x || nextY != y) && SetWindowPos(source.Handle, IntPtr.Zero, nextX, nextY, width, height, ShowAtTop))
                (x, y) = (nextX, nextY);
        }
        if ((GetAsyncKeyState(1) & 0x8000) != 0) return;
        dragTimer.Stop();
        int final = Vertical ? y : x;
        if (final != dragOrigin && max > min) positionChanged?.Invoke((double)(final - min) / (max - min));
    }

    private int Snap(int desired) => ranges.Length == 0 ? Math.Clamp(desired, min, max) : TaskbarRange.Snap(desired, ranges);

    public void Place(int x, int y, int width, int height, int min = 0, int max = 0, TaskbarRange[]? ranges = null)
    {
        if (!IsAlive || GetAncestor(source.Handle, 1) != parent || (GetWindowLong(source.Handle, WindowStyle) & Child) == 0)
            throw new InvalidOperationException("The taskbar widget lost its native parent");
        this.min = min;
        this.max = max;
        this.ranges = ranges ?? [];
        if (dragTimer.IsEnabled)
        {
            if (Vertical) y = Snap(this.y);
            else x = Snap(this.x);
        }
        (this.x, this.y, this.width, this.height) = (x, y, width, height);
        // Explorer's composition window can cover the entire taskbar. Raise and show the widget as an Explorer child.
        if (!SetWindowPos(source.Handle, IntPtr.Zero, x, y, width, height, ShowAtTop))
            throw new Win32Exception(Marshal.GetLastWin32Error());
        double scale = VisualTreeHelper.GetDpi(layout).DpiScaleY;
        compact = (Vertical ? width : height) / scale < 36;
        double coverSize = compact || Vertical ? 23 : 32;
        cover.Height = cover.Width = Math.Min((Vertical ? width : height) / scale - 2, coverSize);
        artist.Visibility = !Vertical && !compact && hasArtist ? Visibility.Visible : Visibility.Collapsed;
        layout.Clip = new RectangleGeometry(new Rect(0, 0, width / scale, height / scale), 6, 6);
    }

    public void VerifyVisibleChild()
    {
        if (GetAncestor(source.Handle, 1) != parent || !IsExposed)
            throw new InvalidOperationException("The widget must be a visible top child of its taskbar");
    }

    // Runs only in the Windows smoke test. Inspect the normal themed widget rather than substituting a test paint.
    public void VerifyRenderedPixels(int x, int y, int width, int height, bool lightTheme)
    {
        var origin = new System.Drawing.Point(x, y);
        if (!ClientToScreen(parent, ref origin)) throw new Win32Exception(Marshal.GetLastWin32Error());
        using var before = ReadScreen(origin.X, origin.Y, width, height);
        SetLanguage("el");
        UpdateView("Δοκιμή ήχου", "Καλλιτέχνης", null, "Άνοιγμα", "Προηγούμενο", "Αναπαραγωγή", "Επόμενο",
            false, true, true, true, lightTheme, false, []);
        Place(x, y, width, height);
        VerifyVisibleChild();
        layout.UpdateLayout();

        var frame = new DispatcherFrame();
        var timer = new DispatcherTimer(DispatcherPriority.Background) { Interval = TimeSpan.FromMilliseconds(120) };
        bool rendered = false;
        int attempts = 0;
        timer.Tick += (_, _) =>
        {
            using var after = ReadScreen(origin.X, origin.Y, width, height);
            int changed = 0;
            int caption = 0;
            int unchanged = 0;
            for (int row = 3; row < height - 3; row++)
            {
                for (int column = Math.Min(35, width / 5); column < width - 8; column++)
                {
                    var old = before.GetPixel(column, row);
                    var pixel = after.GetPixel(column, row);
                    if (Math.Abs(old.R - pixel.R) + Math.Abs(old.G - pixel.G) + Math.Abs(old.B - pixel.B) < 15)
                    {
                        unchanged++;
                        continue;
                    }
                    changed++;
                    if ((Vertical || column < width / 2) && (lightTheme ? pixel.R < 65 && pixel.G < 65 && pixel.B < 65 : pixel.R > 215 && pixel.G > 215 && pixel.B > 215)) caption++;
                }
            }
            rendered = unchanged > changed && changed >= 25 && (caption >= 4 || SystemParameters.HighContrast);
            if (rendered || ++attempts >= 12) frame.Continue = false;
        };
        timer.Start();
        try { Dispatcher.PushFrame(frame); }
        finally { timer.Stop(); }
        if (!rendered) throw new InvalidOperationException("The production widget and its caption did not appear in the Explorer taskbar pixels");
    }

    private static System.Drawing.Bitmap ReadScreen(int x, int y, int width, int height)
    {
        var capture = new System.Drawing.Bitmap(width, height, System.Drawing.Imaging.PixelFormat.Format24bppRgb);
        try
        {
            using var graphics = System.Drawing.Graphics.FromImage(capture);
            var destination = graphics.GetHdc();
            var sourceDc = GetDC(IntPtr.Zero);
            try
            {
                const uint SourceCopyAndCaptureLayers = 0x00CC0020 | 0x40000000;
                if (sourceDc == IntPtr.Zero || !BitBlt(destination, 0, 0, width, height, sourceDc, x, y, SourceCopyAndCaptureLayers))
                    throw new Win32Exception(Marshal.GetLastWin32Error());
            }
            finally
            {
                if (sourceDc != IntPtr.Zero) ReleaseDC(IntPtr.Zero, sourceDc);
                graphics.ReleaseHdc(destination);
            }
            return capture;
        }
        catch
        {
            capture.Dispose();
            throw;
        }
    }

    private static Button CreateButton(string text = "") => new()
    {
        Content = text, Template = ButtonTemplate, Background = HitArea, VerticalContentAlignment = VerticalAlignment.Center, BorderThickness = new Thickness(0),
        Padding = new Thickness(0), Focusable = false, FontSize = 12, MinWidth = 0,
        FontFamily = new System.Windows.Media.FontFamily("Segoe UI, Arial"),
    };

    private static ControlTemplate CreateButtonTemplate()
    {
        var border = new FrameworkElementFactory(typeof(Border));
        border.SetValue(Border.BackgroundProperty, new TemplateBindingExtension(Control.BackgroundProperty));
        var content = new FrameworkElementFactory(typeof(ContentPresenter));
        content.SetValue(FrameworkElement.HorizontalAlignmentProperty, new TemplateBindingExtension(Control.HorizontalContentAlignmentProperty));
        content.SetValue(FrameworkElement.VerticalAlignmentProperty, new TemplateBindingExtension(Control.VerticalContentAlignmentProperty));
        border.AppendChild(content);
        var template = new ControlTemplate(typeof(Button)) { VisualTree = border };
        var disabled = new Trigger { Property = UIElement.IsEnabledProperty, Value = false };
        disabled.Setters.Add(new Setter(UIElement.OpacityProperty, 0.40));
        template.Triggers.Add(disabled);
        return template;
    }

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
        layout.Background = Brushes.Transparent;
        backdrop.Visibility = !highContrast && coverBackground && currentCover is not null ? Visibility.Visible : Visibility.Collapsed;
        cover.Background = highContrast ? SystemColors.WindowBrush : light ? LightHover : DarkHover;
        musicIcon.Foreground = foreground;
        foreach (var button in new[] { title, previous, playback, next }) button.Foreground = foreground;
        Brush accent = highContrast ? foreground : accentBrush ?? foreground;
        grip.Foreground = foreground;
        foreach (var bar in meterBars) bar.Background = accent;
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
        SetSpectrum(levels);
        RefreshPalette();
    }

    public void SetSpectrum(ReadOnlySpan<double> levels)
    {
        for (int i = 0; i < meterBars.Length; i++)
            meterBars[i].Height = 2 + (i < levels.Length ? levels[i] * 12 : 0);
    }

    public void VerifyAppearance()
    {
        UpdateView("Test title", "Test artist", new DrawingImage(), "", "", "", "",
            false, true, true, true, true, false, []);
        if (musicIcon.Visibility != Visibility.Collapsed || backdrop.Visibility != Visibility.Collapsed)
            throw new InvalidOperationException("Album art should replace the placeholder without adding a backdrop");
        if (SystemParameters.HighContrast) return;
        var sampleAccent = Color.FromRgb(37, 111, 209);
        SetSystemAccent(sampleAccent);
        if (meterBars[0].Background is not SolidColorBrush brush || brush.Color != sampleAccent)
            throw new InvalidOperationException("The meter must use the exact Windows accent RGB");
        var lightForeground = title.Foreground;
        if (!Equals(layout.Background, Brushes.Transparent))
            throw new InvalidOperationException("The idle widget must use the visible taskbar palette");
        UpdateView("Test title", "Test artist", currentCover, "", "", "", "",
            false, true, true, true, false, true, []);
        if (Equals(lightForeground, title.Foreground) || !Equals(layout.Background, Brushes.Transparent) || backdrop.Visibility != Visibility.Visible)
            throw new InvalidOperationException("Dark text contrast and optional album-art backdrop must update independently");
    }

    private static IntPtr WindowMessage(IntPtr window, int message, IntPtr wParam, IntPtr lParam, ref bool handled)
    {
        if (message != 0x0021) return IntPtr.Zero; // WM_MOUSEACTIVATE
        handled = true;
        return new IntPtr(3); // MA_NOACTIVATE keeps the click and does not focus the widget.
    }

    public void Dispose()
    {
        dragTimer.Stop();
        source.Dispose();
    }

    [DllImport("user32.dll")] private static extern bool GetCursorPos(out System.Drawing.Point point);
    [DllImport("user32.dll")] private static extern short GetAsyncKeyState(int key);

    [DllImport("user32.dll", SetLastError = true)] private static extern bool ClientToScreen(IntPtr window, ref System.Drawing.Point point);
    [DllImport("user32.dll", SetLastError = true)] private static extern IntPtr GetDC(IntPtr window);
    [DllImport("user32.dll")] private static extern int ReleaseDC(IntPtr window, IntPtr dc);
    [DllImport("gdi32.dll", SetLastError = true)] private static extern bool BitBlt(IntPtr destination, int dx, int dy, int w, int h, IntPtr source, int sx, int sy, uint operation);
    [DllImport("user32.dll")] private static extern IntPtr GetAncestor(IntPtr window, uint flags);
    [DllImport("user32.dll")] private static extern IntPtr GetTopWindow(IntPtr window);
    [DllImport("user32.dll")] private static extern bool IsWindow(IntPtr window);
    [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr window);
    [DllImport("user32.dll", EntryPoint = "GetWindowLongW")] private static extern int GetWindowLong(IntPtr window, int index);
    [DllImport("user32.dll", SetLastError = true)] private static extern bool SetWindowPos(IntPtr window, IntPtr after, int x, int y, int width, int height, uint flags);
}
