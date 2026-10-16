/* Render the real built Electron UI without touching the personal app profile. */
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'artifacts', 'previews');
const issues = [];
const calls = [];
const windows = [];
let hub;
let pet;

app.setPath('userData', path.join(root, '.preview-data'));
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-background-timer-throttling');

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function listen(window, name) {
  window.webContents.on('console-message', (_event, level, message) => {
    if (level >= 3) issues.push({ window: name, kind: 'console', message });
  });
  window.webContents.on('preload-error', (_event, file, error) => {
    issues.push({ window: name, kind: 'preload', file, message: String(error) });
  });
  window.webContents.on('render-process-gone', (_event, details) => {
    issues.push({ window: name, kind: 'renderer', ...details });
  });
}

function create(mode, width, height) {
  const window = new BrowserWindow({
    width,
    height,
    show: false,
    transparent: true,
    frame: false,
    hasShadow: false,
    webPreferences: {
      preload: path.join(root, 'out', 'preload', 'index.js'),
      contextIsolation: true,
      sandbox: false,
      offscreen: true,
      backgroundThrottling: false,
      additionalArguments: [`--mate-mode=${mode}`]
    }
  });
  windows.push(window);
  window.webContents.setFrameRate(30);
  listen(window, mode);
  return window;
}

async function emit(channel, value) {
  // The renderer bus uses real BroadcastChannels shared by the two file origins.
  await hub.webContents.executeJavaScript(`(() => {
    const channel = new BroadcastChannel(${JSON.stringify(channel)});
    channel.postMessage(${JSON.stringify(value)});
    channel.close();
  })()`);
  await pause(140);
}

async function capture(window, name, selectors) {
  window.webContents.invalidate();
  await pause(450);
  const file = path.join(output, `${name}.png`);
  const shot = await window.webContents.capturePage();
  await fs.writeFile(file, shot.toPNG());
  const bitmap = shot.toBitmap();
  let transparentPixels = 0;
  let visiblePixels = 0;
  for (let offset = 3; offset < bitmap.length; offset += 4) {
    if (bitmap[offset] === 0) transparentPixels++;
    else visiblePixels++;
  }
  const layout = await window.webContents.executeJavaScript(`(() => {
    const selectors = ${JSON.stringify(selectors)};
    const round = value => Math.round(value * 100) / 100;
    return {
      viewport: { width: innerWidth, height: innerHeight },
      body: { scrollWidth: document.body.scrollWidth, scrollHeight: document.body.scrollHeight },
      elements: selectors.flatMap(selector => [...document.querySelectorAll(selector)].map(element => {
        const box = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return { selector, className: typeof element.className === 'string' ? element.className : element.className.baseVal,
          x: round(box.x), y: round(box.y), width: round(box.width), height: round(box.height),
          display: style.display, opacity: style.opacity,
          clipped: box.x < -1 || box.y < -1 || box.right > innerWidth + 1 || box.bottom > innerHeight + 1 };
      })),
      text: document.body.innerText.slice(0, 1800)
    };
  })()`);
  return { name, file: path.relative(root, file), imageSize: shot.getSize(), transparentPixels, visiblePixels, ...layout };
}

