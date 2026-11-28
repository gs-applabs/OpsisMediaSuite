# Builds the plugin and packs dist\MediaSuite-Plugin.zip (+ .sha256): the plugin files at the ZIP ROOT (no wrapper folder), as the Opsis update button expects.
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
Remove-Item "$here\dist\plugin" -Recurse -Force -ErrorAction SilentlyContinue
dotnet build "$here\src\MediaSuite.OpsisPlugin" -c Release -o "$here\dist\plugin"
if ($LASTEXITCODE) { throw 'build failed' }
Remove-Item "$here\dist\plugin\OpsisNewsCrawler.Plugin.Abstractions.dll" -ErrorAction SilentlyContinue   # the host shares its own copy
$zip = "$here\dist\MediaSuite-Plugin.zip"
$stage = Join-Path "$here\dist" ("plugin-"+[Guid]::NewGuid().ToString("N")+".zip")
try {
    Compress-Archive -Path "$here\dist\plugin\*" -DestinationPath $stage
    $archive=[IO.Compression.ZipFile]::OpenRead($stage)
    try{
        $entries=@($archive.Entries)
        if(!($entries | Where-Object FullName -eq 'MediaSuite.OpsisPlugin.dll')){throw 'missing plugin DLL'}
        $names=[Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
        foreach($entry in $entries){
            if($entry.FullName -match '[/\\:]' -or !$names.Add($entry.FullName) -or $entry.Name -ieq 'OpsisNewsCrawler.Plugin.Abstractions.dll'){throw "invalid plugin entry"}
        }
    }finally{$archive.Dispose()}
    $h=(Get-FileHash $stage -Algorithm SHA256).Hash.ToLower()
    Remove-Item "$zip.sha256" -ErrorAction SilentlyContinue
    Move-Item $stage $zip -Force
    "$h  MediaSuite-Plugin.zip" | Set-Content "$zip.sha256" -Encoding ascii
}finally{Remove-Item $stage -ErrorAction SilentlyContinue}
Write-Host "OK $zip $h"
