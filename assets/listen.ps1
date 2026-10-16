param([int]$ParentId = 0, [string]$AudioFile = '', [string]$TempDirectory = '')
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
try {
  Add-Type -AssemblyName System.Speech
  Add-Type -AssemblyName System.Web.Extensions
  $source = [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'listen-engine.cs')) + [Environment]::NewLine + [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'capture-audio.cs'))
  Add-Type -ReferencedAssemblies @([System.Speech.Recognition.SpeechRecognitionEngine].Assembly.Location, [System.Web.Script.Serialization.JavaScriptSerializer].Assembly.Location, [System.Collections.Concurrent.ConcurrentQueue[int]].Assembly.Location) -TypeDefinition $source
  if (-not $TempDirectory) { $TempDirectory = Join-Path ([IO.Path]::GetTempPath()) 'CineMate-speech' }
  [CineMicrophone]::Listen($ParentId, $AudioFile, $TempDirectory)
} catch {
  $message = $_.Exception.Message
  if ($_.Exception.InnerException) { $message = $_.Exception.InnerException.Message }
  @{ state='error'; error=$message } | ConvertTo-Json -Compress
  exit 1
}
