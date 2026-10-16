const { spawn } = require('node:child_process');
const path = require('node:path');
const assert = require('node:assert/strict');
const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File',
  path.resolve(__dirname, '../assets/listen.ps1'), '-ParentId', String(process.pid)], { windowsHide: true });
let buffer = '';
let resumed = false;
let passed = false;
const timeout = setTimeout(() => { console.error('Listener control timed out'); child.kill(); process.exitCode = 1; }, 15000);
child.stdout.on('data', chunk => {
  buffer += chunk;
  const lines = buffer.split(/\r?\n/); buffer = lines.pop();
  for (const line of lines) {
    const event = JSON.parse(line);
    assert.notEqual(event.state, 'error', event.error);
    if (event.state === 'ready' && !resumed) {
      resumed = true;
      child.stdin.write('suspend\n');
      setTimeout(() => { child.stdin.write('resume\narm\n'); }, 400);
    }
    if (event.state === 'wake' && resumed) {
      passed = true; clearTimeout(timeout); child.kill();
      console.log('Real microphone listener: stdin remains responsive, suspend/resume succeeds, follow-up listening arms.');
    }
  }
});
child.on('close', () => { clearTimeout(timeout); if (!passed) process.exitCode = 1; });
child.on('error', error => { clearTimeout(timeout); console.error(error); process.exitCode = 1; });
