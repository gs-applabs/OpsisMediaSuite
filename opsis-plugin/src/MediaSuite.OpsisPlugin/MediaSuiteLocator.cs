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
