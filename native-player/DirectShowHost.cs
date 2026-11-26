using DirectShowLib;
using Microsoft.Win32;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Diagnostics;
using System.Text.Json;

internal static class DirectShowHost
{
    // Do not call RenderFile, Render or intelligent Connect: those methods
    // may activate arbitrary registered filters. Only explicit filters and
    // direct pin connections are permitted.
    private static readonly Guid GraphId = new("E436EBB3-524F-11CE-9F53-0020AF0BA770");
    private static readonly Guid AsyncReaderId = new("E436EBB5-524F-11CE-9F53-0020AF0BA770");
    private static readonly Guid WaveParserId = new("D51BD5A1-7548-11CF-A520-0080C77EF58A");
    private static readonly Guid NullRendererId = new("C1F400A4-3F08-11D3-9F0B-006008039E37");
    private static readonly Guid VideoRendererId = new("70E102B0-5556-11CE-97C0-00AA0055595A");
    private static readonly Guid AudioRendererId = new("79376820-07D0-11CF-A24D-0020AFD79767");
    private static readonly Guid LavSource = new("B98D13E7-55DB-4385-A33D-09FD1BA26338");
    private static readonly Guid LavVideo = new("EE30215D-164F-4A92-A4EB-9D4C13390F9F");
    private static readonly Guid LavAudio = new("E8E73B6B-4CB3-44A4-BE99-4F7BCB96E491");
    private static void Check(int hr) { if (hr<0) Marshal.ThrowExceptionForHR(hr); }
    private static string Key(Guid id) => @"SOFTWARE\Classes\CLSID\"+id.ToString("B");
    private static string? Server(RegistryKey root,Guid id)
    {
        using var key=root.OpenSubKey(Key(id)+@"\InprocServer32");
        return key?.GetValue(null, null, RegistryValueOptions.DoNotExpandEnvironmentNames) as string;
    }
    private static string Canonical(string? raw)
    {
        if(string.IsNullOrWhiteSpace(raw))throw new InvalidOperationException("Missing filter server");
        var p=Environment.ExpandEnvironmentVariables(raw.Trim().Trim('"'));
        if(!Path.IsPathFullyQualified(p)||p.Length<4||p[1]!=':'||p[2]!='\\'||p.AsSpan(2).Contains(':'))throw new InvalidOperationException("Invalid filter path");
        p=Path.GetFullPath(p);
        for(FileSystemInfo? item=new FileInfo(p);item!=null;item=item is FileInfo f?f.Directory:((DirectoryInfo)item).Parent)
            if((item.Attributes&FileAttributes.ReparsePoint)!=0)throw new InvalidOperationException("Filter reparse point");
        return p;
    }
    private static string MachineServer(Guid id)
    {
        using var user=RegistryKey.OpenBaseKey(RegistryHive.CurrentUser,RegistryView.Registry64);
        using var machine=RegistryKey.OpenBaseKey(RegistryHive.LocalMachine,RegistryView.Registry64);
        using var shadow=user.OpenSubKey(Key(id));
        if(shadow!=null)throw new InvalidOperationException("Per-user COM registration rejected");
        return Canonical(Server(machine,id));
    }

