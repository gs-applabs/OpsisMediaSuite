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
            if((cmd=="seek"||cmd=="volume"||cmd=="rate")&&!hasValue)return new(n,"invalid",0);
            return new(n,cmd,value);
        }catch{return new(0,"invalid",0);}
    }
    internal static bool Apply(Command c,MediaPlayer player,Media media)
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
                default:return false;
            }
        }catch{return false;}
    }
    internal static void Ack(Command c,bool ok){Console.WriteLine(JsonSerializer.Serialize(new{@event="ack",id=c.Id,ok}));Console.Out.Flush();}
}
