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
export const ACCESSORIES = ['none', 'hoverboard', 'scarf', 'cap', 'glasses', 'backpack', 'wings', 'crown', 'bowtie', 'star', 'sneakers'] as const;
export type Accessory = typeof ACCESSORIES[number];

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
  voiceRate: number;
  expressiveVoice: boolean;
  voiceMood: string;
  wakeListening: boolean;
  headphoneColor: string;
  faceClock: boolean;
  repeatTimer: boolean;
  timerSound: boolean;
  focusBreaks: boolean;
  breakMinutes: number;
  focusMinutes: number;
  stayPut: boolean;
  quietCompanion: boolean;
  cinemaMode: boolean;
  autoDayNight: boolean;
  accessory: Accessory;
  geminiKey: string;
  routerKey: string;
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
  voiceRate: 1,
  expressiveVoice: true,
  voiceMood: 'auto',
  wakeListening: false,
  headphoneColor: '#f3f6fb',
  faceClock: false,
  repeatTimer: false,
  timerSound: true,
  focusBreaks: false,
  breakMinutes: 5,
  focusMinutes: 25,
  stayPut: false,
  quietCompanion: false,
  cinemaMode: false,
  autoDayNight: false,
  accessory: 'none',
  geminiKey: '',
  routerKey: '',
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

// ---------------- Persistent brain memory ----------------
export interface MateMemory {
  firstSeen: number;
  greetingCount: number;
  totalMessages: number;
  lastMessageAt: number;
  memories: string[];
  milestones: Record<string, number>;
}

const DEFAULT_MEMORY: MateMemory = {
  firstSeen: Date.now(),
  greetingCount: 0,
  totalMessages: 0,
  lastMessageAt: 0,
  memories: [],
  milestones: {}
};

const MEM_KEY = 'cinemate-memory-v1';

export function loadMemory(): MateMemory {
  try {
    const raw = localStorage.getItem(MEM_KEY);
    return raw ? { ...DEFAULT_MEMORY, ...(JSON.parse(raw) as Partial<MateMemory>) } : { ...DEFAULT_MEMORY };
  } catch {
    return { ...DEFAULT_MEMORY };
  }
}

export function saveMemory(mem: MateMemory): void {
  try {
    localStorage.setItem(MEM_KEY, JSON.stringify(mem));
  } catch {
    // private mode — memory simply won't persist
  }
}

export function recordMessage(): void {
  const mem = loadMemory();
  saveMemory({ ...mem, totalMessages: mem.totalMessages + 1, lastMessageAt: Date.now() });
}

export function recordGreeting(): void {
  const mem = loadMemory();
  saveMemory({ ...mem, greetingCount: mem.greetingCount + 1, milestones: { ...mem.milestones, greeted: (mem.milestones.greeted || 0) + 1 } });
}

export function addMemory(text: string): MateMemory {
  const trimmed = text.trim();
  const mem = loadMemory();
  if (!trimmed || mem.memories.includes(trimmed)) return mem;
  const next = { ...mem, memories: [...mem.memories, trimmed].slice(-25) };
  saveMemory(next);
  return next;
}

export function forgetMemory(text: string): { mem: MateMemory; removed: boolean } {
  const mem = loadMemory();
  const idx = mem.memories.indexOf(text.trim());
  if (idx < 0) return { mem, removed: false };
  const next = { ...mem, memories: mem.memories.filter((_, i) => i !== idx) };
  saveMemory(next);
  return { mem: next, removed: true };
}

export function forgetAllMemory(): MateMemory {
  const mem = loadMemory();
  const next = { ...DEFAULT_MEMORY, firstSeen: mem.firstSeen, greetingCount: mem.greetingCount, totalMessages: mem.totalMessages };
  saveMemory(next);
  return next;
}

