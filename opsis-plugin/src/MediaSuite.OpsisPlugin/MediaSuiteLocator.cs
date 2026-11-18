using Microsoft.Win32;

namespace MediaSuite.OpsisPlugin;

/// <summary>Finds the installed Opsis Media Suite exe. Same known paths as suite-apps.json ("waveframe" entry) plus the Inno Setup uninstall key. Read-only.</summary>
public static class MediaSuiteLocator
{
    public const string DisplayName = "Opsis Media Suite";
    public static readonly string[] KnownPaths =
    {
        @"%ProgramFiles%\Opsis Media Suite\Opsis Media Suite.exe",
        @"%LocalAppData%\Programs\Opsis Media Suite\Opsis Media Suite.exe",
    };

    /// <summary>Same decision as Opsis' own MediaSuiteDetector (which turns on the native "Audio management" tab by itself): a usual folder with an .exe, or an uninstall entry named "Opsis Media Suite"/"Waveframe". The plugin only mirrors it to decide whether to show its page.</summary>
    public static bool IsInstalled(IEnumerable<string>? existingFolders = null, IEnumerable<string>? uninstallNames = null)
    {
        existingFolders ??= CandidateFolders();
        return existingFolders.Any(f => { try { return Directory.Exists(f) && Directory.EnumerateFiles(f, "*.exe", SearchOption.TopDirectoryOnly).Any(); } catch { return false; } })
            || (uninstallNames ?? UninstallNames()).Any(n => n != null && new[] { "Opsis Media Suite", "Waveframe" }.Any(d => n.StartsWith(d, StringComparison.OrdinalIgnoreCase)));
    }

    public static IEnumerable<string> CandidateFolders()
    {
        var local = Environment.GetEnvironmentVariable("LOCALAPPDATA") ?? "";
        var pf = Environment.GetEnvironmentVariable("ProgramFiles") ?? "";
        var pf86 = Environment.GetEnvironmentVariable("ProgramFiles(x86)") ?? "";
        foreach (var root in new[] { local.Length > 0 ? Path.Combine(local, "Programs") : "", pf, pf86 })
        {
            if (root.Length == 0) continue;
            foreach (var name in new[] { "Opsis Media Suite", "waveframe", "Waveframe" }) yield return Path.Combine(root, name);
        }
    }

    public static IEnumerable<string> UninstallNames()
    {
        var names = new List<string>();
        foreach (var (hive, view) in new[] { (RegistryHive.LocalMachine, RegistryView.Registry64), (RegistryHive.LocalMachine, RegistryView.Registry32), (RegistryHive.CurrentUser, RegistryView.Default) })
        {
            try
            {
                using var root = RegistryKey.OpenBaseKey(hive, view);
                using var un = root.OpenSubKey(@"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall");
                if (un == null) continue;
                foreach (var n in un.GetSubKeyNames()) { using var s = un.OpenSubKey(n); if (s?.GetValue("DisplayName") is string dn) names.Add(dn); }
            }
            catch { }
        }
        return names;
    }

    public static string? Find(Func<string, bool>? exists = null, Func<string?>? registryPath = null)
    {
        exists ??= File.Exists;
        foreach (var p in KnownPaths)
        {
            var full = Environment.ExpandEnvironmentVariables(p);
            if (!full.Contains('%') && exists(full)) return full;
        }
        var reg = (registryPath ?? FromUninstallKey)();
        return !string.IsNullOrWhiteSpace(reg) && exists(reg!) ? reg : null;
    }

    private static string? FromUninstallKey()
    {
        foreach (var (hive, view) in new[] { (RegistryHive.CurrentUser, RegistryView.Default), (RegistryHive.LocalMachine, RegistryView.Registry64), (RegistryHive.LocalMachine, RegistryView.Registry32) })
        {
            try
            {
                using var root = RegistryKey.OpenBaseKey(hive, view);
                using var un = root.OpenSubKey(@"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall");
                if (un == null) continue;
                foreach (var name in un.GetSubKeyNames())
                {
                    using var k = un.OpenSubKey(name);
                    if (!string.Equals(k?.GetValue("DisplayName") as string, DisplayName, StringComparison.OrdinalIgnoreCase)) continue;
                    var loc = (k!.GetValue("InstallLocation") as string)?.Trim('"', ' ');
                    if (!string.IsNullOrEmpty(loc)) return Path.Combine(loc, "Opsis Media Suite.exe");
                }
            }
            catch { /* unreadable key: treat as not found */ }
        }
        return null;
    }
}
