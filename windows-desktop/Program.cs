using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using System.Windows.Threading;
using Forms = System.Windows.Forms;

static class Program
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private static readonly HashSet<string> MediaActions = ["playpause", "prev", "next", "seek", "shuffle", "repeat"];
    private static readonly HashSet<string> MixerActions = ["volume", "mute"];

    [STAThread]
    public static void Main(string[] args)
    {
        Console.InputEncoding = Encoding.UTF8;
        Console.OutputEncoding = new UTF8Encoding(false);
        Forms.Application.SetHighDpiMode(Forms.HighDpiMode.PerMonitorV2);
        Forms.Application.EnableVisualStyles();
        if (args is ["--test-taskbar-placement"])
        {
            TaskbarSpectrum.Verify();
            TaskbarWidget.VerifyPlacement();
            Console.WriteLine("Taskbar placement, Windows theme palettes and artwork styling verified");
            return;
        }
        if (args is ["--test-explorer-taskbar"])
        {
            Console.WriteLine(TaskbarWidget.VerifyExplorer()
                ? "Verified the themed widget and Greek caption pixels on the Explorer taskbar"
                : "Explorer taskbar not available in this Windows session");
            return;
        }
        var dispatcher = Dispatcher.CurrentDispatcher;
        dispatcher.InvokeAsync(async () =>
        {
            try { await Run(); }
            finally { dispatcher.BeginInvokeShutdown(DispatcherPriority.Normal); }
        });
        Dispatcher.Run();
    }

    private static void Send(object message) => Console.WriteLine(JsonSerializer.Serialize(message, JsonOptions));

    private static async Task Run()
    {
        var services = new MediaServices();
        using var widget = new TaskbarWidget(action => Send(new { type = "widget", action }),
            status => Send(new { type = "taskbar-status", status }),
            position => Send(new { type = "taskbar-position", position }));
        using var keys = new KeyboardObserver((key, enabled) => Send(new { type = "key", key, enabled }));
        Send(new { type = "ready" });
        // Console.In uses a synchronized reader. Keep its potentially blocking read off the window message loop.
        while (await Task.Run(Console.ReadLine) is { } line)
        {
            if (line.Length > 16_384) continue;
            try
            {
                using var request = JsonDocument.Parse(line);
                var input = request.RootElement;
                switch (String(input, "type"))
                {
                    case "configure":
                        keys.Configure(Bool(input, "locks"), Bool(input, "mediaKeys"));
                        widget.Configure(Bool(input, "widget"), Bool(input, "light"),
                            String(input, "openLabel"), String(input, "prevLabel"), String(input, "playLabel"), String(input, "nextLabel"),
                            String(input, "widgetPosition"), Bool(input, "widgetLegacyBounds"), Bool(input, "widgetCoverBackground"), String(input, "lang", 2),
                            input.TryGetProperty("widgetOffset", out var offset) ? Number(offset) : 0,
                            String(input, "dragLabel"));
                        break;
                    case "widget":
                        widget.Update(String(input, "title"), String(input, "artist"), String(input, "artwork", 12000),
                            Bool(input, "playing"), Bool(input, "canPlay"),
                            Bool(input, "canPrev"), Bool(input, "canNext"), ReadLevels(input));
                        break;
                    case "snapshot":
                        var media = await services.ReadMedia(Bool(input, "artwork") || Bool(input, "mixer"), String(input, "selected", 1024));
                        var mixer = Bool(input, "mixer") ? services.ReadMixer() : null;
                        Send(new { type = "snapshot", media, mixer });
                        break;
                    case "media":
                    case "mixer":
                        await Execute(services, input);
                        break;
                    case "stop":
                        return;
                }
            }
            catch (Exception e) when (e is JsonException or COMException or InvalidOperationException or ArgumentException
                or UnauthorizedAccessException or System.ComponentModel.Win32Exception)
            {
                Send(new { type = "error" });
            }
        }
    }

    private static async Task Execute(MediaServices services, JsonElement input)
    {
        var action = String(input, "action");
        var id = String(input, "id", 1024);
        if (string.IsNullOrEmpty(id)) return;
        double value = input.TryGetProperty("value", out var item) ? Number(item) : 0;
        bool ok = false;
        bool mixer = String(input, "type") == "mixer";
        if (mixer && MixerActions.Contains(action)) ok = services.ControlMixer(id, action, value);
        if (!mixer && MediaActions.Contains(action)) ok = await services.ControlMedia(id, action, value);
        Send(new { type = "result", ok });
    }

    private static string String(JsonElement input, string name, int limit = 300) =>
        input.TryGetProperty(name, out var item) && item.ValueKind == JsonValueKind.String && item.GetString() is { } s
            ? s[..Math.Min(limit, s.Length)] : "";

    private static bool Bool(JsonElement input, string name) =>
        input.TryGetProperty(name, out var item) && item.ValueKind == JsonValueKind.True;

    private static double Number(JsonElement value) =>
        value.ValueKind == JsonValueKind.Number && value.TryGetDouble(out var n) && double.IsFinite(n) ? Math.Clamp(n, 0, 1) : 0;

    private static double[] ReadLevels(JsonElement input) =>
        input.TryGetProperty("spectrum", out var levels) && levels.ValueKind == JsonValueKind.Array
            ? levels.EnumerateArray().Take(8).Select(Number).ToArray() : [];
}

