# CineMate ambient watcher. Long-running, streams events on stdout:
#   WIN=<foreground window title>   (on change)
#   TYPING=0|1                      (on change)
#   FULLSCREEN=0|1                  (on change)
$ErrorActionPreference = 'SilentlyContinue'

Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public class CW2 {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr hWnd);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int vKey);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  [DllImport("user32.dll")] public static extern IntPtr MonitorFromWindow(IntPtr hWnd, uint flags);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
}
"@

function Emit($line) {
  [Console]::Out.WriteLine($line)
  [Console]::Out.Flush()
}

$lastWin = ''
$lastTyping = ''
$lastFull = ''

while ($true) {
  # --- foreground window ---
  $h = [CW2]::GetForegroundWindow()
  if ($h -ne [IntPtr]::Zero) {
    $len = [CW2]::GetWindowTextLength($h)
    if ($len -gt 0) {
      $sb = New-Object System.Text.StringBuilder ($len + 2)
      [void][CW2]::GetWindowText($h, $sb, $sb.Capacity)
      $title = $sb.ToString().Trim()
      if ($title -and $title -ne $lastWin) {
        $lastWin = $title
        Emit "WIN=$title"
      }
    }

    # --- true fullscreen (covers the taskbar too, not just maximised) ---
    $mon = [CW2]::MonitorFromWindow($h, 2)
    $r = New-Object CW2+RECT
    [void][CW2]::GetWindowRect($h, [ref]$r)
    $monInfo = [System.Windows.Forms.Screen]::AllScreens
    $isFull = '0'
    foreach ($s in $monInfo) {
      if ($r.Left -le $s.Bounds.Left + 2 -and $r.Top -le $s.Bounds.Top + 2 -and
          $r.Right -ge $s.Bounds.Right - 2 -and $r.Bottom -ge $s.Bounds.Bottom - 2) { $isFull = '1' }
    }
    if ($isFull -ne $lastFull) { $lastFull = $isFull; Emit "FULLSCREEN=$isFull" }
  }

  # --- typing: any key currently held or pressed since last tick ---
  $typing = '0'
  foreach ($k in 32..126) {
    if (([CW2]::GetAsyncKeyState($k) -band 0x8000) -ne 0) { $typing = '1'; break }
  }
  if ($typing -ne $lastTyping) { $lastTyping = $typing; Emit "TYPING=$typing" }

  Start-Sleep -Milliseconds 400
}