    [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]
    private static extern IntPtr LoadLibraryEx(string name,IntPtr file,uint flags);
    [DllImport("kernel32.dll",CharSet=CharSet.Ansi,ExactSpelling=true,SetLastError=true)]
    private static extern IntPtr GetProcAddress(IntPtr module,string name);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)]
    private delegate int GetFactory(ref Guid clsid,ref Guid iid,out IntPtr factory);
    [ComImport,Guid("00000001-0000-0000-C000-000000000046"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface Factory
    {
        [PreserveSig] int CreateInstance(IntPtr outer,ref Guid iid,out IntPtr instance);
        [PreserveSig] int LockServer([MarshalAs(UnmanagedType.Bool)] bool value);
    }
    // Hold loaded modules until the isolated process exits, avoiding unloading
    // while COM objects or worker threads are still alive.
    private static object Instantiate(Guid id,string file)
    {
        var handle=LoadLibraryEx(file,IntPtr.Zero,0x100u|0x800u); // DLL directory + System32 only
        if(handle==IntPtr.Zero)throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
        var addr=GetProcAddress(handle,"DllGetClassObject");
        if(addr==IntPtr.Zero)throw new InvalidOperationException("No class factory");
        var get=Marshal.GetDelegateForFunctionPointer<GetFactory>(addr);
        var factoryId=typeof(Factory).GUID;Check(get(ref id,ref factoryId,out var ptr));
        object factory;
        try{factory=Marshal.GetObjectForIUnknown(ptr);}finally{Marshal.Release(ptr);}
        try{
            var iid=new Guid("00000000-0000-0000-C000-000000000046");
            Check(((Factory)factory).CreateInstance(IntPtr.Zero,ref iid,out var obj));
            try{return Marshal.GetObjectForIUnknown(obj);}finally{Marshal.Release(obj);}
        }finally{Marshal.ReleaseComObject(factory);}
    }
    private static object SystemObject(Guid id)
    {
        // Resolve directly from the trusted Windows system directory, not COM
        // search order. Registry entries outside System32 are refused.
        string p=MachineServer(id);
        if(!string.Equals(Path.GetDirectoryName(p),Environment.SystemDirectory,StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("Non-system DirectShow component");
        return Instantiate(id,p);
    }

    private sealed class Approved : IDisposable
    {
        public readonly Guid Id;public readonly string Path;public readonly string Hash;private readonly FileStream hold;
        public Approved(Guid id,string name)
        {
            Id=id;Path=MachineServer(id);
            if(!string.Equals(System.IO.Path.GetFileName(Path),name,StringComparison.OrdinalIgnoreCase))throw new InvalidOperationException("Unexpected LAV module");
            // Restrict initial implementation to Program Files, machine x64,
            // no writable per-user folders, no UNC or junctions.
            string root=Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles)+System.IO.Path.DirectorySeparatorChar;
            if(!Path.StartsWith(root,StringComparison.OrdinalIgnoreCase))throw new InvalidOperationException("LAV outside Program Files");
            hold=new FileStream(Path,FileMode.Open,FileAccess.Read,FileShare.Read);
            try {
                using var reader=new BinaryReader(hold,System.Text.Encoding.UTF8,true);
                if(reader.ReadUInt16()!=0x5a4d)throw new InvalidOperationException("Invalid PE");
                hold.Position=60;int offset=reader.ReadInt32();if(offset<64||offset>1048576||offset+24>hold.Length)throw new InvalidOperationException("Invalid PE");
                hold.Position=offset;if(reader.ReadUInt32()!=0x4550||reader.ReadUInt16()!=0x8664)throw new InvalidOperationException("Not x64");
                hold.Position=0;Hash=Convert.ToHexString(SHA256.HashData(hold));hold.Position=0;
            }catch{hold.Dispose();throw;}
        }
        public void Dispose()=>hold.Dispose();
    }
    private static IPin Pin(IBaseFilter filter,PinDirection dir,Guid? major=null)
    {
        Check(filter.EnumPins(out var en));
        try{
            var pins=new IPin[1];
            while(en.Next(1,pins,IntPtr.Zero)==0){
                var p=pins[0];bool match=false;
                try{
                    Check(p.QueryDirection(out var direction));
                    if(direction!=dir)continue;
                    if(major.HasValue){
                        Check(p.EnumMediaTypes(out var types));
                        try{
                            var mts=new AMMediaType[1];
                            while(types.Next(1,mts,IntPtr.Zero)==0){try{if(mts[0].majorType==major.Value)match=true;}finally{DsUtils.FreeAMMediaType(mts[0]);}if(match)break;}
                        }finally{Marshal.ReleaseComObject(types);}
                    }else match=true;
                    if(match)return p;
                }finally{if(!match)Marshal.ReleaseComObject(p);}
            }
        }finally{Marshal.ReleaseComObject(en);}
        throw new InvalidOperationException("Required pin unavailable");
    }
    private sealed class Graph : IDisposable
    {
        private readonly IGraphBuilder graph;
        private readonly List<IBaseFilter> filters=new();
        public IMediaControl Control => (IMediaControl)graph;
        public IMediaSeeking Seeking => (IMediaSeeking)graph;
        public IVideoWindow Window => (IVideoWindow)graph;
        public Graph()=>graph=(IGraphBuilder)SystemObject(GraphId);
        public IBaseFilter Add(Guid id,string name,string? approved=null)
        {
            var f=(IBaseFilter)(approved==null?SystemObject(id):Instantiate(id,approved));
            filters.Add(f);Check(graph.AddFilter(f,name));return f;
        }
        public void Connect(IBaseFilter from,IBaseFilter to,Guid? type=null)
        {
            var a=Pin(from,PinDirection.Output,type);
            try{var b=Pin(to,PinDirection.Input);try{Check(graph.ConnectDirect(a,b,null));}finally{Marshal.ReleaseComObject(b);}}finally{Marshal.ReleaseComObject(a);}
        }
        public void Load(IBaseFilter source,string file)=>Check(((IFileSourceFilter)source).Load(file,null));
        public void Dispose(){
            try{Control.Stop();}catch{}
            foreach(var f in filters.AsEnumerable().Reverse()){try{graph.RemoveFilter(f);}catch{}Marshal.ReleaseComObject(f);}
            Marshal.ReleaseComObject(graph);
        }
    }

    public static int SelfTest(string file)
    {
        if(!string.Equals(Path.GetExtension(file),".wav",StringComparison.OrdinalIgnoreCase))return 2;
        using var g=new Graph();
        var source=g.Add(AsyncReaderId,"Async Reader");var parser=g.Add(WaveParserId,"Wave Parser");var sink=g.Add(NullRendererId,"Null Renderer");
        g.Load(source,file);g.Connect(source,parser);g.Connect(parser,sink);
        Check(g.Seeking.GetDuration(out long duration));Check(g.Control.Run());
        var timer=Stopwatch.StartNew();long pos=0;
        while(timer.ElapsedMilliseconds<2500){Check(g.Seeking.GetCurrentPosition(out pos));if(pos>=1000000)break;Thread.Sleep(30);}
        Check(g.Control.Stop());
        Console.WriteLine(JsonSerializer.Serialize(new{engine="directshow",graph="AsyncReader -> WaveParser -> NullRenderer",duration100ns=duration,position100ns=pos}));
        return duration>10000000&&pos>=1000000?0:6;
    }
    public static int Run(string file)
    {
        // Explicit experimental local-only path. No automatic fallback.
        using var source=new Approved(LavSource,"LAVSplitter.ax");
        using var video=new Approved(LavVideo,"LAVVideo.ax");
        using var audio=new Approved(LavAudio,"LAVAudio.ax");
        string detail=string.Join("\n\n",new[]{source,video,audio}.Select(x=>x.Path+"\nSHA256 "+x.Hash));
        if(MessageBox.Show("Experimental DirectShow: load the following installed filters and their local dependencies? Only proceed if you trust your codec installation.\n\n"+detail,
            "OPSIS — explicit codec approval",MessageBoxButtons.YesNo,MessageBoxIcon.Warning,MessageBoxDefaultButton.Button2)!=DialogResult.Yes)return 2;
        using var g=new Graph();
        var src=g.Add(source.Id,"LAV Splitter Source",source.Path);
        var vd=g.Add(video.Id,"LAV Video Decoder",video.Path);
        var ad=g.Add(audio.Id,"LAV Audio Decoder",audio.Path);
        var vr=g.Add(VideoRendererId,"Windows Video Renderer");var ar=g.Add(AudioRendererId,"Windows DirectSound Renderer");
        g.Load(src,file);
        g.Connect(src,vd,MediaType.Video);g.Connect(vd,vr,MediaType.Video);
        g.Connect(src,ad,MediaType.Audio);g.Connect(ad,ar,MediaType.Audio);
        using var form=new Form{Text="OPSIS DirectShow — LAV",Width=1000,Height=650};
        var panel=new Panel{Dock=DockStyle.Fill,BackColor=Color.Black};
        var controls=new FlowLayoutPanel{Dock=DockStyle.Bottom,Height=42};
        var play=new Button{Text="Play",AutoSize=true};var pause=new Button{Text="Pause",AutoSize=true};var stop=new Button{Text="Stop",AutoSize=true};
        play.Click+=(_,_)=>Check(g.Control.Run());pause.Click+=(_,_)=>Check(g.Control.Pause());stop.Click+=(_,_)=>Check(g.Control.Stop());
        controls.Controls.AddRange(new Control[]{play,pause,stop,new Label{Text="DirectShow / LAV (explicit graph)",AutoSize=true}});
        form.Controls.Add(panel);form.Controls.Add(controls);
        var window=g.Window;
        form.Shown+=(_,_)=>{Check(window.put_Owner(panel.Handle));Check(window.put_WindowStyle(WindowStyle.Child|WindowStyle.ClipChildren|WindowStyle.ClipSiblings));Check(window.SetWindowPosition(0,0,panel.Width,panel.Height));Check(window.put_Visible(OABool.True));Check(g.Control.Run());};
        panel.Resize+=(_,_)=>{if(form.Visible)window.SetWindowPosition(0,0,panel.Width,panel.Height);};
        form.FormClosing+=(_,_)=>{g.Control.Stop();window.put_Visible(OABool.False);window.put_Owner(IntPtr.Zero);};
        Application.Run(form);return 0;
    }
}
