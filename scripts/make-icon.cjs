// Rasterize the vector character with Chromium, then write a multi-size Windows icon.
// Run with either `node scripts/make-icon.cjs` or `electron scripts/make-icon.cjs`.
const fs = require('node:fs/promises');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const sizes = [16, 32, 48, 64, 256];

if (!process.versions.electron) {
  const { spawnSync } = require('node:child_process');
  const iconEnv = { ...process.env };
  delete iconEnv.ELECTRON_RUN_AS_NODE;
  const result = spawnSync(require('electron'), [__filename], {
    cwd: root, env: iconEnv, stdio: 'inherit', windowsHide: true
  });
  if (result.error) console.error(result.error.message);
  process.exit(result.status ?? 1);
}

const { app, BrowserWindow, nativeImage } = require('electron');
app.setPath('userData', path.join(root, '.preview-data', 'icon-renderer'));
app.disableHardwareAcceleration();

function ico(images) {
  const header = Buffer.alloc(6 + images.length * 16);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, png }, index) => {
    const entry = 6 + index * 16;
    header[entry] = size === 256 ? 0 : size;
    header[entry + 1] = size === 256 ? 0 : size;
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(png.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += png.length;
  });
  return Buffer.concat([header, ...images.map(({ png }) => png)]);
}

app.whenReady().then(async () => {
  const svg = await fs.readFile(path.join(root, 'assets', 'cine.svg'), 'utf8');
  const window = new BrowserWindow({
    width: 256, height: 256, show: false, frame: false, transparent: true,
    webPreferences: { offscreen: true, contextIsolation: true, sandbox: true }
  });
  await window.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent('<!doctype html><html><body style="margin:0;background:transparent"></body></html>'));
  const svgUrl = 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
  const dataUrls = await window.webContents.executeJavaScript(`(async () => {
    const image = new Image();
    image.src = ${JSON.stringify(svgUrl)};
    await image.decode();
    return ${JSON.stringify(sizes)}.map(size => {
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext('2d');
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      context.drawImage(image, 0, 0, size, size);
      return canvas.toDataURL('image/png');
    });
  })()`);
  const images = dataUrls.map((url, index) => ({ size: sizes[index], png: Buffer.from(url.split(',')[1], 'base64') }));
  const image = nativeImage.createFromBuffer(images.at(-1).png);
  const bitmap = image.toBitmap();
  let transparentPixels = 0;
  let visiblePixels = 0;
  for (let offset = 3; offset < bitmap.length; offset += 4) {
    if (bitmap[offset] === 0) transparentPixels++;
    else visiblePixels++;
  }
  if (image.getSize().width !== 256 || image.getSize().height !== 256 || !transparentPixels || !visiblePixels) {
    throw new Error('Icon must be a 256px image with visible artwork and transparent surroundings.');
  }
  await fs.mkdir(path.join(root, 'build'), { recursive: true });
  await fs.writeFile(path.join(root, 'assets', 'cine.png'), images.at(-1).png);
  await fs.writeFile(path.join(root, 'build', 'cine.ico'), ico(images));
  console.log(JSON.stringify({ png: 'assets/cine.png', ico: 'build/cine.ico', sizes, transparentPixels, visiblePixels }));
  window.destroy();
  app.quit();
}).catch((error) => {
  console.error(error);
  app.exit(1);
});
