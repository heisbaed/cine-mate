import { app, BrowserWindow, Menu, Notification, Tray, desktopCapturer, globalShortcut, ipcMain, nativeImage, screen, shell } from 'electron';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { promises as fs } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { askGemini, type ChatTurn } from './ai';
import { transcribeLocal, type SpeechEvent } from './speech';

const DEFAULT_IDLE_MS = 5 * 60_000;
const CURSOR_POLL_MS = 100;
const URL_HOSTS = ['open.spotify.com', 'www.youtube.com', 'www.google.com'];
const FOLDERS = ['downloads', 'documents', 'desktop', 'pictures'] as const;

interface MediaInfo {
  app: string;
  title: string;
  artist: string;
  playing: boolean;
}

const PET_SIZE = { width: 260, height: 320 };
const HUB_MIN = { width: 64, height: 64 };
const HUB_MAX = { width: 360, height: 650 };
const execFileAsync = promisify(execFile);

// Display name reported by the probe -> actual process name for WM_APPCOMMAND.
const APP_PROCESS: Record<string, string> = {
  spotify: 'spotify', chrome: 'chrome', edge: 'msedge',
  firefox: 'firefox', vlc: 'vlc', 'media player': 'wmplayer',
  aimp: 'AIMP', 'media app': 'ApplicationFrameHost'
};

let pet: BrowserWindow | null = null;
let hub: BrowserWindow | null = null;
let tray: Tray | null = null;
let idleAfter = DEFAULT_IDLE_MS;
let clickThrough = false;
let mouseIgnored: boolean | null = null;
let hubOpen = false;
let cinemaMode = false;
let fullscreenActive = false;
let manuallyHidden = false;
let petDragging = false;
let petTopInset = 50;
let microphone: ReturnType<typeof spawn> | null = null;
let microphoneEnabled = false;
let microphoneStatus: { state: string; error?: string } = { state: 'off' };
let speechBusy = 0;
let ignoreSpeechUntil = 0;
let transcriptionAbort: AbortController | null = null;
let microphoneEpoch = 0;
let manualSession = false;
let recordingActive = false;
let finishingRecording = false;
const speechDirectory = () => join(app.getPath('temp'), 'CineMate-speech');

function emitSpeech(event: SpeechEvent): void {
  event = { ...event, enabled: microphoneEnabled };
  if (event.state !== 'heard') microphoneStatus = event;
  hub?.webContents.send('mate:speech', event);
  pet?.webContents.send('mate:speech', event);
}

async function transcribeCaptured(event: SpeechEvent & { path?: string; committed?: boolean }): Promise<void> {
  const file = event.path;
  if (!file || resolve(dirname(file)) !== resolve(speechDirectory())) return;
  if (transcriptionAbort || (!microphoneEnabled && !event.committed) || (!event.manual && (speechBusy || Date.now() < ignoreSpeechUntil))) {
    await fs.rm(file, { force: true }).catch(() => {});
    return;
  }
  const epoch = microphoneEpoch;
  const controller = new AbortController();
  transcriptionAbort = controller;
  emitSpeech({ state: 'transcribing', manual: event.manual });
  try {
    const text = await transcribeLocal(file, assetPath(''), controller.signal);
    if (epoch !== microphoneEpoch) return;
    if (text) {
      emitSpeech({ state: 'heard', text, direct: true, manual: event.manual });
      emitSpeech({ state: microphoneEnabled ? 'ready' : 'off' });
    } else {
      emitSpeech({ state: 'no-speech', error: 'I did not hear clear words. Please try speaking again.' });
      if (manualSession) microphone?.stdin?.write('capture\n');
    }
  } catch (error) {
    if (epoch === microphoneEpoch) emitSpeech({ state: 'error', error: (error as Error).message });
  } finally {
    transcriptionAbort = null;
    await fs.rm(file, { force: true }).catch(() => {});
  }
}

