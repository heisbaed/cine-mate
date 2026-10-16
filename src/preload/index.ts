import { contextBridge, ipcRenderer } from 'electron';
import type { AIReply, ChatTurn } from '../main/ai';

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
export interface SpeechEvent { state: string; text?: string; error?: string; direct?: boolean; manual?: boolean; enabled?: boolean }

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
  onClickThrough: (callback: (enabled: boolean) => void) => () => void;
  setIdleAfter: (ms: number) => void;
  launch: (app: string) => void;
  media: (action: string) => void;
  spotify: (action: 'open' | 'close') => void;
  nowPlaying: () => Promise<MediaInfo | null>;
  speak: (text: string, voice: string, rate?: number, mood?: string) => Promise<{ error?: string }>;
  listen: (enabled: boolean) => Promise<SpeechEvent>;
  captureSpeech: () => Promise<SpeechEvent>;
  armSpeech: () => void;
  onSpeech: (callback: (event: SpeechEvent) => void) => () => void;
  playSong: (query: string) => Promise<{ playing: boolean; title?: string; error?: string }>;
  voices: () => Promise<Array<{ uri: string; name: string }>>;
  timerAlert: () => Promise<{ error?: string }>;
  setCinemaMode: (value: boolean) => void;
  setDragging: (value: boolean) => void;
  setPetInset: (value: number) => void;
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
  ask: (turns: ChatTurn[], system: string, geminiKey: string) => Promise<AIReply>;
  testAI: (geminiKey: string) => Promise<string>;
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
  onClickThrough: callback => {
    const listener = (_event: unknown, enabled: boolean) => callback(enabled);
    ipcRenderer.on('mate:click-through-state', listener);
    return () => { ipcRenderer.removeListener('mate:click-through-state', listener); };
  },
  setIdleAfter: (ms) => ipcRenderer.send('mate:idle-after', ms),
  launch: (name) => ipcRenderer.send('mate:launch', name),
  media: (action) => ipcRenderer.send('mate:media', action),
  spotify: (action) => ipcRenderer.send('mate:spotify', action),
  nowPlaying: () => ipcRenderer.invoke('mate:now-playing'),
  speak: (text, voice, rate, mood) => ipcRenderer.invoke('mate:speak', text, voice, rate, mood),
  listen: enabled => ipcRenderer.invoke('mate:listen', enabled),
  captureSpeech: () => ipcRenderer.invoke('mate:capture-speech'),
  armSpeech: () => ipcRenderer.send('mate:arm-speech'),
  onSpeech: callback => {
    const listener = (_e: unknown, event: SpeechEvent) => callback(event);
    ipcRenderer.on('mate:speech', listener);
    return () => { ipcRenderer.removeListener('mate:speech', listener); };
  },
  playSong: query => ipcRenderer.invoke('mate:play-song', query),
  voices: () => ipcRenderer.invoke('mate:voices'),
  timerAlert: () => ipcRenderer.invoke('mate:timer-alert'),
  setCinemaMode: value => ipcRenderer.send('mate:cinema-mode', value),
  setDragging: value => ipcRenderer.send('mate:dragging', value),
  setPetInset: value => ipcRenderer.send('mate:pet-inset', value),
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
  ask: (turns, system, geminiKey) => ipcRenderer.invoke('ai:ask', turns, system, geminiKey),
  testAI: (geminiKey) => ipcRenderer.invoke('ai:test', geminiKey),
  spotifySearch: (query) => ipcRenderer.send('mate:spotify-search', query),
};

contextBridge.exposeInMainWorld('mate', api);
