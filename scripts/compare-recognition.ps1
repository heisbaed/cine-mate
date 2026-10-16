param([int]$Seconds = 10)
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path $PSScriptRoot
$taskOutput = Join-Path $taskRoot 'artifacts\speech-comparison'
New-Item -ItemType Directory -Path $taskOutput -Force | Out-Null
$taskWave = Join-Path $taskOutput 'same-recording.wav'
$taskBase = Join-Path $taskOutput 'whisper'
$taskWasPlaying = $false
try {
  $taskMediaText = & powershell.exe -NoProfile -NonInteractive -File (Join-Path $taskRoot 'assets\media-probe.ps1')
  $taskMedia = $taskMediaText | ConvertFrom-Json
  $taskWasPlaying = $taskMedia -and $taskMedia.playing -and $taskMedia.app -eq 'Spotify'
  if ($taskWasPlaying) { & powershell.exe -NoProfile -NonInteractive -File (Join-Path $taskRoot 'assets\media-control.ps1') -Action pause | Out-Null }
  Add-Type -AssemblyName System.Speech
  Add-Type -Path (Join-Path $taskRoot 'assets\capture-audio.cs')
  $taskCue = New-Object System.Speech.Synthesis.SpeechSynthesizer
  $taskCue.SetOutputToDefaultAudioDevice()
  $taskCue.Speak('Recording now')
  $taskCue.Dispose()
  $taskCapture = [CineAudio.Recorder]::Record($taskWave, $Seconds, $false)
} finally {
  if ($taskWasPlaying) { & powershell.exe -NoProfile -NonInteractive -File (Join-Path $taskRoot 'assets\media-control.ps1') -Action play | Out-Null }
}
$taskLegacy = New-Object System.Speech.Recognition.SpeechRecognitionEngine
$taskLegacy.LoadGrammar((New-Object System.Speech.Recognition.DictationGrammar))
$taskLegacy.SetInputToWaveFile($taskWave)
$taskLegacyText = @()
while ($taskResult = $taskLegacy.Recognize()) { $taskLegacyText += $taskResult.Text }
$taskLegacy.Dispose()
$taskClock = [Diagnostics.Stopwatch]::StartNew()
$ErrorActionPreference = 'Continue'
& (Join-Path $taskRoot 'assets\speech\bin\Release\whisper-cli.exe') -m (Join-Path $taskRoot 'assets\speech\ggml-base.en-q5_1.bin') -f $taskWave -t 2 -nt -np --no-gpu -otxt -of $taskBase 2> (Join-Path $taskOutput 'engine.log') | Out-Null
$ErrorActionPreference = 'Stop'
if ($LASTEXITCODE -ne 0) { throw 'Whisper could not transcribe the recorded sample.' }
$taskWhisper = [IO.File]::ReadAllText("$taskBase.txt").Trim()
$taskReport = @{ windows=($taskLegacyText -join ' '); whisper=$taskWhisper; seconds=$taskCapture.Seconds; peak=$taskCapture.Peak; transcriptionSeconds=[Math]::Round($taskClock.Elapsed.TotalSeconds,2) }
$taskReport | ConvertTo-Json | Set-Content (Join-Path $taskOutput 'comparison.json')
$taskReport | ConvertTo-Json -Compress
