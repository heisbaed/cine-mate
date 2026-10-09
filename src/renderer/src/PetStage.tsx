import type { CursorState } from '../../preload/index';
import { useCallback, useEffect, useRef, useState } from 'react';
import { APP_REACTIONS, MOVIE_JOKES, MOOD_COMMENTS, QUIPS, VIDEO_APP, inferSongMood, type Emotion } from './brain';

type Look = 'left' | 'center' | 'right';
type LookY = 'up' | 'center' | 'down';
type Mode = 'awake' | 'sleeping' | 'singing' | 'dancing';
type Overlay = 'love' | 'sad' | 'curious' | 'laugh' | null;
type PetKind = 'robot' | 'cat' | 'blob';

interface Look2D { look: Look; lookY: LookY }

const CHANNELS = {
  say: 'cinemate-say',
  mood: 'cinemate-mood',
  bubble: 'cinemate-bubble',
  emotion: 'cinemate-emotion',
  now: 'cinemate-now',
  thinking: 'cinemate-thinking',
  action: 'cinemate-action'
};

export const bus = {
  emit(name: string, payload: unknown) {
    try {
      new BroadcastChannel(name).postMessage(payload);
    } catch {
      // channel unavailable
    }
  },
  on(name: string, cb: (payload: unknown) => void) {
    try {
      const ch = new BroadcastChannel(name);
      ch.onmessage = (e) => cb(e.data);
      return () => ch.close();
    } catch {
      return () => undefined;
    }
  }
};

function RobotFace({ look, lookY }: Look2D) {
  return (
    <>
      <span className="mate-antenna" aria-hidden="true"><i /></span>
      <span className={`mate-screen look-${look} look-${lookY}`} aria-hidden="true">
        <span className="mate-gaze"><i className="mate-eye" /><i className="mate-eye" /></span>
        <span className="mate-mouth" />
<span className="mate-tears" aria-hidden="true"><i /><i /></span>
      <span className="mate-blush" aria-hidden="true"><i /><i /></span>
    </span>
      <span className="mate-torso" aria-hidden="true"><i /></span>
      <span className="mate-arm left" aria-hidden="true" />
      <span className="mate-arm right" aria-hidden="true" />
      <span className="mate-wheel" aria-hidden="true" />
    </>
  );
}

function CatFace({ look, lookY }: Look2D) {
  return (
    <>
      <span className="cat-ears" aria-hidden="true"><i /><i /></span>
      <span className={`cat-head look-${look} look-${lookY}`} aria-hidden="true">
        <span className="cat-gaze"><i className="cat-eye" /><i className="cat-eye" /></span>
        <span className="cat-muzzle" aria-hidden="true"><i className="cat-nose" /><i className="cat-mouth" /></span>
        <span className="mate-tears" aria-hidden="true"><i /><i /></span>
        <span className="mate-blush" aria-hidden="true"><i /><i /></span>
      </span>
      <span className="cat-body" aria-hidden="true" />
      <span className="cat-tail" aria-hidden="true" />
    </>
  );
}

function BlobFace({ look, lookY }: Look2D) {
  return (
    <span className={`blob look-${look} look-${lookY}`} aria-hidden="true">
      <span className="blob-gaze"><i className="blob-eye" /><i className="blob-eye" /></span>
      <span className="mate-mouth blob-mouth" />
<span className="mate-tears" aria-hidden="true"><i /><i /></span>
        <span className="mate-blush" aria-hidden="true"><i /><i /></span>
      </span>
  );
}

export default function PetStage() {
  const [look, setLook] = useState<Look>('center');
  const [lookY, setLookY] = useState<LookY>('center');
  const [mode, setMode] = useState<Mode>('awake');
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [pet, setPet] = useState<PetKind>('robot');
  const [petName, setPetName] = useState('Cine');
  const [bubble, setBubble] = useState<string | null>(null);
const [song, setSong] = useState<string | null>(null);
const [emotion, setEmotion] = useState<Emotion>('neutral');
const [quip, setQuip] = useState(0);
const [quiet, setQuiet] = useState(false);
const [thinking, setThinking] = useState(false);
const [movie, setMovie] = useState(false);
const lastJoke = useRef(0);
  const [idle, setIdle] = useState(false);
  const [hop, setHop] = useState(0);
  const [near, setNear] = useState(false);
  const [ghost, setGhost] = useState(false);
  const timers = useRef<number[]>([]);
  const drag = useRef<{ sx: number; sy: number; wx: number; wy: number } | null>(null);
  const lastSeen = useRef(Date.now());
  const lastComment = useRef(0);
  const lastCursor = useRef({ x: 0, y: 0 });
  const areaRef = useRef<CursorState['area'] | null>(null);
  const windowTitle = useRef('');

  const later = useCallback((fn: () => void, ms: number) => {
    const t = window.setTimeout(fn, ms);
    timers.current.push(t);
  }, []);

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);
  useEffect(() => { void window.mate.getClickThrough().then(setGhost); }, []);

  useEffect(() => bus.on(CHANNELS.now, (p) => {
    if (!p) {
      setSong(null);
      return;
    }
    const label = String(p);
    setSong(label);
    setEmotion((prev) => {
      const next = inferSongMood(label);
      if (next !== prev) {
        bus.emit(CHANNELS.emotion, next);
        const pool = MOOD_COMMENTS[next];
        setBubble(pool[Math.floor(Math.random() * pool.length)]);
        later(() => setBubble(null), 5000);
      }
      return next;
    });
  }), [later]);

