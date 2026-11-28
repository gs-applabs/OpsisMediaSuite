using System.Runtime.InteropServices;
using System.Text.Json;

internal static class AudioEndpointInventory
{
    // Public Core Audio COM interfaces, read-only rendering endpoints.
    // No endpoint policy setter, registry access, audio capture or APO install.
    [ComImport,Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface Enumerator
    {
        [PreserveSig] int EnumAudioEndpoints(int flow,uint mask,out Collection collection);
        [PreserveSig] int GetDefaultAudioEndpoint(int flow,int role,out Device device);
    }
    [ComImport,Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface Collection
    {
        [PreserveSig] int GetCount(out uint count);
        [PreserveSig] int Item(uint index,out Device device);
    }
    [ComImport,Guid("D666063F-1587-4E43-81F1-B948E807363F"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface Device
    {
        [PreserveSig] int Activate(ref Guid iid,uint clsctx,IntPtr activation,[MarshalAs(UnmanagedType.IUnknown)] out object instance);
        [PreserveSig] int OpenPropertyStore(uint access,out PropertyStore store);
        [PreserveSig] int GetId(out IntPtr id);
        [PreserveSig] int GetState(out uint state);
    }
    [StructLayout(LayoutKind.Sequential)] private struct PropertyKey
    {
        public Guid fmtid;public uint pid;
        public PropertyKey(Guid id,uint index){fmtid=id;pid=index;}
    }
    [StructLayout(LayoutKind.Explicit,Size=24)] private struct Variant
    {
        [FieldOffset(0)] public ushort type;
        [FieldOffset(8)] public IntPtr pointer;
    }
    [ComImport,Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface PropertyStore
    {
        [PreserveSig] int GetCount(out uint count);
        [PreserveSig] int GetAt(uint index,out PropertyKey key);
        [PreserveSig] int GetValue(ref PropertyKey key,out Variant value);
    }
    [DllImport("ole32.dll")] private static extern int PropVariantClear(ref Variant value);
    private static void Release(object? obj){if(obj!=null&&Marshal.IsComObject(obj))Marshal.ReleaseComObject(obj);}
    private static string? Id(Device dev)
    {
        IntPtr p=IntPtr.Zero;
        try{return dev.GetId(out p)>=0&&p!=IntPtr.Zero?Marshal.PtrToStringUni(p):null;}
        finally{if(p!=IntPtr.Zero)Marshal.FreeCoTaskMem(p);}
    }
    private static string Name(Device dev)
    {
        PropertyStore? store=null;Variant value=default;
        try{
            if(dev.OpenPropertyStore(0,out store)<0||store==null)return "Unknown endpoint";
            var key=new PropertyKey(new Guid("A45C254E-DF1C-4EFD-8020-67D146A850E0"),14);
            if(store.GetValue(ref key,out value)<0||value.type!=31||value.pointer==IntPtr.Zero)return "Unknown endpoint";
            string s=Marshal.PtrToStringUni(value.pointer)??"Unknown endpoint";
            return new string(s.Take(160).Select(c=>char.IsControl(c)?' ':c).ToArray());
        }finally{PropVariantClear(ref value);Release(store);}
    }
    internal static int Run()
    {
        object? obj=null;Collection? collection=null;
        try{
            var type=Type.GetTypeFromCLSID(new Guid("BCDE0395-E52F-467C-8E3D-C4579291692E"),true)!;
            obj=Activator.CreateInstance(type)!;
            var en=(Enumerator)obj;
            int hr=en.EnumAudioEndpoints(0,15,out collection);
            if(hr<0||collection==null)Marshal.ThrowExceptionForHR(hr<0?hr:unchecked((int)0x80004005));
            Marshal.ThrowExceptionForHR(collection!.GetCount(out uint count));
            var defaults=new string?[3];var rolesKnown=new bool[3];
            for(int i=0;i<3;i++){
                Device? dev=null;
                try{
                    int result=en.GetDefaultAudioEndpoint(0,i,out dev);
                    if(result>=0&&dev!=null){defaults[i]=Id(dev);rolesKnown[i]=defaults[i]!=null;}
                    else if(result==unchecked((int)0x80070490))rolesKnown[i]=true; // no default
                }finally{Release(dev);}
            }
            var rows=new List<object>();bool partial=count>64;
            for(uint i=0;i<Math.Min(count,64u);i++){
                Device? dev=null;
                try{
                    if(collection.Item(i,out dev)<0||dev==null){partial=true;continue;}
                    var id=Id(dev);
                    if(id==null||dev.GetState(out uint state)<0){partial=true;continue;}
                    // Raw endpoint identifiers never leave this process.
                    rows.Add(new{name=Name(dev),state,console=defaults[0]==id,multimedia=defaults[1]==id,communications=defaults[2]==id});
                }catch{partial=true;}finally{Release(dev);}
            }
            Console.WriteLine(JsonSerializer.Serialize(new{ok=true,rows,partial,rolesKnown}));
            return 0;
        }catch(Exception ex){
            Console.WriteLine(JsonSerializer.Serialize(new{ok=false,code="core-audio-unavailable",hresult=ex.HResult}));
            return 3;
        }finally{Release(collection);Release(obj);}
    }
}
