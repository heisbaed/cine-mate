using System;
using System.Collections.Concurrent;
using System.Diagnostics;
using System.IO;
using System.Speech.Recognition;
using System.Threading;
using System.Web.Script.Serialization;

public static class CineMicrophone {
  static volatile bool completed;
  static volatile bool finishRequested;
  static readonly JavaScriptSerializer json = new JavaScriptSerializer();
  static readonly object outputLock = new object();
  static void Emit(object value) { lock(outputLock) { Console.Out.WriteLine(json.Serialize(value)); Console.Out.Flush(); } }
  static bool ParentAlive(int id) { try { return id<=0 || !Process.GetProcessById(id).HasExited; } catch { return false; } }
  static string NewClip(string directory) { return Path.Combine(directory, Guid.NewGuid().ToString("N") + ".wav"); }

  public static void Listen(int parentId, string audioFile, string directory) {
    Directory.CreateDirectory(directory);
    var installed = SpeechRecognitionEngine.InstalledRecognizers();
    if (installed.Count == 0) throw new Exception("Install English speech recognition in Windows language settings, or use Cine's microphone button.");
    var selected = installed[0];
    foreach (var info in installed) if (info.Culture.Name == "en-US") { selected=info; break; }
    var results = new ConcurrentQueue<RecognitionResult>();
    using (var recognizer = new SpeechRecognitionEngine(selected)) {
      // Windows only has to detect a small address vocabulary. Its dictation
      // text is never used as the user's command; Whisper receives the audio.
      recognizer.LoadGrammar(new DictationGrammar());
      var names = new Choices("hey Cine", "Cine", "hey see nee", "see nee", "hey seen", "hey scene", "hey sine", "hey Cindy");
      var wakeBuilder = new GrammarBuilder(); wakeBuilder.Culture=selected.Culture; wakeBuilder.Append(names);
      recognizer.LoadGrammar(new Grammar(wakeBuilder) { Name="wake", Priority=5 });
      var commandBuilder = new GrammarBuilder(); commandBuilder.Culture=selected.Culture; commandBuilder.Append(names); commandBuilder.AppendDictation();
      recognizer.LoadGrammar(new Grammar(commandBuilder) { Name="addressed", Priority=3 });
      recognizer.EndSilenceTimeout=TimeSpan.FromMilliseconds(450);
      recognizer.EndSilenceTimeoutAmbiguous=TimeSpan.FromMilliseconds(650);
      recognizer.SpeechRecognized += (sender,e) => { results.Enqueue(e.Result); };
      recognizer.SpeechRecognitionRejected += (sender,e) => { if(e.Result!=null)results.Enqueue(e.Result); };
      recognizer.RecognizeCompleted += (sender,e) => { completed=true; };
      if(String.IsNullOrEmpty(audioFile))recognizer.SetInputToDefaultAudioDevice();
      else recognizer.SetInputToWaveFile(audioFile);
      completed=false;
      recognizer.RecognizeAsync(RecognizeMode.Multiple);
      Emit(new { state="ready" });
      var awakeUntil=DateTime.MinValue;
      bool suspended=false;
      var commands=new ConcurrentQueue<string>();
      // Console.In.ReadLineAsync can block synchronously on Windows PowerShell.
      // Keep stdin on its own thread so recognition events continue to drain.
      finishRequested=false;
      var inputThread=new Thread(() => { string line; while((line=Console.In.ReadLine())!=null) { if(line=="finish")finishRequested=true; else commands.Enqueue(line); } });
      inputThread.IsBackground=true; inputThread.Start();
      while(ParentAlive(parentId)) {
        string command;
        if(commands.TryDequeue(out command)) {
          if(command=="arm" && !suspended) { awakeUntil=DateTime.UtcNow.AddSeconds(12); Emit(new { state="wake", manual=false }); }
          if(command=="conversation" && !suspended) { awakeUntil=DateTime.MaxValue; Emit(new { state="wake", manual=true }); }
          if(command=="suspend" && !suspended) {
            suspended=true; awakeUntil=DateTime.MinValue;
            recognizer.RecognizeAsyncCancel();
            for(int i=0;i<30 && !completed;i++)Thread.Sleep(50);
            RecognitionResult stale; while(results.TryDequeue(out stale)) {}
          }
          if(command=="resume" && suspended) {
            RecognitionResult stale; while(results.TryDequeue(out stale)) {}
            suspended=false; completed=false; recognizer.RecognizeAsync(RecognizeMode.Multiple);
          }
          if(command=="cancel") { awakeUntil=DateTime.MinValue; RecognitionResult stale; while(results.TryDequeue(out stale)) {} }
          if(command=="capture") {
            recognizer.RecognizeAsyncCancel();
            for(int i=0;i<30 && !completed;i++)Thread.Sleep(50);
            Emit(new { state="wake", manual=true, recording=true });
            var clip=NewClip(directory);
            var capture=CineAudio.Recorder.Record(clip,30,false,()=>finishRequested);
            if(capture.Speech)Emit(new { state="audio", path=clip, direct=true, manual=true });
            else { File.Delete(clip); Emit(new { state="no-speech", error="No clear speech was captured. Turn on the microphone and try again." }); }
            if(finishRequested)break;
            RecognitionResult stale; while(results.TryDequeue(out stale)) {}
            awakeUntil=DateTime.MinValue; completed=false;
            if(!suspended)recognizer.RecognizeAsync(RecognizeMode.Multiple);
          }
        }
        RecognitionResult result;
        while(results.TryDequeue(out result)) {
          if(suspended)continue;
          bool wake=result.Grammar!=null && result.Grammar.Name=="wake" && result.Confidence>=.60;
          bool addressed=result.Grammar!=null && result.Grammar.Name=="addressed" && result.Confidence>=.35;
          if(wake) { awakeUntil=DateTime.UtcNow.AddSeconds(12); Emit(new { state="wake", manual=false }); continue; }
          if((addressed || DateTime.UtcNow<awakeUntil) && result.Audio!=null && result.Audio.Duration.TotalMilliseconds>=300) {
            var clip=NewClip(directory);
            using(var file=File.Create(clip))result.Audio.WriteToWaveStream(file);
            Emit(new { state="audio", path=clip, direct=true, manual=false });
            awakeUntil=DateTime.MinValue;
          }
        }
        if(awakeUntil!=DateTime.MinValue && DateTime.UtcNow>=awakeUntil) { awakeUntil=DateTime.MinValue; Emit(new { state="ready" }); }
        if(!String.IsNullOrEmpty(audioFile) && completed && results.IsEmpty)break;
        Thread.Sleep(25);
      }
      recognizer.RecognizeAsyncCancel();
    }
  }
}
