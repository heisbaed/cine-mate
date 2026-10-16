# CineMate voice. Speaks $args[0] using a Windows SAPI voice.
# Usage: powershell -File speak.ps1 -Text "hello" -Voice "Zira" -Rate 1 -Pitch 0
param(
  [string]$Text = '',
  [string]$Voice = '',
  [int]$Rate = 0,
  [int]$Pitch = 0,
  [string]$Mood = 'warm',
  [string]$OutputFile = '',
  [switch]$ListVoices
)
$ErrorActionPreference = 'Stop'
try {
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$installed = @($synth.GetInstalledVoices() | Where-Object { $_.Enabled } | ForEach-Object { $_.VoiceInfo })
if ($ListVoices) {
  ConvertTo-Json -InputObject @($installed | ForEach-Object { @{ uri = $_.Name; name = $_.Name } }) -Compress
} elseif ($Text) {
  $selected = $installed | Where-Object { $_.Name -eq $Voice -or ($Voice -and $_.Name.IndexOf($Voice, [StringComparison]::OrdinalIgnoreCase) -ge 0) } | Select-Object -First 1
  if (-not $selected) { $selected = $installed | Where-Object { $_.Gender -eq 'Female' } | Select-Object -First 1 }
  if ($selected) { $synth.SelectVoice($selected.Name) }
  if ($OutputFile) { $synth.SetOutputToWaveFile($OutputFile) }
  else { $synth.SetOutputToDefaultAudioDevice() }
  $synth.Volume = 100
  $synth.Rate = [Math]::Max(-10, [Math]::Min(10, $Rate))
  if ($Mood -eq 'plain') { $synth.Speak($Text) }
  else {
    $styles = @{
      warm = @{ pitch='+2%'; rate='+0%'; pause=140 }
      happy = @{ pitch='+7%'; rate='+7%'; pause=110 }
      calm = @{ pitch='-3%'; rate='-10%'; pause=230 }
      curious = @{ pitch='+5%'; rate='+3%'; pause=160 }
      gentle = @{ pitch='-3%'; rate='-13%'; pause=260 }
      excited = @{ pitch='+10%'; rate='+12%'; pause=95 }
    }
    $style = $styles[$Mood]
    if (-not $style) { $style = $styles.warm }
    $language = $synth.Voice.Culture.Name
    $body = ''
    foreach ($sentence in ([regex]::Split($Text, '(?<=[.!?])\s+') | Select-Object -First 35)) {
      $escaped = [System.Security.SecurityElement]::Escape($sentence)
      $body += '<s><prosody pitch="' + $style.pitch + '" rate="' + $style.rate + '">' + $escaped + '</prosody></s><break time="' + $style.pause + 'ms"/>'
    }
    $ssml = '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="' + $language + '">' + $body + '</speak>'
    $synth.SpeakSsml($ssml)
  }
}
$synth.Dispose()
} catch {
  [Console]::Error.WriteLine($_.Exception.Message)
  exit 1
}
exit 0
