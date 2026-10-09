import { app, BrowserWindow, Menu, Notification, Tray, desktopCapturer, globalShortcut, ipcMain, nativeImage, screen, shell } from 'electron';
import { spawn, spawnSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';

const DEFAULT_IDLE_MS = 5 * 60_000;
const CURSOR_POLL_MS = 70;
const URL_HOSTS = ['open.spotify.com', 'www.youtube.com', 'www.google.com'];
const FOLDERS = ['downloads', 'documents', 'desktop', 'pictures'] as const;

interface MediaInfo {
  app: string;
  title: string;
  artist: string;
  playing: boolean;
}

const PET_SIZE = { width: 210, height: 190 };
const HUB_MIN = { width: 64, height: 64 };
const HUB_MAX = { width: 400, height: 600 };

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
let ghostMode = true;
let clickThrough = true;
let hubOpen = false;

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

function runScript(name: string, args: string[], timeout: number): string {
  const r = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', assetPath(name), ...args], {
    encoding: 'utf8', timeout, windowsHide: true
  });
  return (r.stdout || '').trim();
}

// Media keys are injected (keybd_event) and also posted as app-commands, so Windows
// routes them to whichever app owns the active media session (Spotify, browsers, VLC).
function controlMedia(action: string, target?: string): string {
  return runScript('media-control.ps1', ['-Action', action, '-Target', target || ''], 15000);
}

function controlWindow(action: string): string {
  return runScript('window-control.ps1', ['-Action', action], 12000);
}

function systemInfo(): string {
  return runScript('sysinfo.ps1', [], 25000);
}

function probeMedia(): MediaInfo | null {
  const script = assetPath('media-probe.ps1');
  const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script], {
    encoding: 'utf8', timeout: 15000, windowsHide: true
  });
  const out = (r.stdout || '').trim();
  if (!out || out.startsWith('NONE')) return null;
  const pick = (k: string) => {
    const line = out.split(/\r?\n/).find((l) => l.startsWith(`${k}=`));
    return line ? line.slice(k.length + 1).trim() : '';
  };
  const title = pick('TITLE');
  if (!title) return null;
  return { app: pick('APP') || 'media', title, artist: pick('ARTIST'), playing: pick('STATE') === 'Playing' };
}

