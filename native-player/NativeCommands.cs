using LibVLCSharp.Shared;
using System.Text;
using System.Text.Json;

internal static class NativeCommands
{
    internal sealed record Command(int Id,string Name,double Value);
    internal static Command? Read(TextReader reader)
    {
        var line=new StringBuilder(128);
        bool oversized=false;
        // Discard the remainder of an oversized frame without growing memory
        // or terminating the command loop. EOF still closes the pipe.
        while(true){int c=reader.Read();if(c<0)return null;if(c=='\n')break;if(line.Length>=256){oversized=true;continue;}line.Append((char)c);}
        if(oversized)return new(0,"invalid",0);
        try{
            using var json=JsonDocument.Parse(line.ToString());var r=json.RootElement;
            if(!r.TryGetProperty("id",out var id)||!id.TryGetInt32(out int n)||n<1||!r.TryGetProperty("name",out var name)||name.ValueKind!=JsonValueKind.String)return new(0,"invalid",0);
            string cmd=name.GetString()??"";double value=0;
            bool hasValue=r.TryGetProperty("value",out var v);
            if(hasValue&&(v.ValueKind!=JsonValueKind.Number||!v.TryGetDouble(out value)||!double.IsFinite(value)))return new(n,"invalid",0);
            if((cmd=="seek"||cmd=="volume"||cmd=="rate"||cmd=="subtitle-delay"||cmd=="subtitle-replace")&&!hasValue)return new(n,"invalid",0);
            return new(n,cmd,value);
        }catch{return new(0,"invalid",0);}
    }
    internal static bool Apply(Command c,MediaPlayer player,Media media,string? sessionSidecar=null)
    {
        try{
            switch(c.Name){
                case "toggle":if(player.IsPlaying)player.SetPause(true);else if(player.State==VLCState.Paused)player.SetPause(false);else return player.Play(media);return true;
                case "pause":player.SetPause(true);return true;
                case "play":if(player.State==VLCState.Paused){player.SetPause(false);return true;}return player.IsPlaying||player.Play(media);
                case "mute":player.Mute=!player.Mute;return true;
                case "seek":if(c.Value<0||c.Value>360000000||!player.IsSeekable||player.Length<=0)return false;player.Time=(long)Math.Min(c.Value,player.Length);return true;
                case "volume":if(c.Value<0||c.Value>100)return false;player.Volume=(int)c.Value;return true;
                case "rate":return c.Value>=.5&&c.Value<=4&&player.SetRate((float)c.Value)==0;
                // LibVLC expects microseconds. The renderer sends an absolute
                // offset in milliseconds relative to the already-exported SRT.
                case "subtitle-delay":
                    if(c.Value < -7200000 || c.Value > 7200000 || player.Spu < 0)return false;
                    long delay=(long)Math.Round(c.Value*1000);
                    player.SetSpuDelay(delay);
                    return player.SpuDelay==delay;
                case "subtitle-off":return player.Spu<0||player.SetSpu(-1);
                case "subtitle-replace":
                    // Only numbered files in the session's initial sidecar directory.
                    if(sessionSidecar==null||c.Value<1||c.Value>24||c.Value!=Math.Truncate(c.Value))return false;
                    var file=Path.Combine(Path.GetDirectoryName(sessionSidecar)!,"revision-"+((int)c.Value).ToString(System.Globalization.CultureInfo.InvariantCulture)+".srt");
                    if(!Program.SafeSubtitle(file)||new FileInfo(file).Length==0)return false;
                    if(!player.AddSlave(MediaSlaveType.Subtitle,new Uri(file).AbsoluteUri,true))return false;
                    player.SetSpuDelay(0);
                    return true; // accepted by LibVLC; selection/rendering may be asynchronous
                default:return false;
            }
        }catch{return false;}
    }
    internal static void Ack(Command c,bool ok){Console.WriteLine(JsonSerializer.Serialize(new{@event="ack",id=c.Id,ok}));Console.Out.Flush();}
}
