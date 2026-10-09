# CineMate media probe. Prints CURRENT/TITLE/ARTIST/APP/STATE or NONE.
# Works on plain Windows PowerShell 5.1 (no WinRT), no admin needed.
$ErrorActionPreference = 'SilentlyContinue'
$OutputEncoding = [System.Text.Encoding]::UTF8

$players = @(
  @{ proc = 'spotify';            app = 'Spotify' },
  @{ proc = 'chrome';             app = 'Chrome' },
  @{ proc = 'msedge';             app = 'Edge' },
  @{ proc = 'firefox';            app = 'Firefox' },
  @{ proc = 'vlc';                app = 'VLC' },
  @{ proc = 'wmplayer';           app = 'Media Player' },
  @{ proc = 'AIMP';               app = 'AIMP' },
  @{ proc = 'ApplicationFrameHost'; app = 'Media App' }
)

$tails = @(
  ' - Google Chrome', ' - Microsoft Edge', ' - Mozilla Firefox',
  ' - YouTube', ' - Spotify', ' - VLC media player'
)

$found = $null
foreach ($p in $players) {
  $proc = Get-Process -Name $p.proc -ErrorAction SilentlyContinue |
          Where-Object { $_.MainWindowTitle } |
          Select-Object -First 1
  if ($proc -and $proc.MainWindowTitle) {
    $found = [pscustomobject]@{ App = $p.app; Title = $proc.MainWindowTitle }
    break
  }
}

if (-not $found) { Write-Output 'NONE'; exit 0 }

$title = $found.Title
foreach ($t in $tails) { $title = $title.Replace($t, '') }
$title = $title.Trim()
if (-not $title) { Write-Output 'NONE'; exit 0 }

$artist = ''
if ($title -match '^(.*?)\s+[-–—]\s+(.+)$') {
  $artist = $Matches[1].Trim()
  $title = $Matches[2].Trim()
}
if ($title.Length -gt 90) { $title = $title.Substring(0, 90) }
if ($artist.Length -gt 60) { $artist = $artist.Substring(0, 60) }

Write-Output 'CURRENT'
Write-Output "APP=$($found.App)"
Write-Output "TITLE=$title"
Write-Output "ARTIST=$artist"
Write-Output 'STATE=Playing'