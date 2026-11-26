using System.Security.Cryptography;
using OpsisNewsCrawler.Plugin.Abstractions;
using Xunit;

namespace MediaSuite.OpsisPlugin.Tests;

public class PluginTests
{
    private const string CanonicalSha = "514f2a3eafa57770afd0f4b76cfe26397cfecd84edce06f071716fa0d9f30afe";

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
        var trusted = Path.Combine(Environment.GetEnvironmentVariable("ProgramFiles")!, "Opsis Media Suite", "Opsis Media Suite.exe");
        Assert.Equal(trusted, MediaSuiteLocator.Find(p => p == trusted, () => trusted));
        Assert.Null(MediaSuiteLocator.Find(p => p == @"C:\x\Opsis Media Suite.exe", () => @"C:\x\Opsis Media Suite.exe"));
    }

    [Fact]
    public void InstalledDecisionMirrorsOpsisDetector()
    {
        Assert.False(MediaSuiteLocator.IsInstalled(new string[0], new[] { "Something else", null! }));
        Assert.True(MediaSuiteLocator.IsInstalled(new string[0], new[] { "Opsis Media Suite 2.4.1" }));
        Assert.True(MediaSuiteLocator.IsInstalled(new string[0], new[] { "Waveframe" }));
        var d = Directory.CreateTempSubdirectory().FullName;
        try { Assert.False(MediaSuiteLocator.IsInstalled(new[] { d }, new string[0])); File.WriteAllText(Path.Combine(d, "x.exe"), ""); Assert.True(MediaSuiteLocator.IsInstalled(new[] { d }, new string[0])); }
        finally { Directory.Delete(d, true); }
    }

    [Fact]
    public void RegistryPathMustBeTheRealExeUnderAnInstallRoot()
    {
        var pf = Environment.GetEnvironmentVariable("ProgramFiles")!;
        Assert.True(MediaSuiteLocator.IsTrustedLocation(Path.Combine(pf, "Opsis Media Suite", "Opsis Media Suite.exe")));
        Assert.False(MediaSuiteLocator.IsTrustedLocation(Path.Combine(pf, "Opsis Media Suite", "evil.exe")));
        Assert.False(MediaSuiteLocator.IsTrustedLocation(@"C:UsersPublicOpsis Media Suite.exe"));
        Assert.False(MediaSuiteLocator.IsTrustedLocation(@"\servershareOpsis Media Suite.exe"));
        Assert.False(MediaSuiteLocator.IsTrustedLocation(Path.Combine(pf, "..", "Temp", "Opsis Media Suite.exe")));
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
