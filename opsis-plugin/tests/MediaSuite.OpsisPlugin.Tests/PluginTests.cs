using System.Security.Cryptography;
using OpsisNewsCrawler.Plugin.Abstractions;
using Xunit;

namespace MediaSuite.OpsisPlugin.Tests;

public class PluginTests
{
    private const string CanonicalSha = "f5f1a21cee0435abdc19e609fd785b762fc706103991579afe3eb13dcf10ffaf";

    private static string Up(int n, params string[] rest) => Path.GetFullPath(Path.Combine(new[] { AppContext.BaseDirectory }.Concat(Enumerable.Repeat("..", n)).Concat(rest).ToArray()));
    // test output: opsis-plugin/tests/<proj>/bin/<cfg>/<tfm>/ -> 5 levels up is opsis-plugin
    private static string LibDll => Up(5, "libs", "OpsisNewsCrawler.Plugin.Abstractions.dll");

    [Fact]
    public void ContractDllInLibsHasTheCanonicalSha256()
    {
        using var s = File.OpenRead(LibDll);
        Assert.Equal(CanonicalSha, Convert.ToHexString(SHA256.HashData(s)).ToLowerInvariant());
        var recorded = File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "contract.sha256")).Trim().Split(' ', '\t')[0].ToLowerInvariant();
        Assert.Equal(CanonicalSha, recorded);
    }

    [Fact]
    public void ContractAssemblyVersionIs1000()
        => Assert.Equal(new Version(1, 0, 0, 0), typeof(IOpsisNewsCrawlerPlugin).Assembly.GetName().Version);

    [Fact]
    public void PluginAssemblyNameEndsInPlugin()
        => Assert.EndsWith("Plugin", typeof(MediaSuitePlugin).Assembly.GetName().Name);

    [Fact]
    public void PluginOutputDoesNotShipItsOwnContractCopy()
    {
        var pluginOut = Up(5, "src", "MediaSuite.OpsisPlugin", "bin");
        if (Directory.Exists(pluginOut))
            Assert.Empty(Directory.GetFiles(pluginOut, "OpsisNewsCrawler.Plugin.Abstractions.dll", SearchOption.AllDirectories));
    }

    [Fact]
    public void ImplementsTheContractInterfaces()
    {
        var p = new MediaSuitePlugin();
        Assert.IsAssignableFrom<IOpsisNewsCrawlerPlugin>(p);
        Assert.IsAssignableFrom<IPluginUpdateSource>(p);
        Assert.IsAssignableFrom<IPluginHostSettingsAware>(p);
        Assert.IsAssignableFrom<IPluginWidgetProvider>(p);
    }

    [Fact]
    public void UpdateSourceOwnerIsGsAppLabsAndAssetIsAZip()
    {
        var u = new MediaSuitePlugin().GetUpdateSource();
        Assert.Equal("gs-applabs/OpsisMediaSuite", u.Repository);
        Assert.StartsWith("gs-applabs/", u.Repository);
        Assert.Equal("MediaSuite-Plugin.zip", u.AssetName);
        Assert.EndsWith(".zip", u.AssetName);
    }

    [Fact]
    public void HostSettingsSwitchLanguage()
    {
        var p = new MediaSuitePlugin();
        p.SetHostSettings(new PluginHostSettings("en", false, "Balanced", 100, true));
        Assert.False(MediaSuitePlugin.IsGreek);
        p.SetHostSettings(new PluginHostSettings("el", true, "Balanced", 100, true));
        Assert.True(MediaSuitePlugin.IsGreek);
    }

    [Fact]
    public void ListsReturnCopiesAndDoNotOfferReservedTrayKeys()
    {
        var p = new MediaSuitePlugin();
        Assert.NotSame(p.GetTrayMenuItems(), p.GetTrayMenuItems());
        Assert.NotSame(p.GetNavigationItems(), p.GetNavigationItems());
        Assert.NotSame(p.GetWidgets(), p.GetWidgets());
        foreach (var t in p.GetTrayMenuItems())
        {
            var k = t.Key.ToLowerInvariant();
            Assert.False(k is "welcome" or "suite" or "family" || k.EndsWith(".welcome") || k.EndsWith(".suite") || k.EndsWith(".family"));
        }
    }

    [Fact]
    public void LocatorFindsOnlyExistingFiles()
    {
        Assert.Null(MediaSuiteLocator.Find(_ => false, () => null));
        Assert.NotNull(MediaSuiteLocator.Find(p => p.EndsWith(@"Programs\Opsis Media Suite\Opsis Media Suite.exe"), () => null));
        Assert.Equal(@"C:\x\Opsis Media Suite.exe", MediaSuiteLocator.Find(p => p == @"C:\x\Opsis Media Suite.exe", () => @"C:\x\Opsis Media Suite.exe"));
    }

    [Fact]
    public void KnownPathsMatchSuiteAppsJson()
    {
        var json = Up(6, "suite-apps.json");
        Assert.True(File.Exists(json));
        using var doc = System.Text.Json.JsonDocument.Parse(File.ReadAllText(json));
        var entry = doc.RootElement.GetProperty("apps").EnumerateArray().First(a => a.GetProperty("id").GetString() == "waveframe");
        Assert.Equal(entry.GetProperty("paths").EnumerateArray().Select(x => x.GetString()).ToArray(), MediaSuiteLocator.KnownPaths);
        Assert.Equal(MediaSuiteLocator.DisplayName, entry.GetProperty("uninstallDisplayName").GetString());
    }
}