async function main() {
  await fs.mkdir(output, { recursive: true });
  ipcMain.handle('mate:click-through-state', () => false);
  ipcMain.handle('mate:now-playing', () => null);
  ipcMain.handle('mate:speak', () => ({}));
  ipcMain.handle('mate:listen', () => ({ state: 'off' }));
  ipcMain.handle('mate:play-song', () => ({ playing: true, title: 'Preview song' }));
  ipcMain.handle('mate:timer-alert', () => ({}));
  ipcMain.handle('mate:voices', () => [{ uri: 'Microsoft Zira Desktop', name: 'Microsoft Zira Desktop' }]);
  ipcMain.handle('mate:sysinfo', () => 'Preview: Windows desktop');
  ipcMain.handle('mate:screenshot', () => null);
  ipcMain.handle('ai:test', () => 'Preview connection');
  ipcMain.handle('ai:ask', () => ({ text: 'I am right here. What are we making today?', model: 'preview' }));
  const channels = [
    'mate:move', 'hub:move', 'mate:idle-after', 'mate:click-through',
    'mate:ghost-mode', 'mate:login', 'mate:dragging', 'mate:pet-inset', 'mate:cinema-mode', 'mate:menu', 'mate:launch', 'mate:media',
    'mate:spotify', 'mate:spotify-search', 'mate:window', 'mate:notify',
    'mate:open-url', 'mate:open-folder', 'mate:lock', 'mate:open-site', 'mate:quit'
  ];
  for (const channel of channels) ipcMain.on(channel, (_event, ...args) => calls.push({ channel, args }));
  ipcMain.on('hub:toggle', (_event, force) => hub.webContents.send('hub:state', typeof force === 'boolean' ? force : true));

  pet = create('pet', 260, 280);
  hub = create('hub', 420, 650);
  await pet.webContents.session.clearStorageData();
  await Promise.all(windows.map((window, index) => window.loadFile(path.join(root, 'out', 'renderer', 'index.html'), { query: { mode: index === 0 ? 'pet' : 'hub' } })));
  await pause(250);
  pet.webContents.send('mate:cursor', {
    cursor: { x: 360, y: 360 }, winPos: { x: 100, y: 100 }, area: { x: 0, y: 0, width: 1920, height: 1080 }
  });
  await emit('cinemate-config', { pet: 'robot', petName: 'Cine', theme: 'gold', size: 'M', wander: false });
  const reports = [];
  const petSelectors = ['.pet-stage', '.mate-body', '.bubble', '.cine-character', '.cine-robot'];
  reports.push(await capture(pet, 'cine-neutral', petSelectors));
  const firstFrame = (await pet.webContents.capturePage()).toBitmap();
  await pause(360);
  const secondFrame = (await pet.webContents.capturePage()).toBitmap();
  let changedBytes = 0;
  for (let offset = 0; offset < Math.min(firstFrame.length, secondFrame.length); offset++) {
    if (firstFrame[offset] !== secondFrame[offset]) changedBytes++;
  }
  const animation = { milliseconds: 360, changedBytes, totalBytes: firstFrame.length, animated: changedBytes > 100 };
  await emit('cinemate-mood', 'love');
  reports.push(await capture(pet, 'cine-love', petSelectors));
  await emit('cinemate-mood', null);
  await emit('cinemate-thinking', true);
  reports.push(await capture(pet, 'cine-thinking', petSelectors));
  await emit('cinemate-thinking', false);
  await emit('cinemate-action', 'dance');
  reports.push(await capture(pet, 'cine-dancing', petSelectors));
  await emit('cinemate-action', 'sleep');
  reports.push(await capture(pet, 'cine-sleeping', petSelectors));
  await emit('cinemate-action', 'wake');
  for (const size of ['S', 'L']) {
    await emit('cinemate-config', { pet: 'robot', size, wander: false });
    reports.push(await capture(pet, `cine-size-${size.toLowerCase()}`, petSelectors));
  }
  await emit('cinemate-config', { pet: 'robot', size: 'M', theme: 'cyan', wander: false });
  reports.push(await capture(pet, 'cine-cyan', petSelectors));
  hub.webContents.send('hub:state', true);
  reports.push(await capture(hub, 'cine-chat', ['.hub-open', '.chat', '.tabs', '.chat-form', 'form', '.log']));
  await hub.webContents.executeJavaScript(`(() => {
    const buttons = [...document.querySelectorAll('button')];
    buttons.find(button => /^(pet|appearance|look)$/i.test(button.textContent.trim()))?.click();
  })()`);
  reports.push(await capture(hub, 'cine-appearance', ['.hub-open', '.chat', '.tabs', '.pet-config', '.controls']));
  const report = { generatedAt: new Date().toISOString(), animation, reports, issues, calls };
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ animation, captures: reports.map(({ name, file, imageSize, transparentPixels, visiblePixels, elements }) => ({ name, file, imageSize, transparentPixels, visiblePixels, clipped: elements.filter(element => element.clipped) })), issues }, null, 2));
  for (const window of windows) window.destroy();
  app.quit();
}

app.whenReady().then(main).catch(async (error) => {
  console.error(error);
  try { await fs.writeFile(path.join(output, 'failure.txt'), String(error.stack || error)); } catch {}
  app.exit(1);
});
