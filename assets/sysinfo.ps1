# CineMate system info.
# Usage: powershell -File sysinfo.ps1
$ErrorActionPreference = 'SilentlyContinue'

$battery = Get-CimInstance Win32_Battery -ErrorAction SilentlyContinue
if ($battery) {
  $pct = [int]$battery.EstimatedChargeRemaining
  $state = if ($battery.BatteryStatus -eq 2) { 'charging' } else { 'on battery' }
  Write-Output "BATTERY=$pct"
  Write-Output "POWER=$state"
} else {
  Write-Output 'BATTERY=AC'
  Write-Output 'POWER=plugged in'
}

$os = Get-CimInstance Win32_OperatingSystem -ErrorAction SilentlyContinue
$totalGB = [math]::Round($os.TotalVisibleMemorySize / 1MB, 1)
$freeGB = [math]::Round($os.FreePhysicalMemory / 1MB, 1)
Write-Output "MEMORY=$freeGB/$totalGB"

$cpu = (Get-CimInstance Win32_Processor -ErrorAction SilentlyContinue | Select-Object -First 1)
if ($cpu) { Write-Output "CPU=$([int]$cpu.LoadPercentage)" }

exit 0
