using LibVLCSharp.Shared;
using System.Diagnostics;
using System.Text.Json;

internal static class Program
{
    private static readonly HashSet<string> MediaExt = new(StringComparer.OrdinalIgnoreCase)
    { ".mp4",".m4v",".mkv",".webm",".mov",".avi",".wmv",".flv",".mpg",".mpeg",".ts",".m2ts",".ogv",".3gp",".mp3",".wav",".flac",".ogg",".oga",".opus",".m4a",".aac",".wma",".aiff",".aif" };
    private static bool SafeLocal(string file, HashSet<string> extensions)
    {
        try {
            if (!Path.IsPathFullyQualified(file) || file.Length < 4 || file[1] != ':' || file[2] != '\\' || file.AsSpan(2).Contains(':') ||
                !extensions.Contains(Path.GetExtension(file)) || !File.Exists(file)) return false;
            for (FileSystemInfo? item = new FileInfo(file); item != null; item = item is FileInfo f ? f.Directory : ((DirectoryInfo)item).Parent)
                if ((item.Attributes & FileAttributes.ReparsePoint) != 0) return false;
            return true;
        } catch { return false; }
    }

    [STAThread]
    private static int Main(string[] args)
    {
        if (args.Length != 2 || !SafeLocal(args[1], MediaExt) || (args[0] != "--open" && args[0] != "--selftest")) return 2;
        try {
            Core.Initialize();
            bool selftest = args[0] == "--selftest";
            // No remote URL or caller-supplied VLC arguments. Separate process;
            // this is not an OS sandbox for hostile bitstreams.
            using var vlc = selftest
                ? new LibVLC("--no-video-title-show","--no-sub-autodetect-file","--vout=dummy","--aout=dummy")
                : new LibVLC("--no-video-title-show","--no-sub-autodetect-file");
            using var player = new MediaPlayer(vlc);
            using var media = new Media(vlc, args[1], FromType.FromPath);
            if (selftest) return SelfTest(player, media);
            ApplicationConfiguration.Initialize();
            using var form = new PlayerWindow(player, media, Path.GetFileName(args[1]));
            Application.Run(form);
            return 0;
        } catch (Exception ex) { Console.Error.WriteLine(ex.GetType().Name); return 1; }
    }

    private static int SelfTest(MediaPlayer player, Media media)
    {
        if (!player.Play(media)) return 3;
        var clock = Stopwatch.StartNew();
        while (clock.ElapsedMilliseconds < 12000 && player.State != VLCState.Error) {
            if (player.Time >= 500 && player.Length >= 2000 && player.VideoTrackCount >= 1 &&
                player.AudioTrackDescription.Count(t => t.Id >= 0) >= 2 && player.SpuDescription.Any(t => t.Id >= 0)) {
                var audio = player.AudioTrackDescription.Last(t => t.Id >= 0);
                var subtitle = player.SpuDescription.First(t => t.Id >= 0);
                var a = player.SetAudioTrack(audio.Id); var s = player.SetSpu(subtitle.Id);
                var selectedClock=Stopwatch.StartNew();while(selectedClock.ElapsedMilliseconds<2500 && (player.AudioTrack!=audio.Id||player.Spu!=subtitle.Id))Thread.Sleep(50);
                a=a&&player.AudioTrack==audio.Id;s=s&&player.Spu==subtitle.Id;
                Console.WriteLine(JsonSerializer.Serialize(new { engine="libvlc", elapsed=player.Time, length=player.Length,
                    audioTracks=player.AudioTrackDescription.Count(t => t.Id >= 0), subtitleTracks=player.SpuDescription.Count(t => t.Id >= 0), audioSelected=a, subtitleSelected=s }));
                player.Stop();
                return a && s ? 0 : 4;
            }
            Thread.Sleep(100);
        }
        Console.Error.WriteLine("Native playback/track discovery did not reach expected state: " + player.State);
        player.Stop(); return 5;
    }

    private sealed record TrackItem(int Id, string Name) { public override string ToString() => Name; }

