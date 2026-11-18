# Builds the plugin and packs dist\MediaSuite-Plugin.zip (+ .sha256): the plugin files at the ZIP ROOT (no wrapper folder), as the Opsis update button expects.
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
dotnet build "$here\src\MediaSuite.OpsisPlugin" -c Release -o "$here\dist\plugin"
if ($LASTEXITCODE) { throw 'build failed' }
Remove-Item "$here\dist\plugin\OpsisNewsCrawler.Plugin.Abstractions.dll" -ErrorAction SilentlyContinue   # the host shares its own copy
$zip = "$here\dist\MediaSuite-Plugin.zip"
Remove-Item $zip -ErrorAction SilentlyContinue
Compress-Archive -Path "$here\dist\plugin\*" -DestinationPath $zip
$h = (Get-FileHash $zip -Algorithm SHA256).Hash.ToLower()
"$h  MediaSuite-Plugin.zip" | Set-Content "$zip.sha256" -Encoding ascii
Write-Host "OK $zip $h"