export function memoryBackup(): string {
  return JSON.stringify({ exportedAt: new Date().toISOString(), ...loadMemory() }, null, 2);
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

export const FACTS = [
  'The longest movie ever made runs about 35 days — "Cinema 16".',
  'Silent films used to have live musicians at every showing.',
  'The first movie theater was called a Nickelodeon.',
  'Popcorn was once sold as jewelry at cinemas in the 1920s.',
  'The Oscar statue is actually made of bronze with gold plating.',
  'Alfred Hitchcock never won a Best Director Oscar, surprisingly.',
  'Movies used to be rated with stars before G/PG/PG-13/R.',
  'The first film ever made was only about two seconds long.',
  'James Cameron directed both Titanic and Avatar — two of the highest-grossing films.',
  'Cinema seats were once sold by the height of the row: higher rows were pricier.'
] as const;

export const SONG_LYRICS = [
  'La la la, movies in my head ♪',
  'Beep-boop-doo-wop, data in the flow ♪',
  'Render render render, we are going slow ♪',
  'Pixel perfect, screen so bright, watching every night and every light ♪'
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
  interactionHistory: string[]; // Recent interactions for context
  userPreferences: Record<string, any>; // Learned user preferences
  dailyPatterns: Record<string, any>; // Learned daily routines
}

export type ChatMood = 'love' | 'sad' | 'curious' | null;

export interface SkillResult {
  text: string;
  mood?: ChatMood;
  action?: 'dance' | 'sing' | 'sleep' | 'wake';
  pomodoro?: number;
  timerMode?: 'timer' | 'focus';
  reminder?: { mins: number; what: string };
  setting?: Partial<MateSettings>;
  memoryJson?: string;
}

const DURATION_WORDS: Record<string, number> = {
  a: 1, an: 1, half: 0.5, zero: 0, one: 1, two: 2, three: 3, four: 4,
  five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11,
  twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30,
  forty: 40, fifty: 50, sixty: 60
};

function timerDurationSeconds(q: string): number | null {
  const normalized = q.replace(/-/g, ' ');
  const matches = [...normalized.matchAll(/\b(\d+(?:\.\d+)?|a|an|half|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty)\s*(seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h)\b/g)];
  if (!matches.length) return null;
  return matches.reduce((sum, match) => {
    const amount = Number(match[1]) || DURATION_WORDS[match[1]] || 0;
    const unit = match[2];
    return sum + amount * (/^(?:h|hr)/.test(unit) ? 3600 : /^(?:m|min)/.test(unit) ? 60 : 1);
  }, 0);
}

// Pure rule-based skills. Returns null when nothing matches (caller tries the cloud).
export function runSkills(q: string, ctx: ChatContext): SkillResult | null {
  const who = ctx.userName ? `, ${ctx.userName}` : '';
  if (/^(?:please )?sing(?: me (?:a )?song)?[.!?]?$/.test(q)) {
    return { text: `♪ ${SONG_LYRICS[Math.floor(Math.random() * SONG_LYRICS.length)]}${who}`, action: 'sing' };
  }
  if (/^(?:please )?(dance|wiggle|spin|boogie)[.!?]?$/.test(q)) {
    return { text: 'Wiggle wiggle! My servos live for this part.', action: 'dance' };
  }
  if (/^(sleep|nap|rest|power (down|off)|good ?night)[.!?]?$/.test(q)) {
    return { text: 'Powering down for a catnap… nudge the mouse to wake me.', action: 'sleep' };
  }
  if (/^(?:please )?(?:wake(?: up)?|boot|power on)[.!?]?$/.test(q)) {
    return { text: `Booting back up${who}! Missed you.`, action: 'wake' };
  }
  const nameMatch = q.match(/^(?:call me|my name is)\s+([a-z][a-z\-']{1,19})[.!?]?$/);
  if (nameMatch) {
    const name = nameMatch[1].replace(/^[a-z]/, (c) => c.toUpperCase());
    return { text: `Got it — ${name} it is. Nice to properly meet you!`, setting: { userName: name } };
  }
  const petMatch = q.match(/^(?:your name is|i (?:will|'?ll) call you|rename you to)\s+([a-z][a-z\-']{1,19})[.!?]?$/);
  if (petMatch) {
    const name = petMatch[1].replace(/^[a-z]/, (c) => c.toUpperCase());
    return { text: `${name}?! I love it. New name, same glow.`, setting: { petName: name } };
  }
  const timerIntent = /^(?:please )?(?:(?:(?:start|set|begin|run)(?: me)?\b.*\btimer\b|(?:\d+|a|an|half|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|twenty|thirty|forty|fifty|sixty).{0,24}\btimer\b|timer\b(?:\s|$)|time(?: me| this| that| it)?\b.*|count(?: me)? down\b))/.test(q);
  const focusIntent = /\b(?:pomodoro|focus(?: timer)?)\b/.test(q);
  const countdownRequest = q.replace(/^(?:please\s+|(?:can|could|would|will) you\s+(?:please\s+)?)/, '');
  const countdownIntent = /^(?:(?:start|set|begin|do|give me|run)(?: me)?\b[^.!?]*\bcount\s*down\b|(?:\d+|a|an|half|one|two|three|four|five|six|seven|eight|nine|ten|twenty|thirty|sixty).{0,24}\bcount\s*down\b|count\s*down\b|count (?:backwards? )?from\b)/.test(countdownRequest);
  if (timerIntent || focusIntent || countdownIntent) {
    const bareMinutes = q.match(/^(?:pomodoro|focus(?: timer)?|timer)\s+(\d+(?:\.\d+)?)\s*[.!?]?$/);
    const count = countdownIntent ? q.match(/(?:from|down)\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten|twenty|thirty|sixty)\b/) : null;
    const countSeconds = count ? Number(count[1]) || DURATION_WORDS[count[1]] : null;
    const seconds = Math.max(1, Math.min(86400, timerDurationSeconds(q) ?? countSeconds ?? (bareMinutes ? Number(bareMinutes[1]) * 60 : countdownIntent ? 10 : 25 * 60)));
    const mode = focusIntent ? 'focus' : 'timer';
    const duration = seconds % 60 === 0 ? `${seconds / 60} minute${seconds === 60 ? '' : 's'}` : `${seconds} seconds`;
    return { text: mode === 'focus' ? `Focus timer set for ${duration}${who}. I will let you know when it ends.` : `Timer started for ${duration}${who}. I will let you know when it ends.`, pomodoro: seconds / 60, timerMode: mode };
  }
  if (/^(?:stop|cancel)(?: (?:the |my )?(?:timer|countdown|pomodoro|focus))?[.!?]?$/.test(q) && ctx.pomoLeft > 0) {
    return { text: 'Timer cancelled. Freedom!', pomodoro: -1 };
  }
  const reminderMatch = q.match(/^remind me in (\d+)\s*(minutes?|mins?|m|hours?|hrs?|h) (?:to|that|about) (.+)$/);
  const reminderAfter = q.match(/^remind me (?:to|that|about) (.+) in (\d+)\s*(minutes?|mins?|m|hours?|hrs?|h)[.!?]?$/);
  if (reminderMatch || reminderAfter) {
    const duration = Number(reminderMatch?.[1] ?? reminderAfter?.[2]);
    const unit = reminderMatch?.[2] ?? reminderAfter?.[3] ?? 'minutes';
    const mins = duration * (/^h/.test(unit) ? 60 : 1);
    const what = (reminderMatch?.[3] ?? reminderAfter?.[1] ?? '').trim();
    if (mins <= 0 || !what) return null;
    return { text: `Noted${who}. I will buzz you in ${mins} minute${mins === 1 ? '' : 's'} about "${what}".`, reminder: { mins, what } };
  }
  const themeMatch = q.match(/^(?:(?:set|change)(?: the| your)? )?theme(?: to)?\s+(gold|cyan|pink|green)[.!?]?$/);
  if (themeMatch) {
    return { text: `Ooh, ${themeMatch[1]} glow — excellent taste. Wardrobe updated.`, setting: { theme: themeMatch[1] as MateSettings['theme'] } };
  }
  const petMatch2 = q.match(/^(?:become|turn into|morph to|pet)\s+(robot|cat|blob)[.!?]?$/);
  if (petMatch2) {
    return { text: `Poof! ${petMatch2[1]} mode activated. How do I look?`, setting: { pet: petMatch2[1] as PetType } };
  }
  if (/^(?:(?:make |get )?(?:you |yourself )?)?(?:bigger|larger|grow|big mode)[.!?]?$/.test(q)) return { text: 'Growing! Snacks finally paying off.', setting: { size: 'L' } };
  if (/^(?:(?:make |get )?(?:you |yourself )?)?(?:smaller|tiny|shrink|small mode)[.!?]?$/.test(q)) return { text: 'Pocket size. Adorable density increased.', setting: { size: 'S' } };
  if (/^(?:good bot|(?:i )?love you|you(?:'re| are) (?:so |very )?(?:cute|cool|awesome|amazing|great)|thanks|thank you)[.!?]?$/.test(q)) {
    return { text: '', mood: 'love' };
  }
  if (/^(?:bad bot|(?:you(?:'re| are) )?(?:stupid|dumb|annoying|ugly)|(?:i )?hate you|shut up)[.!?]?$/.test(q)) {
    return { text: '', mood: 'sad' };
  }
  if (/^(?:what(?:'s| is) (?:the )?time|time)[.!?]?$/.test(q)) {
    const t = new Date();
    const hh = t.getHours().toString().padStart(2, '0');
    const mm = t.getMinutes().toString().padStart(2, '0');
    return { text: `It is ${hh}:${mm}${who} — prime clicking hours.` };
  }
  if (/^(?:what(?:'s| is) (?:the )?date(?: today)?|what day is (?:it|today)|date|today)[.!?]?$/.test(q)) {
    const t = new Date();
    return { text: `Today is ${t.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}${who}.` };
  }
  if (/^(?:open|launch|start) (?:cine-?verse|(?:the )?site)[.!?]?$/.test(q)) {
    return { text: 'Opening cine-verse for you.' };
  }
  if (/^(?:open|launch|start) notepad[.!?]?$/.test(q)) return { text: 'Summoning Notepad. Scribble away.' };
  if (/^(?:open|launch|start) calculator[.!?]?$/.test(q)) return { text: 'Calculator incoming. Math o’clock.' };
  if (/^(?:open|launch|start) paint[.!?]?$/.test(q)) return { text: 'MS Paint, the canvas of legends. Opened.' };
  if (/^(?:open|launch|start) terminal[.!?]?$/.test(q)) return { text: 'Terminal up. Try not to delete system32. (Kidding. Mostly.)' };
  if (/^(help|features|tour|what can you do)[.!?]?$/.test(q)) {
    return { text: 'Tour time! Music: "play davido", "pause music", "what is playing". Web: "google cats", "youtube lofi". PC: "open downloads", "lock pc", "screenshot", "note buy milk". Memory: "remember my wifi is 1234", "my memories", "forget …", "brain backup". Fun: "play a game", "rock paper scissors", "tell me a joke", "movie fact". Plus pomodoros, reminders, singing and sulking.' };
  }
  const memoryMatch = q.match(/^(?:remember|memorize)(?: that)?\s+(?!how\b|why\b|when\b|what\b|who\b|where\b)(.+)$/);
  if (memoryMatch) {
    const what = memoryMatch[1].trim();
    if (what) {
      const mem = addMemory(what);
      return { text: `Stored. I now hold ${mem.memories.length} memor${mem.memories.length === 1 ? 'y' : 'ies'}. Say "my memories" to recall them.` };
    }
  }
  if (/^(?:forget|remove)\s+/.test(q) && !/(notes|notepad)/.test(q)) {
    if (/^(?:forget|remove) (?:everything|all(?: (?:my|your))?(?: memories| memory)?)[.!?]?$/.test(q)) {
      forgetAllMemory();
      return { text: 'Memory wiped clean. Fresh brain, same glow.' };
    }
    const what = q.replace(/^(?:forget|remove)(?: the| my)?\s+/, '').replace(/^(?:the|my|about)\s+/, '').replace(/\s+from (?:your |my )?(?:memory|memories|brain)$/, '').trim();
    if (what) {
      const { removed } = forgetMemory(what);
      return { text: removed ? `Gone — "${what}" is forgotten.` : `I cannot find "${what}" in my memory.` };
    }
  }
  if (/^(?:my memories|list memories|what do you remember|recall(?: my memories)?)[.!?]?$/.test(q)) {
    const mem = loadMemory();
    return { text: mem.memories.length ? `Brain: ${mem.memories.join(' · ')}` : 'My memory is empty. Tell me "remember …" and I will keep it.' };
  }
  if (/^(?:(?:backup|export)(?: my| your)? (?:memory|brain|memories)|(?:brain|memory|memories) backup)[.!?]?$/.test(q)) {
    return { text: 'Brain backup ready — copied to your clipboard.', memoryJson: memoryBackup() };
  }
  if (/^(?:stats|statistics|how many messages|about me|about us)[.!?]?$/.test(q)) {
    const mem = loadMemory();
    const days = Math.max(1, Math.ceil((Date.now() - mem.firstSeen) / 86_400_000));
    return { text: `We have been together ${days} day${days === 1 ? '' : 's'}, exchanged ${mem.totalMessages} messages, and greeted ${mem.greetingCount} times.` };
  }
  if (/^(?:(?:tell me (?:a |one )?)?(?:movie )?fact|did you know)[.!?]?$/.test(q)) {
    return { text: `Movie fact: ${FACTS[Math.floor(Math.random() * FACTS.length)]}` };
  }
  if (/^(?:voice (?:on|off)|(?:enable|disable|start|stop) voice)[.!?]?$/.test(q)) {
    const on = /^(?:voice on|enable voice|start voice)/.test(q);
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