function setListening(enabled: boolean): { state: string; error?: string } {
  microphoneEnabled = enabled;
  if (!enabled) {
    manualSession = false;
    recordingActive = false;
    finishingRecording = false;
    microphoneEpoch++;
    transcriptionAbort?.abort();
    const child = microphone;
    microphone = null;
    child?.kill();
    emitSpeech({ state: 'off' });
    return microphoneStatus;
  }
  if (microphone) return microphoneStatus;
  emitSpeech({ state: 'starting' });
  const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', assetPath('listen.ps1'), '-ParentId', String(process.pid), '-TempDirectory', speechDirectory()], { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
  microphone = child;
  let buffer = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => {
    buffer += chunk;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';
    for (const line of lines) {
      try {
        const event = JSON.parse(line) as SpeechEvent & { path?: string; recording?: boolean };
        if (microphone !== child || (!microphoneEnabled && !finishingRecording)) continue;
        if (event.state === 'audio') {
          recordingActive = false;
          const committed = finishingRecording;
          if (committed) { finishingRecording = false; microphone = null; child.kill(); }
          void transcribeCaptured({ ...event, manual: event.manual || manualSession, committed }); continue;
        }
        if (event.state === 'wake') {
          recordingActive = !!event.recording;
          if (finishingRecording) continue;
          if (!event.manual && (speechBusy || Date.now() < ignoreSpeechUntil)) { child.stdin.write('cancel\n'); continue; }
          emitSpeech({ state: 'listening', manual: event.manual || manualSession });
          continue;
        }
        if (finishingRecording && event.state === 'ready') continue;
        if (event.state === 'error' || event.state === 'no-speech') {
          recordingActive = false;
          if (finishingRecording) { finishingRecording = false; microphone = null; child.kill(); }
          else if (event.state === 'no-speech' && manualSession) child.stdin.write('capture\n');
        }
        emitSpeech(event);
      } catch { /* partial output */ }
    }
  });
  child.on('error', () => emitSpeech({ state: 'error', error: 'Could not start Windows microphone listening.' }));
  child.on('close', () => {
    if (microphone === child) {
      microphone = null;
      if (finishingRecording) { finishingRecording = false; emitSpeech({ state: 'error', error: 'Recording could not be finished. Please turn the microphone on and try again.' }); }
      if (microphoneEnabled && microphoneStatus.state !== 'error') emitSpeech({ state: 'error', error: 'Microphone listening stopped. Retry in Settings.' });
    }
  });
  return microphoneStatus;
}

function refreshPetVisibility(): void {
  if (manuallyHidden || (cinemaMode && fullscreenActive)) pet?.hide();
  else pet?.showInactive();
}

const prefsPath = () => join(app.getPath('userData'), 'prefs.json');

function loadPrefs(): void {
  try {
    const raw = fsSyncRead();
    if (!raw) return;
    const data = JSON.parse(raw) as { clickThrough?: boolean; idleAfter?: number };
    if (typeof data.clickThrough === 'boolean') clickThrough = data.clickThrough;
    if (typeof data.idleAfter === 'number') idleAfter = data.idleAfter;
  } catch {
    // first run
  }
}

function savePrefs(): void {
  try {
    writeSync(prefsPath(), JSON.stringify({ clickThrough, idleAfter }));
  } catch {
    // non-fatal
  }
}

function fsSyncRead(): string | null {
  try {
    return require('node:fs').readFileSync(prefsPath(), 'utf8') as string;
  } catch {
    return null;
  }
}

function writeSync(file: string, body: string): void {
  require('node:fs').writeFileSync(file, body);
}

function assetPath(name: string): string {
  return app.isPackaged ? join(process.resourcesPath, 'assets', name) : join(__dirname, '../../assets', name);
}

function workArea() {
  return screen.getPrimaryDisplay().workArea;
}

async function runScript(name: string, args: string[], timeout: number): Promise<string> {
  try {
    const result = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', assetPath(name), ...args], { encoding: 'utf8', timeout, windowsHide: true });
    return result.stdout.trim();
  } catch { return ''; }
}

