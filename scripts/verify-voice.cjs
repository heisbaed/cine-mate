const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const assert = require('node:assert/strict');
const processes = require('node:child_process');
const spawn = processes.spawn;
const speech = [];
const speechRates = [];
processes.spawn = (...args) => {
  const child = spawn(...args);
  if (args[1]?.some(value => String(value).endsWith('speak.ps1'))) {
    speech.push(new Promise(resolve => child.once('close', resolve)));
    speechRates.push(args[1][args[1].indexOf('-Rate') + 1]);
  }
  return child;
};
app.setPath('userData', path.resolve(__dirname, '../.qa-data/voice'));
require('../out/main/index.js');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
app.whenReady().then(async () => {
  await pause(1500);
  const hub = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('mode=hub'));
  assert.ok(hub);
  const voices = await hub.webContents.executeJavaScript('window.mate.voices()');
  assert.ok(voices.some(v => v.name.includes('Zira')), 'Windows voices reach the renderer');
  ipcMain.emit('hub:toggle', {}, true);
  await pause(300);
  await hub.webContents.executeJavaScript(`[...document.querySelectorAll('.tabs button')].find(b => b.textContent === 'settings').click()`);
  await pause(100);
  await hub.webContents.executeJavaScript(`(() => {
    const label = [...document.querySelectorAll('label')].find(l => l.textContent.includes('Voice replies'));
    if (!label.querySelector('input').checked) label.querySelector('input').click();
  })()`);
  await pause(200);
  await hub.webContents.executeJavaScript(`(() => {
    const button = [...document.querySelectorAll('button')].find(b => b.textContent === 'Test voice');
    if (!button) throw new Error('Voice test button missing');
    button.click();
  })()`);
  let status = '';
  for (let i = 0; i < 40; i++) {
    await pause(500);
    status = await hub.webContents.executeJavaScript(`document.querySelector('.test-line[role="status"]')?.textContent || ''`);
    if (status.startsWith('Voice test finished')) break;
  }
  assert.ok(status.startsWith('Voice test finished'), status);
  const result = await hub.webContents.executeJavaScript(`window.mate.speak('A slower voice test.', '', -2)`);
  assert.deepEqual(result, {});
  assert.equal(speechRates.at(-1), '-2', 'requested speed reaches Windows speech');
  const previousSpeech = speech.length;
  await hub.webContents.executeJavaScript(`document.querySelectorAll('.tabs button')[0].click()`);
  await pause(150);
  await hub.webContents.executeJavaScript(`[...document.querySelectorAll('.chips button')].find(b => b.textContent === 'Tell me a joke').click()`);
  await pause(700);
  assert.ok(speech.length > previousSpeech, 'chat replies request speech while voice is enabled');
  assert.equal(await speech.at(-1), 0, 'automatic chat speech succeeds');
  console.log('Voice verification passed: real Windows voices, Settings toggle, Test voice, renderer IPC, default audio playback, and automatic chat speech.');
  app.quit();
}).catch(error => { console.error(error); app.exit(1); });
