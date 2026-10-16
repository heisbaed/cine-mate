import CineCharacter, { type FaceDisplay } from './CineCharacter';
import type { CursorState } from '../../preload/index';
import { useCallback, useEffect, useRef, useState } from 'react';
import { APP_REACTIONS, MOVIE_JOKES, MOOD_COMMENTS, VIDEO_APP, inferSongMood, loadSettings, type Emotion } from './brain';

// Enhanced EMO expressions: more detailed facial features for expressiveness
interface EMOExpressions {
  // Eye details
  eyeLook: 'left' | 'center' | 'right';
  eyeLookY: 'up' | 'center' | 'down';
  eyeOpen: number; // 0-1 (fully closed to fully open)
  eyeTear: number; // 0-1 (tear level)
  eyeBlush: number; // 0-1 (blush intensity)
  eyePupilSize: number; // 0.5-1.5 (pupil dilation)
  eyePupilLookX: number; // -0.5 to 0.5 (where pupil is looking within eye)
  eyePupilLookY: number; // -0.5 to 0.5 (where pupil is looking within eye)

  // Eyebrow details (for more expressive emotions)
  browLeft: { height: number; angle: number }; // height: 0-1, angle: -20 to 20 degrees
  browRight: { height: number; angle: number };

  // Mouth details
  mouthOpen: number; // 0-1 (closed to open)
  mouthWidth: number; // 0.5-1.5 (width)
  mouthCurve: number; // -1 (frown) to 1 (smile)

  // Blush and tears
  blushLevel: number; // 0-1
  tearLevel: number; // 0-1

  // Additional expressive elements
  antennaWag: number; // -0.5 to 0.5 (antenna waggle)
  bodyLean: number; // -0.2 to 0.2 (body lean)
}

type Look = 'left' | 'center' | 'right';
type LookY = 'up' | 'center' | 'down';
type Mode = 'awake' | 'sleeping' | 'singing' | 'dancing';
type Overlay = 'love' | 'sad' | 'curious' | 'laugh' | null;
type PetKind = 'robot' | 'cat' | 'blob';


const CHANNELS = {
  say: 'cinemate-say',
  mood: 'cinemate-mood',
  bubble: 'cinemate-bubble',
  emotion: 'cinemate-emotion',
  now: 'cinemate-now',
  thinking: 'cinemate-thinking',
  action: 'cinemate-action',
  display: 'cinemate-face-display'
};

