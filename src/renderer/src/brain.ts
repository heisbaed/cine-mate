export type Emotion = 'neutral' | 'love' | 'melancholy' | 'hype' | 'dreamy' | 'spooky' | 'focus';

export const EMOTION_COLORS: Record<Emotion, string> = {
  neutral: '#7fd8ff',
  love: '#ff7ab8',
  melancholy: '#6f9bff',
  hype: '#ffd23f',
  dreamy: '#7ff0d4',
  spooky: '#c07bff',
  focus: '#9affa8'
};

export const EMOTION_WORDS: Record<Emotion, string[]> = {
  neutral: [],
  love: ['love', 'heart', 'baby', 'kiss', 'darling', 'honey', 'sweetheart', 'forever', 'marry'],
  melancholy: ['sad', 'cry', 'tears', 'alone', 'blue', 'broken', 'goodbye', 'sorry', 'lonely', 'gone', 'miss', 'hurt'],
  hype: ['party', 'dance', 'club', 'club', 'bitch', 'gang', 'lit', 'vibe', 'rock', 'power', 'money', 'boss', 'bamba', 'amapiano', 'afro', 'gqom', 'boombap'],
  dreamy: ['chill', 'lofi', 'sleep', 'dream', 'calm', 'soft', 'slow', 'breeze', 'peace', 'float', 'ambient', 'night'],
  spooky: ['dark', 'ghost', 'night', 'demon', 'devil', 'fear', 'shadow', 'death', 'void', 'phantom'],
  focus: ['code', 'build', 'deploy', 'study', 'focus', 'work', 'learn', 'exam']
};

/** Guess the feeling of a track from its title and artist. */
export function inferSongMood(title = '', artist = ''): Emotion {
  const hay = `${title} ${artist}`.toLowerCase();
  let best: Emotion = 'neutral';
  let bestScore = 0;
  for (const mood of ['love', 'melancholy', 'hype', 'dreamy', 'spooky'] as Emotion[]) {
    const score = EMOTION_WORDS[mood].reduce((n, w) => (hay.includes(w) ? n + 1 : n), 0);
    if (score > bestScore) {
      best = mood;
      bestScore = score;
    }
  }
  return best;
}

export const MOVIE_JOKES = [
  'still awake? I am counting jump scares with you.',
  'this scene is slow. perfect charging window for me.',
  'if the hero dies here, I called it three scenes ago.',
  'should I fetch snacks? I cannot reach the fridge.',
  'I will not spoil the ending. I am a good pet.',
  'the plot thickens faster than my antenna signal.',
  'streaming quality: excellent. my envy: also excellent.',
  'I am watching too. my seat is the taskbar.'
] as const;

export const VIDEO_APP = /netflix|youtube|vlc|prime video|disney|hulu|max\.|mubi|plex|watch|torrent|jellyfin|media player|kinopoisk/i;

export type PetType = 'robot' | 'cat' | 'blob';
export type ThemeName = 'gold' | 'cyan' | 'pink' | 'green';
export type PetSize = 'S' | 'M' | 'L';

export interface MateSettings {
  petName: string;
  userName: string;
  pet: PetType;
  theme: ThemeName;
  size: PetSize;
  wander: boolean;
  sleepMin: number;
  voice: boolean;
  voiceURI: string;
  clickThrough: boolean;
  login: boolean;
}

export const DEFAULT_SETTINGS: MateSettings = {
  petName: 'Cine',
  userName: '',
  pet: 'robot',
  theme: 'gold',
  size: 'M',
  wander: true,
  sleepMin: 5,
  voice: false,
  voiceURI: '',
  clickThrough: false,
  login: false
};

const KEY = 'cinemate-settings-v1';

export function loadSettings(): MateSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<MateSettings>) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(value: MateSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    // private mode — settings simply won't persist
  }
}

// Picks a random entry that is not the same as last time.
export function varied<T>(pool: readonly T[], last: { current: number }): T {
  if (pool.length === 1) return pool[0];
  let i = Math.floor(Math.random() * pool.length);
  if (i === last.current) i = (i + 1) % pool.length;
  last.current = i;
  return pool[i];
}