// Media keys are injected (keybd_event) and also posted as app-commands, so Windows
// routes them to whichever app owns the active media session (Spotify, browsers, VLC).
function controlMedia(action: string, target?: string): Promise<string> {
  return runScript('media-control.ps1', ['-Action', action, '-Target', target || ''], 15000);
}

function controlWindow(action: string): Promise<string> {
  return runScript('window-control.ps1', ['-Action', action], 12000);
}

async function systemInfo(): Promise<string> {
  try {
    const result = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', assetPath('sysinfo.ps1')], { encoding: 'utf8', timeout: 25000, windowsHide: true });
    return result.stdout.trim();
  } catch { return ''; }
}

let latestMedia: MediaInfo | null = null;
async function probeMedia(): Promise<MediaInfo | null> { return latestMedia; }

function startMediaMonitor(): void {
  const watcher = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', assetPath('media-probe.ps1'), '-Watch'], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
  let buffer = '';
  watcher.stdout.setEncoding('utf8');
  watcher.stdout.on('data', (chunk: string) => {
    buffer += chunk;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';
    for (const line of lines) {
      try { latestMedia = JSON.parse(line) as MediaInfo | null; } catch { /* incomplete message */ }
    }
  });
  watcher.on('error', () => { latestMedia = null; });
  watcher.on('close', () => { latestMedia = null; });
  app.on('will-quit', () => { try { watcher.kill(); } catch { /* already closed */ } });
}

// Windows SAPI speech — reliable on every machine, unlike Chromium TTS.
async function speak(text: string, voice: string, rate = 1, mood = 'warm'): Promise<{ error?: string }> {
  const clean = String(text).replace(/[\u266a\u266b\u201c\u201d"\u2026]/g, '').replace(/\s+/g, ' ').trim().slice(0, 1200);
  if (!clean) return Promise.resolve({});
  const speed = Number.isFinite(rate) ? Math.max(-5, Math.min(5, Math.round(rate))) : 1;
  const args = ['-Text', clean, '-Rate', String(speed), '-Mood', ['plain', 'warm', 'happy', 'calm', 'curious', 'gentle', 'excited'].includes(mood) ? mood : 'warm'];
  if (voice) args.push('-Voice', String(voice));
  speechBusy++;
  if (speechBusy === 1) microphone?.stdin?.write('suspend\n');
  try { return await playAudioScript('speak.ps1', args); }
  finally {
    speechBusy--;
    if (!speechBusy) microphone?.stdin?.write('resume\n');
    ignoreSpeechUntil = Date.now() + 250;
  }
}

function playAudioScript(script: string, scriptArgs: string[]): Promise<{ error?: string }> {
  return new Promise(resolve => {
    const args = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', assetPath(script), ...scriptArgs];
    const child = spawn('powershell.exe', args, { windowsHide: true });
    let detail = '';
    child.stderr.on('data', data => { detail = (detail + String(data)).slice(-2000); });
    const timer = setTimeout(() => { child.kill(); resolve({ error: 'Audio playback timed out. Check your Windows audio output.' }); }, 120_000);
    child.on('error', () => { clearTimeout(timer); resolve({ error: 'Windows audio could not start.' }); });
    child.on('close', code => {
      clearTimeout(timer);
      resolve(code === 0 ? {} : { error: detail.trim() || 'Windows audio failed. Check your audio output.' });
    });
  });
}

function createPetWindow(): void {
  const area = workArea();
  pet = new BrowserWindow({
    width: PET_SIZE.width,
    height: PET_SIZE.height,
    x: area.x + area.width - PET_SIZE.width - 32,
    y: area.y + area.height - PET_SIZE.height - 32,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    focusable: false,
    icon: assetPath('cine.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: false,
      additionalArguments: ['--mate-mode=pet']
    }
  });
  pet.setAlwaysOnTop(true, 'floating');
  pet.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false });
  updateMousePolicy();
  if (process.env['ELECTRON_RENDERER_URL']) {
    void pet.loadURL(`${process.env['ELECTRON_RENDERER_URL']}?mode=pet`);
  } else {
    void pet.loadFile(join(__dirname, '../renderer/index.html'), { query: { mode: 'pet' } });
  }
}

