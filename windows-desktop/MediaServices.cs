using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text.Json;
using NAudio.CoreAudioApi;
using NAudio.CoreAudioApi.Interfaces;
using Windows.Media;
using Windows.Media.Control;
using Windows.Storage.Streams;

sealed class MediaServices
{
    private GlobalSystemMediaTransportControlsSessionManager? manager;
    private readonly Dictionary<string, GlobalSystemMediaTransportControlsSession> sessions = new();
    private readonly Dictionary<string, string> names = new();
    private Dictionary<GlobalSystemMediaTransportControlsSession, string> sessionIds = new();
    private int nextId;
    private readonly Dictionary<string, string> covers = new();

    public async Task<object?> ReadMedia(bool withCover, string selected)
    {
        try
        {
            manager ??= await GlobalSystemMediaTransportControlsSessionManager.RequestAsync();
            var current = manager.GetCurrentSession();
            string active = "", activeBySource = "";
            var rows = new List<object>();
            var seen = new Dictionary<GlobalSystemMediaTransportControlsSession, string>();
            sessions.Clear();
            foreach (var session in manager.GetSessions().Take(20))
            {
                try
                {
                    string source = session.SourceAppUserModelId;
                    if (!sessionIds.TryGetValue(session, out var id)) id = $"{source}#{++nextId}";
                    seen[session] = id;
                    var info = session.GetPlaybackInfo();
                    if (info?.Controls is not { } controls) continue;
                    var track = await session.TryGetMediaPropertiesAsync();
                    var timeline = session.GetTimelineProperties();
                    var duration = timeline is null ? 0 : Math.Max(0, (timeline.EndTime - timeline.StartTime).TotalSeconds);
                    bool playing = info.PlaybackStatus == GlobalSystemMediaTransportControlsSessionPlaybackStatus.Playing;
                    double position = timeline is null ? 0 : (timeline.Position - timeline.StartTime).TotalSeconds;
                    if (playing && timeline is not null && timeline.LastUpdatedTime > DateTimeOffset.UtcNow.AddMinutes(-10))
                        position += Math.Max(0, (DateTimeOffset.UtcNow - timeline.LastUpdatedTime).TotalSeconds) * (info.PlaybackRate ?? 1);
                    bool isActive = Equals(current, session);
                    if (isActive) active = id;
                    if (string.IsNullOrEmpty(activeBySource) && source == current?.SourceAppUserModelId) activeBySource = id;
                    sessions[id] = session;
                    if (!names.TryGetValue(source, out var name))
                        names[source] = name = source.Split('!')[0].Split('\\').Last().Replace(".exe", "", StringComparison.OrdinalIgnoreCase);
                    string artwork = "";
                    if (withCover && (selected == id || isActive || id == activeBySource) && track?.Thumbnail is { } thumbnail)
                        artwork = await ReadCover(thumbnail, $"{id}|{track.Title}|{track.Artist}|{track.AlbumTitle}");
                    rows.Add(new
                    {
                        id, source, name, artwork, title = track?.Title ?? "", artist = track?.Artist ?? "",
                        playing, duration, position = Math.Clamp(position, 0, duration),
                        canPlay = controls.IsPlayPauseToggleEnabled || (playing ? controls.IsPauseEnabled : controls.IsPlayEnabled),
                        canPrev = controls.IsPreviousEnabled, canNext = controls.IsNextEnabled,
                        canSeek = controls.IsPlaybackPositionEnabled && duration > 0,
                        canShuffle = controls.IsShuffleEnabled, canRepeat = controls.IsRepeatEnabled,
                        shuffle = info.IsShuffleActive == true,
                        repeat = info.AutoRepeatMode == MediaPlaybackAutoRepeatMode.Track ? "one" :
                            info.AutoRepeatMode == MediaPlaybackAutoRepeatMode.List ? "all" : "off"
                    });
                }
                catch (COMException) { }
            }
            sessionIds = seen;
            return new { active = string.IsNullOrEmpty(active) ? activeBySource : active, sessions = rows };
        }
        catch (Exception e) when (e is COMException or UnauthorizedAccessException or InvalidOperationException)
        {
            manager = null;
            sessions.Clear();
            sessionIds.Clear();
            return null;
        }
    }

    private async Task<string> ReadCover(IRandomAccessStreamReference thumbnail, string key)
    {
        if (covers.TryGetValue(key, out var saved)) return saved;
        if (covers.Count >= 12) covers.Remove(covers.Keys.First());
        string cover = "";
        try
        {
            using var stream = await thumbnail.OpenReadAsync();
            if (stream.Size == 0 || stream.Size > 160_000 || stream.ContentType is not ("image/png" or "image/jpeg" or "image/webp"))
                return covers[key] = cover;
            using var reader = new DataReader(stream);
            uint count = await reader.LoadAsync((uint)stream.Size);
            var bytes = new byte[count];
            reader.ReadBytes(bytes);
            cover = $"data:{stream.ContentType};base64,{Convert.ToBase64String(bytes)}";
        }
        catch (Exception e) when (e is COMException or InvalidOperationException or UnauthorizedAccessException) { }
        return covers[key] = cover;
    }

