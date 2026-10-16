$ErrorActionPreference='Stop'
$source=[IO.File]::ReadAllText((Join-Path $PSScriptRoot '../assets/capture-audio.cs'))
$driver=@'
public static class CaptureStopTest {
  public static CineAudio.CaptureResult Run(string file) {
    var clock=System.Diagnostics.Stopwatch.StartNew();
    return CineAudio.Recorder.Record(file,30,false,()=>clock.ElapsedMilliseconds>=800);
  }
}
'@
Add-Type -TypeDefinition ($source+[Environment]::NewLine+$driver)
$recording=Join-Path $env:TEMP 'CineMate-stop-test.wav'
$clock=[Diagnostics.Stopwatch]::StartNew()
try {
  $result=[CaptureStopTest]::Run($recording)
  if($clock.ElapsedMilliseconds -gt 2000){throw 'Stop did not finish promptly'}
  if((Get-Item -LiteralPath $recording).Length -le 44){throw 'Captured audio was lost on stop'}
  @{stopMilliseconds=$clock.ElapsedMilliseconds;audioSeconds=$result.Seconds;recordingSaved=$true}|ConvertTo-Json -Compress
} finally {Remove-Item -LiteralPath $recording -Force -ErrorAction SilentlyContinue}
