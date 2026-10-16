param([string]$Query = '')
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
function Normalize($text) { return (($text.ToLowerInvariant() -replace '[^\p{L}\p{N}]+', ' ').Trim()) }
try {
  Add-Type -AssemblyName UIAutomationClient
  Add-Type -AssemblyName UIAutomationTypes
  $tokens = @((Normalize $Query).Split(' ') | Where-Object { $_ -and $_ -notin @('by', 'song', 'the', 'please') })
  if (-not $tokens.Count) { throw 'Please include a song title.' }
  $deadline = (Get-Date).AddSeconds(14)
  do {
    $spotify = Get-Process -Name Spotify -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
    if ($spotify) {
      $root = [System.Windows.Automation.AutomationElement]::FromHandle($spotify.MainWindowHandle)
      $comboCondition = New-Object System.Windows.Automation.PropertyCondition ([System.Windows.Automation.AutomationElement]::ControlTypeProperty),([System.Windows.Automation.ControlType]::ComboBox)
      $searchReady = $false
      foreach ($combo in $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, $comboCondition)) {
        $value = $combo.GetCurrentPropertyValue([System.Windows.Automation.ValuePattern]::ValueProperty)
        if ($value -is [string] -and (Normalize $value) -eq (Normalize $Query)) { $searchReady = $true; break }
      }
      if ($searchReady) {
        $buttonCondition = New-Object System.Windows.Automation.PropertyCondition ([System.Windows.Automation.AutomationElement]::ControlTypeProperty),([System.Windows.Automation.ControlType]::Button)
        $best = $null; $bestScore = 0; $bestTitle = ''
        foreach ($button in $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, $buttonCondition)) {
          $name = $button.Current.Name
          if ($name -notlike 'Play *' -or -not $button.Current.IsEnabled) { continue }
          $title = $name.Substring(5)
          $context = $title
          $node = $button; $isTrack = $false
          for ($depth = 0; $depth -lt 7; $depth++) {
            $node = [System.Windows.Automation.TreeWalker]::ControlViewWalker.GetParent($node)
            if (-not $node) { break }
            if ($node.Current.ControlType -eq [System.Windows.Automation.ControlType]::DataGrid) { $isTrack = $true; break }
            if ($node.Current.ControlType -eq [System.Windows.Automation.ControlType]::DataItem) {
              $context += ' ' + $node.Current.Name
              $textCondition = New-Object System.Windows.Automation.PropertyCondition ([System.Windows.Automation.AutomationElement]::ControlTypeProperty),([System.Windows.Automation.ControlType]::Text)
              foreach ($text in $node.FindAll([System.Windows.Automation.TreeScope]::Descendants, $textCondition)) { $context += ' ' + $text.Current.Name }
            }
          }
          if (-not $isTrack) { continue }
          $normalized = Normalize $context
          $score = @($tokens | Where-Object { $normalized.Contains($_) }).Count
          if ($score -ge [Math]::Max(1, [Math]::Ceiling($tokens.Count * 0.5))) { $best=$button; $bestScore=$score; $bestTitle=$title; break }
        }
        if ($best -and $bestScore -ge [Math]::Max(1, [Math]::Ceiling($tokens.Count * 0.5))) {
          $pattern = $null
          if ($best.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern, [ref]$pattern)) {
            $pattern.Invoke()
            @{ invoked=$true; title=$bestTitle } | ConvertTo-Json -Compress
            exit 0
          }
        }
      }
    }
    Start-Sleep -Milliseconds 400
  } while ((Get-Date) -lt $deadline)
  throw 'Spotify did not expose a matching playable song. Check that you are signed in and the song is available.'
} catch {
  @{ invoked=$false; error=$_.Exception.Message } | ConvertTo-Json -Compress
  exit 1
}
