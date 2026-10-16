import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, access, rename } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';

const root = fileURLToPath(new URL('..', import.meta.url));
const directory = path.join(root, 'assets', 'speech');
const downloads = path.join(root, 'artifacts', 'downloads');
await Promise.all([mkdir(directory, { recursive: true }), mkdir(downloads, { recursive: true })]);
async function digest(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
async function download(url, target, expected) {
  try { await access(target); if (await digest(target) === expected) { console.log(`Verified cached ${path.basename(target)}`); return; } } catch { /* not downloaded */ }
  const temporary = `${target}.part`;
  await promisify(execFile)('curl.exe', ['--fail', '--location', '--connect-timeout', '15', '--max-time', '300', '--retry', '3', '--speed-time', '20', '--speed-limit', '1024', '--continue-at', '-', '--output', temporary, url], { windowsHide: true, maxBuffer: 1024 * 1024 });
  if (await digest(temporary) !== expected) throw new Error(`Checksum mismatch for ${path.basename(target)}`);
  await rename(temporary, target);
  console.log(`Downloaded and verified ${path.basename(target)}`);
}
const binary = path.join(downloads, 'whisper-b5454-win-x64.zip');
await Promise.all([
  download('https://github.com/ggml-org/whisper.cpp/releases/download/b5454/whisper-bin-x64.zip', binary, '6ba69e3482d7826214f90a6a9c84ca07782aec1e1d0c6a7c30c994fd5d816ccb'),
  download('https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en-q5_1.bin?download=true', path.join(directory, 'ggml-base.en-q5_1.bin'), '4baf70dd0d7c4247ba2b81fafd9c01005ac77c2f9ef064e00dcf195d0e2fdd2f')
]);
execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `Expand-Archive -LiteralPath '${binary.replaceAll("'", "''")}' -DestinationPath '${path.join(directory, 'bin').replaceAll("'", "''")}' -Force`], { windowsHide: true, stdio: 'inherit' });
for (const [name, url] of [
  ['LICENSE.whisper.cpp.txt', 'https://raw.githubusercontent.com/ggml-org/whisper.cpp/b5454/LICENSE'],
  ['LICENSE.whisper-model.txt', 'https://raw.githubusercontent.com/openai/whisper/main/LICENSE']
]) {
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!response.ok || !response.body) throw new Error(`License download failed: HTTP ${response.status}`);
  await pipeline(Readable.fromWeb(response.body), createWriteStream(path.join(directory, name)));
}
console.log('Offline speech runtime ready. Audio stays on this computer.');
