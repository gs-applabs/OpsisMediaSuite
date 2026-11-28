using System.Runtime.InteropServices;
using System.Text.Json;

internal static class MediaFoundationProbe
{
    // Windows Media Foundation Source Reader, distinct from DirectShow and VLC.
    // No third-party COM discovery or global codec changes. MF may select
    // registered transforms according to Windows policy; this is a decode
    // diagnostic, not yet a renderer or a trusted-transform policy.
    private const uint FirstVideo=0xfffffffc, FirstAudio=0xfffffffd, AllStreams=0xfffffffe;
    private const uint EndOfStream=2, Error=1;
    private static readonly Guid MajorType=new("48EBA18E-F8C9-4687-BF11-0A74C9F96A8F");
    private static readonly Guid Subtype=new("F7E34C9A-42E8-4714-B74B-CB29D72C35E5");
    private static readonly Guid Audio=new("73647561-0000-0010-8000-00AA00389B71");
    private static readonly Guid Video=new("73646976-0000-0010-8000-00AA00389B71");
    private static readonly Guid Pcm=new("00000001-0000-0010-8000-00AA00389B71");
    private static readonly Guid Nv12=new("3231564E-0000-0010-8000-00AA00389B71");

    [DllImport("mfplat.dll",ExactSpelling=true)] private static extern int MFStartup(int version,int flags);
    [DllImport("mfplat.dll",ExactSpelling=true)] private static extern int MFShutdown();
    [DllImport("mfplat.dll",ExactSpelling=true)] private static extern int MFCreateMediaType(out IntPtr type);
    [DllImport("mfreadwrite.dll",ExactSpelling=true,CharSet=CharSet.Unicode)]
    private static extern int MFCreateSourceReaderFromURL([MarshalAs(UnmanagedType.LPWStr)] string url,IntPtr attributes,out IntPtr reader);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] private delegate int SetGuid(IntPtr self,ref Guid key,ref Guid value);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] private delegate int GetGuid(IntPtr self,ref Guid key,out Guid value);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] private delegate int Selection(IntPtr self,uint stream,int selected);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] private delegate int SetType(IntPtr self,uint stream,IntPtr reserved,IntPtr type);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] private delegate int GetType(IntPtr self,uint stream,out IntPtr type);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] private delegate int Read(IntPtr self,uint stream,uint control,out uint actual,out uint flags,out long time,out IntPtr sample);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] private delegate int Length(IntPtr self,out uint size);

    private static T Method<T>(IntPtr obj,int slot) where T:Delegate
    {
        if(obj==IntPtr.Zero)throw new InvalidOperationException("Null COM interface");
        return Marshal.GetDelegateForFunctionPointer<T>(Marshal.ReadIntPtr(Marshal.ReadIntPtr(obj),slot*IntPtr.Size));
    }
    private static void Check(int hr){if(hr<0)Marshal.ThrowExceptionForHR(hr);}
    private static void Release(ref IntPtr p){if(p!=IntPtr.Zero){Marshal.Release(p);p=IntPtr.Zero;}}
    private static void SetAttribute(IntPtr type,Guid key,Guid value)=>Check(Method<SetGuid>(type,24)(type,ref key,ref value));
    private static Guid GetAttribute(IntPtr type,Guid key){Check(Method<GetGuid>(type,10)(type,ref key,out var v));return v;}
    private sealed record Decoded(string Kind,string Format,int Samples,long Bytes,long LastTimestamp100ns);
    private static Decoded Decode(string file,bool video)
    {
        IntPtr reader=IntPtr.Zero,type=IntPtr.Zero,current=IntPtr.Zero;
        uint stream=video?FirstVideo:FirstAudio;
        try{
            Check(MFCreateSourceReaderFromURL(file,IntPtr.Zero,out reader));
            Check(Method<Selection>(reader,4)(reader,AllStreams,0));
            Check(Method<Selection>(reader,4)(reader,stream,1));
            Check(MFCreateMediaType(out type));
            SetAttribute(type,MajorType,video?Video:Audio);SetAttribute(type,Subtype,video?Nv12:Pcm);
            Check(Method<SetType>(reader,7)(reader,stream,IntPtr.Zero,type));
            Check(Method<GetType>(reader,6)(reader,stream,out current));
            if(GetAttribute(current,MajorType)!=(video?Video:Audio)||GetAttribute(current,Subtype)!=(video?Nv12:Pcm))
                throw new InvalidOperationException("Unexpected negotiated media type");
            int count=0;long bytes=0,last=-1;
            for(int i=0;i<256&&count<8;i++){
                IntPtr sample=IntPtr.Zero;
                try{
                    Check(Method<Read>(reader,9)(reader,stream,0,out _,out uint flags,out long time,out sample));
                    if((flags&Error)!=0)throw new InvalidOperationException("Source Reader error");
                    if(sample!=IntPtr.Zero){
                        // IMFSample inherits IMFAttributes: GetTotalLength is slot 45.
                        Check(Method<Length>(sample,45)(sample,out uint length));
                        if(length>0){count++;bytes+=length;last=time;}
                    }
                    if((flags&EndOfStream)!=0)break;
                }finally{Release(ref sample);}
            }
            if(count<2||bytes<=0||last<=0)throw new InvalidOperationException("Insufficient decoded samples");
            return new(video?"video":"audio",video?"NV12":"PCM",count,bytes,last);
        }finally{Release(ref current);Release(ref type);Release(ref reader);}
    }
    public static int Run(string file,bool video)
    {
        // Source Reader operations are bounded by the parent process timeout.
        // MFStartup is paired with shutdown after all COM objects are released.
        Check(MFStartup(0x00020070,0));
        try{
            var results=video?new[]{Decode(file,false),Decode(file,true)}:new[]{Decode(file,false)};
            Console.WriteLine(JsonSerializer.Serialize(new{engine="media-foundation",streams=results}));
            return 0;
        }finally{MFShutdown();}
    }
}
