import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MediaInfo } from '../../preload/index';
import {
  CHECKINS, GREETINGS, GUESS_WINS, JOKES, PRAISE_LINES, SCOLD_LINES,
  daypart, loadSettings, runSkills, saveSettings, situationalLine, varied,
  type MateSettings, type PetType
} from './brain';
import { CHANNELS, bus } from './PetStage';

interface Message { from: 'cine' | 'you'; text: string }
interface Scores { gw: number; w: number; l: number; d: number }

const SCORE_KEY = 'cinemate-scores-v1';
const NOTES_KEY = 'cinemate-notes-v1';

const loadJSON = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...(JSON.parse(raw) as object) } as T : fallback;
  } catch {
    return fallback;
  }
};

const notes = () => {
  try {
    const p = JSON.parse(localStorage.getItem(NOTES_KEY) || '[]');
    return Array.isArray(p) ? p.filter((n): n is string => typeof n === 'string') : [];
  } catch {
    return [];
  }
};

export default function HubStage() {
  const [settings, setSettings] = useState<MateSettings>(loadSettings);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'chat' | 'pet' | 'settings'>('chat');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const [pomoLeft, setPomoLeft] = useState(0);
  const [nowPlaying, setNowPlaying] = useState<MediaInfo | null>(null);
  const [voices, setVoices] = useState<Array<{ uri: string; name: string }>>([]);
  const [ghost, setGhost] = useState(false);

  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const pomoRef = useRef(0);
  pomoRef.current = pomoLeft;
  const timers = useRef<number[]>([]);
  const jokeLast = useRef(-1);
  const guessRef = useRef<{ target: number; tries: number; lastDiff: number } | null>(null);
  const rpsRef = useRef(false);
  const scoresRef = useRef<Scores>(loadJSON<Scores>(SCORE_KEY, { gw: 0, w: 0, l: 0, d: 0 }));
  const trackRef = useRef<string | null>(null);
  const idleSince = useRef(Date.now());

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  const bump = (patch: Partial<Scores>) => {
    scoresRef.current = { ...scoresRef.current, ...patch };
    try { localStorage.setItem(SCORE_KEY, JSON.stringify(scoresRef.current)); } catch { /* ignore */ }
  };

  useEffect(() => {
    saveSettings(settings);
    bus.emit('cinemate-config', { pet: settings.pet, petName: settings.petName });
    window.mate.setIdleAfter(settings.sleepMin <= 0 ? 0 : settings.sleepMin * 60_000);
  }, [settings]);

  useEffect(() => { void window.mate.getClickThrough().then(setGhost); }, []);
  useEffect(() => window.mate.onHubState(setOpen), []);
  useEffect(() => {
    const g = varied(GREETINGS[daypart(new Date().getHours())], { current: -1 });
    const n = settingsRef.current.userName ? `, ${settingsRef.current.userName}` : '';
    setMessages([{ from: 'cine', text: `${g}${n} I am ${settingsRef.current.petName}. Type "help" for everything I can do.` }]);
  }, []);

  useEffect(() => {
    const defaults = ['Zira', 'Hazel', 'Susan', 'Sonia', 'Vicki', 'Libby', 'Aria', 'Jenny', 'Microsoft David'];
    setVoices(defaults.map((n) => ({ uri: n, name: n })));
  }, []);

  const speak = useCallback((text: string) => {
    if (!settingsRef.current.voice) return;
    window.mate.speak(text, settingsRef.current.voiceURI);
  }, []);

  const say = useCallback((text: string) => {
    setMessages((prev) => [...prev, { from: 'cine', text }]);
    speak(text);
  }, [speak]);
  const pokeSay = useCallback((text: string) => {
    bus.emit(CHANNELS.bubble, text);
  }, []);

  // Proactive: idle nudges, check-ins, and now-playing awareness.
  useEffect(() => {
    const beat = window.setInterval(() => {
      void window.mate.nowPlaying().then((info) => {
        setNowPlaying(info);
        const label = info ? (info.playing ? `${info.artist ? `${info.artist} — ` : ''}${info.title}` : `${info.title} (paused)`) : null;
        bus.emit(CHANNELS.now, label);
        if (!info) { trackRef.current = null; return; }
        if (trackRef.current !== null && trackRef.current !== label && !open) {
          bus.emit(CHANNELS.mood, 'curious');
        }
        trackRef.current = label;
      }).catch(() => setNowPlaying(null));

      if (idleSince.current && Date.now() - idleSince.current > 50 * 60_000) {
        window.mate.notify(settingsRef.current.petName, '50 minutes nonstop — stretch break!');
        pokeSay('50 min grind… stretch!');
        idleSince.current = Date.now();
      }
      if (!open && Math.random() < 0.5) {
        pokeSay(Math.random() < 0.5
          ? situationalLine({ nowPlaying, pomoLeft: pomoRef.current, hour: new Date().getHours(), petName: settingsRef.current.petName })
          : varied(CHECKINS, jokeLast));
      }
    }, 30000);
    return () => window.clearInterval(beat);
  }, [open, pokeSay]);

  useEffect(() => window.mate.onIdle((idle) => {
    if (idle) idleSince.current = Date.now();
    else {
      idleSince.current = 0;
      pokeSay(situationalLine({
        nowPlaying, pomoLeft: pomoRef.current, hour: new Date().getHours(),
        petName: settingsRef.current.petName
      }));
      bus.emit(CHANNELS.action, 'wake');
    }
  }), [pokeSay, nowPlaying]);

  useEffect(() => {
    if (pomoLeft <= 0) return;
    if (pomoLeft === 1) {
      window.mate.notify(settingsRef.current.petName, 'Pomodoro done — stretch!');
      say('Ding! Pomodoro complete. Proud of you.');
    }
    const t = window.setTimeout(() => setPomoLeft((v) => v - 1), 1000);
    return () => window.clearTimeout(t);
  }, [pomoLeft, say]);

  const patch = (p: Partial<MateSettings>) => setSettings((prev) => ({ ...prev, ...p }));

  const reply = (text: string) => {
    const raw = text.trim();
    if (!raw) return;
    const q = raw.toLowerCase();
    setMessages((prev) => [...prev, { from: 'you', text: raw }]);
    setInput('');
    window.setTimeout(() => {
      const game = guessRef.current;
      if (game && !/(stop|quit|give up|play rock|score)/.test(q)) {
        const n = Number(q.match(/\b(\d{1,2})\b/)?.[1]);
        if (Number.isFinite(n) && n >= 1 && n <= 20) {
          game.tries++;
          const diff = Math.abs(n - game.target);
          if (diff === 0) {
            guessRef.current = null;
            bump({ gw: scoresRef.current.gw + 1 });
            say(`${varied(GUESS_WINS, jokeLast)} In ${game.tries} tries!`);
            bus.emit(CHANNELS.mood, 'love');
            bus.emit(CHANNELS.action, 'dance');
          } else if (game.tries >= 6) {
            guessRef.current = null;
            say(`Out of tries — it was ${game.target}. Rematch?`);
          } else {
            const hint = diff < game.lastDiff ? 'Warmer' : diff > game.lastDiff ? 'Colder' : 'Same';
            game.lastDiff = diff;
            say(`${hint}. ${n < game.target ? 'Go higher' : 'Go lower'}. (${6 - game.tries} left)`);
          }
          return;
        }
      }
      if (rpsRef.current && /(rock|paper|scissors)/.test(q)) {
        rpsRef.current = false;
        const mine = (['rock', 'paper', 'scissors'] as const)[Math.floor(Math.random() * 3)];
        const pick = q.includes('rock') ? 'rock' : q.includes('paper') ? 'paper' : 'scissors';
        const beats: Record<string, string> = { rock: 'scissors', paper: 'rock', scissors: 'paper' };
        if (mine === pick) { bump({ d: scoresRef.current.d + 1 }); say(`${mine} both — draw!`); }
        else if (beats[pick] === mine) { bump({ w: scoresRef.current.w + 1 }); say(`I threw ${mine}. You win — graceful loser, me.`); bus.emit(CHANNELS.mood, 'sad'); }
        else { bump({ l: scoresRef.current.l + 1 }); say(`I threw ${mine} — victory is mine!`); bus.emit(CHANNELS.mood, 'love'); bus.emit(CHANNELS.action, 'dance'); }
        return;
      }
      const dj = (action: string, lines: [string, string]) => { window.mate.media(action); say(varied(lines, jokeLast)); };
      if (/(next|skip).*(song|track|music)/.test(q) || /^(next|skip)$/.test(q)) { dj('next', ['Skipped!', 'Next track, coming right up.']); return; }
      if (/(previous|rewind|last).*(song|track|music)/.test(q) || q === 'previous') { dj('prev', ['Rewinding.', 'Encore, please.']); return; }
      if (/pause/.test(q) || /resume/.test(q) || /unpause/.test(q) || q === 'play') { dj('playpause', ['Toggled play/pause.', 'Beat controlled.']); return; }
      if (/stop.*(music|song|spotify|play)/.test(q)) { dj('stop', ['Stopped.', 'Silence.']); return; }
      if (/(volume up|louder|turn it up)/.test(q)) { dj('volup', ['Louder!', 'Turning it up.']); return; }
      if (/(volume down|quieter|turn it down|lower the volume)/.test(q)) { dj('voldown', ['Softer.', 'Cozy volume.']); return; }
      if (/mute/.test(q) || /unmute/.test(q)) { dj('mute', ['Shhh.', 'Muted.']); return; }

      if (/(what'?s playing|what song|now playing|current (song|track)|what music)/.test(q)) {
        void window.mate.nowPlaying().then((info) => {
          if (!info) say('Nothing is playing that Windows can see right now.');
          else say(`${info.playing ? 'Now playing' : 'Paused'}: ${info.artist} — ${info.title} (via ${info.app}).`);
        });
        return;
      }
      const playObj = q.match(/^play\s+(.+)/);
      if (playObj && !/(rock|paper|scissors|game|guess|number)/.test(playObj[1])) {
        const target = playObj[1].replace(/\s+on\s+(spotify|youtube)$/, '').trim();
        if (/youtube/.test(playObj[1])) window.mate.openUrl(`https://www.youtube.com/results?search_query=${encodeURIComponent(target)}`);
        else window.mate.spotifySearch(target);
        say(`Queued “${target}” on ${/youtube/.test(playObj[1]) ? 'YouTube' : 'Spotify'} — pick and play.`);
        return;
      }
      if (/(open|play|start) spotify/.test(q)) { window.mate.spotify('open'); say('Opening Spotify and hitting play.'); return; }
      if (/(close|quit|kill|exit|stop) spotify/.test(q)) { window.mate.spotify('close'); say('Spotify closed.'); return; }
      if (/(google|search)(?: for)?\s+(.+)/.test(q)) { window.mate.openUrl(`https://www.google.com/search?q=${encodeURIComponent(q.replace(/^(google|search)(?: for)?\s+/, ''))}`); say('Googling it.'); return; }
      const yt = q.match(/^youtube\s+(.+)/);
      if (yt) { window.mate.openUrl(`https://www.youtube.com/results?search_query=${encodeURIComponent(yt[1])}`); say('YouTube it is.'); return; }
      const folder = q.match(/open(?: my)? (downloads|documents|desktop|pictures)(?: folder)?/);
      if (folder) { window.mate.openFolder(folder[1]); say(`Opening ${folder[1]}.`); return; }
      if (/lock (?:my |the )?(?:pc|computer|screen|windows)/.test(q)) { window.mate.lock(); say('Locking up.'); return; }
      if (/(minimi[sz]e|hide) (?:this|the|my)? ?window/.test(q)) { window.mate.window('minimize'); say('Tucked away.'); return; }
      if (/(close|quit|kill|exit) (?:this|the|my)? ?window/.test(q)) { window.mate.window('close'); say('Closed. Gone but not forgotten.'); return; }
      if (/(maximi[sz]e|full ?screen) (?:this|the)? ?window/.test(q)) { window.mate.window('maximize'); say('Big screen energy.'); return; }
      if (/(what|which) (?:window|app) am i using/.test(q)) { window.mate.window('list'); say('Checked the focused window.'); return; }
      if (/(battery|power|how much (?:ram|memory)|system status|pc status|performance)/.test(q)) {
        void window.mate.sysinfo().then((info) => {
          const b = info.match(/BATTERY=(\d+)/)?.[1] ?? '?';
          const mem = info.match(/MEMORY=([\d.]+)\/([\d.]+)/)?.[0]?.replace('MEMORY=', '') ?? '?';
          const cpu = info.match(/CPU=(\d+)/)?.[1];
          say(`Battery ${b}%. Memory free ${mem} GB.${cpu ? ` CPU ${cpu}%.` : ''}`);
        });
        return;
      }
      if (/(screenshot|screen ?shot|snap\b|capture (?:my )?screen)/.test(q)) {
        void window.mate.screenshot().then((f) => say(f ? 'Snapped — saved in Pictures.' : 'Screenshot failed.'));
        return;
      }
      const note = q.match(/^(?:note|remember|jot down)(?: that)?\s+(.+)/);
      if (note) {
        const list = [...notes(), note[1].trim()];
        try { localStorage.setItem(NOTES_KEY, JSON.stringify(list.slice(-50))); } catch { /* ignore */ }
        say(`Noted (${list.length} on the pad). "my notes" to recap.`);
        return;
      }
      if (/^(my notes|show notes|list notes|read my notes)/.test(q)) {
        const list = notes();
        say(list.length ? `Pad: ${list.map((n, i) => `${i + 1}. ${n}`).join(' ')}` : 'Pad is empty.');
        return;
      }
      if (/^(clear|forget|delete)(?: all)? notes/.test(q)) {
        try { localStorage.setItem(NOTES_KEY, '[]'); } catch { /* ignore */ }
        say('Wiped clean.');
        return;
      }
      if (/(play|start).*(guess|number game)|guessing game/.test(q)) {
        guessRef.current = { target: 1 + Math.floor(Math.random() * 20), tries: 0, lastDiff: 99 };
        say('Number between 1 and 20. Six guesses. Go!');
        return;
      }
      if (q.includes('rock paper') || (q.includes('play') && q.includes('scissors'))) { rpsRef.current = true; say('Rock, paper, or scissors?'); return; }
      if (/(score|record|trophy|wins)/.test(q)) {
        const s = scoresRef.current;
        say(`Trophies: ${s.gw} guessing wins · RPS ${s.w}W/${s.l}L/${s.d}D.`);
        return;
      }
      if (/(laugh|joke|funny|haha)/.test(q)) {
        bus.emit(CHANNELS.mood, 'laugh');
        say(`Ha! ${varied(JOKES, jokeLast)}`);
        return;
      }
      if (/(read (?:this|it|aloud|my clipboard|clipboard)|read to me)/.test(q)) {
        void (async () => {
          try {
            const t = (await navigator.clipboard.readText()).trim().slice(0, 300);
            say(t ? `Clipboard: “${t}”` : 'Clipboard is empty.');
          } catch {
            say('Cannot read the clipboard — paste it here instead.');
          }
        })();
        return;
      }
      const skill = runSkills(q, { petName: settingsRef.current.petName, userName: settingsRef.current.userName, pomoLeft: pomoRef.current });
      if (skill) {
        if (skill.setting) patch(skill.setting);
        if (skill.pomodoro !== undefined) setPomoLeft(skill.pomodoro < 0 ? 0 : skill.pomodoro * 60);
        if (skill.reminder) {
          const { mins, what } = skill.reminder;
          window.setTimeout(() => window.mate.notify(`${settingsRef.current.petName} reminder`, what), mins * 60000);
        }
        if (skill.action === 'dance') bus.emit(CHANNELS.action, 'dance');
        else if (skill.action === 'sing') bus.emit(CHANNELS.action, 'sing');
        else if (skill.action === 'sleep') bus.emit(CHANNELS.action, 'sleep');
        else if (skill.action === 'wake') bus.emit(CHANNELS.action, 'wake');
        if (/notepad/.test(q)) window.mate.launch('notepad');
        if (/calculat/.test(q)) window.mate.launch('calculator');
        if (/paint/.test(q)) window.mate.launch('paint');
        if (/terminal/.test(q)) window.mate.launch('terminal');
        if (/cine-?verse/.test(q)) window.mate.openSite();
        if (skill.mood === 'love') { say(varied(PRAISE_LINES, jokeLast)); bus.emit(CHANNELS.mood, 'love'); bus.emit(CHANNELS.action, 'dance'); return; }
        if (skill.mood === 'sad') { say(varied(SCOLD_LINES, jokeLast)); bus.emit(CHANNELS.mood, 'sad'); return; }
        if (skill.text) { say(skill.text); bus.emit(CHANNELS.bubble, skill.text.slice(0, 60)); }
        return;
      }
      setTyping(true);
      bus.emit(CHANNELS.thinking, true);
      const system = `You are ${settingsRef.current.petName}, a tiny desktop robot pet living on the user's Windows screen. Cheerful, playful, a little cheeky. Reply in 1-2 short sentences, plain text, no emojis. The user's name is ${settingsRef.current.userName || 'human'}. Never claim to browse the web or run code.`;
      void window.mate.ask(raw, system)
        .then((cloud) => say(cloud || 'My big brain is offline right now — I still do music, reminders, games, folders and screenshots.'))
        .catch(() => say('Brain offline. Local tricks still work.'))
        .finally(() => { setTyping(false); bus.emit(CHANNELS.thinking, false); });
    }, 260);
  };

  const park = useCallback((text: string) => {
    bus.emit(CHANNELS.bubble, text);
  }, []);

  const nowPlayingLine = useMemo(
    () => (nowPlaying ? `${nowPlaying.playing ? '♪' : '❚❚'} ${nowPlaying.artist ? `${nowPlaying.artist} — ` : ''}${nowPlaying.title}` : null),
    [nowPlaying]
  );

  if (!open) {
    return (
      <div className="stage hub-collapsed">
        <button type="button" className="hub-fab" onClick={() => window.mate.hubToggle(true)} aria-label="Open Cine chat" title="Open Cine chat">
          <span aria-hidden="true"><i /><i /><i /></span>
        </button>
      </div>
    );
  }

  return (
    <div className="stage hub-open">
      <section className="chat" aria-label={`Chat with ${settings.petName}`}>
        <header className="dragzone" onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest('button')) return;
          const ox = e.screenX - e.clientX;
          const oy = e.screenY - e.clientY;
          const move = (ev: PointerEvent) => window.mate.moveHub(ev.screenX - ox, ev.screenY - oy);
          const up = () => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
          };
          window.addEventListener('pointermove', move);
          window.addEventListener('pointerup', up);
        }}>
          <span className="chat-dot" aria-hidden="true" />
          <div>
            <strong>{settings.petName}</strong>
            <small>{nowPlayingLine ?? (pomoLeft > 0 ? `focus ${Math.floor(pomoLeft / 60)}:${String(pomoLeft % 60).padStart(2, '0')}` : 'screen companion')}</small>
          </div>
          <button type="button" onClick={() => window.mate.hubToggle(false)} aria-label="Collapse chat">–</button>
        </header>
        <nav className="tabs" aria-label="Panels">
          {(['chat', 'pet', 'settings'] as const).map((t) => (
            <button key={t} type="button" className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>{t}</button>
          ))}
        </nav>
        {tab === 'chat' && (
          <>
            <div className="log" role="log" aria-live="polite">
              {messages.map((m, i) => <p key={i} className={m.from}>{m.text}</p>)}
              {typing && <p className="cine typing" aria-label="thinking"><span /><span /><span /></p>}
            </div>
            <div className="chips">
              {['What is playing', 'Pomodoro 25', 'Help', 'Tell me a joke'].map((c) => (
                <button key={c} type="button" onClick={() => reply(c)}>{c}</button>
              ))}
            </div>
            <form onSubmit={(e) => { e.preventDefault(); reply(input); }}>
              <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={`Ask ${settings.petName}…`} autoComplete="off" aria-label="Ask" />
              <button type="submit" aria-label="Send">Send</button>
            </form>
          </>
        )}
        {tab === 'pet' && (
          <div className="panel">
            <label>Pet name<input value={settings.petName} maxLength={16} onChange={(e) => patch({ petName: e.target.value.trim() || 'Cine' })} /></label>
            <label>Your name<input value={settings.userName} maxLength={20} placeholder="so I greet you" onChange={(e) => patch({ userName: e.target.value.trim() })} /></label>
            <span className="row-label">Species</span>
            <div className="seg">{(['robot', 'cat', 'blob'] as PetType[]).map((p) => (
              <button key={p} type="button" className={settings.pet === p ? 'active' : ''} onClick={() => { patch({ pet: p }); park(`I am a ${p} now!`); }}>{p}</button>
            ))}</div>
            <span className="row-label">Glow</span>
            <div className="swatches">{(['gold', 'cyan', 'pink', 'green'] as const).map((t) => (
              <button key={t} className={`sw ${t}${settings.theme === t ? ' active' : ''}`} onClick={() => patch({ theme: t })} aria-label={`${t} glow`} />
            ))}</div>
            <span className="row-label">Size</span>
            <div className="seg">{(['S', 'M', 'L'] as const).map((s) => (
              <button key={s} type="button" className={settings.size === s ? 'active' : ''} onClick={() => patch({ size: s })}>{s}</button>
            ))}</div>
          </div>
        )}
        {tab === 'settings' && (
          <div className="panel">
            <label className="check"><input type="checkbox" checked={settings.wander} onChange={(e) => patch({ wander: e.target.checked })} /> Wander the screen</label>
            <label>Sleep after idle
              <select value={settings.sleepMin} onChange={(e) => patch({ sleepMin: Number(e.target.value) })}>
                <option value={0}>Never</option><option value={5}>5 min</option><option value={10}>10 min</option><option value={30}>30 min</option>
              </select>
            </label>
            <label className="check"><input type="checkbox" checked={settings.voice} onChange={(e) => patch({ voice: e.target.checked })} /> Voice replies (female preferred)</label>
            {settings.voice && voices.length > 0 && (
              <label>Voice
                <select value={settings.voiceURI} onChange={(e) => patch({ voiceURI: e.target.value })}>
                  <option value="">Auto (female preferred)</option>
                  {voices.map((v) => <option key={v.uri} value={v.uri}>{v.name}</option>)}
                </select>
              </label>
            )}
            <label className="check"><input type="checkbox" checked={ghost} onChange={(e) => { setGhost(e.target.checked); window.mate.setClickThrough(e.target.checked); }} /> Ghost mode (pet never blocks clicks · Ctrl+Alt+M)</label>
            <label className="check"><input type="checkbox" checked={settings.login} onChange={(e) => { patch({ login: e.target.checked }); window.mate.setLogin(e.target.checked); }} /> Start with Windows</label>
            <button type="button" className="quit" onClick={() => window.mate.quit()}>Quit CineMate</button>
          </div>
        )}
      </section>
    </div>
  );
}