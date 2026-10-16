const { app, BrowserWindow, ipcMain } = require('electron');
const cp = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs/promises');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough, Writable } = require('node:stream');
let listenerStarts = 0;
const listeners = [];
const spawn = cp.spawn;
cp.spawn = function (command, args, options) {
  const listening = args?.some(value => String(value).endsWith('listen.ps1'));
  if (listening) listenerStarts++;
  if (listening && listenerStarts === 3) {
    const child = new EventEmitter();
    child.stdout = new PassThrough(); child.exitCode = null; child.signalCode = null;
    const emit = value => child.stdout.write(JSON.stringify(value)+'\n');
    child.kill = () => { child.exitCode = 0; queueMicrotask(()=>child.emit('close',0)); return true; };
    child.stdin = new Writable({ write(chunk, _encoding, done) {
      const command = String(chunk).trim();
      if (command === 'capture') queueMicrotask(()=>{emit({state:'ready'});emit({state:'wake',manual:true,recording:true});});
      if (command === 'finish') {
        const directory = args[args.indexOf('-TempDirectory')+1];
        const clip = path.join(directory, 'stop-and-send-test.wav');
        fs.copyFile(path.resolve(__dirname,'../artifacts/wake-fixture.wav'),clip).then(()=>emit({state:'audio',path:clip,manual:true,direct:true})).catch(error=>child.emit('error',error));
      }
      done();
    }});
    listeners.push(child); return child;
  }
  if (listening && listenerStarts === 2) args = [...args, '-AudioFile', path.resolve(__dirname, '../artifacts/wake-fixture.wav')];
  const child = spawn.call(this, command, args, options);
  if (listening) {
    listeners.push(child);
    if (listenerStarts === 2) {
      const write = child.stdin.write.bind(child.stdin);
      child.stdin.write = (chunk, ...rest) => String(chunk) === 'capture\n' ? true : write(chunk, ...rest);
    }
  }
  return child;
};
app.setPath('userData', path.resolve(__dirname, '../.qa-data/countdown-mic'));
require('../out/main/index.js');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check) {
  for (let i = 0; i < 100; i++) { if (await check()) return; await pause(100); }
  throw new Error('Timed out waiting for test state');
}
app.whenReady().then(async () => {
  await pause(1300);
  const windows = BrowserWindow.getAllWindows();
  const pet = windows.find(w => w.webContents.getURL().includes('mode=pet'));
  const hub = windows.find(w => w.webContents.getURL().includes('mode=hub'));
  const run = code => hub.webContents.executeJavaScript(code);
  await run(`localStorage.setItem('cinemate-settings-v1',JSON.stringify({voice:false,wakeListening:true,wander:false}));`);
  hub.reload(); await pause(1000);
  assert.equal(listenerStarts, 0, 'Existing always-listening preference does not open microphone at startup');
  assert.equal(await pet.webContents.executeJavaScript(`document.querySelector('.pet-mic').getAttribute('aria-pressed')`), 'false');
  ipcMain.removeHandler('ai:ask');
  const aiCalls = [];
  ipcMain.handle('ai:ask', (_event,turns) => { aiCalls.push(turns.at(-1)?.text); return {text:null,error:'Unexpected AI request in timer verification'}; });
  ipcMain.emit('hub:toggle', {}, true);
  await run(`(() => { const input=document.querySelector('input[aria-label="Ask"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'set a 1 minute countdown');input.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  await pause(100); await run(`document.querySelector('form').requestSubmit()`);
  await until(async () => /TIMER01:00|TIMER00:59/.test(await pet.webContents.executeJavaScript(`document.querySelector('.cine-face-display')?.textContent || ''`)));
  ipcMain.emit('hub:toggle', {}, false);
  await pause(1300);
  assert.match(await pet.webContents.executeJavaScript(`document.querySelector('.cine-face-display')?.textContent || ''`), /TIMER00:5[6789]/);
  const output = path.resolve(__dirname, '../artifacts/countdown-mic'); await fs.mkdir(output, {recursive:true});
  await fs.writeFile(path.join(output,'one-minute-face.png'), (await pet.webContents.capturePage()).toPNG());
  await run(`window.__speech=[];window.mate.onSpeech(e=>window.__speech.push(e));void 0;`);
  await pet.webContents.executeJavaScript(`document.querySelector('.pet-mic').click()`);
  await until(() => run(`window.__speech.some(e=>e.state==='listening')`));
  assert.equal(await pet.webContents.executeJavaScript(`document.querySelector('.pet-mic').getAttribute('aria-pressed')`), 'true');
  await pet.webContents.executeJavaScript(`document.querySelector('.pet-mic').click()`);
  await until(() => run(`window.__speech.at(-1)?.enabled===false`));
  await until(() => listeners[0].exitCode !== null || listeners[0].signalCode !== null);
  await run(`window.__speech=[]`);
  await pet.webContents.executeJavaScript(`document.querySelector('.pet-mic').click()`);
  await until(() => run(`window.__speech.some(e=>e.state==='transcribing')`));
  await pet.webContents.executeJavaScript(`document.querySelector('.pet-mic').click()`);
  await pause(1800);
  const events = await run(`window.__speech`);
  assert.equal(events.at(-1).state, 'off');
  assert.equal(events.at(-1).enabled, false);
  assert.ok(events.some(e=>e.state==='heard'), 'Stopping the microphone preserves a recording already being transcribed');
  assert.equal(await pet.webContents.executeJavaScript(`document.querySelector('.pet-mic').getAttribute('aria-pressed')`), 'false');
  await run(`window.__speech=[]`);
  await pet.webContents.executeJavaScript(`document.querySelector('.pet-mic').click()`);
  await until(() => run(`window.__speech.some(e=>e.state==='listening')`));
  await pet.webContents.executeJavaScript(`document.querySelector('.pet-mic').click()`);
  await until(() => run(`window.__speech.some(e=>e.state==='heard')`));
  const sent = await run(`window.__speech`);
  assert.ok(sent.some(e=>e.state==='finishing'&&e.enabled===false));
  assert.ok(sent.some(e=>e.state==='transcribing'&&e.enabled===false));
  assert.match(sent.find(e=>e.state==='heard').text,/set a timer for (?:five|5) seconds/i);
  await until(async()=>/TIMER00:0[45]/.test(await pet.webContents.executeJavaScript(`document.querySelector('.cine-face-display')?.textContent || ''`)));
  assert.ok(listeners[2].exitCode!==null, 'Capture worker closed before transcription completes');
  assert.equal(aiCalls.length,0,JSON.stringify(aiCalls));
  console.log(JSON.stringify({oneMinuteFaceVisible:true,countdownContinuesWithChatHidden:true,microphoneOffOnStartup:true,stoppingPreservesTranscription:true,stopButtonSendsRecordingToRealWhisper:true,microphoneClosedWhileProcessing:true}));
  app.quit();
}).catch(error => { console.error(error); app.exit(1); });
