param([switch]$Watch)
# Read real Windows media-session state; window titles cannot prove playback.
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
try {
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  $managerType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType=WindowsRuntime]
  $propertiesType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties, Windows.Media.Control, ContentType=WindowsRuntime]
  $asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetGenericArguments().Count -eq 1 -and
    $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
  } | Select-Object -First 1
  function Await-Operation($operation, $resultType) {
    $task = $asTask.MakeGenericMethod($resultType).Invoke($null, @($operation))
    if (-not $task.Wait(8000)) { throw 'Media session timed out.' }
    return $task.Result
  }
  $manager = Await-Operation ($managerType::RequestAsync()) $managerType
  function Get-MediaState {
  $session = $manager.GetSessions() | Where-Object { $_.GetPlaybackInfo().PlaybackStatus.ToString() -eq 'Playing' } | Select-Object -First 1
  if (-not $session) { $session = $manager.GetCurrentSession() }
  if (-not $session) { return $null }
  $media = Await-Operation ($session.TryGetMediaPropertiesAsync()) $propertiesType
  if (-not $media.Title) { return $null }
  $source = $session.SourceAppUserModelId
  $appName = $source
  if ($source -match '(?i)spotify') { $appName = 'Spotify' }
  elseif ($source -match '(?i)chrome') { $appName = 'Chrome' }
  elseif ($source -match '(?i)msedge|edge') { $appName = 'Edge' }
  elseif ($source -match '(?i)firefox') { $appName = 'Firefox' }
  elseif ($source -match '(?i)vlc') { $appName = 'VLC' }
  elseif ($source -match '(?i)zunemusic|mediaplayer') { $appName = 'Media Player' }
  return @{ app = $appName; title = $media.Title; artist = $media.Artist; playing = $session.GetPlaybackInfo().PlaybackStatus.ToString() -eq 'Playing' }
  }
  do {
    try { $state = Get-MediaState } catch { $state = $null }
    $line = if ($null -eq $state) { 'null' } else { ConvertTo-Json -InputObject $state -Compress }
    [Console]::Out.WriteLine($line)
    [Console]::Out.Flush()
    if ($Watch) { Start-Sleep -Milliseconds 1500 }
  } while ($Watch)

} catch {
  Write-Output 'null'
}
