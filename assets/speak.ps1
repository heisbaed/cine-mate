# CineMate voice. Speaks $args[0] using a Windows SAPI voice.
# Usage: powershell -File speak.ps1 -Text "hello" -Voice "Zira" -Rate 1 -Pitch 0
param(
  [string]$Text = '',
  [string]$Voice = '',
  [int]$Rate = 0,
  [int]$Pitch = 0
)
$ErrorActionPreference = 'SilentlyContinue'
if (-not $Text) { exit 0 }
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer

# Prefer an explicitly requested voice, then a soft female-sounding one.
$female = @('Zira', 'Hazel', 'Susan', 'Zira Desktop', 'Sonia', 'Vicki', 'Libby', 'Aria', 'Jenny', 'Michelle', 'Ana')
if ($Voice) {
  $exact = $synth.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Name -eq $Voice } | Select-Object -First 1
  if ($exact) { $synth.SelectVoice($Voice) }
}
if (-not $synth.Voice -or $synth.Voice.Name -eq '') {
  foreach ($name in $female) {
    if ($synth.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Name -like "*$name*" }) {
      $synth.SelectVoice($name); break
    }
  }
}
if ($Rate -ne 0) { $synth.Rate = [Math]::Max(-10, [Math]::Min(10, $Rate)) }
if ($Pitch -ne 0) { $synth.Volume = 100; $synth.Rate = $synth.Rate }
$synth.Speak($Text)
exit 0