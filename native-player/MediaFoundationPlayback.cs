using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text.Json;

// Transitional explicit local MFPlay backend, not IMFMediaEngine and not a
// GPU certification. COM method slots follow the Windows SDK mfplay.h ABI.
internal static class MediaFoundationPlayback
{
    private static readonly HashSet<string> Extensions = new(StringComparer.OrdinalIgnoreCase)
        { ".mp4",".m4v",".mov",".wmv",".wav",".mp3",".m4a",".aac",".wma" };
    public static bool Supports(string file)=>Extensions.Contains(Path.GetExtension(file));

    [DllImport("mfplay.dll",ExactSpelling=true,CharSet=CharSet.Unicode)]
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)]
    private static extern int MFPCreateMediaPlayer(string url,int autoplay,uint options,IntPtr callback,IntPtr window,out IntPtr player);
    [DllImport("ole32.dll",ExactSpelling=true)]
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)]
    private static extern int PropVariantClear(ref Variant value);
    [StructLayout(LayoutKind.Explicit,Size=24)]
    private struct Variant
    {
        [FieldOffset(0)]public ushort Type;
        [FieldOffset(8)]public long Ticks;
    }
    [UnmanagedFunctionPointer(CallingConvention.StdCall)]private delegate int Simple(IntPtr self);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)]private delegate int GetInt(IntPtr self,out int value);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)]private delegate int PutInt(IntPtr self,int value);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)]private delegate int GetFloat(IntPtr self,out float value);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)]private delegate int PutFloat(IntPtr self,float value);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)]private delegate int GetTime(IntPtr self,ref Guid type,out Variant value);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)]private delegate int PutTime(IntPtr self,ref Guid type,ref Variant value);
    private sealed class Player:IDisposable
    {
        private IntPtr player;
        public Player(string file,IntPtr window)
        {
            int hr=MFPCreateMediaPlayer(file,1,0,IntPtr.Zero,window,out player);
            if(hr<0){Dispose();Marshal.ThrowExceptionForHR(hr);}
            if(player==IntPtr.Zero)throw new InvalidOperationException("No MF player");
        }
        private T Method<T>(int slot)where T:Delegate=>Marshal.GetDelegateForFunctionPointer<T>(Marshal.ReadIntPtr(Marshal.ReadIntPtr(player),slot*IntPtr.Size));
        public int State=>Method<GetInt>(13)(player,out int n)>=0?n:-1;
        public bool Playing=>State==2;
        private long Time(int slot)
        {
            Guid type=Guid.Empty;Variant v=default;
            try{
                if(Method<GetTime>(slot)(player,ref type,out v)<0)return -1;
                return (v.Type==20||v.Type==21)&&v.Ticks>=0?v.Ticks/10000:-1;
            }finally{PropVariantClear(ref v);}
        }
        public long Position=>Time(8);
        public long Duration=>Time(9);
        public int? Volume=>Method<GetFloat>(19)(player,out float v)>=0&&float.IsFinite(v)?(int)Math.Clamp(Math.Round(v*100),0,100):null;
        public bool? Muted=>Method<GetInt>(23)(player,out int v)>=0?v!=0:null;
        public bool Control(string name,double value=0)
        {
            if(player==IntPtr.Zero||!double.IsFinite(value))return false;
            switch(name){
                case "toggle":return Method<Simple>(Playing?4:3)(player)>=0;
                case "play":return Method<Simple>(3)(player)>=0;
                case "pause":return Method<Simple>(4)(player)>=0;
                case "seek":
                    long duration=Duration;
                    if(value<0||value>360000000||duration<=0)return false;
                    Guid type=Guid.Empty;var v=new Variant{Type=20,Ticks=(long)Math.Min(value,duration)*10000};
                    return Method<PutTime>(7)(player,ref type,ref v)>=0;
                case "volume":return value>=0&&value<=100&&Method<PutFloat>(20)(player,(float)value/100)>=0;
                case "mute":var muted=Muted;return muted.HasValue&&Method<PutInt>(24)(player,muted.Value?0:1)>=0;
                case "rate":return value>=.5&&value<=4&&Method<PutFloat>(10)(player,(float)value)>=0;
                default:return false;
            }
        }
        public void Update(){if(player!=IntPtr.Zero)Method<Simple>(32)(player);}
        public void Dispose()
        {
            if(player==IntPtr.Zero)return;
            try{Method<Simple>(38)(player);}finally{Marshal.Release(player);player=IntPtr.Zero;}
        }
    }

    public static int Run(string file,long resume=0,bool selftest=false)
    {
        if(!Supports(file))return 2;
        using var form=new Form{Text="OPSIS — Media Foundation (experimental)",Width=900,Height=580,MinimumSize=new Size(500,350)};
        var panel=new Panel{Dock=DockStyle.Fill,BackColor=Color.Black};
        var bar=new FlowLayoutPanel{Dock=DockStyle.Bottom,Height=45};
        var status=new Label{AutoSize=true,Text="Opening local media…"};
        Player? player=null;bool closing=false,ready=false,resumeIssued=false;int result=1,stage=0;
        var clock=Stopwatch.StartNew();long lastReport=0;bool volumeVerified=false,muteVerified=false;
        using var timer=new System.Windows.Forms.Timer{Interval=100};
        void Button(string caption,string action){var b=new Button{Text=caption,AutoSize=true};b.Click+=(_,_)=>{if(ready)player?.Control(action);};bar.Controls.Add(b);}
        Button("Play / Pause","toggle");Button("Mute","mute");bar.Controls.Add(status);form.Controls.Add(panel);form.Controls.Add(bar);
        void Fail(){if(closing)return;Program.HostEvent("error",0,0);form.Close();}
        void Report(string kind){if(player!=null)Program.HostEvent(kind,player.Position,player.Duration,null,player.Playing,player.Muted,player.Volume);}
        panel.Resize+=(_,_)=>player?.Update();panel.Paint+=(_,_)=>player?.Update();
        form.Shown+=(_,_)=>{
            try{player=new Player(file,panel.Handle);clock.Restart();timer.Start();}
            catch{Fail();}
        };
        timer.Tick+=(_,_)=>{
            if(player==null||closing)return;
            try{
                var position=player.Position;var duration=player.Duration;
                if(!ready){
                    if(clock.ElapsedMilliseconds>18000){Fail();return;}
                    if(!player.Playing||position<=0||duration<=0)return;
                    if(!resumeIssued&&resume>0){resumeIssued=true;if(!player.Control("seek",Math.Min(resume,Math.Max(0,duration-500)))){Fail();return;}return;}
                    ready=true;result=0;Report("ready");lastReport=clock.ElapsedMilliseconds;
                    if(!selftest&&Console.IsInputRedirected)Task.Run(()=>{
                        try{while(true){
                            var cmd=NativeCommands.Read(Console.In);if(cmd==null||form.IsDisposed)return;
                            var done=new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
                            form.BeginInvoke(new Action(()=>{try{NativeCommands.Ack(cmd,!closing&&ready&&player.Control(cmd.Name,cmd.Value));}finally{done.TrySetResult(true);}}));
                            if(!done.Task.Wait(5000))return;
                        }}catch{}
                    });
                }
                status.Text=TimeSpan.FromMilliseconds(Math.Max(0,position)).ToString(@"mm\:ss")+" / "+TimeSpan.FromMilliseconds(Math.Max(0,duration)).ToString(@"mm\:ss");
                if(clock.ElapsedMilliseconds-lastReport>=500){Report("position");lastReport=clock.ElapsedMilliseconds;}
                if(!selftest)return;
                if(clock.ElapsedMilliseconds>23000){result=5;Fail();return;}
                switch(stage){
                    case 0:
                        if(position<250)return;
                        if(!player.Control("pause"))throw new InvalidOperationException("Pause");
                        stage=1;break;
                    case 1:
                        if(player.State!=3)return;
                        if(!player.Control("seek",1000))throw new InvalidOperationException("Seek");
                        stage=2;break;
                    case 2:
                        if(Math.Abs(position-1000)>350)return;
                        // Actual player-local volume/mute readback, not OS mixer changes.
                        volumeVerified=player.Control("volume",40)&&player.Volume==40;
                        bool? before=player.Muted;
                        muteVerified=before.HasValue&&player.Control("mute")&&player.Muted==!before.Value&&player.Control("mute")&&player.Muted==before;
                        if(!player.Control("play"))throw new InvalidOperationException("Resume");
                        stage=3;break;
                    case 3:
                        if(!player.Playing||position<1250)return;
                        Console.WriteLine(JsonSerializer.Serialize(new{engine="media-foundation-mfplay",durationMs=duration,positionMs=position,paused=true,seekVerified=true,resumed=true,volumeVerified,muteVerified}));
                        result=volumeVerified&&muteVerified?0:5;form.Close();break;
                }
            }catch{result=5;Fail();}
        };
        form.FormClosing+=(_,_)=>{closing=true;timer.Stop();if(ready)Report("closed");player?.Dispose();player=null;};
        try{Application.Run(form);return result;}
        finally{player?.Dispose();}
    }
}