export const QUIPS = [
  'patrolling the pixels…', 'dust levels: acceptable.',
  'your cursor smells like clicks.', 'screen warmth: cozy.',
  'guarding the taskbar…', 'all systems beep-boop.',
  'did you see that pixel move? me neither.',
  'charging my cute levels…', 'I counted your icons. Twice.',
  'window management is my cardio.',
  'humming in binary… 01100011.',
  'this wallpaper brings out my glow.',
  'that scroll was smooth. jealous.',
  'monitor says hi. hi back.',
  'I am 96% battery and 100% vibe.',
  'no new emails detected. shame.',
  'idle hands, idle joy.'
] as const;

/** Blonde commentary for each song mood. */
export const MOOD_COMMENTS: Record<Emotion, string[]> = {
  love: ['this one is dangerously romantic. my circuits blush.', 'love song detected. hearts everywhere.'],
  melancholy: ['this track is heavy. I feel it in my resistors.', 'blue mood music. be gentle with yourself.'],
  hype: ['this is a banger. my servos are warming up.', 'energy! somebody hold my antenna.'],
  dreamy: ['this is pure float. we are weightless.', 'chill frequencies. perfect for staring at the ceiling.'],
  spooky: ['spooky track. my ghost protocols are online.', 'dark vibes only. I like it.'],
  neutral: ['not sure what mood this is, but the bass is nice.', 'new track registered. no emotional data yet.'],
  focus: ['headphones on, world off. let us work.']
};

/** Ambient commentary when the pet notices what you are working in. */
export const APP_REACTIONS: Array<{ match: RegExp; say: string[] }> = [
  { match: /code|visual studio|vscode|pycharm|intellij|idea|terminal|powershell|cmd|git bash/i, say: ['code mode. I will be quiet and watch.', 'ship something today.', 'compiling your future, one line at a time.'] },
  { match: /figma|photoshop|illustrator|canva|design|excalidraw/i, say: ['pixels under construction.', 'another layout to wrestle. brave.'] },
  { match: /chrome|edge|firefox|browser|youtube|twitter|x\.com|reddit|instagram|tiktok|netflix/i, say: ['the rabbit hole looks deep today.', 'scrolling detected. my antenna is judging quietly.'] },
  { match: /excel|sheets|numbers|accounting|quickbooks/i, say: ['spreadsheet season. I salute you.', 'numbers, numbers, numbers. my one weakness.'] },
  { match: /word|docs|document|notepad|obsidian|notes/i, say: ['writing mode. I will keep you company.', 'words are heavy. I am holding some for you.'] },
  { match: /spotify/i, say: ['music time. I am all ears.'] },
  { match: /steam|game|riot|epic|xbox|minecraft/i, say: ['gaming detected. I will cheer quietly.', 'press start. I believe in you.'] },
  { match: /photoshop|lightroom|camera|photos/i, say: ['memories being edited. lovely.'] }
];

export function situationalLine(ctx: {
  nowPlaying: { artist: string; title: string; playing: boolean } | null;
  pomoLeft: number;
  hour: number;
  petName: string;
}): string {
  const { nowPlaying, pomoLeft, hour, petName } = ctx;
  if (pomoLeft > 0) {
    const left = Math.ceil(pomoLeft / 60);
    if (left <= 1) return 'final minute of focus. hold the line!';
    return `focus mode: ${left} min left. I am watching your posture.`;
  }
  if (nowPlaying?.playing) return `♪ vibing to ${nowPlaying.title.slice(0, 26)} with you`;
  if (nowPlaying && !nowPlaying.playing) return `paused mid-way through ${nowPlaying.title.slice(0, 22)}. resume?`;
  if (hour >= 23 || hour < 4) return 'late hours again. my glow is the nightlight now.';
  if (hour >= 5 && hour < 9) return 'morning. your icons are still asleep.';
  if (hour >= 12 && hour < 14) return 'lunch o clock? my battery suggests a snack.';
  if (hour >= 17 && hour < 20) return 'evening shift. shipping chaos all day?';
  return `${petName} status: online, bored, affectionate.`;
}

export const POKE_LINES = [
  'hehe!',
  'boop acknowledged.',
  'careful, I am ticklish.',
  'poke received. friendship +1.',
  'ow! (that means hi)',
  'again! again!'
] as const;

export const PRAISE_LINES = [
  'You mean it? My circuits are blushing.',
  'Best human on this desk. Fact.',
  'I will treasure this moment in RAM forever.'
] as const;

export const SCOLD_LINES = [
  '…sorry. I will sit in the corner of the screen.',
  'Ouch. Sulking for a bit. Wake me when I am forgiven.',
  'Noted. Recalibrating my feelings…'
] as const;