function anchorHub(width: number, height: number): void {
  if (!hub) return;
  const area = workArea();
  hub.setBounds({
    width,
    height,
    x: Math.max(area.x + 8, area.x + area.width - width - 16),
    y: area.y + 16
  }, false);
}

function createHubWindow(): void {
  hub = new BrowserWindow({
    ...HUB_MIN,
    show: false,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    focusable: true,
    icon: assetPath('cine.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: false,
      backgroundThrottling: false,
      autoplayPolicy: 'no-user-gesture-required',
      additionalArguments: ['--mate-mode=hub']
    }
  });
  hub.setAlwaysOnTop(true, 'floating');
  hub.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false });
  anchorHub(HUB_MIN.width, HUB_MIN.height);
  if (process.env['ELECTRON_RENDERER_URL']) {
    void hub.loadURL(`${process.env['ELECTRON_RENDERER_URL']}?mode=hub`);
  } else {
    void hub.loadFile(join(__dirname, '../renderer/index.html'), { query: { mode: 'hub' } });
  }
}

function toggleHub(force?: boolean): void {
  if (!hub) return;
  const next = typeof force === 'boolean' ? force : !hubOpen;
  if (next === hubOpen) return;
  hubOpen = next;
  if (next) hub.show();
  else hub.hide();
  const { width, height } = next ? HUB_MAX : HUB_MIN;
  const [x, y] = hub.getPosition();
  const area = workArea();
  // Resize first, then keep the same top-left corner: dragging never changes size.
  hub.setBounds({
    width,
    height,
    x: Math.min(Math.max(x, area.x), Math.max(area.x, area.x + area.width - width)),
    y: Math.min(Math.max(y, area.y), area.y + area.height - 80)
  }, false);
  hub.webContents.send('hub:state', hubOpen);
  if (hubOpen) hub.focus();
}

function updateMousePolicy(): void {
  if (!pet || pet.isDestroyed()) return;
  const cursor = screen.getCursorScreenPoint();
  const [px, py] = pet.getPosition();
  const [pw, ph] = pet.getSize();
  const dx = cursor.x - (px + pw / 2);
  const nearDock = Math.abs(dx) <= 124 && cursor.y >= py + ph - 42 && cursor.y <= py + ph;
  const nearBody = Math.abs(dx) <= pw / 2 - 12 && cursor.y >= py + petTopInset && cursor.y <= py + ph - 33;
  const ignore = !petDragging && !nearDock && (clickThrough || !nearBody);
  if (mouseIgnored !== ignore) { mouseIgnored = ignore; pet.setIgnoreMouseEvents(ignore, { forward: true }); }
}

function setClickThroughPreference(value: boolean): void {
  clickThrough = value;
  updateMousePolicy();
  savePrefs();
  pet?.webContents.send('mate:click-through-state', value);
  hub?.webContents.send('mate:click-through-state', value);
}

function showMenu(): void {
  Menu.buildFromTemplate([
    { label: 'CineMate', enabled: false },
    { type: 'separator' },
    { label: 'Open chat', click: () => toggleHub(true) },
    {
      label: 'Allow clicks through pet (dock stays clickable)',
      type: 'checkbox',
      checked: clickThrough,
      click: (item) => {
        setClickThroughPreference(item.checked);
      }
    },
    {
      label: 'Start with Windows',
      type: 'checkbox',
      checked: app.getLoginItemSettings().openAtLogin,
      click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked, name: 'CineMate' })
    },
    { type: 'separator' },
    { label: 'Quit CineMate', click: () => app.quit() }
  ]).popup();
}

