namespace CineAudio {
  using System;
  using System.Collections.Concurrent;
  using System.Collections.Generic;
  using System.Diagnostics;
  using System.IO;
  using System.Runtime.InteropServices;
  using System.Text;
  using System.Threading;

  public sealed class CaptureResult {
    public bool Speech;
    public double Seconds;
    public double Peak;
    public string Path;
  }

  // WaveIn's callback only queues completed buffers. All device calls happen
  // on the recorder thread, away from Electron and outside the native callback.
  public static class Recorder {
    [StructLayout(LayoutKind.Sequential, Pack=2)]
    struct Format { public ushort Tag, Channels; public uint Rate, BytesPerSecond; public ushort Align, Bits, Extra; }
    [StructLayout(LayoutKind.Sequential)]
    struct Header { public IntPtr Data; public uint Length, Recorded; public IntPtr User; public uint Flags, Loops; public IntPtr Next, Reserved; }
    delegate void Callback(IntPtr device, uint message, IntPtr user, IntPtr header, IntPtr unused);
    [DllImport("winmm.dll")] static extern uint waveInOpen(out IntPtr device, uint id, ref Format format, Callback callback, IntPtr user, uint flags);
    [DllImport("winmm.dll")] static extern uint waveInPrepareHeader(IntPtr device, IntPtr header, uint size);
    [DllImport("winmm.dll")] static extern uint waveInAddBuffer(IntPtr device, IntPtr header, uint size);
    [DllImport("winmm.dll")] static extern uint waveInStart(IntPtr device);
    [DllImport("winmm.dll")] static extern uint waveInStop(IntPtr device);
    [DllImport("winmm.dll")] static extern uint waveInReset(IntPtr device);
    [DllImport("winmm.dll")] static extern uint waveInUnprepareHeader(IntPtr device, IntPtr header, uint size);
    [DllImport("winmm.dll")] static extern uint waveInClose(IntPtr device);
    static void Check(uint code) { if (code != 0) throw new Exception("Microphone capture failed (Windows audio code " + code + "). Check the selected input device and microphone permissions."); }

    public static CaptureResult Record(string file, int seconds, bool stopOnSilence) {
      return Record(file, seconds, stopOnSilence, null);
    }
    public static CaptureResult Record(string file, int seconds, bool stopOnSilence, Func<bool> finish) {
      var queue = new ConcurrentQueue<IntPtr>();
      var headers = new List<IntPtr>();
      var data = new List<IntPtr>();
      Callback callback = (device, message, user, header, unused) => { if (message == 0x3c0) queue.Enqueue(header); };
      var format = new Format { Tag=1, Channels=1, Rate=16000, BytesPerSecond=32000, Align=2, Bits=16, Extra=0 };
      IntPtr input;
      Check(waveInOpen(out input, UInt32.MaxValue, ref format, callback, IntPtr.Zero, 0x30000));
      uint headerSize = (uint)Marshal.SizeOf(typeof(Header));
      double peak = 0;
      int voicedFrames = 0;
      long lastSpeech = 0;
      using (var pcm = new MemoryStream()) {
        try {
          for (int i=0; i<4; i++) {
            var buffer = Marshal.AllocHGlobal(3200);
            var header = Marshal.AllocHGlobal((int)headerSize);
            data.Add(buffer); headers.Add(header);
            Marshal.StructureToPtr(new Header { Data=buffer, Length=3200 }, header, false);
            Check(waveInPrepareHeader(input, header, headerSize));
            Check(waveInAddBuffer(input, header, headerSize));
          }
          var clock = Stopwatch.StartNew();
          Check(waveInStart(input));
          while (clock.ElapsedMilliseconds < Math.Max(1, Math.Min(30, seconds)) * 1000) {
            IntPtr pointer;
            while (queue.TryDequeue(out pointer)) {
              var header = (Header)Marshal.PtrToStructure(pointer, typeof(Header));
              var bytes = new byte[header.Recorded];
              Marshal.Copy(header.Data, bytes, 0, bytes.Length);
              pcm.Write(bytes, 0, bytes.Length);
              double sum = 0;
              for (int i=0; i+1<bytes.Length; i+=2) {
                double sample = (short)(bytes[i] | bytes[i+1] << 8) / 32768.0;
                sum += sample * sample; peak = Math.Max(peak, Math.Abs(sample));
              }
              double rms = Math.Sqrt(sum / Math.Max(1, bytes.Length / 2));
              if (rms > .007) { voicedFrames++; lastSpeech = clock.ElapsedMilliseconds; }
              Check(waveInAddBuffer(input, pointer, headerSize));
            }
            if (stopOnSilence && voicedFrames >= 3 && clock.ElapsedMilliseconds-lastSpeech > 650) break;
            if (finish!=null && finish()) break;
            if (stopOnSilence && voicedFrames == 0 && clock.ElapsedMilliseconds > 8000) break;
            Thread.Sleep(10);
          }
        } finally {
          waveInStop(input); waveInReset(input);
          IntPtr tail;
          while(queue.TryDequeue(out tail)) {
            var header=(Header)Marshal.PtrToStructure(tail,typeof(Header));
            if(header.Recorded>0) { var bytes=new byte[header.Recorded]; Marshal.Copy(header.Data,bytes,0,bytes.Length); pcm.Write(bytes,0,bytes.Length); }
          }
          foreach(var header in headers) waveInUnprepareHeader(input, header, headerSize);
          waveInClose(input);
          foreach(var header in headers) Marshal.FreeHGlobal(header);
          foreach(var buffer in data) Marshal.FreeHGlobal(buffer);
          GC.KeepAlive(callback);
        }
        var audio = pcm.ToArray();
        Directory.CreateDirectory(System.IO.Path.GetDirectoryName(file));
        using (var writer = new BinaryWriter(File.Create(file))) {
          writer.Write(Encoding.ASCII.GetBytes("RIFF")); writer.Write(36 + audio.Length);
          writer.Write(Encoding.ASCII.GetBytes("WAVEfmt ")); writer.Write(16);
          writer.Write((ushort)1); writer.Write((ushort)1); writer.Write(16000); writer.Write(32000);
          writer.Write((ushort)2); writer.Write((ushort)16);
          writer.Write(Encoding.ASCII.GetBytes("data")); writer.Write(audio.Length); writer.Write(audio);
        }
        return new CaptureResult { Speech=voicedFrames>=3, Seconds=audio.Length/32000.0, Peak=peak, Path=file };
      }
    }
  }
}