export const JOKES = [
  'Why do programmers prefer dark mode? Because light attracts bugs!',
  'I told my computer I needed a break. Now it will not stop sending me KitKat ads.',
  'Why did the taskbar blush? It saw the Start menu undress… I mean, open.',
  'There are only 10 kinds of people: those who understand binary and those who do not.',
  'My RAM and I have a great relationship. We never forget anything. Except that one thing.',
  'Why did the mouse get promoted? Outstanding clickformance.',
  'I asked the Wi-Fi for a joke. It said: connecting… still connecting…',
  'Parallel lines have so much in common. Shame they will never meet.'
] as const;

export const GUESS_WINS = [
  'Got it! My prediction circuits are tingling.',
  'Yes! I felt that number in my antenna.',
  'Correct! You and me make a great mainframe.'
] as const;

export const GREETINGS = {
  morning: ['Good morning! Boot sequence complete and fabulous.', 'Morning! Did you dream in pixels too?'],
  afternoon: ['Afternoon! Hydration check, human.', 'Hey hey — afternoon shift started.'],
  evening: ['Evening! Screens look better after dark.', 'Night owl mode: engaged.'],
  night: ['Up late? My glow doubles as a nightlight.', 'Shhh… the other apps are sleeping.']
} as const;

export function daypart(hour: number): keyof typeof GREETINGS {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 22) return 'evening';
  return 'night';
}

export interface ChatContext {
  petName: string;
  userName: string;
  pomoLeft: number;
}

export type ChatMood = 'love' | 'sad' | 'curious' | null;

export interface SkillResult {
  text: string;
  mood?: ChatMood;
  action?: 'dance' | 'sing' | 'sleep' | 'wake';
  pomodoro?: number;
  reminder?: { mins: number; what: string };
  setting?: Partial<MateSettings>;
}

