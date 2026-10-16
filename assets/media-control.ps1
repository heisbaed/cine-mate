param([string]$Action = 'playpause', [string]$Target = '')
$ErrorActionPreference = 'Stop'
$sent = $false
if ($Action -in @('next', 'prev', 'playpause', 'play', 'pause', 'stop')) {
  try {
    Add-Type -AssemblyName System.Runtime.WindowsRuntime
    $managerType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType=WindowsRuntime]
    $asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
      $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetGenericArguments().Count -eq 1 -and
      $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
    } | Select-Object -First 1
    function Await-Operation($operation, $resultType) {
      $task = $asTask.MakeGenericMethod($resultType).Invoke($null, @($operation))
      if (-not $task.Wait(8000)) { throw 'Media control timed out.' }
      return $task.Result
    }
    $manager = Await-Operation ($managerType::RequestAsync()) $managerType
    $session = $manager.GetSessions() | Where-Object { $_.GetPlaybackInfo().PlaybackStatus.ToString() -eq 'Playing' } | Select-Object -First 1
    if (-not $session) { $session = $manager.GetCurrentSession() }
    if ($session) {
      $operation = switch ($Action) {
        'next' { $session.TrySkipNextAsync() }
        'prev' { $session.TrySkipPreviousAsync() }
        'playpause' { $session.TryTogglePlayPauseAsync() }
        'play' { $session.TryPlayAsync() }
        'pause' { $session.TryPauseAsync() }
        'stop' { $session.TryStopAsync() }
      }
      $sent = Await-Operation $operation ([bool])
    }
  } catch { $sent = $false }
}
# A single media-key fallback. Never send a second transport action after success.
if (-not $sent) {
  Add-Type @"
using System;
using System.Runtime.InteropServices;
public class CineMediaKey {
  [DllImport("user32.dll")] public static extern void keybd_event(byte key, byte scan, uint flags, UIntPtr extra);
}
"@
  $keys = @{ next=0xB0; prev=0xB1; playpause=0xB3; stop=0xB2; volup=0xAF; voldown=0xAE; mute=0xAD }
  if ($keys.ContainsKey($Action)) {
    [CineMediaKey]::keybd_event($keys[$Action], 0, 0, [UIntPtr]::Zero)
    [CineMediaKey]::keybd_event($keys[$Action], 0, 2, [UIntPtr]::Zero)
    $sent = $true
  }
}
if ($sent) { Write-Output 'SENT' } else { Write-Output 'FAILED' }
