# Run only on an ephemeral Windows CI runner. No release publication.
$ErrorActionPreference='Stop'
if($env:GITHUB_ACTIONS -ne 'true'){throw 'CI only'}
$root=Join-Path $env:RUNNER_TEMP 'opsis-installer-fixture'
if(Test-Path $root){throw 'unexpected existing fixture directory'}
$exe=Join-Path $root 'Opsis Media Suite.exe'
function Run-Setup([string]$version){
  $setup=(Resolve-Path "release-installer-ci/$version/OpsisMediaSuite-CI-$version.exe").Path
  Get-FileHash $setup -Algorithm SHA256 | Format-List
  $p=Start-Process -FilePath $setup -ArgumentList @('/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART','/SP-',"/DIR=`"$root`"",'/TASKS=','/LANG=english') -PassThru -Wait
  if($p.ExitCode -ne 0){throw "setup exited $($p.ExitCode)"}
  foreach($file in @('Opsis Media Suite.exe','resources/app.asar','resources/native-player/Opsis.NativePlayer.exe','resources/app.asar.unpacked/subtitle-sync-worker.js')){
    if(!(Test-Path (Join-Path $root $file))){throw "missing installed resource: $file"}
  }
  $env:OPSIS_ASAR=(Join-Path $root 'resources/app.asar')
  $env:OPSIS_EXPECTED_VERSION=$version
  node -e "const a=require('@electron/asar');const p=JSON.parse(a.extractFile(process.env.OPSIS_ASAR,'package.json'));if(p.version!==process.env.OPSIS_EXPECTED_VERSION)throw Error('installed version '+p.version);const entries=a.listPackage(process.env.OPSIS_ASAR).map(x=>x.replaceAll('\\','/'));if(entries.some(x=>x.includes('/dsp-dev/')||x.endsWith('/index-dsp-dev.html')))throw Error('experimental assets installed');console.log('PASS installed version '+p.version)"
  if($LASTEXITCODE){throw 'installed version verification failed'}
}
try{
  Run-Setup '2.4.2'
  $env:OPSIS_PACKAGED_SELFTEST_EXE=$exe
  npm run selftest 2>&1 | Tee-Object installer-first.log
  if($LASTEXITCODE){throw 'initial installation selftest failed'}
  $marker=Join-Path $env:APPDATA 'waveframe/opsis-ci-preserve.txt'
  if(Test-Path $marker){throw 'unexpected existing profile marker'}
  New-Item -ItemType Directory -Force (Split-Path $marker) | Out-Null
  Set-Content $marker 'preserve settings'
  $candidate=(Get-Content package.json -Raw | ConvertFrom-Json).version
  if($candidate -notmatch '^3\.0\.0-rc\.[1-9][0-9]{0,3}
  if((Get-Content $marker -Raw).Trim() -ne 'preserve settings'){throw 'upgrade removed profile marker'}
  npm run selftest 2>&1 | Tee-Object installer-upgrade.log
  if($LASTEXITCODE){throw 'upgrade selftest failed'}
  $u=Get-ChildItem $root -File -Filter 'unins*.exe'
  if(@($u).Count -ne 1){throw 'expected one uninstaller'}
  $p=Start-Process -FilePath $u.FullName -ArgumentList @('/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART') -Wait -PassThru
  if($p.ExitCode -ne 0){throw "uninstall exited $($p.ExitCode)"}
  for($i=0;$i -lt 30 -and (Test-Path $exe);$i++){Start-Sleep -Seconds 1}
  if((Test-Path $exe) -or (Test-Path (Join-Path $root 'resources/app.asar'))){throw 'uninstall left application executable/resources'}
  if((Get-Content $marker -Raw).Trim() -ne 'preserve settings'){throw 'uninstall removed profile marker'}
  Run-Setup $candidate
  if((Get-Content $marker -Raw).Trim() -ne 'preserve settings'){throw 'reinstall removed profile marker'}
  Run-Setup $candidate
  if((Get-Content $marker -Raw).Trim() -ne 'preserve settings'){throw 'repair removed profile marker'}
  $u=Get-ChildItem $root -File -Filter 'unins*.exe'
  if(@($u).Count -ne 1){throw 'expected one uninstaller after repair'}
  $p=Start-Process -FilePath $u.FullName -ArgumentList @('/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART') -Wait -PassThru
  if($p.ExitCode -ne 0){throw 'reinstall uninstall failed'}
  for($i=0;$i -lt 30 -and (Test-Path $exe);$i++){Start-Sleep -Seconds 1}
  if(Test-Path $exe){throw 'reinstall uninstall left executable'}
  if((Get-Content $marker -Raw).Trim() -ne 'preserve settings'){throw 'reinstall uninstall removed profile marker'}
  Remove-Item $marker
  Write-Host 'PASS install / synthetic base upgrade / uninstall / reinstall / repair / profile preservation'
}finally{
  # Self-test uses separate disposable profiles. Do not remove normal app data.
  Remove-Item Env:OPSIS_PACKAGED_SELFTEST_EXE -ErrorAction SilentlyContinue
}
){$candidate='3.0.0'}
  Run-Setup $candidate
  if((Get-Content $marker -Raw).Trim() -ne 'preserve settings'){throw 'upgrade removed profile marker'}
  npm run selftest 2>&1 | Tee-Object installer-upgrade.log
  if($LASTEXITCODE){throw 'upgrade selftest failed'}
  $u=Get-ChildItem $root -File -Filter 'unins*.exe'
  if(@($u).Count -ne 1){throw 'expected one uninstaller'}
  $p=Start-Process -FilePath $u.FullName -ArgumentList @('/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART') -Wait -PassThru
  if($p.ExitCode -ne 0){throw "uninstall exited $($p.ExitCode)"}
  for($i=0;$i -lt 30 -and (Test-Path $exe);$i++){Start-Sleep -Seconds 1}
  if((Test-Path $exe) -or (Test-Path (Join-Path $root 'resources/app.asar'))){throw 'uninstall left application executable/resources'}
  if((Get-Content $marker -Raw).Trim() -ne 'preserve settings'){throw 'uninstall removed profile marker'}
  Remove-Item $marker
  Write-Host 'PASS install / synthetic version upgrade / uninstall / profile preservation'
}finally{
  # Self-test uses separate disposable profiles. Do not remove normal app data.
  Remove-Item Env:OPSIS_PACKAGED_SELFTEST_EXE -ErrorAction SilentlyContinue
}
