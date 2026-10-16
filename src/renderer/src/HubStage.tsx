import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import cineIcon from '../../../assets/cine.svg';
import type { MediaInfo } from '../../preload/index';
import {
  ACCESSORIES, CHECKINS, GREETINGS, GUESS_WINS, JOKES, PRAISE_LINES, SCOLD_LINES,
  daypart, loadSettings, recordGreeting, recordMessage, runSkills, saveSettings,
  situationalLine, varied, type MateSettings, type PetType
} from './brain';
import { CHANNELS, bus } from './PetStage';
import type { FaceDisplay } from './CineCharacter';
import CompanionTools from './CompanionTools';
import { speechMood, wakeCommand } from './voiceIntent';

interface Message { from: 'cine' | 'you'; text: string; error?: boolean; retryable?: boolean; detail?: string }
interface ChatRequest { turns: Array<{ role: 'user' | 'model'; text: string }>; system: string }
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
  const [tab, setTab] = useState<'chat' | 'tools' | 'pet' | 'settings'>('chat');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const [aiStatus, setAiStatus] = useState('Your desktop companion');
  const pending = useRef(false);
  const musicPending = useRef(false);
  const lastRequest = useRef<ChatRequest | null>(null);
  const logEnd = useRef<HTMLDivElement>(null);
  useEffect(() => { logEnd.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, typing, open, tab]);
  const [pomoLeft, setPomoLeft] = useState(0);
  const [timerMode, setTimerMode] = useState<'timer' | 'focus' | 'break' | null>(null);
  const [timerPaused, setTimerPaused] = useState(false);
  const [timerVersion, setTimerVersion] = useState(0);
  const [stopwatchMs, setStopwatchMs] = useState(0);
  const [stopwatchRunning, setStopwatchRunning] = useState(false);
  const stopwatchStarted = useRef(0);
  const stopwatchSaved = useRef(0);
  const [clockNow, setClockNow] = useState(Date.now());
  const [counterDisplay, setCounterDisplay] = useState<FaceDisplay | null>(null);
  const timerTotal = useRef(0);
  const timerDeadline = useRef(0);
  const [nowPlaying, setNowPlaying] = useState<MediaInfo | null>(null);
  const [voices, setVoices] = useState<Array<{ uri: string; name: string }>>([]);
  const [voiceStatus, setVoiceStatus] = useState('');
  const [voiceTesting, setVoiceTesting] = useState(false);
  const [timerSoundStatus, setTimerSoundStatus] = useState('');
  const [microphoneState, setMicrophoneState] = useState('starting');
  const [microphoneOn, setMicrophoneOn] = useState(false);
  const [microphoneError, setMicrophoneError] = useState('');
  const voiceAwakeUntil = useRef(0);
  const replyRef = useRef<(text: string) => void>(() => {});
  const voiceTurn = useRef(false);
  const voiceTimeout = useRef<number>();
  const [ghost, setGhost] = useState(false);
  const [aiTest, setAiTest] = useState<string | null>(null);

  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const pomoRef = useRef(0);
  pomoRef.current = pomoLeft;
  const timers = useRef<number[]>([]);
  const jokeLast = useRef(-1);
  const guessRef = useRef<{ target: number; tries: number; lastDiff: number } | null>(null);
  const rpsRef = useRef(false);
  const scoresRef = useRef<Scores>(loadJSON<Scores>(SCORE_KEY, { gw: 0, w: 0, l: 0, d: 0 }));
  const idleSince = useRef(Date.now());

  const startTimer = useCallback((seconds: number, mode: 'timer' | 'focus' | 'break' = 'timer') => {
    const duration = Math.max(1, Math.min(86400, Math.ceil(seconds)));
    timerTotal.current = duration;
    timerDeadline.current = Date.now() + duration * 1000;
    setCounterDisplay(null);
    setTimerPaused(false);
    setPomoLeft(duration);
    setTimerMode(mode);
    setTimerVersion(v => v + 1);
  }, []);

  const cancelTimer = () => {
    timerDeadline.current = 0;
    setPomoLeft(0);
    setTimerMode(null);
    setTimerPaused(false);
    setCounterDisplay(null);
  };

  const toggleTimerPause = () => {
    if (pomoRef.current <= 0) return;
    if (timerPaused) timerDeadline.current = Date.now() + pomoRef.current * 1000;
    else setPomoLeft(Math.max(1, Math.ceil((timerDeadline.current - Date.now()) / 1000)));
    setTimerPaused(v => !v);
  };

  const extendTimer = (seconds: number) => {
    if (pomoRef.current <= 0) return;
    timerTotal.current += seconds;
    timerDeadline.current += seconds * 1000;
    setPomoLeft(v => v + seconds);
    setTimerVersion(v => v + 1);
  };

  const toggleStopwatch = () => {
    if (stopwatchRunning) {
      stopwatchSaved.current += Date.now() - stopwatchStarted.current;
      setStopwatchMs(stopwatchSaved.current);
    } else stopwatchStarted.current = Date.now();
    setStopwatchRunning(v => !v);
  };

  useEffect(() => {
    if (!stopwatchRunning) return;
    const tick = () => setStopwatchMs(stopwatchSaved.current + Date.now() - stopwatchStarted.current);
    const interval = window.setInterval(tick, 250);
    return () => window.clearInterval(interval);
  }, [stopwatchRunning]);

  useEffect(() => {
    if (!settings.faceClock) return;
    setClockNow(Date.now());
    const interval = window.setInterval(() => setClockNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [settings.faceClock]);

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  const bump = (patch: Partial<Scores>) => {
    scoresRef.current = { ...scoresRef.current, ...patch };
    try { localStorage.setItem(SCORE_KEY, JSON.stringify(scoresRef.current)); } catch { /* ignore */ }
  };

  useEffect(() => {
    saveSettings(settings);
    bus.emit('cinemate-config', { pet: settings.pet, petName: settings.petName, wander: settings.wander, theme: settings.theme, size: settings.size, stayPut: settings.stayPut, quietCompanion: settings.quietCompanion, autoDayNight: settings.autoDayNight, accessory: settings.accessory, headphoneColor: settings.headphoneColor });
    window.mate.setIdleAfter(settings.sleepMin <= 0 ? 0 : settings.sleepMin * 60_000);
    window.mate.setCinemaMode(settings.cinemaMode);
  }, [settings]);

  useEffect(() => { void window.mate.getClickThrough().then(setGhost); }, []);
  useEffect(() => window.mate.onClickThrough(setGhost), []);
  useEffect(() => window.mate.onHubState(setOpen), []);
  useEffect(() => {
    recordGreeting();
    const g = varied(GREETINGS[daypart(new Date().getHours())], { current: -1 });
    const n = settingsRef.current.userName ? `, ${settingsRef.current.userName}` : '';
    setMessages([{ from: 'cine', text: `${g}${n} I am ${settingsRef.current.petName}. Type "help" for everything I can do.` }]);
  }, []);

  useEffect(() => {
    void window.mate.voices().then(setVoices).catch(() => setVoiceStatus('Could not load Windows voices.'));
  }, []);

  useEffect(() => {
    const off = window.mate.onSpeech(event => {
      if (typeof event.enabled === 'boolean') setMicrophoneOn(event.enabled);
      if (event.state === 'heard' && event.text) {
        bus.emit(CHANNELS.thinking, false);
        if (pending.current) return;
        const intent = wakeCommand(event.text, event.direct ? Infinity : voiceAwakeUntil.current);
        if (!intent) return;
        window.clearTimeout(voiceTimeout.current);
        if (intent.command) {
          voiceTurn.current = true;
          voiceAwakeUntil.current = 0;
          setMicrophoneState('ready');
          bus.emit('cinemate-listening', false);
          replyRef.current(intent.command);
        } else {
          window.mate.armSpeech();
          voiceAwakeUntil.current = Date.now() + 12000;
          setMicrophoneState('listening');
          setMicrophoneError('');
          window.mate.hubToggle(true);
          bus.emit(CHANNELS.action, 'wake');
          bus.emit(CHANNELS.bubble, 'I’m listening. What would you like?');
          bus.emit('cinemate-listening', true);
          voiceTimeout.current = window.setTimeout(() => {
            voiceAwakeUntil.current = 0; setMicrophoneState('ready'); bus.emit('cinemate-listening', false);
          }, 12000);
        }
      } else if (event.state === 'listening') {
        voiceAwakeUntil.current = Date.now() + 12000;
        setMicrophoneState('listening');
        setMicrophoneError('');
        bus.emit('cinemate-listening', true);
        bus.emit(CHANNELS.action, 'wake');
        bus.emit(CHANNELS.bubble, 'Recording. Click the mic again to send.');
        window.clearTimeout(voiceTimeout.current);
        if (!event.manual) voiceTimeout.current = window.setTimeout(() => {
          setMicrophoneState('ready'); bus.emit('cinemate-listening', false);
        }, 12000);
      } else {
        if (event.state === 'starting') bus.emit(CHANNELS.bubble, 'Opening microphone. Wait for the recording cue.');
        if (event.state === 'finishing' || event.state === 'transcribing') {
          bus.emit(CHANNELS.thinking, true);
          bus.emit(CHANNELS.bubble, 'Understanding what you said...');
        }
        if (event.state === 'error' || event.state === 'no-speech') {
          bus.emit(CHANNELS.thinking, false);
          bus.emit(CHANNELS.bubble, event.error || 'I did not hear clear words. Please try again.');
          setMessages(prev => [...prev, { from: 'cine', text: event.error || 'I did not hear clear words. Please try again.', error: true }]);
        }
        if (event.state === 'transcribing') window.clearTimeout(voiceTimeout.current);
        setMicrophoneState(event.state);
        setMicrophoneError(event.error || '');
        if (event.state !== 'ready') { voiceAwakeUntil.current = 0; bus.emit('cinemate-listening', false); }
      }
    });
    return () => { off(); window.clearTimeout(voiceTimeout.current); };
  }, []);

  useEffect(() => {
    void window.mate.listen(false).then(status => {
      setMicrophoneOn(false);
      setMicrophoneState(status.state);
      setMicrophoneError(status.error || '');
    }).catch(() => { setMicrophoneState('error'); setMicrophoneError('Microphone listening could not start.'); });
  }, []);

  const speak = useCallback((text: string) => {
    const continueConversation = () => {
      if (!voiceTurn.current) return;
      voiceTurn.current = false;
      window.mate.armSpeech();
    };
    if (!settingsRef.current.voice) { continueConversation(); return; }
    const mood = settingsRef.current.expressiveVoice ? settingsRef.current.voiceMood === 'auto' ? speechMood(text) : settingsRef.current.voiceMood : 'plain';
    void window.mate.speak(text, settingsRef.current.voiceURI, settingsRef.current.voiceRate, mood).then(result => {
      setVoiceStatus(result.error || '');
    }).catch(() => setVoiceStatus('Voice playback could not start.')).finally(continueConversation);
  }, []);

  const say = useCallback((text: string) => {
    setMessages((prev) => [...prev, { from: 'cine', text }]);
    speak(text);
  }, [speak]);
  const pokeSay = useCallback((text: string) => {
    if (settingsRef.current.quietCompanion) return;
    bus.emit(CHANNELS.bubble, text);
  }, []);

  useEffect(() => {
    let alive = true;
    let busy = false;
    const check = async () => {
      if (busy) return;
      busy = true;
      try {
        const info = await window.mate.nowPlaying();
        if (alive) {
          setNowPlaying(info);
          bus.emit(CHANNELS.now, info);
        }
      } catch {
        if (alive) { setNowPlaying(null); bus.emit(CHANNELS.now, null); }
      } finally { busy = false; }
    };
    void check();
    const interval = window.setInterval(() => { void check(); }, 1500);
    return () => { alive = false; window.clearInterval(interval); };
  }, []);

  useEffect(() => {
    const seconds = Math.max(0, Math.ceil(pomoLeft));
    const hours = Math.floor(seconds / 3600);
    const value = hours > 0
      ? `${hours}:${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
      : `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    const stopwatchSeconds = Math.floor(stopwatchMs / 1000);
    const stopwatchValue = stopwatchSeconds >= 3600
      ? `${Math.floor(stopwatchSeconds / 3600)}:${String(Math.floor(stopwatchSeconds / 60) % 60).padStart(2, '0')}:${String(stopwatchSeconds % 60).padStart(2, '0')}`
      : `${String(Math.floor(stopwatchSeconds / 60)).padStart(2, '0')}:${String(stopwatchSeconds % 60).padStart(2, '0')}`;
    const clock = new Date(clockNow);
    const clockDisplay = settings.faceClock ? { label: 'LOCAL TIME', value: `${String(clock.getHours()).padStart(2, '0')}:${String(clock.getMinutes()).padStart(2, '0')}`, progress: clock.getSeconds() / 60 } : null;
    const stopwatchDisplay = stopwatchRunning || stopwatchMs > 0 ? { label: stopwatchRunning ? 'STOPWATCH' : 'PAUSED', value: stopwatchValue, progress: (stopwatchSeconds % 60) / 60 } : null;
    bus.emit(CHANNELS.display, seconds > 0 ? {
      label: timerPaused ? 'PAUSED' : timerMode === 'focus' ? 'FOCUS' : timerMode === 'break' ? 'BREAK' : 'TIMER', value,
      progress: seconds / Math.max(1, timerTotal.current), urgent: seconds <= 10
    } : counterDisplay && (!counterDisplay.expiresAt || counterDisplay.expiresAt > Date.now()) ? counterDisplay : stopwatchDisplay ?? clockDisplay);
  }, [pomoLeft, timerMode, timerPaused, counterDisplay, stopwatchMs, stopwatchRunning, settings.faceClock, clockNow]);

  useEffect(() => {
    if (!counterDisplay?.expiresAt) return;
    const timeout = window.setTimeout(() => setCounterDisplay(null), Math.max(0, counterDisplay.expiresAt - Date.now()));
    return () => window.clearTimeout(timeout);
  }, [counterDisplay]);

  // Proactive: idle nudges, check-ins, and now-playing awareness.
  useEffect(() => {
    const beat = window.setInterval(() => {
      if (settingsRef.current.quietCompanion) return;
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
    if (pomoLeft <= 0 || timerPaused) return;
    const t = window.setTimeout(() => {
      const left = Math.max(0, Math.ceil((timerDeadline.current - Date.now()) / 1000));
      setPomoLeft(left);
      if (left === 0) {
        setTimerMode(null);
        setCounterDisplay({ label: 'DONE', value: '00:00', progress: 1, expiresAt: Date.now() + 6000 });
        window.mate.notify(settingsRef.current.petName, timerMode === 'focus' ? 'Focus session complete — stretch!' : 'Your timer has finished.');
        if (settingsRef.current.timerSound) void window.mate.timerAlert().then(result => {
          if (result.error) say(`Timer finished. The alert could not play: ${result.error}`);
        }).catch(() => say('Timer finished. The alert could not play.'));
        say(timerMode === 'focus' ? 'Ding! Focus session complete. Proud of you.' : timerMode === 'break' ? 'Break finished. Ready for the next focus session.' : 'Ding! Time is up.');
        if (settingsRef.current.focusBreaks && timerMode === 'focus') startTimer(settingsRef.current.breakMinutes * 60, 'break');
        else if (settingsRef.current.focusBreaks && timerMode === 'break') startTimer(settingsRef.current.focusMinutes * 60, 'focus');
        else if (settingsRef.current.repeatTimer && timerMode === 'timer') startTimer(timerTotal.current, 'timer');
      }
    }, Math.min(1000, Math.max(10, timerDeadline.current - Date.now())));
    return () => window.clearTimeout(t);
  }, [pomoLeft, timerMode, timerPaused, timerVersion, say, startTimer]);

  const patch = (p: Partial<MateSettings>) => {
    settingsRef.current = { ...settingsRef.current, ...p };
    setSettings(settingsRef.current);
  };

  const requestAI = (request: ChatRequest) => {
    if (pending.current) return;
    lastRequest.current = request;
    pending.current = true;
    setTyping(true);
    setAiStatus('Connecting...');
    bus.emit(CHANNELS.thinking, true);
    void window.mate.ask(request.turns, request.system, settingsRef.current.geminiKey)
      .then(result => {
        if (result.text) {
          setAiStatus('Ready to chat');
          say(result.text);
          bus.emit(CHANNELS.bubble, result.text.slice(0, 90));
        } else {
          setAiStatus(result.retryable ? 'Temporarily unavailable' : 'Connection needs attention');
          setMessages(prev => [...prev, { from: 'cine', text: result.error || 'Gemini could not respond. Test the connection in Settings.', error: true, retryable: result.retryable, detail: result.detail }]);
        }
      })
      .catch(() => {
        setAiStatus('Temporarily unavailable');
        setMessages(prev => [...prev, { from: 'cine', text: 'Cine could not contact the AI service. Please try again.', error: true, retryable: true }]);
      })
      .finally(() => { pending.current = false; setTyping(false); bus.emit(CHANNELS.thinking, false); });
  };

  const reply = (text: string) => {
    const raw = text.trim();
    if (!raw || pending.current) return;
    pending.current = true;
    const q = raw.toLowerCase();
    setMessages((prev) => [...prev, { from: 'you', text: raw }]);
    recordMessage();
    setInput('');
    window.setTimeout(() => {
      pending.current = false;
      if (/^(pause|resume) (?:the )?timer[.!?]?$/.test(q)) {
        if (pomoRef.current <= 0) say('There is no timer running. Start one in Tools.');
        else {
          const pause = q.startsWith('pause');
          if (pause !== timerPaused) toggleTimerPause();
          say(pause ? 'Timer paused.' : 'Timer resumed.');
        }
        return;
      }
      const extra = q.match(/^add (\d+) (seconds?|minutes?) to (?:the )?timer[.!?]?$/);
      if (extra) {
        if (pomoRef.current <= 0) say('Start a timer first, then I can add more time.');
        else {
          extendTimer(Math.min(86400, Number(extra[1]) * (extra[2].startsWith('minute') ? 60 : 1)));
          say(`Added ${extra[1]} ${extra[2]} to your timer.`);
        }
        return;
      }
      if (/^(show|hide) (?:the )?(?:face )?clock[.!?]?$/.test(q)) {
        const on = q.startsWith('show');
        patch({ faceClock: on });
        say(on ? 'My face will show the local time when no timer is running.' : 'Clock off. Back to my usual face.');
        return;
      }
      const game = guessRef.current;
      if (game && !/(stop|quit|give up|play rock|score)/.test(q)) {
        const n = Number(q.match(/\b(\d{1,2})\b/)?.[1]);
        if (Number.isFinite(n) && n >= 1 && n <= 20) {
          game.tries++;
          setCounterDisplay({ label: 'GUESSES', value: `${game.tries}/6`, progress: game.tries / 6, expiresAt: Date.now() + 6000 });
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
      if (/^(pause|resume|unpause|play)(?: (?:the )?(music|song|track|playback))?[.!?]?$/.test(q)) { dj('playpause', ['Toggled play/pause.', 'Beat controlled.']); return; }
      if (/^stop(?: the)? (music|song|spotify|playback)[.!?]?$/.test(q)) { dj('stop', ['Stopped.', 'Silence.']); return; }
      if (/^(volume up|louder|turn it up)[.!?]?$/.test(q)) { dj('volup', ['Louder!', 'Turning it up.']); return; }
      if (/^(volume down|quieter|turn it down|lower the volume)[.!?]?$/.test(q)) { dj('voldown', ['Softer.', 'Cozy volume.']); return; }
      if (/^(unmute|mute)(?: (?:the )?(music|sound))?[.!?]?$/.test(q)) { dj('mute', ['Shhh.', 'Muted.']); return; }

      if (/(what'?s playing|what song|now playing|current (song|track)|what music)/.test(q)) {
        void window.mate.nowPlaying().then((info) => {
          if (!info) say('Nothing is playing that Windows can see right now.');
          else say(`${info.playing ? 'Now playing' : 'Paused'}: ${info.artist} — ${info.title} (via ${info.app}).`);
        });
        return;
      }
      const playObj = q.match(/^play\s+(.+)/);
      if (playObj && !/(rock|paper|scissors|game|guess|number)/.test(playObj[1])) {
        if (musicPending.current) { say('I am still starting your previous song.'); return; }
        const target = playObj[1].replace(/\s+on\s+(spotify|youtube)$/, '').trim();
        if (/\s+on\s+youtube$/.test(playObj[1])) {
          window.mate.openUrl(`https://www.youtube.com/results?search_query=${encodeURIComponent(target)}`);
          say('I opened YouTube results. Automatic song playback currently works with the Spotify desktop app.');
          return;
        }
        setAiStatus('Starting your song...');
        musicPending.current = true;
        void window.mate.playSong(target).then(result => {
          say(result.playing ? `Playing ${result.title || target}.` : result.error || 'I could not start that song. Please try another title.');
        }).catch(() => say('I could not start that song. Please try again.')).finally(() => { musicPending.current = false; setAiStatus('Ready to chat'); });
        return;
      }
      if (/(open|play|start) spotify/.test(q)) { window.mate.spotify('open'); say('Opening Spotify and hitting play.'); return; }
      if (/(close|quit|kill|exit|stop) spotify/.test(q)) { window.mate.spotify('close'); say('Spotify closed.'); return; }
      if (/^(google|search)(?: for)?\s+(.+)/.test(q)) { window.mate.openUrl(`https://www.google.com/search?q=${encodeURIComponent(q.replace(/^(google|search)(?: for)?\s+/, ''))}`); say('Googling it.'); return; }
      const yt = q.match(/^youtube\s+(.+)/);
      if (yt) { window.mate.openUrl(`https://www.youtube.com/results?search_query=${encodeURIComponent(yt[1])}`); say('YouTube it is.'); return; }
      const folder = q.match(/^open(?: my)? (downloads|documents|desktop|pictures)(?: folder)?[.!?]?$/);
      if (folder) { window.mate.openFolder(folder[1]); say(`Opening ${folder[1]}.`); return; }
      if (/^lock (?:my |the )?(?:pc|computer|screen|windows)[.!?]?$/.test(q)) { window.mate.lock(); say('Locking up.'); return; }
      if (/(minimi[sz]e|hide) (?:this|the|my)? ?window/.test(q)) { window.mate.window('minimize'); say('Tucked away.'); return; }
      if (/(close|quit|kill|exit) (?:this|the|my)? ?window/.test(q)) { window.mate.window('close'); say('Closed. Gone but not forgotten.'); return; }
      if (/(maximi[sz]e|full ?screen) (?:this|the)? ?window/.test(q)) { window.mate.window('maximize'); say('Big screen energy.'); return; }
      if (/(what|which) (?:window|app) am i using/.test(q)) { window.mate.window('list'); say('Checked the focused window.'); return; }
      if (/^(?:battery|system status|pc status|how much (?:ram|memory)(?: is free)?|check (?:my )?(?:battery|performance))[.!?]?$/.test(q)) {
        void window.mate.sysinfo().then((info) => {
          const b = info.match(/BATTERY=(\d+)/)?.[1] ?? '?';
          const mem = info.match(/MEMORY=([\d.]+)\/([\d.]+)/)?.[0]?.replace('MEMORY=', '') ?? '?';
          const cpu = info.match(/CPU=(\d+)/)?.[1];
          say(`Battery ${b}%. Memory free ${mem} GB.${cpu ? ` CPU ${cpu}%.` : ''}`);
        });
        return;
      }
      if (/^(?:take (?:a )?)?(screenshot|screen ?shot|snap|capture (?:my )?screen)[.!?]?$/.test(q)) {
        void window.mate.screenshot().then((f) => say(f ? 'Snapped — saved in Pictures.' : 'Screenshot failed.'));
        return;
      }
      const note = q.match(/^(?:note|jot down)(?: that)?\s+(.+)/);
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
      if (/^(?:score|my score|trophies|wins)[.!?]?$/.test(q)) {
        const s = scoresRef.current;
        setCounterDisplay({ label: 'WINS', value: String(s.gw + s.w), progress: 1, expiresAt: Date.now() + 6000 });
        say(`Trophies: ${s.gw} guessing wins · RPS ${s.w}W/${s.l}L/${s.d}D.`);
        return;
      }
      if (/^(?:tell me (?:a )?joke|joke|make me laugh)[.!?]?$/.test(q)) {
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
      const skill = runSkills(q, { petName: settingsRef.current.petName, userName: settingsRef.current.userName, pomoLeft: pomoRef.current, interactionHistory: messages.map(m => m.text), userPreferences: {}, dailyPatterns: {} });
      if (skill) {
        if (skill.memoryJson) void navigator.clipboard.writeText(skill.memoryJson).catch(() => { /* clipboard unavailable */ });
        if (skill.setting) patch(skill.setting);
        if (skill.pomodoro !== undefined) {
          const seconds = skill.pomodoro < 0 ? 0 : Math.ceil(skill.pomodoro * 60);
          if (seconds <= 0) cancelTimer();
          else startTimer(seconds, skill.timerMode ?? 'focus');
        }
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
      const system = `You are ${settingsRef.current.petName}, a friendly, thoughtful desktop companion on Windows. The user's name is ${settingsRef.current.userName || 'not yet known'}. Be natural and useful. Match the user's language and give enough detail to answer well. Use the conversation for context. Avoid canned robot jokes. You can discuss tasks, movies, ideas, and feelings. You cannot see the screen, browse, or execute arbitrary tools from this AI chat. Cine has built-in countdown timers, focus timers, and reminders; never claim Cine lacks a timer, send the user to their phone or Windows Clock, or claim a timer was started unless the app confirms it. Explicit timer and reminder commands are handled locally by the app.`;
      const turns = [...messages.filter(m => !m.error).map(m => ({ role: m.from === 'you' ? 'user' as const : 'model' as const, text: m.text })), { role: 'user' as const, text: raw }];
      requestAI({ turns, system: voiceTurn.current ? `${system} This is a spoken conversation. Give a direct, natural reply in one or two short sentences unless the user asks for more detail. Avoid headings and lists in spoken replies.` : system });
    }, 0);
  };
  replyRef.current = reply;

  const park = useCallback((text: string) => {
    bus.emit(CHANNELS.bubble, text);
  }, []);

  const nowPlayingLine = useMemo(
    () => (nowPlaying ? `${nowPlaying.playing ? '♪' : '❚❚'} ${nowPlaying.artist ? `${nowPlaying.artist} — ` : ''}${nowPlaying.title}` : null),
    [nowPlaying]
  );

  if (!open) {
    return null;
  }

  return (
    <div className="stage hub-open">
      <section className="chat" aria-label={`Chat with ${settings.petName}`}>
        <header className="dragzone" onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest('button')) return;
          const sx = e.screenX;
          const sy = e.screenY;
          const ox = e.screenX - e.clientX;
          const oy = e.screenY - e.clientY;
          const move = (ev: PointerEvent) => window.mate.moveHub(ox + ev.screenX - sx, oy + ev.screenY - sy);
          const up = () => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
          };
          window.addEventListener('pointermove', move);
          window.addEventListener('pointerup', up);
        }}>
          <img className="chat-avatar" src={cineIcon} alt="" />
          <div>
            <strong>{settings.petName}</strong>
            <small>{nowPlayingLine ?? (pomoLeft > 0 ? `${timerMode === 'focus' ? 'focus' : 'timer'} ${Math.floor(pomoLeft / 60)}:${String(pomoLeft % 60).padStart(2, '0')}` : aiStatus)}</small>
          </div>
          <button type="button" onClick={() => window.mate.hubToggle(false)} aria-label="Collapse chat">–</button>
        </header>
        <nav className="tabs" aria-label="Panels">
          {(['chat', 'tools', 'pet', 'settings'] as const).map((t) => (
            <button key={t} type="button" className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>{t === 'pet' ? 'Appearance' : t}</button>
          ))}
        </nav>
        {tab === 'chat' && (
          <>
            <div className="log" role="log" aria-live="polite">
              {messages.map((m, i) => <div key={i} className={`message ${m.from}`}><p className={`${m.from}${m.error ? ' error' : ''}`}>{m.text}</p>{m.detail && <details className="connection-detail"><summary>Connection details</summary><pre>{m.detail}</pre></details>}{m.retryable && i === messages.length - 1 && <button className="retry-chat" disabled={typing} onClick={() => { if (lastRequest.current) requestAI(lastRequest.current); }}>Try again</button>}</div>)}
              {typing && <p className="cine typing" aria-label="thinking"><span /><span /><span /></p>}
            <div ref={logEnd} />
            </div>
            <div className="chips">
              {['What is playing', 'Pomodoro 25', 'Help', 'Tell me a joke'].map((c) => (
                <button key={c} type="button" disabled={typing} onClick={() => reply(c)}>{c}</button>
              ))}
            </div>
            <form onSubmit={(e) => { e.preventDefault(); reply(input); }}>
              <button type="button" aria-label={microphoneOn ? 'Turn microphone off' : 'Turn microphone on'} title={microphoneOn ? 'Turn microphone off' : 'Turn microphone on'} aria-pressed={microphoneOn} onClick={() => { void window.mate.captureSpeech(); }}>{microphoneOn ? 'Mic off' : 'Mic on'}</button>
              <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={`Ask ${settings.petName}…`} autoComplete="off" aria-label="Ask" />
              <button type="submit" disabled={typing || !input.trim()} aria-label="Send">{typing ? 'Wait' : 'Send'}</button>
            </form>
            {['finishing', 'transcribing'].includes(microphoneState) && <small className="microphone-status" role="status">Understanding what you said...</small>}
          </>
        )}
        {tab === 'tools' && (
          <div className="panel tools-panel">
            <CompanionTools />
            <div className="tool-heading"><strong>Timers</strong><small>Live on Cine’s face</small></div>
            <div className="timer-presets">
              {[1, 5, 15, 25].map(minutes => <button key={minutes} type="button" onClick={() => startTimer(minutes * 60)}>{minutes} min</button>)}
            </div>
            {pomoLeft > 0 && <div className="timer-controls">
              <output className="tool-counter">{Math.floor(pomoLeft / 60)}:{String(pomoLeft % 60).padStart(2, '0')}<small>{timerPaused ? 'Paused' : timerMode === 'break' ? 'Break' : timerMode === 'focus' ? 'Focus' : 'Counting down'}</small></output>
              <div className="tool-actions"><button type="button" onClick={toggleTimerPause}>{timerPaused ? 'Resume timer' : 'Pause timer'}</button><button type="button" onClick={() => extendTimer(60)}>+1 min</button><button type="button" onClick={() => extendTimer(300)}>+5 min</button><button type="button" onClick={cancelTimer}>Cancel timer</button></div>
            </div>}
            <label className="check"><input type="checkbox" checked={settings.repeatTimer} onChange={e => patch({ repeatTimer: e.target.checked })} /> Repeat countdown timers</label>
            <label className="check"><input type="checkbox" checked={settings.timerSound} onChange={e => patch({ timerSound: e.target.checked })} /> Play a chime when timers finish</label>
            <button type="button" className="test-btn" onClick={() => {
              setTimerSoundStatus('Playing timer chime...');
              void window.mate.timerAlert().then(result => setTimerSoundStatus(result.error || 'Timer sound test finished.')).catch(() => setTimerSoundStatus('Timer sound could not play. Check the Windows volume mixer for CineMate.'));
            }}>Test timer sound</button>
            {timerSoundStatus && <small role="status">{timerSoundStatus}</small>}
            <div className="tool-heading"><strong>Focus &amp; breaks</strong><small>One session at a time</small></div>
            <div className="tool-fields">
              <label>Focus minutes<select value={settings.focusMinutes} onChange={e => patch({ focusMinutes: Number(e.target.value) })}>{[15, 25, 45, 60].map(m => <option key={m} value={m}>{m} min</option>)}</select></label>
              <label>Break minutes<select value={settings.breakMinutes} onChange={e => patch({ breakMinutes: Number(e.target.value) })}>{[3, 5, 10, 15].map(m => <option key={m} value={m}>{m} min</option>)}</select></label>
            </div>
            <label className="check"><input type="checkbox" checked={settings.focusBreaks} onChange={e => patch({ focusBreaks: e.target.checked })} /> Alternate focus and break sessions</label>
            <button type="button" className="test-btn" onClick={() => startTimer(settings.focusMinutes * 60, 'focus')}>Start focus session</button>
            <div className="tool-heading"><strong>Stopwatch</strong><small>Timers take priority on his face</small></div>
            <output className="tool-counter">{Math.floor(stopwatchMs / 60000)}:{String(Math.floor(stopwatchMs / 1000) % 60).padStart(2, '0')}</output>
            <div className="tool-actions"><button type="button" onClick={toggleStopwatch}>{stopwatchRunning ? 'Pause stopwatch' : stopwatchMs > 0 ? 'Resume stopwatch' : 'Start stopwatch'}</button><button type="button" onClick={() => { setStopwatchRunning(false); stopwatchSaved.current = 0; setStopwatchMs(0); }}>Reset stopwatch</button></div>
            <label className="check"><input type="checkbox" checked={settings.faceClock} onChange={e => patch({ faceClock: e.target.checked })} /> Show local time on Cine’s face</label>
          </div>
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
            <label className="check"><input type="checkbox" checked={settings.stayPut} onChange={e => patch({ stayPut: e.target.checked })} /> Stay here (move only when I drag)</label>
            <label className="check"><input type="checkbox" checked={settings.quietCompanion} onChange={e => patch({ quietCompanion: e.target.checked })} /> Quiet companion (no unsolicited chatter)</label>
            <label className="check"><input type="checkbox" checked={settings.cinemaMode} onChange={e => patch({ cinemaMode: e.target.checked })} /> Cinema mode (hide Cine during fullscreen)</label>
            <label className="check"><input type="checkbox" checked={settings.autoDayNight} onChange={e => patch({ autoDayNight: e.target.checked })} /> Softer glow at night (7 pm–7 am)</label>
            <span className="row-label">Robot accessories</span>
            <div className="accessory-grid">{ACCESSORIES.map(accessory => <button type="button" key={accessory} aria-pressed={settings.accessory === accessory} onClick={() => patch({ pet: 'robot', accessory })}>{accessory === 'none' ? 'No accessory' : accessory === 'star' ? 'Star antenna' : accessory[0].toUpperCase() + accessory.slice(1)}</button>)}</div>
            <label>Headphone colour<input type="color" aria-label="Headphone colour" value={settings.headphoneColor} onChange={e => patch({ headphoneColor: e.target.value })} /></label>
            <button type="button" className="test-btn" onClick={() => patch({ headphoneColor: '#f3f6fb' })}>White headphones</button>
            <label>Sleep after idle
              <select value={settings.sleepMin} onChange={(e) => patch({ sleepMin: Number(e.target.value) })}>
                <option value={0}>Never</option><option value={5}>5 min</option><option value={10}>10 min</option><option value={30}>30 min</option>
              </select>
            </label>
            <label>Gemini API key <small>aistudio.google.com/apikey · test your key below</small>
              <input type="password" value={settings.geminiKey} placeholder="Your Gemini API key" onChange={(e) => patch({ geminiKey: e.target.value.trim() })} />
            </label>
            <button type="button" className="test-btn" onClick={() => {
              setAiTest('Testing…');
              void window.mate.testAI(settings.geminiKey).then(result => { setAiTest(result); setAiStatus(result.startsWith('Connected') ? 'Ready to chat' : 'Connection needs attention'); }).catch(() => setAiTest('Test failed.'));
            }}>Test Gemini connection</button>
            {aiTest && <span className="test-line">{aiTest}</span>}
            <label className="check"><input type="checkbox" checked={settings.voice} onChange={(e) => patch({ voice: e.target.checked })} /> Voice replies (female preferred)</label>
            <small>Click the mic, wait for the recording cue, then speak. Click again to stop recording and send. The microphone starts off.</small>
            <small className="microphone-status" role="status">{microphoneState === 'ready' ? 'Microphone on. Speak naturally.' : microphoneState === 'listening' ? 'Listening. Speak now.' : microphoneState === 'transcribing' ? 'Understanding your words on this PC...' : microphoneState === 'starting' ? 'Starting microphone...' : microphoneState === 'off' ? 'Microphone off.' : microphoneError || 'Microphone unavailable'}</small>
            <button type="button" className="test-btn" aria-pressed={microphoneOn} onClick={() => { void window.mate.captureSpeech(); }}>{microphoneOn ? 'Turn microphone off' : 'Turn microphone on'}</button>
            {settings.voice && voices.length > 0 && (
              <label>Voice
                <select value={settings.voiceURI} onChange={(e) => patch({ voiceURI: e.target.value })}>
                  <option value="">Auto (female preferred)</option>
                  {voices.map((v) => <option key={v.uri} value={v.uri}>{v.name}</option>)}
                </select>
              </label>
            )}
            {settings.voice && <>
              <label className="check"><input type="checkbox" checked={settings.expressiveVoice} onChange={e => patch({ expressiveVoice: e.target.checked })} /> Expressive voice (mood and natural pauses)</label>
              {settings.expressiveVoice && <label>Voice mood<select value={settings.voiceMood} onChange={e => patch({ voiceMood: e.target.value })}>{['auto', 'warm', 'happy', 'calm', 'curious', 'gentle', 'excited'].map(mood => <option key={mood} value={mood}>{mood === 'auto' ? 'Auto · match the reply' : mood[0].toUpperCase() + mood.slice(1)}</option>)}</select></label>}
              <label>Speaking speed
                <input type="range" min={-5} max={5} step={1} value={settings.voiceRate} aria-label="Speaking speed" aria-valuetext={settings.voiceRate === 0 ? 'Normal' : settings.voiceRate < 0 ? `Slower, ${-settings.voiceRate}` : `Faster, ${settings.voiceRate}`} onChange={e => patch({ voiceRate: Number(e.target.value) })} />
                <small className="voice-speed-labels"><span>Slower</span><span>{settings.voiceRate === 0 ? 'Normal' : settings.voiceRate < 0 ? 'Relaxed' : 'Brisk'}</span><span>Faster</span></small>
              </label>
              <button type="button" className="test-btn" disabled={voiceTesting} onClick={() => {
                setVoiceTesting(true);
                setVoiceStatus('Playing voice test...');
                void window.mate.speak('Hi, I am Cine. Voice replies are on. It is lovely to have you here!', settings.voiceURI, settings.voiceRate, settings.expressiveVoice ? settings.voiceMood === 'auto' ? 'happy' : settings.voiceMood : 'plain')
                  .then(result => setVoiceStatus(result.error || 'Voice test finished. If silent, check your Windows output device and volume mixer.'))
                  .catch(() => setVoiceStatus('Voice playback could not start.'))
                  .finally(() => setVoiceTesting(false));
              }}>{voiceTesting ? 'Speaking...' : 'Test voice'}</button>
              {voiceStatus && <span className="test-line" role="status">{voiceStatus}</span>}
            </>}
            <label className="check"><input type="checkbox" checked={ghost} onChange={(e) => { setGhost(e.target.checked); window.mate.setClickThrough(e.target.checked); }} /> Allow clicks through pet · Ctrl+Alt+M</label>
            <small>The dock stays clickable. Switch this off to drag Cine.</small>
            <label className="check"><input type="checkbox" checked={settings.login} onChange={(e) => { patch({ login: e.target.checked }); window.mate.setLogin(e.target.checked); }} /> Start with Windows</label>
            <button type="button" className="quit" onClick={() => window.mate.quit()}>Quit CineMate</button>
          </div>
        )}
      </section>
    </div>
  );
}
