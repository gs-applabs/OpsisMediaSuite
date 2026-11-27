using System.Runtime.InteropServices;

// The parent HWND is supplied only by the Electron main process. The child
// never accepts a parent or arbitrary coordinates over the command channel.
internal sealed class EmbeddedViewport
{
    private readonly IntPtr parent;
    private readonly uint ownerPid;
    private IntPtr child;
    private long deadline;
    private int x,y,w,h;
    private const int SW_HIDE=0;
    private const uint SWP_NOACTIVATE=0x0010, SWP_SHOWWINDOW=0x0040, SWP_HIDEWINDOW=0x0080;
    [StructLayout(LayoutKind.Sequential)] private struct RECT { public int Left,Top,Right,Bottom; }
    [DllImport("user32.dll")] private static extern bool IsWindow(IntPtr hwnd);
    [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr hwnd);
    [DllImport("user32.dll")] private static extern bool IsIconic(IntPtr hwnd);
    [DllImport("user32.dll")] private static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] private static extern IntPtr GetAncestor(IntPtr hwnd,uint flags);
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr hwnd,out uint pid);
    [DllImport("user32.dll",SetLastError=true)] private static extern IntPtr SetParent(IntPtr child,IntPtr parent);
    [DllImport("user32.dll")] private static extern IntPtr GetParent(IntPtr hwnd);
    [DllImport("user32.dll",SetLastError=true)] private static extern IntPtr GetWindowLongPtrW(IntPtr hwnd,int index);
    [DllImport("user32.dll",SetLastError=true)] private static extern IntPtr SetWindowLongPtrW(IntPtr hwnd,int index,IntPtr value);
    [DllImport("user32.dll")] private static extern bool ShowWindow(IntPtr hwnd,int command);
    [DllImport("user32.dll")] private static extern bool GetClientRect(IntPtr hwnd,out RECT rect);
    [DllImport("user32.dll",SetLastError=true)] private static extern bool SetWindowPos(IntPtr hwnd,IntPtr after,int x,int y,int cx,int cy,uint flags);
    internal EmbeddedViewport(IntPtr parent,uint ownerPid){this.parent=parent;this.ownerPid=ownerPid;}
    internal bool ParentValid()=>parent!=IntPtr.Zero&&IsWindow(parent)&&GetAncestor(parent,2)==parent&&GetWindowThreadProcessId(parent,out uint pid)!=0&&pid==ownerPid;
    internal bool Attach(IntPtr handle)
    {
        if(!ParentValid()||handle==IntPtr.Zero||!IsWindow(handle))return false;
        child=handle;ShowWindow(child,SW_HIDE);
        // WS_CHILD | WS_DISABLED; strip WS_POPUP. No focus or mouse capture
        // inside this experimental video-only surface.
        long style=GetWindowLongPtrW(child,-16).ToInt64();
        SetWindowLongPtrW(child,-16,new IntPtr((style&~0x80000000L)|0x48000000L));
        long ex=GetWindowLongPtrW(child,-20).ToInt64();
        SetWindowLongPtrW(child,-20,new IntPtr(ex|0x08000000L));
        SetParent(child,parent);
        return GetParent(child)==parent&&SetWindowPos(child,IntPtr.Zero,0,0,1,1,SWP_NOACTIVATE|SWP_HIDEWINDOW);
    }
    internal static bool Decode(double packed,out int x,out int y,out int w,out int h)
    {
        x=y=w=h=0;
        if(!double.IsFinite(packed)||packed<0||packed>=1099511627776d||packed!=Math.Truncate(packed))return false;
        long n=(long)packed;h=(int)(n&1023);w=(int)((n>>10)&1023);y=(int)((n>>20)&1023);x=(int)((n>>30)&1023);
        return n==0||(x<=1000&&y<=1000&&w>0&&h>0&&x+w<=1000&&y+h<=1000);
    }
    internal bool Update(double packed)
    {
        if(!Decode(packed,out x,out y,out w,out h)||!ParentValid()||GetParent(child)!=parent){Hide();return false;}
        deadline=Environment.TickCount64+1800;
        return Tick();
    }
    internal void Hide(){if(child!=IntPtr.Zero&&IsWindow(child))ShowWindow(child,SW_HIDE);}
    internal bool Tick()
    {
        if(!ParentValid()||!IsWindow(child)||GetParent(child)!=parent){Hide();return false;}
        if(w==0||h==0||Environment.TickCount64>deadline||!IsWindowVisible(parent)||IsIconic(parent)||GetForegroundWindow()!=parent){Hide();return true;}
        if(!GetClientRect(parent,out RECT rect)||rect.Right<=0||rect.Bottom<=0){Hide();return false;}
        int left=(int)((long)rect.Right*x/1000),top=(int)((long)rect.Bottom*y/1000);
        int right=(int)((long)rect.Right*(x+w)/1000),bottom=(int)((long)rect.Bottom*(y+h)/1000);
        if(right<=left||bottom<=top){Hide();return true;}
        return SetWindowPos(child,IntPtr.Zero,left,top,right-left,bottom-top,SWP_NOACTIVATE|SWP_SHOWWINDOW);
    }
    internal static int SelfTest()
    {
        using var parent=new Form{Width=640,Height=480};
        using var child=new Form{TopLevel=false,FormBorderStyle=FormBorderStyle.None,ShowInTaskbar=false};
        var viewport=new EmbeddedViewport(parent.Handle,(uint)Environment.ProcessId);
        bool attached=viewport.Attach(child.Handle);
        long value=((100L*1024+100)*1024+500)*1024+500;
        bool valid=Decode(value,out int x,out int y,out int w,out int h)&&x==100&&y==100&&w==500&&h==500;
        bool rejected=!Decode(-1,out _,out _,out _,out _)&&!Decode(1099511627776d,out _,out _,out _,out _)
            &&!Decode(((900L*1024+100)*1024+500)*1024+500,out _,out _,out _,out _);
        bool updated=attached&&viewport.Update(value)&&viewport.Update(0);
        bool wrongOwner=!new EmbeddedViewport(parent.Handle,uint.MaxValue).ParentValid();
        Console.WriteLine(System.Text.Json.JsonSerializer.Serialize(new{attached,valid,rejected,updated,wrongOwner}));
        return attached&&valid&&rejected&&updated&&wrongOwner?0:8;
    }
}