// Windows SAPI speech — reliable on every machine, unlike Chromium TTS.
function speak(text: string, voice: string): void {
  const clean = text.replace(/[♪♫“”"…]/g, '').replace(/\s+/g, ' ').trim().slice(0, 220);
  if (!clean) return;
  try {
    spawn('powershell.exe', [
      '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', assetPath('speak.ps1'),
      '-Text', clean, '-Voice', String(voice || ''), '-Rate', '1'
    ], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  } catch {
    // speech unavailable
  }
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
  pet.setIgnoreMouseEvents(clickThrough, { forward: true });
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

function showMenu(): void {
  Menu.buildFromTemplate([
    { label: 'CineMate', enabled: false },
    { type: 'separator' },
    { label: 'Open chat', click: () => toggleHub(true) },
    {
      label: 'Click-through (pet never blocks clicks)',
      type: 'checkbox',
      checked: clickThrough,
      click: (item) => {
        clickThrough = item.checked;
        pet?.setIgnoreMouseEvents(clickThrough, { forward: true });
        savePrefs();
        pet?.webContents.send('hub:state', hubOpen);
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
      }
    } else if (!idleSent && idleAfter > 0 && Date.now() - lastMove > idleAfter) {
      idleSent = true;
      pet.webContents.send('mate:idle', true);
    }
    const area = screen.getDisplayNearestPoint(cursor).workArea;

    // Ghost mode: never block clicks, except when the cursor comes close enough
    // that the user clearly wants to grab the pet.
    if (ghostMode) {
      const [px, py] = pet.getPosition();
      const [pw, ph] = pet.getSize();
      const near = cursor.x >= px - 40 && cursor.x <= px + pw + 40 &&
                   cursor.y >= py - 30 && cursor.y <= py + ph + 30;
      if (near !== clickThrough) {
        clickThrough = !near;
        pet.setIgnoreMouseEvents(clickThrough, { forward: true });
      }
    }

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
  globalShortcut.register('Control+Alt+M', () => {
    ghostMode = !ghostMode;
    clickThrough = ghostMode;
    pet?.setIgnoreMouseEvents(clickThrough, { forward: true });
    savePrefs();
    pet?.webContents.send('hub:state', hubOpen);
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
    ghostMode = !v;
    clickThrough = v;
    pet?.setIgnoreMouseEvents(clickThrough, { forward: true });
    savePrefs();
  });
  ipcMain.on('mate:ghost-mode', (_e, v: boolean) => {
    ghostMode = !!v;
    if (!ghostMode) pet?.setIgnoreMouseEvents(false, { forward: true });
    savePrefs();
  });
  ipcMain.on('mate:click-through-state', (event) => {
    event.returnValue = clickThrough;
  });
  ipcMain.on('mate:idle-after', (_e, ms: number) => {
    idleAfter = Number.isFinite(ms) && ms >= 0 ? ms : DEFAULT_IDLE_MS;
    savePrefs();
  });
  ipcMain.on('mate:move', (_e, x: number, y: number) => {
    if (!pet || pet.isDestroyed()) return;
    const area = workArea();
    pet.setPosition(
      Math.round(Math.min(Math.max(x, area.x - 40), area.x + area.width - 60)),
      Math.round(Math.min(Math.max(y, area.y), area.y + area.height - 60))
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
  ipcMain.on('mate:media', (_e, action: string) => {
    const media = probeMedia();
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

  // AI chat runs in main so there is no CORS / file-origin / CSP involvement.
// Providers are tried in order: Gemini (free key), OpenRouter (free key), Pollinations (keyless).
async function askAI(prompt: string, system: string, geminiKey: string, routerKey: string): Promise<string | null> {
  const text = `${system}\n\nUser: ${prompt}`;

  if (geminiKey) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(geminiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text }] }] }),
          signal: AbortSignal.timeout(30000)
        }
      );
      if (res.ok) {
        const data = (await res.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
        const out = data.candidates?.[0]?.content?.parts?.map((p) => p.text).join('').trim();
        if (out) return out.replace(/\s+/g, ' ').slice(0, 400);
      }
    } catch {
      // fall through to the next provider
    }
  }

  if (routerKey) {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${routerKey}` },
        body: JSON.stringify({
          model: 'meta-llama/llama-3.1-8b-instruct:free',
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: prompt }
          ]
        }),
        signal: AbortSignal.timeout(30000)
      });
      if (res.ok) {
        const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
        const out = data.choices?.[0]?.message?.content?.trim();
        if (out) return out.replace(/\s+/g, ' ').slice(0, 400);
      }
    } catch {
      // fall through
    }
  }

  // Keyless option: still worth trying, the free tier comes and goes.
  for (const model of ['openai', 'openai-fast']) {
    try {
      const res = await fetch(
        `https://text.pollinations.ai/${encodeURIComponent(text)}?model=${model}&private=true&seed=${Math.floor(Math.random() * 100000)}`,
        { signal: AbortSignal.timeout(20000) }
      );
      if (res.ok) {
        const out = (await res.text()).trim();
        if (out && out.length > 1) return out.replace(/\s+/g, ' ').slice(0, 400);
      }
    } catch {
      // try the next model
    }
  }
  return null;
}

ipcMain.handle('ai:ask', async (_e, prompt: string, system: string, geminiKey: string, routerKey: string) =>
  askAI(prompt, system, String(geminiKey || ''), String(routerKey || '')));
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
  ipcMain.on('mate:speak', (_e, text: string, voice: string) => speak(text, voice));
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
app.on('will-quit', () => globalShortcut.unregisterAll());