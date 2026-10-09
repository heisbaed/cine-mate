# CineMate media control. Talks to the running media app directly.
# Usage: powershell -File media.ps1 -Action next|prev|playpause|stop|volup|voldown|mute -Target Spotify
param(
  [string]$Action = 'playpause',
  [string]$Target = ''
)
$ErrorActionPreference = 'SilentlyContinue'

Add-Type @"
using System;
using System.Runtime.InteropServices;
public class CM {
  [DllImport("user32.dll", CharSet = CharSet.Auto)]
  public static extern IntPtr PostMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);
  [DllImport("user32.dll")]
  public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
  [DllImport("user32.dll")]
  public static extern IntPtr GetForegroundWindow();
}
"@

$WM_APPCOMMAND = 0x0319

# MSDN APPCOMMAND values
$commands = @{
  'next'      = 0xB1
  'prev'      = 0xB0
  'playpause' = 0xB3
  'stop'      = 0xB2
}

# Virtual-key codes for volume (system wide)
$vkeys = @{
  'volup'   = 0xAF
  'voldown' = 0xAE
  'mute'    = 0xAD
}

$sent = $false

# Virtual-key codes for transport + volume. These are what real media keys send,
# so Windows routes them to whichever app owns the active media session.
$vkeys = @{
  'next'      = 0xB0
  'prev'      = 0xB1
  'playpause' = 0xB3
  'stop'      = 0xB2
  'volup'   = 0xAF
  'voldown' = 0xAE
  'mute'    = 0xAD
}

if ($vkeys.ContainsKey($Action)) {
  $vk = $vkeys[$Action]
  [CM]::keybd_event($vk, 0, 0, [UIntPtr]::Zero)
  [CM]::keybd_event($vk, 0, 2, [UIntPtr]::Zero)
  $sent = $true
}

# Belt and braces: also post the app-command to the media window and foreground.
if ($commands.ContainsKey($Action)) {
  $cmd = $commands[$Action]
  $targets = @()

  if ($Target) {
    $p = Get-Process -Name $Target -ErrorAction SilentlyContinue |
         Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
    if ($p) { $targets += $p.MainWindowHandle }
  }

  foreach ($name in @('spotify', 'chrome', 'msedge', 'vlc', 'wmplayer')) {
    if ($targets.Count -gt 0) { break }
    $p = Get-Process -Name $name -ErrorAction SilentlyContinue |
         Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
    if ($p) { $targets += $p.MainWindowHandle }
  }
  $fg = [CM]::GetForegroundWindow()
  if ($fg -ne [IntPtr]::Zero) { $targets += $fg }

  foreach ($h in $targets) {
    [CM]::PostMessage($h, $WM_APPCOMMAND, $h, [IntPtr]$cmd) | Out-Null
    $sent = $true
  }
}

if ($sent) { Write-Output 'SENT' } else { Write-Output 'FAILED' }
exit 0