// Ambient awareness: react to the app in front of the user.
useEffect(() => window.mate.onContext((title) => {
    if (!title || idle) return;
    const hit = APP_REACTIONS.find((r) => r.match.test(title));
    if (!hit) return;
    if (Date.now() - lastComment.current < 90_000) return;
    lastComment.current = Date.now();
    setBubble(hit.say[Math.floor(Math.random() * hit.say.length)]);
    setHop((v) => v + 1);
    later(() => setBubble(null), 5000);
  }), [idle, later]);

useEffect(() => bus.on(CHANNELS.bubble, (p) => {
    const text = String(p);
    setBubble(text);
    setHop((v) => v + 1);
    later(() => setBubble((cur) => (cur === text ? null : cur)), 4500);
  }), [later]);

  // Idle chatter so the bubble always has something alive in it.
  useEffect(() => {
    const t = window.setInterval(() => {
      if (!song && !bubble) setQuip((v) => v + 1);
    }, 8000);
    return () => window.clearInterval(t);
  }, [song, bubble]);

  useEffect(() => bus.on(CHANNELS.mood, (p) => {
    const kind = String(p) as Overlay;
    setOverlay(kind);
    if (kind) later(() => setOverlay(null), 4000);
  }), [later]);

  useEffect(() => bus.on(CHANNELS.action, (p) => {
    if (p === 'dance') {
      setMode('dancing');
      window.setTimeout(() => setMode((cur) => (cur === 'dancing' ? 'awake' : cur)), 1300);
    }
    if (p === 'sing') {
      setMode('singing');
      window.setTimeout(() => setMode((cur) => (cur === 'singing' ? 'awake' : cur)), 5000);
    }
    if (p === 'sleep') setMode('sleeping');
    if (p === 'wake') setMode('awake');
  }), []);

  useEffect(() => bus.on('cinemate-config', (p) => {
    const cfg = p as { pet?: PetKind; petName?: string };
    if (cfg.pet) setPet(cfg.pet);
    if (cfg.petName) setPetName(cfg.petName);
  }), []);

  useEffect(() => {
    const off = window.mate.onCursor((s: CursorState) => {
      const dx = s.cursor.x - (s.winPos.x + 105);
      const dy = s.cursor.y - (s.winPos.y + 120);
      lastSeen.current = Date.now();
      lastCursor.current = s.cursor;
      areaRef.current = s.area;
      setLook(dx < -50 ? 'left' : dx > 50 ? 'right' : 'center');
      setLookY(dy < -70 ? 'up' : dy > 70 ? 'down' : 'center');
      setNear(Math.hypot(dx, dy) < 90);
    });
    return off;
  }, []);

  // Idle life: look around, sway and fidget so it never reads as a frozen statue.
  useEffect(() => {
    const glance = window.setInterval(() => {
      if (idle || document.hidden) return;
      if (Date.now() - lastSeen.current < 2500) return;
      setLook((['left', 'center', 'right'] as const)[Math.floor(Math.random() * 3)]);
      setLookY((['up', 'center', 'down'] as const)[Math.floor(Math.random() * 3)]);
      if (Math.random() < 0.35) setHop((v) => v + 1);
    }, 2600);
    return () => window.clearInterval(glance);
  }, [idle]);

  useEffect(() => {
    const off = window.mate.onIdle((isIdle) => {
      setIdle(isIdle);
      if (!isIdle) setHop((v) => v + 1);
    });
    return off;
  }, []);

  useEffect(() => bus.on(CHANNELS.thinking, (p) => setThinking(!!p)), []);

