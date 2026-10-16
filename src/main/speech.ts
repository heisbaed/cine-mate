import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { constants, setPriority } from 'node:os';
import { join } from 'node:path';

export interface SpeechEvent {
  state: string;
  text?: string;
  error?: string;
  direct?: boolean;
  manual?: boolean;
  enabled?: boolean;
}

// Keep enough encoder context for the full utterance plus a second of padding.
// Short conversations do not need Whisper's default thirty-second window.
export function speechAudioContext(wav: Buffer): number {
  if (wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 8, 12) !== 'WAVE') return 0;
  let rate = 0;
  for (let offset = 12; offset + 8 <= wav.length;) {
    const name = wav.toString('ascii', offset, offset + 4);
    const length = wav.readUInt32LE(offset + 4);
    if (name === 'fmt ' && length >= 16 && offset + 24 <= wav.length) rate = wav.readUInt32LE(offset + 16);
    if (name === 'data' && rate > 0) {
      const seconds = Math.min(length, wav.length - offset - 8) / rate;
      return Math.min(1500, Math.max(768, Math.ceil((seconds + 1) * 50 / 128) * 128));
    }
    offset += 8 + length + (length % 2);
  }
  return 0;
}

export async function transcribeLocal(file: string, assets: string, signal?: AbortSignal): Promise<string> {
  const executable = join(assets, 'speech', 'bin', 'Release', 'whisper-cli.exe');
  const model = join(assets, 'speech', 'ggml-base.en-q5_1.bin');
  try { await Promise.all([fs.access(executable), fs.access(model)]); }
  catch { throw new Error('The offline speech model is missing. Repair or reinstall CineMate.'); }
  const output = `${file}.recognized`;
  const context = speechAudioContext(await fs.readFile(file));
  try {
    await new Promise<void>((resolve, reject) => {
      const child = execFile(executable, ['-m', model, '-f', file, '-t', '4', '-bs', '1', '-bo', '1', '-nf', '-ac', String(context), '-nt', '-np', '--no-gpu', '-otxt', '-of', output,
        '--prompt', 'Cine is a desktop companion. Hey Cine. Timers, music, countdowns and everyday conversation.'],
      { windowsHide: true, timeout: 45000, maxBuffer: 512 * 1024, signal }, error => {
        if (error) reject(new Error('Offline speech recognition failed. Try the microphone button again.'));
        else resolve();
      });
      try { if (child.pid) setPriority(child.pid, constants.priority.PRIORITY_BELOW_NORMAL); } catch { /* platform may disallow priority changes */ }
    });
    const text = (await fs.readFile(`${output}.txt`, 'utf8')).trim().slice(0, 2000);
    // Non-verbal captions must never become commands or AI requests.
    const words = text.replace(/[\[(](?:beep|music|silence|blank_audio|no speech|background noise|inaudible|applause|laughter)[\])]/gi, '').trim();
    return words ? text : '';
  } finally {
    await fs.rm(`${output}.txt`, { force: true }).catch(() => {});
  }
}