    public async Task<bool> ControlMedia(string id, string action, double value)
    {
        if (!sessions.TryGetValue(id, out var session)) return false;
        var playback = session.GetPlaybackInfo();
        if (playback?.Controls is null) return false;
        return action switch
        {
            "playpause" when playback.Controls.IsPlayPauseToggleEnabled => await session.TryTogglePlayPauseAsync(),
            "playpause" when playback.PlaybackStatus == GlobalSystemMediaTransportControlsSessionPlaybackStatus.Playing
                => await session.TryPauseAsync(),
            "playpause" => await session.TryPlayAsync(),
            "next" => await session.TrySkipNextAsync(),
            "prev" => await session.TrySkipPreviousAsync(),
            "shuffle" => await session.TryChangeShuffleActiveAsync(playback.IsShuffleActive != true),
            "repeat" => await session.TryChangeAutoRepeatModeAsync(playback.AutoRepeatMode switch
            {
                MediaPlaybackAutoRepeatMode.List => MediaPlaybackAutoRepeatMode.Track,
                MediaPlaybackAutoRepeatMode.Track => MediaPlaybackAutoRepeatMode.None,
                _ => MediaPlaybackAutoRepeatMode.List
            }),
            "seek" => await Seek(session, value),
            _ => false
        };
    }

    private static async Task<bool> Seek(GlobalSystemMediaTransportControlsSession session, double fraction)
    {
        var time = session.GetTimelineProperties();
        if (time is null || session.GetPlaybackInfo()?.Controls?.IsPlaybackPositionEnabled != true || time.EndTime <= time.StartTime)
            return false;
        long ticks = time.StartTime.Ticks + (long)((time.EndTime.Ticks - time.StartTime.Ticks) * fraction);
        return await session.TryChangePlaybackPositionAsync(ticks);
    }

    private static string ProcessName(uint pid)
    {
        if (pid == 0) return "";
        try
        {
            using var p = Process.GetProcessById((int)pid);
            return p.ProcessName;
        }
        catch (Exception e) when (e is InvalidOperationException or ArgumentException or System.ComponentModel.Win32Exception)
        {
            return "";
        }
    }

    private static T WithDevice<T>(Func<MMDevice, T> use)
    {
        using var devices = new MMDeviceEnumerator();
        using var device = devices.GetDefaultAudioEndpoint(DataFlow.Render, Role.Multimedia);
        return use(device);
    }

    private static void ForSessions(MMDevice device, Action<AudioSessionControl> visit)
    {
        var list = device.AudioSessionManager.Sessions;
        int count = Math.Min(100, list.Count);
        for (int i = 0; i < count; i++)
        {
            try
            {
                using var session = list[i];
                if (session.State != AudioSessionState.AudioSessionStateExpired && session.SimpleAudioVolume is not null)
                    visit(session);
            }
            catch (COMException) { }
        }
    }

    public object? ReadMixer()
    {
        try
        {
            return WithDevice(device =>
            {
                var volume = device.AudioEndpointVolume;
                var apps = new List<object>();
                ForSessions(device, session =>
                {
                    var name = session.DisplayName;
                    if (name.StartsWith('@') || string.IsNullOrWhiteSpace(name)) name = ProcessName(session.GetProcessID);
                    apps.Add(new { id = session.GetSessionInstanceIdentifier, name, volume = session.SimpleAudioVolume.Volume, muted = session.SimpleAudioVolume.Mute });
                });
                return new { master = new { id = "master", name = device.FriendlyName, volume = volume.MasterVolumeLevelScalar, muted = volume.Mute }, apps };
            });
        }
        catch (Exception e) when (e is COMException or InvalidOperationException)
        {
            return null;
        }
    }

    public bool ControlMixer(string id, string action, double value)
    {
        return WithDevice(device =>
        {
            if (id == "master")
            {
                var endpoint = device.AudioEndpointVolume;
                if (action == "volume") endpoint.MasterVolumeLevelScalar = (float)value;
                if (action == "mute") endpoint.Mute = value == 1;
                return true;
            }
            bool found = false;
            ForSessions(device, session =>
            {
                if (session.GetSessionInstanceIdentifier != id) return;
                if (action == "volume") session.SimpleAudioVolume.Volume = (float)value;
                if (action == "mute") session.SimpleAudioVolume.Mute = value == 1;
                found = true;
            });
            return found;
        });
    }
}