// Movie mode: fullscreen + a video app in front = crack a joke mid-watch.
useEffect(() => {
  const t = window.setInterval(() => {
    if (!movie || thinking) return;
    if (Date.now() - lastJoke.current < 150_000) return;
    lastJoke.current = Date.now();
    setBubble(MOVIE_JOKES[Math.floor(Math.random() * MOVIE_JOKES.length)]);
    later(() => setBubble(null), 6000);
  }, 20000);
  return () => window.clearInterval(t);
}, [movie, thinking, later]);

// Get out of the way while you type or watch something fullscreen.
useEffect(() => window.mate.onActivity(({ typing, fullscreen }) => {
    const busy = typing || fullscreen;
    setQuiet(busy);
    const area = areaRef.current;
    if (fullscreen && windowTitle.current && VIDEO_APP.test(windowTitle.current)) {
      setMovie(true);
    } else if (!fullscreen) {
      setMovie(false);
    }
    if (!area) return;
    if (busy) {
      // Tuck into whichever screen corner is furthest from the cursor.
      const c = lastCursor.current;
      const corners = [
        { x: area.x + 16, y: area.y + area.height - 120 },
        { x: area.x + area.width - 130, y: area.y + area.height - 120 },
        { x: area.x + 16, y: area.y + 16 },
        { x: area.x + area.width - 130, y: area.y + 16 }
      ];
      let best = corners[0];
      let bestDist = -1;
      for (const corner of corners) {
        const d = Math.hypot(corner.x - c.x, corner.y - c.y);
        if (d > bestDist) { bestDist = d; best = corner; }
      }
      window.mate.move(best.x, best.y);
      setHop((v) => v + 1);
    }
  }), []);

useEffect(() => {
    if (ghost || quiet) return;
    const t = window.setInterval(() => {
      const area = screenArea();
      if (!area) return;
      window.mate.move(
        area.x + 40 + Math.random() * Math.max(80, area.width - 320),
        area.y + 40 + Math.random() * Math.max(80, area.height - 320)
      );
      setHop((v) => v + 1);
    }, 24000);
    return () => window.clearInterval(t);
  }, [ghost]);

  function screenArea() {
    return lastArea.current;
  }
  const lastArea = useRef<CursorState['area'] | null>(null);
  useEffect(() => window.mate.onCursor((s) => { lastArea.current = s.area; }), []);

  const face: Mode = idle ? 'sleeping' : mode;
  const cls = `mate-body pet-${pet} hop emo-${emotion} ${face}${overlay ? ` ${overlay}` : ''}${near && face === 'awake' && !overlay ? ' excited' : ''}${quiet ? ' quiet' : ''}${thinking ? ' thinking' : ''}`;

  // Priority: thinking, then a message, then the song it hears, then idle chatter.
  const bubbleText = idle
    ? 'sleeping… move the mouse to wake'
    : quiet
      ? 'out of your way — call me if you need me'
      : bubble
        ?? (song ? `♪ ${song}` : QUIPS[quip % QUIPS.length]);

  return (
    <div className="stage pet-stage">
      {thinking ? (
        <div className="bubble think-bubble" aria-label="Cine is thinking"><i /><i /><i /></div>
      ) : (
        <div className={`bubble${song && !bubble ? ' song' : ''}`} title={bubbleText}>{bubbleText}</div>
      )}
      <button
        key={hop}
        type="button"
        className={cls}
        aria-label={`${petName}. Drag to move. Right-click for options.`}
        onPointerDown={(e) => {
          const start = { sx: e.clientX, sy: e.clientY };
          drag.current = { ...start, wx: e.screenX - e.clientX, wy: e.screenY - e.clientY };
          const move = (ev: PointerEvent) => {
            if (!drag.current) return;
            window.mate.move(ev.screenX - drag.current.wx, ev.screenY - drag.current.wy);
          };
          const up = () => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
            drag.current = null;
          };
          window.addEventListener('pointermove', move);
          window.addEventListener('pointerup', up);
        }}
        onContextMenu={(e) => { e.preventDefault(); window.mate.menu(); }}
      >
        {pet === 'cat' ? <CatFace look={look} lookY={lookY} /> : pet === 'blob' ? <BlobFace look={look} lookY={lookY} /> : <RobotFace look={look} lookY={lookY} />}
        {face === 'sleeping' && <span className="mate-zzz" aria-hidden="true"><i>z</i><i>z</i><i>Z</i></span>}
      </button>
    </div>
  );
}

export { CHANNELS };