sealed class KeyboardObserver : IDisposable
{
    private static readonly Dictionary<int, string> LockKeys = new() { [0x14] = "caps", [0x90] = "num", [0x91] = "scroll" };
    private static readonly HashSet<int> MediaKeys = [0xAD, 0xAE, 0xAF, 0xB0, 0xB1, 0xB2, 0xB3];
    private readonly Action<string, bool> notify;
    private readonly HookProc hookProc;
    private readonly Forms.Timer timer = new() { Interval = 80 };
    private IntPtr hook;
    private int pendingKey;
    private bool observeLocks, observeMedia;

    public KeyboardObserver(Action<string, bool> notify)
    {
        this.notify = notify;
        hookProc = Observe;
        timer.Tick += (_, _) =>
        {
            timer.Stop();
            if (observeLocks && LockKeys.TryGetValue(pendingKey, out var key))
                notify(key, (GetKeyState(pendingKey) & 1) != 0);
        };
    }

    public void Configure(bool locks, bool media)
    {
        observeLocks = locks;
        observeMedia = media;
        if ((locks || media) && hook == IntPtr.Zero)
            hook = SetWindowsHookEx(13, hookProc, GetModuleHandle(IntPtr.Zero), 0);
        if (!locks && !media) Unhook();
    }

    private IntPtr Observe(int code, IntPtr message, IntPtr data)
    {
        if (code >= 0 && (message == (IntPtr)0x0101 || message == (IntPtr)0x0105))
        {
            int key = Marshal.ReadInt32(data);
            if (observeLocks && LockKeys.ContainsKey(key))
            {
                // Let Windows handle the toggle before querying its new state.
                pendingKey = key;
                timer.Stop();
                timer.Start();
            }
            if (observeMedia && MediaKeys.Contains(key)) notify(key <= 0xAF ? "volume" : "media", false);
        }
        return CallNextHookEx(hook, code, message, data);
    }

    private void Unhook()
    {
        timer.Stop();
        if (hook != IntPtr.Zero) UnhookWindowsHookEx(hook);
        hook = IntPtr.Zero;
    }

    public void Dispose() { Unhook(); timer.Dispose(); }

    private delegate IntPtr HookProc(int code, IntPtr message, IntPtr data);
    [DllImport("user32.dll", EntryPoint = "SetWindowsHookExW")] private static extern IntPtr SetWindowsHookEx(int id, HookProc proc, IntPtr module, uint thread);
    [DllImport("user32.dll")] private static extern bool UnhookWindowsHookEx(IntPtr hook);
    [DllImport("user32.dll")] private static extern IntPtr CallNextHookEx(IntPtr hook, int code, IntPtr message, IntPtr data);
    [DllImport("user32.dll")] private static extern short GetKeyState(int key);
    [DllImport("kernel32.dll", EntryPoint = "GetModuleHandleW")] private static extern IntPtr GetModuleHandle(IntPtr name);
}