    private sealed class PlayerWindow : Form
    {
        private readonly MediaPlayer player;
        private readonly Media media;
        private readonly Panel video = new() { Dock = DockStyle.Fill, BackColor = Color.Black };
        private readonly TrackBar seek = new() { Dock = DockStyle.Fill, Minimum=0, Maximum=1000, TickStyle=TickStyle.None };
        private readonly Label time = new() { AutoSize=true, Text="0:00 / 0:00" };
        private readonly Label status = new() { AutoSize=true, Text="LibVLC • Native playback" };
        private readonly ComboBox audio = new() { DropDownStyle=ComboBoxStyle.DropDownList, Width=170 };
        private readonly ComboBox subtitle = new() { DropDownStyle=ComboBoxStyle.DropDownList, Width=170 };
        private readonly System.Windows.Forms.Timer timer = new() { Interval=250 };
        private bool updating, seeking, closing;
        public PlayerWindow(MediaPlayer player, Media media, string title)
        {
            this.player=player; this.media=media; Text="OPSIS Native Player — "+title;
            Width=1050;Height=690;MinimumSize=new Size(650,420);
            var transport=new FlowLayoutPanel { Dock=DockStyle.Fill, AutoScroll=true, WrapContents=true };
            Button Button(string label, Action action) { var b=new Button{Text=label,AutoSize=true}; b.Click+=(_,_)=>action(); transport.Controls.Add(b);return b; }
            Button("Play / Pause",()=>{if(player.IsPlaying)player.SetPause(true);else if(player.State==VLCState.Paused)player.SetPause(false);else player.Play(media);});
            Button("Stop",()=>player.Stop()); Button("Next frame",()=>{player.SetPause(true);player.NextFrame();}); Button("−10 s",()=>SeekRelative(-10000));Button("+10 s",()=>SeekRelative(10000));
            transport.Controls.Add(time);
            var rate=new ComboBox{DropDownStyle=ComboBoxStyle.DropDownList,Width=75};foreach(var r in new float[]{.5f,.75f,1f,1.25f,1.5f,2f})rate.Items.Add(r);rate.SelectedItem=1f;rate.SelectedIndexChanged+=(_,_)=>{if(rate.SelectedItem is float r)player.SetRate(r);};transport.Controls.Add(rate);
            Button("Previous chapter",()=>{if(player.Chapter>0)player.Chapter--;});Button("Next chapter",()=>{if(player.Chapter+1<player.ChapterCount)player.Chapter++;});
            Button("Fullscreen",()=>{if(FormBorderStyle==FormBorderStyle.None){FormBorderStyle=FormBorderStyle.Sizable;WindowState=FormWindowState.Normal;}else{FormBorderStyle=FormBorderStyle.None;WindowState=FormWindowState.Maximized;}});
            transport.Controls.Add(new Label{Text="Audio",AutoSize=true});transport.Controls.Add(audio);
            transport.Controls.Add(new Label{Text="Subtitles",AutoSize=true});transport.Controls.Add(subtitle);
            Button("Load subtitle",()=>{using var pick=new OpenFileDialog{Filter="Subtitles|*.srt;*.ass;*.ssa;*.vtt;*.sub;*.idx"};if(pick.ShowDialog(this)==DialogResult.OK &&
                SafeLocal(pick.FileName,new HashSet<string>(StringComparer.OrdinalIgnoreCase){".srt",".ass",".ssa",".vtt",".sub",".idx"}))
                status.Text=player.AddSlave(MediaSlaveType.Subtitle,new Uri(pick.FileName).AbsoluteUri,true)?"Subtitle added":"Subtitle failed";});
            Button("Sub −0.5s",()=>player.SetSpuDelay(Math.Max(-3600000000L,player.SpuDelay-500000)));
            Button("Sub +0.5s",()=>player.SetSpuDelay(Math.Min(3600000000L,player.SpuDelay+500000)));
            var volume=new TrackBar{Minimum=0,Maximum=100,Value=75,TickStyle=TickStyle.None,Width=100};volume.ValueChanged+=(_,_)=>player.Volume=volume.Value;transport.Controls.Add(volume);transport.Controls.Add(status);
            KeyPreview=true;KeyDown+=(_,e)=>{if(e.KeyCode==Keys.Escape&&FormBorderStyle==FormBorderStyle.None){FormBorderStyle=FormBorderStyle.Sizable;WindowState=FormWindowState.Normal;e.Handled=true;}};
            var layout=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=1,RowCount=3};layout.RowStyles.Add(new RowStyle(SizeType.Percent,100));layout.RowStyles.Add(new RowStyle(SizeType.Absolute,42));layout.RowStyles.Add(new RowStyle(SizeType.Absolute,100));layout.Controls.Add(video,0,0);layout.Controls.Add(seek,0,1);layout.Controls.Add(transport,0,2);Controls.Add(layout);
            audio.SelectedIndexChanged+=(_,_)=>{if(!updating&&audio.SelectedItem is TrackItem t)player.SetAudioTrack(t.Id);};
            subtitle.SelectedIndexChanged+=(_,_)=>{if(!updating&&subtitle.SelectedItem is TrackItem t)player.SetSpu(t.Id);};
            seek.MouseDown+=(_,_)=>seeking=true;seek.MouseUp+=(_,_)=>{seeking=false;if(player.IsSeekable&&player.Length>0)player.Time=player.Length*seek.Value/1000;};
            seek.Scroll+=(_,_)=>{if(!seeking&&player.IsSeekable&&player.Length>0)player.Time=player.Length*seek.Value/1000;};
            timer.Tick+=(_,_)=>RefreshState();
            Shown+=(_,_)=>{player.Hwnd=video.Handle;player.Volume=75;if(!player.Play(media))status.Text="Playback failed";timer.Start();};
            FormClosing+=(_,_)=>{if(closing)return;closing=true;timer.Stop();player.Stop();};
        }
        private void SeekRelative(long delta){if(player.IsSeekable&&player.Length>0)player.Time=Math.Clamp(player.Time+delta,0,player.Length);}
        private static string Clock(long ms)=>TimeSpan.FromMilliseconds(Math.Max(0,ms)).ToString(@"hh\:mm\:ss");
        private void RefreshState()
        {
            if(closing)return;
            time.Text=Clock(player.Time)+" / "+Clock(player.Length);
            seek.Enabled=player.IsSeekable&&player.Length>0;
            if(!seeking&&seek.Enabled)seek.Value=(int)Math.Clamp(player.Time*1000d/player.Length,0,1000);
            status.Text="LibVLC • "+player.State;
            updating=true;
            try { Fill(audio,player.AudioTrackDescription.Select(t=>new TrackItem(t.Id,t.Name??("Track "+t.Id))).ToArray(),player.AudioTrack);Fill(subtitle,player.SpuDescription.Select(t=>new TrackItem(t.Id,t.Name??("Track "+t.Id))).ToArray(),player.Spu); }
            finally {updating=false;}
        }
        private static void Fill(ComboBox box,TrackItem[] next,int selected)
        {
            if(!box.Items.Cast<TrackItem>().SequenceEqual(next)){box.Items.Clear();box.Items.AddRange(next);}
            var index=Array.FindIndex(next,t=>t.Id==selected);if(box.SelectedIndex!=index)box.SelectedIndex=index;
        }
    }
}
