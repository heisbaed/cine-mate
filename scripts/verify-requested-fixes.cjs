const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const assert = require('node:assert/strict');
app.setPath('userData', path.resolve(__dirname, '../.qa-data/requested-fixes'));
require('../out/main/index.js');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
app.whenReady().then(async () => {
  await pause(1400);
  const windows = BrowserWindow.getAllWindows();
  const pet = windows.find(w => w.webContents.getURL().includes('mode=pet'));
  const hub = windows.find(w => w.webContents.getURL().includes('mode=hub'));
  const run = code => hub.webContents.executeJavaScript(code);
  await run(`localStorage.setItem('cinemate-settings-v1', JSON.stringify({voice:false,wakeListening:false,wander:false,pet:'robot',size:'M',accessory:'hoverboard'}))`);
  hub.reload(); await pause(1000);
  ipcMain.emit('hub:toggle', {}, true); await pause(200);
  const mic = await run(`new Promise(async resolve => {
    const timeout=setTimeout(()=>{off();resolve({state:'timeout'});},18000);
    const off=window.mate.onSpeech(event=>{if(event.state==='ready'||event.state==='error'){clearTimeout(timeout);off();resolve(event);}});
    await window.mate.listen(true);
  })`);
  assert.equal(mic.state, 'ready', `actual microphone initialization: ${JSON.stringify(mic)}`);
  const send = async (channel, payload) => {
    await run(`(() => { const ch=new BroadcastChannel(${JSON.stringify(channel)});ch.postMessage(${JSON.stringify(payload)});ch.close(); })()`); await pause(160);
  };
  const output = path.resolve(__dirname, '../artifacts/voice-and-layout'); await fs.mkdir(output, { recursive: true });
  const geometry = [];
  for (const size of ['S','M','L']) {
    await send('cinemate-config', { pet:'robot',size,wander:false,accessory:'hoverboard',headphoneColor:'#f3f6fb' });
    await send('cinemate-bubble', 'Just a small thought. I am right here.');
    const box = await pet.webContents.executeJavaScript(`(() => {
      const b=document.querySelector('.bubble').getBoundingClientRect();const p=document.querySelector('.mate-body').getBoundingClientRect();
      return {size:${JSON.stringify(size)},gap:p.top-b.bottom,top:b.top,bottom:p.bottom};
    })()`);
    assert.ok(box.gap >= 8 && box.gap <= 16, `bubble anchored to actual pet: ${JSON.stringify(box)}`);
    assert.ok(box.top >= -1, 'bubble fits in window');
    const area=screen.getPrimaryDisplay().workArea;
    ipcMain.emit('mate:move',{},area.x+200,area.y-250); await pause(200);
    const visibleTop=await pet.webContents.executeJavaScript('document.querySelector(".mate-body").getBoundingClientRect().top');
    assert.ok(pet.getPosition()[1]+visibleTop-area.y <= 14, 'Cine can be dragged to screen top at every size');
    ipcMain.emit('mate:move',{},area.x+200,area.y+100); await pause(200);
    geometry.push(box);
    await fs.writeFile(path.join(output, `bubble-${size}.png`),(await pet.webContents.capturePage()).toPNG());
  }
  await send('cinemate-config',{size:'M'});
  await run(`[...document.querySelectorAll('.tabs button')].find(b=>b.textContent==='settings').click()`); await pause(150);
  await run(`window.mate.listen(true)`); await pause(150);
  const song = await run(`window.mate.playSong('Sia Elastic Heart Piano Version')`);
  assert.equal(song.playing,true,JSON.stringify(song));
  await pause(1700);
  assert.ok(await pet.webContents.executeJavaScript('!!document.querySelector(".cine-headphones")'), 'real playing music equips headphones');
  hub.webContents.send('mate:speech',{state:'heard',text:'Hey Cine'}); await pause(150);
  assert.ok(await pet.webContents.executeJavaScript('!!document.querySelector(".mic-dot.awake")'), 'wake shows an active listening indicator');
  hub.webContents.send('mate:speech',{state:'heard',text:'countdown from 5'}); await pause(600);
  assert.match(await pet.webContents.executeJavaScript('document.querySelector(".cine-face-display")?.textContent || ""'), /TIMER00:0[45]/);
  assert.ok((await run('window.mate.nowPlaying()')).playing,'music continues during countdown');
  await fs.writeFile(path.join(output,'music-and-countdown.png'),(await pet.webContents.capturePage()).toPNG());
  await pause(5200);
  assert.match(await pet.webContents.executeJavaScript('document.querySelector(".cine-face-display")?.textContent || ""'), /DONE00:00/);
  assert.ok((await run('window.mate.nowPlaying()')).playing,'music continues after countdown');
  await fs.writeFile(path.join(output,'verification.json'),JSON.stringify({microphone:mic.state,geometry,spotify:song,countdownDuringMusic:true},null,2));
  console.log(JSON.stringify({microphone:mic.state,geometry,spotify:song,countdownDuringMusic:true}));
  app.quit();
}).catch(error=>{console.error(error);app.exit(1);});