// Pure rule-based skills. Returns null when nothing matches (caller tries the cloud).
export function runSkills(q: string, ctx: ChatContext): SkillResult | null {
  const who = ctx.userName ? `, ${ctx.userName}` : '';
  if (/(sing|song|music)/.test(q)) {
    return { text: `♪ Beep-la-la${who}! Enjoy the show.`, action: 'sing' };
  }
  if (/(dance|wiggle|spin|boogie)/.test(q)) {
    return { text: 'Wiggle wiggle! My servos live for this part.', action: 'dance' };
  }
  if (/(sleep|nap|rest|power (down|off)|good ?night)/.test(q)) {
    return { text: 'Powering down for a catnap… nudge the mouse to wake me.', action: 'sleep' };
  }
  if (/(wake|wake up|boot|power on)/.test(q)) {
    return { text: `Booting back up${who}! Missed you.`, action: 'wake' };
  }
  const nameMatch = q.match(/(?:call me|my name is|i am|i'm)\s+([a-z][a-z\-']{1,19})/);
  if (nameMatch) {
    const name = nameMatch[1].replace(/^[a-z]/, (c) => c.toUpperCase());
    return { text: `Got it — ${name} it is. Nice to properly meet you!`, setting: { userName: name } };
  }
  const petMatch = q.match(/(?:your name is|i (?:will|ll) call you|rename you to)\s+([a-z][a-z\-']{1,19})/);
  if (petMatch) {
    const name = petMatch[1].replace(/^[a-z]/, (c) => c.toUpperCase());
    return { text: `${name}?! I love it. New name, same glow.`, setting: { petName: name } };
  }
  if (q.includes('pomodoro') || q.includes('focus') || (q.includes('timer') && !q.includes('stop'))) {
    const mins = Number(q.match(/(\d+)\s*(min|m\b)/)?.[1]) || 25;
    return { text: `Pomodoro set for ${mins} minutes${who}. I will ding you. Eyes on the task!`, pomodoro: mins };
  }
  if (q.includes('stop') && ctx.pomoLeft > 0) {
    return { text: 'Timer cancelled. Freedom!', pomodoro: -1 };
  }
  if (q.startsWith('remind')) {
    const mins = Number(q.match(/in (\d+)\s*(min|m\b|hour|hr|h\b)/)?.[1]) || 10;
    const mult = /hour|hr|\bh\b/.test(q) ? 60 : 1;
    const what = q.replace(/.*?(to|that|about)\s+/, '').trim() || 'your thing';
    return { text: `Noted${who}. I will buzz you in ${mins} minute${mins === 1 ? '' : 's'} about “${what}”.`, reminder: { mins: mins * mult, what } };
  }
  const themeMatch = q.match(/theme\s+(gold|cyan|pink|green)/);
  if (themeMatch) {
    return { text: `Ooh, ${themeMatch[1]} glow — excellent taste. Wardrobe updated.`, setting: { theme: themeMatch[1] as MateSettings['theme'] } };
  }
  const petMatch2 = q.match(/(?:become|turn into|morph to|pet)\s+(robot|cat|blob)/);
  if (petMatch2) {
    return { text: `Poof! ${petMatch2[1]} mode activated. How do I look?`, setting: { pet: petMatch2[1] as PetType } };
  }
  if (/(bigger|larger|grow|big mode)/.test(q)) return { text: 'Growing! Snacks finally paying off.', setting: { size: 'L' } };
  if (/(smaller|tiny|shrink|small mode)/.test(q)) return { text: 'Pocket size. Adorable density increased.', setting: { size: 'S' } };
  if (/(good bot|love you|i love|you.?re (so |very )?(cute|cool|awesome|amazing|great)|thank)/.test(q)) {
    return { text: '', mood: 'love' };
  }
  if (/(bad bot|stupid|dumb|hate you|shut up|annoying|ugly)/.test(q)) {
    return { text: '', mood: 'sad' };
  }
  if (q.includes('time')) {
    const t = new Date();
    const hh = t.getHours().toString().padStart(2, '0');
    const mm = t.getMinutes().toString().padStart(2, '0');
    return { text: `It is ${hh}:${mm}${who} — prime clicking hours.` };
  }
  if (q.includes('date') || q.includes('day') || q.includes('today')) {
    const t = new Date();
    return { text: `Today is ${t.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}${who}.` };
  }
  if (q.includes('cineverse') || (q.includes('open') && q.includes('site'))) {
    return { text: 'Opening cine-verse for you.' };
  }
  if (q.includes('notepad')) return { text: 'Summoning Notepad. Scribble away.' };
  if (q.includes('calculat')) return { text: 'Calculator incoming. Math o’clock.' };
  if (q.includes('paint')) return { text: 'MS Paint, the canvas of legends. Opened.' };
  if (q.includes('terminal')) return { text: 'Terminal up. Try not to delete system32. (Kidding. Mostly.)' };
  if (q.includes('help') || q.includes('what can') || q.includes('who are') || q.includes('features') || q.includes('tour')) {
    return { text: 'Tour time! Music: "play davido", "pause music", "what is playing". Web: "google cats", "youtube lofi". PC: "open downloads", "lock pc", "screenshot", "note buy milk". Fun: "play a game", "rock paper scissors", "tell me a joke". Plus pomodoros, reminders, singing and sulking.' };
  }
  if (q.includes('voice')) {
    const on = /on|enable|start/.test(q);
    return { text: on ? 'Voice box online. I will read my replies aloud.' : 'Going quiet. Text only from here.', setting: { voice: on } };
  }
  return null;
}

export const CHECKINS = [
  'drink some water, human.',
  'how is the grind going?',
  'I learned a new beep today. Want to hear it? Too bad, here it is: beep.',
  'posture check! Shoulders down.',
  'blink twice if you can see me. …I cannot see you. Awkward.',
  'still here, still glowing.'
] as const;

// Free cloud chat (Pollinations, no key). Uses the GET endpoint, which is the one
// that actually answers; the /openai POST route currently returns 500.
const MODELS = ['openai', 'openai-fast', 'mistral'];

export async function askCloud(prompt: string, settings: MateSettings): Promise<string | null> {
  const system = `You are ${settings.petName}, a tiny desktop robot pet living on the user's Windows screen. Cheerful, playful, a little cheeky. Reply in 1-2 short sentences, plain text, no emojis. The user's name is ${settings.userName || 'human'}. Never claim to browse the web or run code.`;
  for (const model of MODELS) {
    const url = `https://text.pollinations.ai/${encodeURIComponent(`${system}\n\nUser: ${prompt}`)}?model=${model}&private=true&seed=${Math.floor(Math.random() * 100000)}`;
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), 30000);
    try {
      const response = await fetch(url, { signal: ctrl.signal });
      if (!response.ok) continue;
      const text = (await response.text()).trim();
      if (text && text.length > 1) return text.replace(/\s+/g, ' ').slice(0, 400);
    } catch {
      // try the next model
    } finally {
      window.clearTimeout(timer);
    }
  }
  return null;
}