export const bus = {
  emit(name: string, payload: unknown) {
    try {
      const channel = new BroadcastChannel(name);
      channel.postMessage(payload);
      channel.close();
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

// Enhanced Cat Face with EMO expressions
function CatFace({ expressions }: { expressions: EMOExpressions }) {
  const {
    eyeLook, eyeLookY, eyeOpen, eyeTear, eyeBlush, eyePupilSize,
    eyePupilLookX, eyePupilLookY,
    browLeft, browRight,
    mouthOpen, mouthWidth, mouthCurve,
    blushLevel,
    antennaWag, bodyLean
  } = expressions;

  // Calculate eye positions based on look direction

  // Calculate pupil position within eye
  const pupilOffsetX = eyePupilLookX * 2.5; // Scale to cat eye dimensions
  const pupilOffsetY = eyePupilLookY * 2.5;

  // Eye height based on openness
  const eyeHeight = 10 + (eyeOpen * 6); // 10-16px
  const eyeWidth = 8 + (eyeOpen * 4); // 8-12px

  // Tear positioning
  const tearOffset = eyeTear * 8; // 0-8px down

  // Blush positioning
  const blushOffset = eyeBlush * 10; // 0-10px out

  return (
    <>
      {/* Ears with wag */}
      <span
        className="cat-ears"
        aria-hidden="true"
        style={{
          transform: `rotate(${antennaWag * 5}deg)` // Ears wag with antenna
        }}
      ><i /><i /></span>

      {/* Head with lean */}
      <span
        className={`cat-head look-${eyeLook} look-${eyeLookY}`}
        aria-hidden="true"
        style={{
          transform: `translate(${bodyLean * 3}px, 0) rotate(${bodyLean * 1}deg)` // -0.6 to 0.6px, -0.5 to 0.5deg
        }}
      >
        {/* Eyes */}
        <span className="cat-gaze">
          <span
            className="cat-eye"
            style={{
              width: `${eyeWidth}px`,
              height: `${eyeHeight}px`,
              background: `radial-gradient(circle at ${50 + (eyePupilLookX * 25)}% ${50 + (eyePupilLookY * 25)}%, var(--eye), transparent 70%)`,
              boxShadow: `0 0 ${8 * eyePupilSize}px var(--acc-glow)`,
              borderRadius: '50%',
              transform: `translate(${pupilOffsetX}px, ${pupilOffsetY}px)`
            }}
          ><i /></span>
          <span
            className="cat-eye"
            style={{
              width: `${eyeWidth}px`,
              height: `${eyeHeight}px`,
              background: `radial-gradient(circle at ${50 - (eyePupilLookX * 25)}% ${50 - (eyePupilLookY * 25)}%, var(--eye), transparent 70%)`,
              boxShadow: `0 0 ${8 * eyePupilSize}px var(--acc-glow)`,
              borderRadius: '50%',
              transform: `translate(${-pupilOffsetX}px, ${-pupilOffsetY}px)`
            }}
          ><i /></span>
        </span>

        {/* Eyebrows (more subtle for cat) */}
        <span className="cat-brows" style={{ position: 'absolute', top: '-2px', left: '0', width: '100%', height: '100%', pointerEvents: 'none' }}>
          <span
            className="cat-brow left"
            style={{
              position: 'absolute',
              left: '10px',
              top: `${6 - browLeft.height * 8}px`,
              width: '8px',
              height: '1.5px',
              background: '#3a4656',
              transformOrigin: 'left center',
              transform: `rotate(${browLeft.angle * 0.5}deg)`
            }}
          ><i /></span>
          <span
            className="cat-brow right"
            style={{
              position: 'absolute',
              right: '10px',
              top: `${6 - browRight.height * 8}px`,
              width: '8px',
              height: '1.5px',
              background: '#3a4656',
              transformOrigin: 'right center',
              transform: `rotate(${-browRight.angle * 0.5}deg)`
            }}
          ><i /></span>
        </span>

        {/* Tears */}
        {eyeTear > 0 && (
          <>
            <span
              className="mate-tears"
              style={{
                position: 'absolute',
                top: `${12 + tearOffset}px`,
                left: '20px',
                width: '4px',
                height: '6px',
                background: '#7fb8ff',
                opacity: 0.7,
                borderRadius: '50%',
                transform: `translateY(${tearOffset}px)`
              }}
            ><i /><i /></span>
            <span
              className="mate-tears"
              style={{
                position: 'absolute',
                top: `${12 + tearOffset}px`,
                left: '36px',
                width: '4px',
                height: '6px',
                background: '#7fb8ff',
                opacity: 0.7,
                borderRadius: '50%',
                transform: `translateY(${tearOffset}px)`
              }}
            ><i /><i /></span>
          </>
        )}

        {/* Blush */}
        {blushLevel > 0 && (
          <>
            <span
              className="mate-blush"
              style={{
                position: 'absolute',
                top: `${24 + blushOffset}px`,
                left: '8px',
                width: '10px',
                height: '5px',
                background: `rgba(255, 130, 165, ${blushLevel * 0.6})`,
                borderRadius: '50%'
              }}
            ><i /><i /></span>
            <span
              className="mate-blush"
              style={{
                position: 'absolute',
                top: `${24 + blushOffset}px`,
                right: '8px',
                width: '10px',
                height: '5px',
                background: `rgba(255, 130, 165, ${blushLevel * 0.6})`,
                borderRadius: '50%'
              }}
            ><i /><i /></span>
          </>
        )}

        {/* Muzzle and mouth */}
        <span className="cat-muzzle" aria-hidden="true">
          <span className="cat-nose" />
          <span
            className="cat-mouth"
            style={{
              position: 'absolute',
              bottom: '2px',
              left: '50%',
              transform: `translateX(-50%)`,
              width: `${8 * mouthWidth}px`,
              height: `${3 + (mouthOpen * 4)}px`, // 3-7px
              borderBottom: mouthCurve < 0 ? '1.5px solid #ff9db0' : 'none',
              borderTop: mouthCurve > 0 ? '1.5px solid #ff9db0' : 'none',
              borderRadius: mouthCurve < 0 ? '50% 50% 0 0' : mouthCurve > 0 ? '0 0 50% 50%' : '0'
            }}
          ><i /></span>
        </span>
      </span>

      {/* Body */}
      <span className="cat-body" aria-hidden="true" />
      <span className="cat-tail" aria-hidden="true" />
    </>
  );
}

// Enhanced Blob Face with EMO expressions
function BlobFace({ expressions, gaze }: { expressions: EMOExpressions; gaze: { x: number; y: number } }) {
  const {
    eyeLook, eyeLookY, eyeOpen, eyeTear, eyeBlush, eyePupilSize,
    eyePupilLookX, eyePupilLookY,
    browLeft, browRight,
    mouthOpen, mouthWidth, mouthCurve,
    blushLevel,
    bodyLean
  } = expressions;

  // Calculate eye positions based on look direction

  // Calculate pupil position within eye
  const pupilOffsetX = eyePupilLookX * 3; // Scale to blob eye dimensions
  const pupilOffsetY = eyePupilLookY * 3;

  // Eye height based on openness
  const eyeHeight = 12 + (eyeOpen * 6); // 12-18px
  const eyeWidth = 10 + (eyeOpen * 4); // 10-14px

  // Tear positioning
  const tearOffset = eyeTear * 8; // 0-8px down

  // Blush positioning
  const blushOffset = eyeBlush * 12; // 0-12px out

  return (
    <span
      className={`blob look-${eyeLook} look-${eyeLookY}`}
      aria-hidden="true"
      style={{
        transform: `translate(${bodyLean * 4}px, 0) rotate(${bodyLean * 1}deg)`, // -0.8 to 0.8px, -0.5 to 0.5deg
        borderRadius: `${40 + (Math.sin(Date.now() / 1000) * 10)}%` // Subtle morphing
      }}
    >
      {/* Eyes */}
      <span className="blob-gaze">
        <span
          className="blob-eye"
          style={{
            width: `${eyeWidth}px`,
            height: `${eyeHeight}px`,
            background: `radial-gradient(circle at ${50 + (eyePupilLookX * 30)}% ${50 + (eyePupilLookY * 30)}%, var(--eye), transparent 70%)`,
            boxShadow: `0 0 ${8 * eyePupilSize}px var(--acc-glow)`,
              borderRadius: '50%',
              transform: `translate(${pupilOffsetX + gaze.x * 3}px, ${pupilOffsetY + gaze.y * 3}px)`
            }}
          ><i /></span>
        <span
          className="blob-eye"
          style={{
            width: `${eyeWidth}px`,
            height: `${eyeHeight}px`,
            background: `radial-gradient(circle at ${50 - (eyePupilLookX * 30)}% ${50 - (eyePupilLookY * 30)}%, var(--eye), transparent 70%)`,
            boxShadow: `0 0 ${8 * eyePupilSize}px var(--acc-glow)`,
              borderRadius: '50%',
              transform: `translate(${-pupilOffsetX + gaze.x * 3}px, ${-pupilOffsetY + gaze.y * 3}px)`
            }}
          ><i /></span>
      </span>

      {/* Eyebrows (very subtle for blob) */}
      <span className="blob-brows" style={{ position: 'absolute', top: '-4px', left: '0', width: '100%', height: '100%', pointerEvents: 'none' }}>
        <span
          className="blob-brow left"
          style={{
            position: 'absolute',
            left: '12px',
            top: `${8 - browLeft.height * 10}px`,
            width: '6px',
            height: '1px',
            background: '#3a4656',
            transformOrigin: 'left center',
            transform: `rotate(${browLeft.angle * 0.3}deg)`
          }}
          ><i /></span>
          <span
            className="blob-brow right"
            style={{
              position: 'absolute',
              right: '12px',
              top: `${8 - browRight.height * 10}px`,
              width: '6px',
              height: '1px',
              background: '#3a4656',
              transformOrigin: 'right center',
              transform: `rotate(${-browRight.angle * 0.3}deg)`
            }}
          ><i /></span>
      </span>

      {/* Tears */}
      {eyeTear > 0 && (
        <>
          <span
            className="mate-tears"
            style={{
              position: 'absolute',
              top: `${16 + tearOffset}px`,
              left: '24px',
              width: '4px',
              height: '6px',
              background: '#7fb8ff',
              opacity: 0.7,
              borderRadius: '50%',
              transform: `translateY(${tearOffset}px)`
            }}
            ><i /><i /></span>
          <span
            className="mate-tears"
            style={{
              position: 'absolute',
              top: `${16 + tearOffset}px`,
              left: '34px',
              width: '4px',
              height: '6px',
              background: '#7fb8ff',
              opacity: 0.7,
              borderRadius: '50%',
              transform: `translateY(${tearOffset}px)`
            }}
            ><i /><i /></span>
          </>
        )}

        {/* Blush */}
        {blushLevel > 0 && (
          <>
            <span
              className="mate-blush"
              style={{
                position: 'absolute',
                top: `${28 + blushOffset}px`,
                left: '16px',
                width: '12px',
                height: '8px',
                background: `rgba(255, 130, 165, ${blushLevel * 0.5})`,
                borderRadius: '50%'
              }}
            ><i /><i /></span>
            <span
              className="mate-blush"
              style={{
                position: 'absolute',
                top: `${28 + blushOffset}px`,
                right: '16px',
                width: '12px',
                height: '8px',
                background: `rgba(255, 130, 165, ${blushLevel * 0.5})`,
                borderRadius: '50%'
              }}
            ><i /><i /></span>
          </>
        )}

        {/* Mouth */}
        <span
          className="blob-mouth"
          style={{
            position: 'absolute',
            bottom: '12px',
            left: '50%',
            transform: `translateX(-50%)`,
            width: `${12 * mouthWidth}px`,
            height: `${4 + (mouthOpen * 6)}px`, // 4-10px
            borderBottom: mouthCurve < 0 ? '2px solid var(--eye)' : 'none',
            borderTop: mouthCurve > 0 ? '2px solid var(--eye)' : 'none',
            borderRadius: mouthCurve < 0 ? '50% 50% 0 0' : mouthCurve > 0 ? '0 0 50% 50%' : '0'
          }}
        ><i /></span>
      </span>
  );
}

export default function PetStage() {
  // Enhanced EMO expressions state
  const [expressions, setExpressions] = useState<EMOExpressions>({
    // Eyes
    eyeLook: 'center',
    eyeLookY: 'center',
    eyeOpen: 0.9,
    eyeTear: 0,
    eyeBlush: 0,
    eyePupilSize: 1,
    eyePupilLookX: 0,
    eyePupilLookY: 0,

    // Eyebrows
    browLeft: { height: 0.5, angle: 0 },
    browRight: { height: 0.5, angle: 0 },

    // Mouth
    mouthOpen: 0.1,
    mouthWidth: 1,
    mouthCurve: 0,

    // Blush and tears
    blushLevel: 0,
    tearLevel: 0,

    // Additional elements
    antennaWag: 0,
    bodyLean: 0
  });

  // Legacy state for compatibility (will be migrated)
  const [look, setLook] = useState<Look>('center');
  const [lookY, setLookY] = useState<LookY>('center');
  const [mode, setMode] = useState<Mode>('awake');
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [config, setConfig] = useState(loadSettings);
  const configRef = useRef(config);
  configRef.current = config;
  const [pet, setPet] = useState<PetKind>(() => loadSettings().pet);
  const [animationTime, setAnimationTime] = useState(Date.now());
  useEffect(() => {
    const tick = window.setInterval(() => setAnimationTime(Date.now()), 200);
    return () => window.clearInterval(tick);
  }, []);
  const [petName, setPetName] = useState(() => loadSettings().petName);
  const [bubble, setBubble] = useState<string | null>(null);
  const [song, setSong] = useState<string | null>(null);
  const [musicPlaying, setMusicPlaying] = useState(false);
  const [hasMedia, setHasMedia] = useState(false);
  const [microphoneReady, setMicrophoneReady] = useState(false);
  const [voiceAwake, setVoiceAwake] = useState(false);
  useEffect(() => window.mate.onSpeech(event => {
    if (typeof event.enabled === 'boolean') setMicrophoneReady(event.enabled);
  }), []);
  useEffect(() => bus.on('cinemate-listening', active => setVoiceAwake(!!active)), []);
  const [emotion, setEmotion] = useState<Emotion>('neutral');
  const [quiet, setQuiet] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [faceDisplay, setFaceDisplay] = useState<FaceDisplay | null>(null);
  useEffect(() => {
    let expiry: number | undefined;
    const off = bus.on(CHANNELS.display, payload => {
      window.clearTimeout(expiry);
      const display = payload as FaceDisplay | null;
      setFaceDisplay(display);
      if (display?.expiresAt) expiry = window.setTimeout(() => setFaceDisplay(null), Math.max(0, display.expiresAt - Date.now()));
    });
    return () => { off(); window.clearTimeout(expiry); };
  }, []);
  const [movie, setMovie] = useState(false);
  const lastJoke = useRef(0);
  const [idle, setIdle] = useState(false);
  const [hop, setHop] = useState(0);
  const [flying, setFlying] = useState(false);
  const position = useRef({ x: 0, y: 0 });
  const travel = useRef<number | null>(null);
  const [near, setNear] = useState(false);
  const [atTop, setAtTop] = useState(false);
  const [nightStyle, setNightStyle] = useState(() => new Date().getHours() >= 19 || new Date().getHours() < 7);
  useEffect(() => {
    const interval = window.setInterval(() => setNightStyle(new Date().getHours() >= 19 || new Date().getHours() < 7), 60000);
    return () => window.clearInterval(interval);
  }, []);
  useEffect(() => { if (config.quietCompanion) setBubble(null); }, [config.quietCompanion]);
  const [gaze, setGaze] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const petButtonRef = useRef<HTMLButtonElement | null>(null);
  const timers = useRef<number[]>([]);
  const drag = useRef<{ sx: number; sy: number; wx: number; wy: number } | null>(null);
  const lastSeen = useRef(Date.now());
  const lastComment = useRef(0);
  const lastCursor = useRef({ x: 0, y: 0 });
  const areaRef = useRef<CursorState['area'] | null>(null);
  const windowTitle = useRef('');
  const lastFullscreen = useRef(false);

  const later = useCallback((fn: () => void, ms: number) => {
    const t = window.setTimeout(fn, ms);
    timers.current.push(t);
  }, []);

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  useEffect(() => bus.on(CHANNELS.now, (p) => {
    const info = p as { title?: string; artist?: string; playing?: boolean } | null;
    setHasMedia(!!info?.title);
    setMusicPlaying(info?.playing === true);
    if (!info?.playing || !info.title) {
      setSong(null);
      return;
    }
    const label = `${info.artist ? `${info.artist} — ` : ''}${info.title}`;
    setSong(label);
    setEmotion((prev) => {
      const next = inferSongMood(label);
      if (next !== prev) {
        bus.emit(CHANNELS.emotion, next);
        const pool = MOOD_COMMENTS[next];
        if (!configRef.current.quietCompanion) setBubble(pool[Math.floor(Math.random() * pool.length)]);
        later(() => setBubble(null), 5000);
      }
      return next;
    });
  }), [later]);

// Ambient awareness: react to the app in front of the user.
useEffect(() => window.mate.onContext((title) => {
    windowTitle.current = title;
    if (configRef.current.quietCompanion) return;
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
    const cfg = p as ReturnType<typeof loadSettings>;
    setConfig(prev => ({ ...prev, ...cfg }));
    if (cfg.pet) setPet(cfg.pet);
    if (cfg.petName) setPetName(cfg.petName);
  }), []);

  useEffect(() => {
    const off = window.mate.onCursor((s: CursorState) => {
      const dx = s.cursor.x - (s.winPos.x + 130);
      const dy = s.cursor.y - (s.winPos.y + 125);
      if (s.cursor.x !== lastCursor.current.x || s.cursor.y !== lastCursor.current.y) lastSeen.current = Date.now();
      lastCursor.current = s.cursor;
      position.current = s.winPos;
      setAtTop(s.winPos.y < s.area.y + 8);
      setGaze({ x: Math.max(-1, Math.min(1, dx / 260)), y: Math.max(-1, Math.min(1, dy / 220)) });
      areaRef.current = s.area;
      setLook(dx < -50 ? 'left' : dx > 50 ? 'right' : 'center');
      setLookY(dy < -70 ? 'up' : dy > 70 ? 'down' : 'center');
      setNear(Math.hypot(dx, dy) < 90);
    });
    return off;
  }, []);

  // Renderer-side cursor radar: forwarded mousemove events reach this
  // webContents even in click-through mode, so the eyes follow the cursor
  // without depending on the main-process poll.
  useEffect(() => {
    const onMove = (ev: MouseEvent) => {
      const btn = petButtonRef.current;
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height * 0.3;
      let dx = (ev.clientX - cx) / (rect.width * 1.6);
      let dy = (ev.clientY - cy) / (rect.height * 1.6);
      dx = Math.max(-1, Math.min(1, dx));
      dy = Math.max(-1, Math.min(1, dy));
      if (Math.abs(dx) < 0.12) dx = 0;
      if (Math.abs(dy) < 0.12) dy = 0;
      setGaze((prev) => (prev.x === dx && prev.y === dy ? prev : { x: dx, y: dy }));
    };
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
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

// Update expressions based on state and emotions
  useEffect(() => {
    // Default expressions (neutral state)
    const defaultExpr: EMOExpressions = {
      // Eyes
      eyeLook: look,
      eyeLookY: lookY,
      eyeOpen: 0.9,
      eyeTear: 0,
      eyeBlush: 0,
      eyePupilSize: 1,
      eyePupilLookX: gaze.x * 0.5,
      eyePupilLookY: gaze.y * 0.5,

      // Eyebrows
      browLeft: { height: 0.5, angle: 0 },
      browRight: { height: 0.5, angle: 0 },

      // Mouth
      mouthOpen: 0.1,
      mouthWidth: 1,
      mouthCurve: 0,

      // Blush and tears
      blushLevel: 0,
      tearLevel: 0,

      // Additional elements
      antennaWag: 0,
      bodyLean: 0
    };

    // Modify based on mode
    let expr: EMOExpressions = { ...defaultExpr };

    switch (mode) {
      case 'sleeping':
        expr.eyeOpen = 0.1;
        expr.mouthOpen = 0.05;
        expr.mouthCurve = -0.2; // slight frown
        expr.browLeft.height = 0.3;
        expr.browRight.height = 0.3;
        expr.bodyLean = -0.05; // slight lean forward
        break;

      case 'singing':
        expr.eyeOpen = 0.7;
        expr.mouthOpen = 0.8;
        expr.mouthCurve = 0.6; // happy smile
        expr.eyePupilSize = 1.3;
        expr.antennaWag = 0.3 * Math.sin(Date.now() / 200); // waggling
        expr.bodyLean = 0.1 * Math.sin(Date.now() / 300); // bouncing
        break;

      case 'dancing':
        expr.eyeOpen = 0.8;
        expr.mouthOpen = 0.5;
        expr.mouthCurve = 0.4; // smiling
        expr.eyePupilSize = 1.2;
        expr.bodyLean = 0.2 * Math.sin(Date.now() / 150); // leaning side to side
        break;

      case 'awake':
      default:
        // Base awake state - will be modified by emotion and other factors below
        break;
    }

    // Modify based on emotion overlay
    switch (overlay) {
      case 'love':
        expr.eyeBlush = 0.7;
        expr.mouthCurve = 0.5; // happy smile
        expr.eyePupilSize = 1.2;
        expr.browLeft.height = 0.6;
        expr.browRight.height = 0.6;
        expr.bodyLean = -0.03; // slightly leaning in (affectionate)
        break;

      case 'sad':
        expr.eyeOpen = 0.4;
        expr.mouthOpen = 0.2;
        expr.mouthCurve = -0.5; // frown
        expr.eyeTear = 0.6;
        expr.browLeft.height = 0.3;
        expr.browRight.height = 0.3;
        expr.browLeft.angle = -5;
        expr.browRight.angle = 5; // furrowed brows
        expr.bodyLean = 0.05; // slightly slumped
        break;

      case 'curious':
        expr.eyeLookY = 'up'; // looking up
        expr.eyePupilLookX = 0.2 * (Math.sin(Date.now() / 1000)); // scanning
        expr.eyePupilLookY = 0.1 * Math.cos(Date.now() / 800);
        expr.eyeOpen = 0.95;
        expr.mouthCurve = 0.1; // slight smile
        expr.browLeft.height = 0.7;
        expr.browRight.height = 0.7;
        expr.browLeft.angle = -3;
        expr.browRight.angle = 3; // raised eyebrows
        expr.bodyLean = -0.02; // leaning forward slightly
        break;

      case 'laugh':
        expr.eyeOpen = 0.6;
        expr.mouthOpen = 0.9;
        expr.mouthCurve = 0.8; // big smile/laugh
        expr.eyePupilSize = 0.7; // squinting
        expr.eyeTear = 0.3; // happy tears
        expr.antennaWag = 0.5 * Math.sin(Date.now() / 100); // waggling
        expr.bodyLean = 0.3 * Math.sin(Date.now() / 120); // rocking
        break;
    }

    // Modify based on emotion (from music detection)
    switch (emotion) {
      case 'love':
        expr.eyeBlush = Math.max(expr.eyeBlush, 0.5);
        expr.mouthCurve = Math.max(expr.mouthCurve, 0.3);
        break;

      case 'melancholy':
        expr.eyeOpen = Math.min(expr.eyeOpen, 0.6);
        expr.mouthCurve = Math.min(expr.mouthCurve, -0.2);
        expr.eyeTear = Math.max(expr.eyeTear, 0.4);
        break;

      case 'hype':
        expr.eyePupilSize = Math.max(expr.eyePupilSize, 1.3);
        expr.antennaWag = Math.max(Math.abs(expr.antennaWag), 0.4) * (Math.sin(Date.now() / 150) > 0 ? 1 : -1);
        expr.bodyLean = Math.max(Math.abs(expr.bodyLean), 0.15) * (Math.sin(Date.now() / 200) > 0 ? 1 : -1);
        break;

      case 'dreamy':
        expr.eyeOpen = Math.min(expr.eyeOpen, 0.7);
        expr.mouthCurve = Math.max(expr.mouthCurve, 0.2);
        expr.bodyLean = -0.05; // relaxed, leaning back slightly
        break;

      case 'spooky':
        expr.eyeOpen = Math.max(expr.eyeOpen, 0.8); // wide eyes
        expr.eyePupilSize = Math.min(expr.eyePupilSize, 0.6); // small pupils
        expr.mouthCurve = Math.min(expr.mouthCurve, -0.1);
        expr.bodyLean = 0.02; // slightly tense
        break;

      case 'focus':
        expr.eyePupilSize = Math.max(expr.eyePupilSize, 1.4); // focused, dilated pupils
        expr.mouthOpen = Math.min(expr.mouthOpen, 0.2); // closed mouth
        expr.mouthCurve = 0; // neutral mouth
        expr.browLeft.height = Math.max(expr.browLeft.height, 0.7); // focused brows
        expr.browRight.height = Math.max(expr.browRight.height, 0.7);
        break;

      case 'neutral':
      default:
        // Keep current values
        break;
    }

    // Modify based on idle state
    if (idle) {
      expr.eyeOpen = Math.max(0.2, expr.eyeOpen * 0.7); // eyes half closed
      expr.mouthOpen = Math.max(0.05, expr.mouthOpen * 0.5); // mouth more closed
      expr.bodyLean = expr.bodyLean * 0.8; // more relaxed

      // Add subtle scanning when idle
      if (!thinking && !song) {
        expr.eyePupilLookX = 0.3 * Math.sin(Date.now() / 3000);
        expr.eyePupilLookY = 0.2 * Math.cos(Date.now() / 2500);
        expr.antennaWag = 0.1 * Math.sin(Date.now() / 4000);
      }
    }

    // Modify based on thinking state
    if (thinking) {
      expr.eyePupilLookX = 0.4 * Math.sin(Date.now() / 700); // scanning back and forth
      expr.eyePupilLookY = 0.2 * Math.cos(Date.now() / 500);
      expr.mouthOpen = Math.max(0.05, expr.mouthOpen * 0.3); // mouth mostly closed
      expr.bodyLean = -0.08; // leaning forward in thought
      expr.antennaWag = 0.2 * Math.sin(Date.now() / 600); // slight wag
    }

    // Modify based on proximity (when user is near)
    if (near) {
      expr.eyeBlush = Math.max(expr.eyeBlush, 0.3);
      expr.bodyLean = expr.bodyLean - 0.05; // leaning in slightly
      expr.mouthCurve = Math.max(expr.mouthCurve, 0.2); // happier when someone's near
    }

    // Add subtle breathing animation
    const breathCycle = (animationTime % 6000) / 6000; // 0-1 over 6 seconds
    const breathAmount = Math.sin(breathCycle * Math.PI * 2) * 0.05; // -0.05 to 0.05
    expr.bodyLean += breathAmount;

    // Add subtle blinking
    const blinkCycle = (animationTime % 4000) / 4000; // 0-1 over 4 seconds
    if (blinkCycle > 0.95 && !thinking && mode !== 'sleeping') {
      expr.eyeOpen = 0.1; // blink
    } else if (blinkCycle > 0.9 && !thinking && mode !== 'sleeping') {
      expr.eyeOpen = 0.4; // half blink
    }

    // Apply the expressions
    setExpressions(expr);
  }, [mode, overlay, emotion, idle, thinking, near, song, look, lookY, gaze, animationTime]);

// Movie mode: fullscreen + a video app in front = crack a joke mid-watch.
useEffect(() => {
  const t = window.setInterval(() => {
    if (!movie || thinking || configRef.current.quietCompanion) return;
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
    const enteringFullscreen = fullscreen && !lastFullscreen.current;
    lastFullscreen.current = fullscreen;
    const area = areaRef.current;
    if (fullscreen && windowTitle.current && VIDEO_APP.test(windowTitle.current)) {
      setMovie(true);
    } else if (!fullscreen) {
      setMovie(false);
    }
    if (!area || configRef.current.stayPut || drag.current || !configRef.current.wander) return;
    if (enteringFullscreen) {
      // Tuck into whichever screen corner is furthest from the cursor.
      const c = lastCursor.current;
      const corners = [
        { x: area.x + 16, y: area.y + area.height - window.innerHeight - 16 },
        { x: area.x + area.width - window.innerWidth - 16, y: area.y + area.height - window.innerHeight - 16 },
        { x: area.x + 16, y: area.y + 16 },
        { x: area.x + area.width - window.innerWidth - 16, y: area.y + 16 }
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
    const stop = () => {
      if (travel.current !== null) window.clearInterval(travel.current);
      travel.current = null;
      setFlying(false);
    };
    if (!config.wander || config.stayPut || quiet || idle || thinking || mode !== 'awake') { stop(); return; }
    const t = window.setInterval(() => {
      const area = areaRef.current;
      if (!area || near || drag.current || travel.current !== null) return;
      const start = { ...position.current };
      const target = Math.min(Math.max(start.x + (Math.random() > 0.5 ? 1 : -1) * (80 + Math.random() * 120), area.x + 16), area.x + area.width - window.innerWidth - 16);
      const began = Date.now();
      setFlying(true);
      travel.current = window.setInterval(() => {
        if (drag.current) { stop(); return; }
        const progress = Math.min(1, (Date.now() - began) / 2600);
        const eased = progress * progress * (3 - 2 * progress);
        window.mate.move(start.x + (target - start.x) * eased, start.y);
        if (progress >= 1) stop();
      }, 40);
    }, 24_000);
    return () => { window.clearInterval(t); stop(); };
  }, [config.wander, config.stayPut, quiet, idle, thinking, mode, near]);

  const face: Mode = idle ? 'sleeping' : mode;

  // Priority: thinking, then a message, then the song it hears, then idle chatter.
  const bubbleText = bubble ?? (config.quietCompanion ? null : song ? `♪ ${song}` : (near ? 'Hey, you.' : null));

  // Determine CSS class based on state for backwards compatibility with existing CSS
  const getPetClass = (): string => {
    let base = `mate-body pet-${pet} emo-expressive${hop % 2 ? ' fidget' : ''}`; // Always use expressive mode now

    // Mode-based classes
    if (face === 'sleeping') base += ' sleeping';
    else if (mode === 'singing') base += ' singing';
    else if (mode === 'dancing') base += ' dancing';
    else if (thinking) base += ' thinking';
    else if (quiet) base += ' quiet';

    // Emotion-based classes (for backward compatibility with existing emotion CSS)
    if (overlay === 'love') base += ' love';
    else if (overlay === 'sad') base += ' sad';
    else if (overlay === 'curious') base += ' curious';
    else if (overlay === 'laugh') base += ' laugh';

    // Emotion from music
    if (emotion === 'love') base += ' emo-love';
    else if (emotion === 'melancholy') base += ' emo-melancholy';
    else if (emotion === 'hype') base += ' emo-hype';
    else if (emotion === 'dreamy') base += ' emo-dreamy';
    else if (emotion === 'spooky') base += ' emo-spooky';
    else if (emotion === 'focus') base += ' emo-focus';

    // Additional state classes
    if (flying) base += ' flying';
    if (near && face === 'awake' && !overlay) base += ' excited';
    if (idle && !thinking && !song) base += ' idle-scanning';

    return base;
  };

  const cls = getPetClass();
  useEffect(() => {
    const report = () => {
      const button = petButtonRef.current;
      if (button) window.mate.setPetInset(Math.max(0, (button.parentElement?.offsetTop || 0) - 12));
    };
    const frame = requestAnimationFrame(report);
    const observer = new ResizeObserver(report);
    if (petButtonRef.current) observer.observe(petButtonRef.current);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, [config.size, pet]);

  return (
    <div className={`stage pet-stage size-${config.size}${atTop ? ' edge-top' : ''}${config.autoDayNight && nightStyle ? ' night-style' : ''}`} data-mate-theme={config.theme}>
      <div className="pet-anchor">
      {thinking ? (
        <div className="bubble think-bubble" aria-label="Cine is thinking"><i /><i /><i /></div>
      ) : bubbleText ? (
        <div className={`bubble${song && !bubble ? ' song' : ''}`} title={bubbleText}>{bubbleText}</div>
      ) : null}
      <button
        ref={petButtonRef}
        type="button"
        className={cls}
        aria-label={`${petName}. Drag to move. Right-click for options.`}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          window.mate.setDragging(true);
          const start = { sx: e.screenX, sy: e.screenY };
          drag.current = { ...start, wx: e.screenX - e.clientX, wy: e.screenY - e.clientY };
          const move = (ev: PointerEvent) => {
            if (!drag.current) return;
            window.mate.move(drag.current.wx + ev.screenX - drag.current.sx, drag.current.wy + ev.screenY - drag.current.sy);
          };
          const up = (ev: PointerEvent) => {
            if (drag.current && Math.hypot(ev.screenX - drag.current.sx, ev.screenY - drag.current.sy) < 6) {
              setMode('awake');
              setOverlay('love');
              setBubble('Hey, you.');
              later(() => { setOverlay(null); setBubble(null); }, 2200);
            }
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
            window.removeEventListener('pointercancel', up);
            drag.current = null;
            window.mate.setDragging(false);
          };
          window.addEventListener('pointermove', move);
          window.addEventListener('pointerup', up);
          window.addEventListener('pointercancel', up, { once: true });
        }}
        onDoubleClick={() => { setMode('dancing'); later(() => setMode('awake'), 1600); }}
        onContextMenu={(e) => { e.preventDefault(); window.mate.menu(); }}
      >
        {pet === 'cat' ? <CatFace expressions={expressions} /> : pet === 'blob' ? <BlobFace expressions={expressions} gaze={gaze} /> : <CineCharacter face={expressions} gaze={gaze} sleeping={face === 'sleeping'} affectionate={overlay === 'love'} propelled={flying} display={faceDisplay} headphones={musicPlaying} accessory={config.accessory} headphoneColor={config.headphoneColor} />}
        {face === 'sleeping' && <span className="mate-zzz" aria-hidden="true"><i>z</i><i>z</i><i>Z</i></span>}
      </button>
      </div>
      <div className="pet-dock">
        <button className="pet-chat" title="Toggle chat" aria-label="Toggle chat" onClick={() => window.mate.hubToggle()}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 17l-1 4 5-3h8a4 4 0 004-4V7a4 4 0 00-4-4H7a4 4 0 00-4 4v6a4 4 0 002 4z"/><path d="M8 9h8M8 13h5"/></svg></button>
        <span>{petName}{microphoneReady && <b className={`mic-dot${voiceAwake ? ' awake' : ''}`} title="Microphone on · click mic to switch off" aria-label="Microphone on" />}{!hasMedia && <i>{voiceAwake ? 'listening...' : face === 'sleeping' ? 'resting' : thinking ? 'thinking' : mode === 'dancing' ? 'happy feet' : microphoneReady ? 'mic on' : 'mic off'}</i>}</span>
        {hasMedia && <div className="pet-media-controls">
          <button type="button" title="Previous track" aria-label="Previous track" onClick={() => window.mate.media('prev')}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5v14M19 5l-11 7 11 7z" /></svg></button>
          <button type="button" title={musicPlaying ? 'Pause music' : 'Play music'} aria-label={musicPlaying ? 'Pause music' : 'Play music'} onClick={() => window.mate.media('playpause')}><svg viewBox="0 0 24 24" aria-hidden="true">{musicPlaying ? <path d="M8 5v14M16 5v14" /> : <path d="M7 4l13 8-13 8z" />}</svg></button>
          <button type="button" title="Next track" aria-label="Next track" onClick={() => window.mate.media('next')}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 5v14M5 5l11 7-11 7z" /></svg></button>
        </div>}
        <button className="pet-mic" title={microphoneReady ? 'Turn microphone off' : 'Turn microphone on'} aria-label={microphoneReady ? 'Turn microphone off' : 'Turn microphone on'} aria-pressed={microphoneReady} onClick={() => { void window.mate.captureSpeech(); }}><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11v1a7 7 0 0014 0v-1M12 19v3M8 22h8"/>{!microphoneReady && <path d="M3 3l18 18"/>}</svg></button>
        <button className="pet-options" title="Cine options" aria-label="Cine options" onClick={() => window.mate.menu()}><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg></button>
      </div>
    </div>
  );
}

export { CHANNELS };
