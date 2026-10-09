import { contextBridge, ipcRenderer } from 'electron';

export interface CursorState {
  cursor: { x: number; y: number };
  winPos: { x: number; y: number };
  area: { x: number; y: number; width: number; height: number };
}

export interface MediaInfo {
  app: string;
  title: string;
  artist: string;
  playing: boolean;
}

const modeArg = process.argv.find((a) => a.startsWith('--mate-mode='));

export interface MateApi {
  mode: 'pet' | 'hub';
  move: (x: number, y: number) => void;
  moveHub: (x: number, y: number) => void;
  setLogin: (value: boolean) => void;
  openSite: () => void;
  hubToggle: (force?: boolean) => void;
  onHubState: (cb: (open: boolean) => void) => () => void;
  setClickThrough: (value: boolean) => void;
  setGhostMode: (value: boolean) => void;
  getClickThrough: () => Promise<boolean>;
  setIdleAfter: (ms: number) => void;
  launch: (app: string) => void;
  media: (action: string) => void;
  spotify: (action: 'open' | 'close') => void;
  nowPlaying: () => Promise<MediaInfo | null>;
  speak: (text: string, voice: string) => void;
  openUrl: (url: string) => void;
  openFolder: (kind: string) => void;
  lock: () => void;
  window: (action: string) => void;
  sysinfo: () => Promise<string>;
  screenshot: () => Promise<string | null>;
  notify: (title: string, body: string) => void;
  menu: () => void;
  quit: () => void;
  onCursor: (cb: (state: CursorState) => void) => () => void;
  onIdle: (cb: (idle: boolean) => void) => () => void;
  onContext: (cb: (title: string) => void) => () => void;
  onActivity: (cb: (a: { typing: boolean; fullscreen: boolean }) => void) => () => void;
  ask: (prompt: string, system: string, geminiKey: string, routerKey: string) => Promise<string | null>;
  spotifySearch: (query: string) => void;
}

const api: MateApi = {
  mode: modeArg?.includes('hub') ? 'hub' : 'pet',
  move: (x, y) => ipcRenderer.send('mate:move', x, y),
  moveHub: (x, y) => ipcRenderer.send('hub:move', x, y),
  setLogin: (v) => ipcRenderer.send('mate:login', v),
  openSite: () => ipcRenderer.send('mate:open-site'),
  hubToggle: (force) => ipcRenderer.send('hub:toggle', force),
  onHubState: (cb) => {
    const l = (_e: unknown, open: boolean) => cb(open);
    ipcRenderer.on('hub:state', l as never);
    return () => ipcRenderer.removeListener('hub:state', l as never);
  },
  setClickThrough: (v) => ipcRenderer.send('mate:click-through', v),
  setGhostMode: (v) => ipcRenderer.send('mate:ghost-mode', v),
  getClickThrough: () => ipcRenderer.invoke('mate:click-through-state'),
  setIdleAfter: (ms) => ipcRenderer.send('mate:idle-after', ms),
  launch: (name) => ipcRenderer.send('mate:launch', name),
  media: (action) => ipcRenderer.send('mate:media', action),
  spotify: (action) => ipcRenderer.send('mate:spotify', action),
  nowPlaying: () => ipcRenderer.invoke('mate:now-playing'),
  speak: (text, voice) => ipcRenderer.send('mate:speak', text, voice),
  openUrl: (url) => ipcRenderer.send('mate:open-url', url),
  openFolder: (kind) => ipcRenderer.send('mate:open-folder', kind),
  lock: () => ipcRenderer.send('mate:lock'),
  window: (action: string) => ipcRenderer.send('mate:window', action),
  sysinfo: () => ipcRenderer.invoke('mate:sysinfo'),
  screenshot: () => ipcRenderer.invoke('mate:screenshot'),
  notify: (title, body) => ipcRenderer.send('mate:notify', title, body),
  menu: () => ipcRenderer.send('mate:menu'),
  quit: () => ipcRenderer.send('mate:quit'),
  onCursor: (cb) => {
    const l = (_e: unknown, s: CursorState) => cb(s);
    ipcRenderer.on('mate:cursor', l as never);
    return () => ipcRenderer.removeListener('mate:cursor', l as never);
  },
  onIdle: (cb) => {
    const l = (_e: unknown, idle: boolean) => cb(idle);
    ipcRenderer.on('mate:idle', l as never);
    return () => ipcRenderer.removeListener('mate:idle', l as never);
  },
  onContext: (cb) => {
    const l = (_e: unknown, title: string) => cb(title);
    ipcRenderer.on('mate:context', l as never);
    return () => ipcRenderer.removeListener('mate:context', l as never);
  },
  onActivity: (cb) => {
    const l = (_e: unknown, a: { typing: boolean; fullscreen: boolean }) => cb(a);
    ipcRenderer.on('mate:activity', l as never);
    return () => ipcRenderer.removeListener('mate:activity', l as never);
  },
  ask: (prompt, system, geminiKey, routerKey) => ipcRenderer.invoke('ai:ask', prompt, system, geminiKey, routerKey),
  spotifySearch: (query) => ipcRenderer.send('mate:spotify-search', query),
};

contextBridge.exposeInMainWorld('mate', api);