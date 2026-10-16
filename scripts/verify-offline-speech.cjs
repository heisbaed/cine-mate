const { app, BrowserWindow } = require('electron');
const cp = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
app.setPath('userData', path.resolve(__dirname, '../.qa-data/offline-speech'));
const originalSpawn = cp.spawn;
cp.spawn = function (command, args, options) {
  if (args?.some(arg => String(arg).endsWith('listen.ps1'))) {
    args = [...args, '-AudioFile', path.resolve(__dirname, '../artifacts/wake-fixture.wav')];
  }
  return originalSpawn.call(this, command, args, options);
};
require('../out/main/index.js');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
app.whenReady().then(async () => {
  await pause(1300);
  const before = new Set(await fs.readdir(path.join(app.getPath('temp'), 'CineMate-speech')));
  const hub = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('mode=hub'));
  const result = await hub.webContents.executeJavaScript(`new Promise(async resolve => {
    const events=[];
    let started=0;
    const timer=setTimeout(()=>{off();resolve({timeout:true,events});},45000);
    const off=window.mate.onSpeech(event=>{
      events.push(event);
      if(event.state==='transcribing')started=performance.now();
      if(event.state==='heard'){clearTimeout(timer);off();resolve({events,text:event.text,direct:event.direct,transcriptionMs:performance.now()-started});}
    });
    await window.mate.listen(false); await window.mate.listen(true);
  })`);
  assert.match(result.text || '', /set a timer for (?:five|5) seconds/i, JSON.stringify(result));
  assert.equal(result.direct, true);
  assert.ok(result.events.some(event => event.state === 'transcribing'));
  await hub.webContents.executeJavaScript('window.mate.listen(false)');
  await pause(500);
  const clips = await fs.readdir(path.join(app.getPath('temp'), 'CineMate-speech'));
  assert.equal(clips.filter(file => !before.has(file)).length, 0, 'temporary audio and transcription deleted');
  console.log(JSON.stringify({ offlineTranscription: result.text, transcriptionMs:Math.round(result.transcriptionMs), temporaryAudioDeleted: true }));
  app.quit();
}).catch(error => { console.error(error); app.exit(1); });
