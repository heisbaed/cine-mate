// Opt-in live check: uses the saved personal key through the real Electron IPC.
const { app, BrowserWindow, ipcMain } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
app.setPath('userData', path.join(root, '.qa-data'));
require('../out/main/index.js');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

async function send(hub, text) {
  const before = await hub.webContents.executeJavaScript('document.querySelectorAll(".log p.cine:not(.typing)").length');
  await hub.webContents.executeJavaScript(`(() => {
    const input = document.querySelector('input[aria-label="Ask"]');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(text)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await pause(80);
  await hub.webContents.executeJavaScript('document.querySelector("form").requestSubmit()');
  const until = Date.now() + 50_000;
  while (Date.now() < until) {
    const state = await hub.webContents.executeJavaScript(`(() => {
      const replies = [...document.querySelectorAll('.log p.cine:not(.typing)')];
      return { count: replies.length, text: replies.at(-1)?.textContent, detail: document.querySelector('.connection-detail pre')?.textContent, error: replies.at(-1)?.classList.contains('error'), busy: !!document.querySelector('.typing') };
    })()`);
    if (state.count > before && !state.busy) {
      assert.equal(state.error, false, [state.text, state.detail].filter(Boolean).join('\n'));
      return state.text;
    }
    await pause(250);
  }
  throw new Error('Live chat did not answer within 50 seconds.');
}

app.whenReady().then(async () => {
  await pause(1500);
  const hub = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('mode=hub'));
  assert.ok(hub);
  ipcMain.emit('hub:toggle', {}, true);
  await pause(180);
  const first = await send(hub, 'Let us use the codeword marigold for this conversation. Say hello in one short sentence.');
  const second = await send(hub, 'What is the codeword we just chose? Reply with only that word.');
  assert.match(second.toLowerCase(), /marigold/);
  const output = path.join(root, 'artifacts', 'live-chat');
  await fs.mkdir(output, { recursive: true });
  await fs.writeFile(path.join(output, 'cine-chat.png'), (await hub.webContents.capturePage()).toPNG());
  const report = { passed: true, first, second, checkedAt: new Date().toISOString() };
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
  app.quit();
}).catch(error => { console.error(error.message); app.exit(1); });
