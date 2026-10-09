# CineMate window control. Acts on the focused window.
# Usage: powershell -File window-control.ps1 -Action minimize|restore|close|maximize|list
param([string]$Action = 'list')
$ErrorActionPreference = 'SilentlyContinue'

Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public class CW {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr hWnd);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);
}
"@

$SW_MINIMIZE = 6
$SW_RESTORE = 9
$SW_MAXIMIZE = 3
$WM_CLOSE = 0x0010

$h = [CW]::GetForegroundWindow()
if ($h -eq [IntPtr]::Zero) { Write-Output 'FAILED'; exit 0 }

$len = [CW]::GetWindowTextLength($h)
$sb = New-Object System.Text.StringBuilder ($len + 2)
[void][CW]::GetWindowText($h, $sb, $sb.Capacity)
$title = $sb.ToString()

switch ($Action) {
  'minimize' { if ([CW]::ShowWindow($h, $SW_MINIMIZE)) { Write-Output "MINIMIZED=$title" } else { Write-Output 'FAILED' } }
  'maximize' { if ([CW]::ShowWindow($h, $SW_MAXIMIZE)) { Write-Output "MAXIMIZED=$title" } else { Write-Output 'FAILED' } }
  'restore'  {
    if ([CW]::IsIconic($h)) { [void][CW]::ShowWindow($h, $SW_RESTORE); Write-Output "RESTORED=$title" }
    else { Write-Output "NOT_MINIMIZED=$title" }
  }
  'close'    { if ([CW]::PostMessage($h, $WM_CLOSE, [IntPtr]::Zero, [IntPtr]::Zero)) { Write-Output "CLOSED=$title" } else { Write-Output 'FAILED' } }
  default    { Write-Output "ACTIVE=$title" }
}
exit 0