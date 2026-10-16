$ErrorActionPreference = 'Stop'
try {
  $player = New-Object System.Media.SoundPlayer (Join-Path $PSScriptRoot 'timer-done.wav')
  $player.Load()
  $player.PlaySync()
  $player.Dispose()
} catch {
  [Console]::Error.WriteLine($_.Exception.Message)
  exit 1
}
