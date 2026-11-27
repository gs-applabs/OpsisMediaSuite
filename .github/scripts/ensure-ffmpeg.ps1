$ErrorActionPreference='Stop'
# Chocolatey can report a failed feed lookup without a useful exit code.
# Verify the actual executable, never allow real-conversion tests to skip silently.
function Find-VerifiedFfmpeg {
  $cmd=Get-Command ffmpeg.exe -ErrorAction SilentlyContinue
  if(-not $cmd){return $null}
  $output=& $cmd.Source -version 2>&1 | Out-String
  if($LASTEXITCODE -eq 0 -and $output -match '(?m)^ffmpeg version '){return $cmd.Source}
  return $null
}
$exe=Find-VerifiedFfmpeg
for($attempt=1; -not $exe -and $attempt -le 3; $attempt++){
  & choco install ffmpeg --no-progress -y
  $exe=Find-VerifiedFfmpeg
  if(-not $exe -and $attempt -lt 3){Start-Sleep -Seconds (5*$attempt)}
}
if(-not $exe){throw 'FFmpeg executable not verified after three attempts'}
Write-Host "Verified FFmpeg: $exe"
& $exe -version
if($LASTEXITCODE){throw 'FFmpeg version check failed'}
if($env:GITHUB_PATH){Split-Path -Parent $exe | Out-File -FilePath $env:GITHUB_PATH -Encoding utf8 -Append}