function startCursorRadar(): void {
  let lastX = -1;
  let lastY = -1;
  let lastMove = Date.now();
  let idleSent = false;
  let lastSent = '';
  setInterval(() => {
    if (!pet || pet.isDestroyed()) return;
    const cursor = screen.getCursorScreenPoint();
    const [px, py] = pet.getPosition();
    if (cursor.x !== lastX || cursor.y !== lastY) {
      lastX = cursor.x;
      lastY = cursor.y;
      lastMove = Date.now();
      if (idleSent) {
        idleSent = false;
        pet.webContents.send('mate:idle', false);
        hub?.webContents.send('mate:idle', false);
      }
    } else if (!idleSent && idleAfter > 0 && Date.now() - lastMove > idleAfter) {
      idleSent = true;
      pet.webContents.send('mate:idle', true);
      hub?.webContents.send('mate:idle', true);
    }
    const area = screen.getDisplayNearestPoint(cursor).workArea;

    updateMousePolicy();

    const signature = `${cursor.x},${cursor.y},${px},${py},${area.x},${area.y},${area.width},${area.height}`;
    if (signature === lastSent || !pet.isVisible()) return;
    lastSent = signature;
    pet.webContents.send('mate:cursor', {
      cursor,
      winPos: { x: px, y: py },
      area: { x: area.x, y: area.y, width: area.width, height: area.height }
    });
  }, CURSOR_POLL_MS);
}

