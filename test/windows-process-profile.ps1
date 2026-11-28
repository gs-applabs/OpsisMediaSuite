param([Parameter(Mandatory=$true)][int]$RootPid)
$ErrorActionPreference = 'Stop'
# One snapshot. No executable paths, command lines or user file names are collected.
$procs = @(Get-CimInstance Win32_Process -Property ProcessId,ParentProcessId,Name,CreationDate,KernelModeTime,UserModeTime,WorkingSetSize,ReadTransferCount,WriteTransferCount)
$ids = [System.Collections.Generic.HashSet[int]]::new()
[void]$ids.Add($RootPid)
do {
  $changed = $false
  foreach ($p in $procs) {
    if ($ids.Contains([int]$p.ParentProcessId) -and $ids.Add([int]$p.ProcessId)) { $changed = $true }
  }
} while ($changed)
$rows = @($procs | Where-Object { $ids.Contains([int]$_.ProcessId) } | Select-Object -First 128 | ForEach-Object {
  [ordered]@{
    pid=[int]$_.ProcessId
    name=[string]$_.Name
    started=if ($_.CreationDate) { $_.CreationDate.ToUniversalTime().ToString('o') } else { $null }
    cpu100ns=if ($null -ne $_.KernelModeTime -and $null -ne $_.UserModeTime) { [double]$_.KernelModeTime + [double]$_.UserModeTime } else { $null }
    workingSetBytes=if ($null -ne $_.WorkingSetSize) { [double]$_.WorkingSetSize } else { $null }
    readTransferBytes=if ($null -ne $_.ReadTransferCount) { [double]$_.ReadTransferCount } else { $null }
    writeTransferBytes=if ($null -ne $_.WriteTransferCount) { [double]$_.WriteTransferCount } else { $null }
  }
})
$gpu = $null
try {
  $engines = @(Get-CimInstance Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine -OperationTimeoutSec 3 -ErrorAction Stop)
  if ($engines.Count -gt 0) {
    $values = @($engines | Where-Object { $_.Name -match '^pid_(\d+)_' -and $ids.Contains([int]$Matches[1]) } | ForEach-Object { [double]$_.UtilizationPercentage })
    if ($values.Count -gt 0) { $gpu = ($values | Measure-Object -Maximum).Maximum }
  }
} catch {}
[ordered]@{utc=[DateTime]::UtcNow.ToString('o');rootPid=$RootPid;rows=$rows;maxObservedGpuEnginePercent=$gpu;scope='process tree snapshot; transfer bytes include non-disk I/O; GPU maximum is not total GPU usage'} | ConvertTo-Json -Compress -Depth 5