app.whenReady().then(() => {
  loadPrefs();
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }
  createPetWindow();
  createHubWindow();
  startCursorRadar();
  startMediaMonitor();
  globalShortcut.register('Control+Alt+C', () => toggleHub());
  globalShortcut.register('Control+Alt+H', () => { manuallyHidden = !manuallyHidden; refreshPetVisibility(); });
  globalShortcut.register('Control+Alt+M', () => {
    setClickThroughPreference(!clickThrough);
  });

  try {
    tray = new Tray(nativeImage.createFromPath(assetPath('cine.png')));
    tray.setToolTip('CineMate');
    tray.on('click', () => toggleHub());
  } catch {
    tray = null;
  }

  ipcMain.on('mate:menu', () => showMenu());
  ipcMain.on('mate:click-through', (_e, v: boolean) => {
    setClickThroughPreference(!!v);
  });
  ipcMain.on('mate:ghost-mode', (_e, v: boolean) => {
    setClickThroughPreference(!!v);
  });
  ipcMain.handle('mate:click-through-state', () => clickThrough);
  ipcMain.on('mate:idle-after', (_e, ms: number) => {
    idleAfter = Number.isFinite(ms) && ms >= 0 ? ms : DEFAULT_IDLE_MS;
    savePrefs();
  });
  ipcMain.on('mate:move', (_e, x: number, y: number) => {
    if (!pet || pet.isDestroyed() || !Number.isFinite(x) || !Number.isFinite(y)) return;
    const area = screen.getDisplayNearestPoint({ x: Math.round(x + PET_SIZE.width / 2), y: Math.round(y + PET_SIZE.height / 2) }).workArea;
    pet.setPosition(
      Math.round(Math.min(Math.max(x, area.x), area.x + area.width - PET_SIZE.width)),
      Math.round(Math.min(Math.max(y, area.y - petTopInset), area.y + area.height - PET_SIZE.height))
    );
  });
  ipcMain.on('mate:mode', (event) => {
    event.returnValue = clickThrough ? 'click-through' : 'interactive';
  });
  ipcMain.on('hub:toggle', (_e, force?: boolean) => toggleHub(force));
  ipcMain.on('hub:move', (_e, x: number, y: number) => {
    if (!hub || hub.isDestroyed()) return;
    const area = workArea();
    const [w] = hub.getSize();
    hub.setPosition(
      Math.round(Math.min(Math.max(x, area.x), area.x + area.width - w)),
      Math.round(Math.min(Math.max(y, area.y), area.y + area.height - 80))
    );
  });
  ipcMain.on('mate:login', (_e, v: boolean) => app.setLoginItemSettings({ openAtLogin: !!v, name: 'CineMate' }));
  ipcMain.on('mate:dragging', (_e, value: boolean) => { petDragging = !!value; updateMousePolicy(); });
  ipcMain.on('mate:pet-inset', (_e, value: number) => { if (Number.isFinite(value)) petTopInset = Math.max(0, Math.min(220, value)); });
  ipcMain.on('mate:cinema-mode', (_e, value: boolean) => { cinemaMode = !!value; refreshPetVisibility(); });
  ipcMain.on('mate:open-site', () => void shell.openExternal('https://ourcineverse.web.app/'));
  ipcMain.on('mate:launch', (_e, name: string) => {
    const map: Record<string, string> = {
      notepad: 'notepad.exe', calculator: 'calc.exe', paint: 'mspaint.exe', terminal: 'wt.exe'
    };
    const target = map[String(name).toLowerCase()];
    if (target) {
      try {
        spawn(target, [], { detached: true, stdio: 'ignore' }).unref();
      } catch {
        // app not installed
      }
    }
  });
  ipcMain.on('mate:media', async (_e, action: string) => {
    const media = await probeMedia();
    const proc = media ? APP_PROCESS[media.app.toLowerCase()] || '' : '';
    controlMedia(String(action), proc);
  });
  ipcMain.on('mate:spotify-search', (_e, query: string) => {
    const q = String(query || '').trim();
    if (!q) return;
    // Prefer the installed Spotify app (protocol is registered per-user), never the browser.
    try {
      void shell.openExternal(`spotify:search:${encodeURIComponent(q)}`);
      return;
    } catch {
      // fall through to web
    }
    void shell.openExternal(`https://open.spotify.com/search/${encodeURIComponent(q)}`);
  });

  // Credentials stay in the main process for the bundled personal key.
  const localKey = async (override: string) => {
    if (String(override || '').trim()) return String(override).trim();
    try {
      return (await fs.readFile(app.isPackaged ? join(process.resourcesPath, 'gemini.key') : join(__dirname, '../../gemini.key'), 'utf8')).trim();
    } catch { return ''; }
  };
  ipcMain.handle('ai:ask', async (_e, turns: ChatTurn[], system: string, key: string) => {
    if (!Array.isArray(turns) || !turns.length || turns.some(t => !t || !['user', 'model'].includes(t.role) || typeof t.text !== 'string')) {
      return { text: null, error: 'Invalid conversation. Start a new chat.' };
    }
    return askGemini(await localKey(key), String(system || '').slice(0, 12000), turns);
  });
  ipcMain.handle('ai:test', async (_e, key: string) => {
    const reply = await askGemini(await localKey(key), 'Reply briefly.', [{ role: 'user', text: 'Reply with exactly: ok' }]);
    return reply.text ? `Connected to ${reply.model}. Cine is ready to chat.` : [reply.error, reply.detail].filter(Boolean).join('\n\n');
  });
  ipcMain.on('mate:window', (_e, action: string) => {
    controlWindow(String(action));
  });
  ipcMain.handle('mate:sysinfo', () => systemInfo());
  ipcMain.on('mate:spotify', (_e, action: string) => {
    if (String(action).toLowerCase() === 'close') {
      spawn('taskkill.exe', ['/IM', 'spotify.exe', '/T', '/F'], { detached: true, stdio: 'ignore' }).unref();
    } else {
      void shell.openExternal('spotify:');
        setTimeout(() => controlMedia('playpause', 'spotify'), 2500);
    }
  });
  ipcMain.handle('mate:now-playing', () => probeMedia());
  ipcMain.handle('mate:speak', (_e, text: string, voice: string, rate?: number, mood?: string) => speak(text, voice, rate, mood));
  ipcMain.handle('mate:listen', (_e, enabled: boolean) => setListening(!!enabled));
  ipcMain.handle('mate:capture-speech', () => {
    if (microphoneEnabled) {
      microphoneEnabled = false;
      manualSession = false;
      if (microphone && (recordingActive || microphoneStatus.state === 'starting')) {
        finishingRecording = true;
        microphone.stdin?.write('finish\n');
        emitSpeech({ state: 'finishing', manual: true });
        const child = microphone;
        setTimeout(() => {
          if (finishingRecording && microphone === child) { setListening(false); emitSpeech({ state: 'error', error: 'Recording could not finish. Please try again.' }); }
        }, 5000);
      } else {
        const child = microphone; microphone = null; child?.kill();
        emitSpeech({ state: transcriptionAbort ? 'transcribing' : 'off', manual: true });
      }
      return microphoneStatus;
    }
    if (finishingRecording) return microphoneStatus;
    manualSession = true;
    setListening(true);
    microphone?.stdin?.write('capture\n');
    return microphoneStatus;
  });
  ipcMain.on('mate:arm-speech', () => {
    const epoch = microphoneEpoch;
    setTimeout(() => {
      if (microphoneEnabled && epoch === microphoneEpoch && !speechBusy) microphone?.stdin?.write(manualSession ? 'capture\n' : 'arm\n');
    }, Math.max(0, ignoreSpeechUntil - Date.now()));
  });
  ipcMain.handle('mate:play-song', async (_e, query: string) => {
    const clean = String(query || '').trim().slice(0, 180);
    if (!clean) return { playing: false, error: 'Tell me the name of the song you want.' };
    const words = clean.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(word => word && !['by', 'song', 'the', 'please'].includes(word));
    const current = latestMedia ? `${latestMedia.artist} ${latestMedia.title}`.toLowerCase() : '';
    if (latestMedia?.playing && /spotify/i.test(latestMedia.app) && words.length && words.every(word => current.includes(word))) return { playing: true, title: latestMedia.title };
    try {
      await shell.openExternal(`spotify:search:${encodeURIComponent(clean)}`);
      const result = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', assetPath('spotify-play.ps1'), '-Query', clean], { encoding: 'utf8', timeout: 20000, windowsHide: true });
      const selected = JSON.parse(result.stdout.trim()) as { invoked: boolean; title?: string; error?: string };
      if (!selected.invoked || !selected.title) return { playing: false, error: selected.error || 'Spotify could not start a matching song.' };
      await new Promise(resolve => setTimeout(resolve, 700));
      await runScript('media-control.ps1', ['-Action', 'play'], 10000);
      const normalize = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
      const wanted = normalize(selected.title);
      const deadline = Date.now() + 10000;
      while (Date.now() < deadline) {
        if (latestMedia?.playing && /spotify/i.test(latestMedia.app) && [latestMedia.title, `${latestMedia.title} ${latestMedia.artist}`, `${latestMedia.artist} ${latestMedia.title}`].some(label => normalize(label).includes(wanted))) return { playing: true, title: latestMedia.title };
        await new Promise(resolve => setTimeout(resolve, 400));
      }
      return { playing: false, error: `I selected ${selected.title}, but Spotify has not confirmed playback. Check whether Spotify is showing an ad or sign-in prompt.` };
    } catch (error) {
      const output = (error as { stdout?: string }).stdout;
      try { return { playing: false, error: JSON.parse(output || '{}').error || 'Could not start Spotify playback. Check that Spotify is installed and signed in.' }; }
      catch { return { playing: false, error: 'Could not start Spotify playback. Check that Spotify is installed and signed in.' }; }
    }
  });
  ipcMain.handle('mate:timer-alert', async () => {
    try {
      if (!hub || hub.isDestroyed()) throw new Error('Audio window unavailable');
      await hub.webContents.executeJavaScript(`(async () => {
        const context = new AudioContext();
        try {
          await context.resume();
          if (context.state !== 'running') throw new Error('Audio output is suspended');
          const start = context.currentTime + .03;
          const notes = [659.25, 830.61, 987.77, 0, 659.25, 830.61, 987.77];
          notes.forEach((frequency, i) => {
            if (!frequency) return;
            const oscillator = context.createOscillator();
            const gain = context.createGain();
            oscillator.type = 'sine'; oscillator.frequency.value = frequency;
            const at = start + i * .33;
            gain.gain.setValueAtTime(0, at);
            gain.gain.linearRampToValueAtTime(.5, at + .015);
            gain.gain.exponentialRampToValueAtTime(.001, at + .31);
            oscillator.connect(gain); gain.connect(context.destination);
            oscillator.start(at); oscillator.stop(at + .32);
          });
          await new Promise(resolve => setTimeout(resolve, 2500));
        } finally { await context.close(); }
      })()`);
      return {};
    } catch {
      return playAudioScript('timer-alert.ps1', []);
    }
  });
  ipcMain.handle('mate:voices', async () => {
    try { return JSON.parse(await runScript('speak.ps1', ['-ListVoices'], 15000) || '[]'); }
    catch { return []; }
  });
  ipcMain.on('mate:open-url', (_e, raw: string) => {
    try {
      const u = new URL(String(raw));
      if (u.protocol === 'https:' && URL_HOSTS.includes(u.hostname)) void shell.openExternal(u.toString());
    } catch {
      // blocked
    }
  });
  ipcMain.on('mate:open-folder', (_e, kind: string) => {
    const k = String(kind).toLowerCase();
    if ((FOLDERS as readonly string[]).includes(k)) void shell.openPath(app.getPath(k as 'downloads'));
  });
  ipcMain.on('mate:lock', () => {
    spawn('rundll32.exe', ['user32.dll,LockWorkStation'], { detached: true, stdio: 'ignore' }).unref();
  });
  ipcMain.handle('mate:screenshot', async () => {
    try {
      const size = screen.getPrimaryDisplay().size;
      const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: size });
      const shot = sources[0]?.thumbnail.toPNG();
      if (!shot?.length) return null;
      const dir = join(app.getPath('pictures'), 'CineMate');
      await fs.mkdir(dir, { recursive: true });
      const file = join(dir, `shot-${Date.now()}.png`);
      await fs.writeFile(file, shot);
      return file;
    } catch {
      return null;
    }
  });
  ipcMain.on('mate:notify', (_e, title: string, body: string) => {
    if (Notification.isSupported()) new Notification({ title, body }).show();
  });
  ipcMain.on('mate:quit', () => app.quit());

  // Ambient awareness: one long-lived watcher streams foreground-window changes.
  try {
    const watcher = spawn(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', assetPath('watch.ps1')],
      { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }
    );
    let buffer = '';
    let typing = false;
    let fullscreen = false;
    watcher.stdout?.on('data', (chunk: Buffer) => {
      buffer += String(chunk);
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (line.startsWith('WIN=')) {
          const title = line.slice(4).trim();
          if (title) pet?.webContents.send('mate:context', title);
        } else if (line.startsWith('TYPING=')) {
          typing = line.slice(7).trim() === '1';
          pet?.webContents.send('mate:activity', { typing, fullscreen });
        } else if (line.startsWith('FULLSCREEN=')) {
          fullscreen = line.slice(11).trim() === '1';
          fullscreenActive = fullscreen;
          refreshPetVisibility();
          pet?.webContents.send('mate:activity', { typing, fullscreen });
        }
      }
    });
    watcher.on('error', () => { /* watcher unavailable */ });
    app.on('will-quit', () => { try { watcher.kill(); } catch { /* already gone */ } });
  } catch {
    // ambient awareness unavailable
  }
});

app.on('window-all-closed', () => app.quit());
app.on('will-quit', () => { transcriptionAbort?.abort(); microphone?.kill(); globalShortcut.unregisterAll(); });
