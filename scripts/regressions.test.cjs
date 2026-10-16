const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const fixtureKey = 'test-fixture-key';

test('Speech context keeps complete long utterances while avoiding thirty-second padding for short requests', () => {
  const speech = loadTS('src/main/speech.ts', { Buffer }, {
    'node:child_process': {}, 'node:fs': { promises: {} }, 'node:os': {}, 'node:path': {}
  });
  const wav = seconds => {
    const bytes = Buffer.alloc(44 + seconds * 32000);
    bytes.write('RIFF', 0); bytes.write('WAVE', 8); bytes.write('fmt ', 12);
    bytes.writeUInt32LE(16, 16); bytes.writeUInt32LE(32000, 28);
    bytes.write('data', 36); bytes.writeUInt32LE(seconds * 32000, 40);
    return bytes;
  };
  assert.equal(speech.speechAudioContext(wav(5)), 768);
  assert.ok(speech.speechAudioContext(wav(20)) >= 21 * 50);
  assert.equal(speech.speechAudioContext(wav(30)), 1500);
  assert.equal(speech.speechAudioContext(Buffer.from('invalid')), 0);
});

test('Wake words require an address or a recent wake, never ordinary background speech', () => {
  const intent = loadTS('src/renderer/src/voiceIntent.ts');
  assert.equal(intent.wakeCommand('play a song', 0), null);
  assert.equal(intent.wakeCommand('the cinema was great', 0), null);
  assert.equal(intent.wakeCommand('Hey Cine, countdown from 10', 0).command, 'countdown from 10');
  assert.equal(intent.wakeCommand('Hey Ciene. Set a timer for 5 seconds.', Infinity).command, 'Set a timer for 5 seconds.');
  assert.equal(intent.wakeCommand('Cine', 0).wake, true);
  assert.equal(intent.wakeCommand('hey see nee', 0).command, '');
  assert.equal(intent.wakeCommand('hey scene, pause timer', 0).command, 'pause timer');
  assert.equal(intent.wakeCommand('countdown from five', 2000, 1000).command, 'countdown from five');
  assert.equal(intent.wakeCommand('countdown from five', 1000, 2000), null);
  assert.equal(intent.speechMood('Congratulations! I am proud of you.'), 'excited');
  assert.equal(intent.speechMood('Take a breath and relax.'), 'calm');
  assert.equal(intent.speechMood('I am sorry that you are feeling sad.'), 'gentle');
});

test('Natural countdowns use seconds instead of silently starting a 25-minute timer', () => {
  const brain = loadBrain();
  for (const q of ['countdown from 10', 'count down from ten', 'start a countdown from 10', 'count from 10 to 0']) {
    assert.equal(brain.runSkills(q, context).pomodoro * 60, 10, q);
  }
  assert.equal(brain.runSkills('countdown from 5 seconds', context).pomodoro * 60, 5);
});

test('One-minute countdown commands start the local timer rather than falling through to AI', () => {
  const brain = loadBrain();
  for (const command of ['set a 1 minute countdown', 'set a one-minute countdown', 'set a countdown for one minute', 'one minute countdown', 'can you please set a 1 minute countdown?']) {
    const result = brain.runSkills(command, context);
    assert.equal(result?.pomodoro, 1, command);
    assert.equal(result?.timerMode, 'timer', command);
  }
  assert.equal(brain.runSkills('How do I set a one minute countdown?', context), null);
  assert.equal(brain.runSkills('cancel countdown', {...context,pomoLeft:60}).pomodoro, -1);
  assert.equal(brain.DEFAULT_SETTINGS.wakeListening, false);
});

function loadTS(relativePath, globals = {}, imports = {}) {
  const source = fs.readFileSync(path.join(root, relativePath), 'utf8');
  const code = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX }
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, {
    exports,
    require: name => {
      if (Object.prototype.hasOwnProperty.call(imports, name)) return imports[name];
      throw new Error(`Unexpected import in isolated test: ${name}`);
    },
    Date, AbortSignal, AbortController, URL, encodeURIComponent, ...globals
  }, { filename: relativePath });
  return exports;
}

function storage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}

function loadBrain(store = storage()) {
  return loadTS('src/renderer/src/brain.ts', { localStorage: store });
}

function gemini(responses) {
  const calls = [];
  const delays = [];
  let now = Date.now();
  class Clock extends Date { static now() { return now; } }
  const random = Object.create(Math);
  random.random = () => 0;
  const api = loadTS('src/main/ai.ts', {
    Date: Clock,
    Math: random,
    setTimeout(callback, delay) { delays.push(delay); now += delay; callback(); },
    fetch: async (url, options) => {
      calls.push({ url, ...options, body: options.body ? JSON.parse(options.body) : undefined });
      const response = responses.shift();
      assert.ok(response, 'An unexpected Gemini request was made');
      if (response instanceof Error) throw response;
      now += response.elapsedMs ?? 0;
      return {
        ok: (response.status ?? 200) < 400,
        status: response.status ?? 200,
        statusText: response.statusText ?? '',
        headers: new Headers(response.headers),
        json: async () => { if (response.jsonError) throw response.jsonError; return response.data; }
      };
    }
  }, { 'node:crypto': require('node:crypto') });
  return { ...api, calls, delays, advance(ms) { now += ms; } };
}

const model = (name, methods = ['generateContent']) => ({ name: `models/${name}`, supportedGenerationMethods: methods });
const catalog = (...models) => ({ data: { models } });
const answer = text => ({ data: { candidates: [{ content: { parts: [{ text }] } }] } });
const failure = (status, message) => ({ status, data: { error: { message } } });

test('Gemini asks for a key without making a network request', async () => {
  const api = gemini([]);
  const result = await api.askGemini('  ', 'system', []);
  assert.equal(result.text, null);
  assert.match(result.error, /Add your Gemini API key/);
  assert.equal(api.calls.length, 0);
});

test('Gemini discovers paginated text models, filters other modalities, and sends the key only as a header', async () => {
  const api = gemini([
    { data: { models: [model('gemini-2.5-flash-image'), model('gemini-embedding-001', ['embedContent'])], nextPageToken: 'next/token +' } },
    catalog(model('gemini-2.5-pro'), model('gemini-2.5-flash'), model('gemini-2.5-flash-preview-tts')),
    answer('Hello there')
  ]);
  const result = await api.askGemini(fixtureKey, 'Be Cine', [{ role: 'user', text: 'Hello' }]);
  assert.equal(result.text, 'Hello there');
  assert.equal(result.model, 'gemini-2.5-flash');
  assert.match(api.calls[1].url, /pageToken=next%2Ftoken%20%2B$/);
  assert.match(api.calls[2].url, /models\/gemini-2\.5-flash:generateContent$/);
  assert.ok(api.calls.every(call => !call.url.includes(fixtureKey)));
  assert.ok(api.calls.every(call => call.headers['x-goog-api-key'] === fixtureKey));
});

test('Gemini preserves ordered conversation context and bounds request content', async () => {
  const turns = Array.from({ length: 28 }, (_, index) => ({ role: index % 2 ? 'model' : 'user', text: `turn ${index}` }));
  turns[27].text = 'x'.repeat(13_000);
  const api = gemini([catalog(model('gemini-2.5-flash')), answer('Done')]);
  await api.askGemini(fixtureKey, 'The user is Alex', turns);
  const body = api.calls[1].body;
  assert.equal(body.systemInstruction.parts[0].text, 'The user is Alex');
  assert.equal(body.contents.length, 24);
  assert.equal(body.contents[0].parts[0].text, 'turn 4');
  assert.equal(body.contents[1].role, 'model');
  assert.equal(body.contents[23].parts[0].text.length, 12_000);
});

test('Gemini exposes the actual provider error and redacts the API key', async () => {
  const api = gemini([failure(403, `API key ${fixtureKey} is not authorized for this project.`)]);
  const result = await api.askGemini(fixtureKey, 'system', [{ role: 'user', text: 'Hi' }]);
  assert.equal(result.error, 'Gemini HTTP 403: API key [redacted] is not authorized for this project.');
  assert.equal(result.text, null);
  assert.equal(result.retryable, false);
  assert.equal(api.calls.length, 1);
});

test('Gemini redacts keys in transport exceptions and explains timeout failures', async () => {
  const api = gemini([new Error(`Connection failed for ${fixtureKey}`), new Error(`Connection failed for ${fixtureKey}`)]);
  const result = await api.askGemini(fixtureKey, '', []);
  assert.equal(result.error, 'Cine could not reach Gemini. Check your connection and try again.');
  assert.match(result.detail, /Connection failed for \[redacted\]/);
  assert.ok(!result.detail.includes(fixtureKey));
  assert.equal(result.retryable, true);
  const timedOut = gemini([new Error('The operation was aborted due to timeout'), new Error('The operation was aborted due to timeout')]);
  assert.equal((await timedOut.askGemini(fixtureKey, '', [])).error, 'Gemini took too long to respond. Please try again.');
  assert.equal(timedOut.calls.length, 2);
});

for (const [status, reason] of [[404, 'model was removed'], [503, 'model unavailable'], [429, 'Quota exceeded, limit: 0']]) {
  test(`Gemini tries another discovered model after HTTP ${status}: ${reason}`, async () => {
    const api = gemini([catalog(model('gemini-3.5-flash'), model('gemini-3.5-flash-lite')), failure(status, reason), answer('Recovered')]);
    const result = await api.askGemini(fixtureKey, '', [{ role: 'user', text: 'Hi' }]);
    assert.equal(result.text, 'Recovered');
    assert.equal(result.model, 'gemini-3.5-flash');
    assert.equal(api.calls.length, 3);
    assert.equal(api.delays.length, 0, 'Healthy alternatives are tried before a delayed retry');
  });
}

test('Gemini selects the newest stable Flash Lite instead of a retired or overloaded older model', async () => {
  const api = gemini([catalog(model('gemini-2.5-flash'), model('gemini-2.5-flash-lite'), model('gemini-3.1-flash-lite'), model('gemini-3.5-flash-lite'), model('gemini-4-flash-lite-preview')), answer('Cine connected')]);
  const result = await api.askGemini(`  ${fixtureKey}  `, '', []);
  assert.equal(result.model, 'gemini-3.5-flash-lite');
  assert.equal(result.text, 'Cine connected');
  assert.ok(api.calls.every(call => call.headers['x-goog-api-key'] === fixtureKey));
  assert.equal(api.calls.length, 2);
});

test('Gemini retains normal quota errors without multiplying model requests', async () => {
  const api = gemini([catalog(model('gemini-2.5-flash'), model('gemini-2.5-flash-lite')), failure(429, 'Rate limit exceeded. Retry in 32 seconds.')]);
  const result = await api.askGemini(fixtureKey, '', []);
  assert.equal(result.error, 'Gemini HTTP 429: Rate limit exceeded. Retry in 32 seconds.');
  assert.equal(api.calls.length, 2);
});

test('Gemini bounds transient retries and keeps every model failure as separate diagnostics', async () => {
  const errors = Array.from({ length: 6 }, (_, index) => failure(503, `busy ${index + 1} ${fixtureKey}`));
  const api = gemini([catalog(model('gemini-3.5-flash-lite'), model('gemini-3.1-flash-lite'), model('gemini-3-flash'), model('gemini-3-pro')), ...errors]);
  const result = await api.askGemini(fixtureKey, '', []);
  assert.equal(result.error, 'Gemini is busy right now. Please try again in a moment.');
  assert.equal(result.retryable, true);
  assert.equal(result.text, null);
  for (let index = 1; index <= 6; index++) assert.ok(result.detail.includes(`busy ${index} [redacted]`));
  assert.match(result.detail, /gemini-3.5-flash-lite: Gemini HTTP 503/);
  assert.ok(!result.detail.includes(fixtureKey));
  assert.equal(api.calls.length, 7);
  assert.equal(api.delays.length, 1);
  assert.equal(api.delays[0], 1000);
  assert.ok(api.calls.every(call => !call.url.includes('gemini-3-pro:')));
});

test('Gemini retries a temporary overload once with provider-directed backoff', async () => {
  const overloaded = { ...failure(503, 'high demand'), headers: { 'Retry-After': '3' } };
  const api = gemini([catalog(model('gemini-3.5-flash-lite')), overloaded, answer('Recovered')]);
  const result = await api.askGemini(fixtureKey, '', []);
  assert.equal(result.text, 'Recovered');
  assert.equal(api.calls.length, 3);
  assert.deepEqual(api.delays, [3000]);
});

for (const [status, reason] of [[404, 'no longer available to new users'], [429, 'Quota exceeded, limit: 0']]) {
  test(`Gemini allows a manual retry when HTTP ${status} and overload failures occur together`, async () => {
    const api = gemini([catalog(model('gemini-3.5-flash-lite'), model('gemini-3.1-flash-lite')), failure(status, reason), failure(503, 'high demand'), failure(503, 'still busy')]);
    const result = await api.askGemini(fixtureKey, '', []);
    assert.equal(result.retryable, true);
    assert.equal(result.error, 'Gemini is busy right now. Please try again in a moment.');
    assert.ok(result.detail.includes(`Gemini HTTP ${status}: ${reason}`));
    assert.match(result.detail, /Gemini HTTP 503: high demand/);
    assert.equal(api.calls.filter(call => call.url.includes('gemini-3.5-flash-lite:')).length, 1);
    assert.equal(api.calls.length, 4);
  });
}

test('Gemini respects a long Retry-After without sleeping beyond its response budget', async () => {
  const overloaded = { ...failure(503, 'high demand'), headers: { 'Retry-After': '60' } };
  const api = gemini([catalog(model('gemini-3.5-flash-lite')), overloaded]);
  const result = await api.askGemini(fixtureKey, '', []);
  assert.equal(result.retryable, true);
  assert.equal(api.calls.length, 2);
  assert.equal(api.delays.length, 0);
});

test('Gemini shares a bounded deadline across slow alternatives and never adds another full wait', async () => {
  const api = gemini([catalog(model('gemini-3.5-flash-lite'), model('gemini-3.1-flash-lite'), model('gemini-3-flash')),
    { ...failure(503, 'busy one'), elapsedMs: 12000 }, { ...failure(503, 'busy two'), elapsedMs: 12000 }, { ...failure(503, 'busy three'), elapsedMs: 11000 }]);
  const result = await api.askGemini(fixtureKey, '', []);
  assert.equal(result.retryable, true);
  assert.equal(api.calls.length, 4);
  assert.equal(api.delays.length, 0);
});

test('Gemini retries model discovery on transient failures but never on credential errors', async () => {
  const api = gemini([failure(503, 'catalog busy'), catalog(model('gemini-3.5-flash-lite')), answer('Ready')]);
  assert.equal((await api.askGemini(fixtureKey, '', [])).text, 'Ready');
  assert.equal(api.calls.length, 3);
  assert.equal(api.delays[0], 1000);
  const badKey = gemini([catalog(model('gemini-3.5-flash-lite'), model('gemini-3.5-flash')), failure(400, 'API key not valid.')]);
  const result = await badKey.askGemini(fixtureKey, '', []);
  assert.equal(result.error, 'Gemini HTTP 400: API key not valid.');
  assert.equal(result.retryable, false);
  assert.equal(badKey.calls.length, 2);
  assert.equal(badKey.delays.length, 0);
});

test('Gemini caches discovery and remembers the model that actually answered', async () => {
  const api = gemini([catalog(model('gemini-3.5-flash-lite'), model('gemini-3.1-flash-lite')), failure(503, 'newest busy'), answer('First response'), answer('Follow-up response')]);
  assert.equal((await api.askGemini(fixtureKey, '', [])).model, 'gemini-3.1-flash-lite');
  assert.equal((await api.askGemini(fixtureKey, '', [])).text, 'Follow-up response');
  assert.equal(api.calls.length, 4);
  assert.match(api.calls[3].url, /gemini-3\.1-flash-lite:generateContent$/);
  assert.equal(api.calls.filter(call => call.method === 'GET').length, 1);
});

test('Gemini refreshes expired catalogs without losing its last working model', async () => {
  const api = gemini([catalog(model('gemini-3.1-flash-lite')), answer('First'), catalog(model('gemini-3.5-flash-lite'), model('gemini-3.1-flash-lite')), answer('Next')]);
  await api.askGemini(fixtureKey, '', []);
  api.advance(15 * 60_000 + 1);
  assert.equal((await api.askGemini(fixtureKey, '', [])).model, 'gemini-3.1-flash-lite');
  assert.equal(api.calls.filter(call => call.method === 'GET').length, 2);
});

test('Gemini does not repeat quota-disabled models and retries them after the cooldown', async () => {
  const api = gemini([catalog(model('gemini-3.5-flash-lite')), failure(429, 'Quota exceeded, limit: 0'), answer('Now available')]);
  const first = await api.askGemini(fixtureKey, '', []);
  const second = await api.askGemini(fixtureKey, '', []);
  assert.equal(first.retryable, false);
  assert.equal(second.retryable, false);
  assert.match(second.detail, /HTTP 429: Quota exceeded, limit: 0/);
  assert.equal(api.calls.length, 2);
  api.advance(5 * 60_000 + 1);
  assert.equal((await api.askGemini(fixtureKey, '', [])).text, 'Now available');
  assert.equal(api.calls.length, 3);
});

test('Gemini keeps cached model availability and last-good choices isolated between API keys', async () => {
  const otherKey = 'second-fixture-key';
  const api = gemini([catalog(model('gemini-3.5-flash-lite')), failure(429, 'Quota exceeded, limit: 0'), catalog(model('gemini-3.5-flash-lite')), answer('Second project ready')]);
  await api.askGemini(fixtureKey, '', []);
  assert.equal((await api.askGemini(otherKey, '', [])).text, 'Second project ready');
  assert.equal(api.calls.length, 4);
  assert.ok(api.calls.slice(0, 2).every(call => call.headers['x-goog-api-key'] === fixtureKey));
  assert.ok(api.calls.slice(2).every(call => call.headers['x-goog-api-key'] === otherKey));
});

test('Gemini retains HTTP failure details when the provider returns an HTML overload page', async () => {
  const badJSON = { ...failure(503, ''), statusText: 'Service Unavailable', jsonError: new SyntaxError('Unexpected token <') };
  const api = gemini([catalog(model('gemini-3.5-flash-lite')), badJSON, badJSON]);
  const result = await api.askGemini(fixtureKey, '', []);
  assert.equal(result.retryable, true);
  assert.match(result.detail, /Gemini HTTP 503: Service Unavailable/);
  assert.ok(!result.detail.includes('Unexpected token'));
});

test('Gemini never presents thought text as the companion response', async () => {
  const api = gemini([catalog(model('gemini-2.5-flash')), { data: { candidates: [{ content: { parts: [{ thought: true, text: 'private reasoning' }, { text: 'Hello ' }, { text: 'Alex' }] } }] } }]);
  assert.equal((await api.askGemini(fixtureKey, '', [])).text, 'Hello Alex');
});

test('Gemini identifies blocked and empty responses without fabricating success', async () => {
  const api = gemini([catalog(model('gemini-2.5-flash')), { data: { promptFeedback: { blockReason: 'SAFETY' } } }]);
  const result = await api.askGemini(fixtureKey, '', []);
  assert.equal(result.text, null);
  assert.equal(result.error, 'Gemini returned no text (SAFETY). Try rephrasing your message.');
  const unavailable = gemini([catalog(model('gemini-embedding-001', ['embedContent']))]);
  assert.equal((await unavailable.askGemini(fixtureKey, '', [])).error, 'No Gemini text models are available for this key. Check the project in Google AI Studio.');
});

const context = { petName: 'Cine', userName: 'Alex', pomoLeft: 0, interactionHistory: [], userPreferences: {}, dailyPatterns: {} };

test('Ordinary dialogue reaches AI instead of changing the pet, launching tools, or storing memories', () => {
  const brain = loadBrain();
  const dialogue = [
    'what is the meaning of time?',
    'i cannot sleep, tell me a calming story',
    'how can i wake up feeling refreshed?',
    'explain the boot process in windows',
    'my name is important to me, why is that?',
    'why do some people say your name is your identity?',
    'can you remind me how recursion works?',
    'remind me why the sky is blue',
    'what does the theme gold symbolize in movies?',
    'can a character turn into cat in a fantasy movie?',
    'how can i grow as a developer?',
    'how do i make my code smaller?',
    'i love documentaries about painting',
    'why does this stupid calculator keep failing?',
    'tell me about cineverse',
    'how do i open notepad on windows?',
    'how can i remember what i study?',
    'why do i forget things so easily?',
    'how does memory recall work?',
    'can you explain statistics to me?',
    'what factors affect a movie budget?',
    'help me improve my speaking voice'
  ];
  for (const text of dialogue) assert.equal(brain.runSkills(text, context), null, `Dialogue was hijacked: ${text}`);
  assert.deepEqual(Array.from(brain.loadMemory().memories), []);
});

test('Explicit companion commands still work, including the advertised timer shortcut', () => {
  const brain = loadBrain();
  for (const command of ['dance', 'please wiggle!', 'sing me a song']) assert.ok(brain.runSkills(command, context).action);
  assert.equal(brain.runSkills('sleep', context).action, 'sleep');
  assert.equal(brain.runSkills('wake up', context).action, 'wake');
  assert.equal(brain.runSkills('call me alex', context).setting.userName, 'Alex');
  assert.equal(brain.runSkills('rename you to pip', context).setting.petName, 'Pip');
  assert.equal(brain.runSkills('pomodoro 10', context).pomodoro, 10);
  assert.equal(brain.runSkills('set a timer for 15 minutes', context).pomodoro, 15);
  assert.equal(brain.runSkills('cancel timer', { ...context, pomoLeft: 600 }).pomodoro, -1);
  assert.equal(brain.runSkills('theme cyan', context).setting.theme, 'cyan');
  assert.equal(brain.runSkills('become cat', context).setting.pet, 'cat');
  assert.equal(brain.runSkills('bigger', context).setting.size, 'L');
  assert.equal(brain.runSkills('smaller', context).setting.size, 'S');
  assert.ok(brain.runSkills('open notepad', context));
  assert.equal(brain.runSkills('voice on', context).setting.voice, true);
  assert.equal(brain.runSkills('voice off', context).setting.voice, false);
});

test('Explicit reminders require a duration and preserve hours correctly', () => {
  const brain = loadBrain();
  const reminder = brain.runSkills('remind me in 2 hours to stretch', context).reminder;
  assert.equal(reminder.mins, 120);
  assert.equal(reminder.what, 'stretch');
});

test('Memory commands store, recall, remove and export actual saved memories', () => {
  const brain = loadBrain();
  brain.runSkills('remember that i prefer tea', context);
  assert.match(brain.runSkills('my memories', context).text, /i prefer tea/);
  const backup = JSON.parse(brain.runSkills('brain backup', context).memoryJson);
  assert.deepEqual(backup.memories, ['i prefer tea']);
  brain.runSkills('forget i prefer tea', context);
  assert.equal(brain.loadMemory().memories.length, 0);
});

function hubHarness(responses = [{ text: 'A thoughtful response', model: 'test-model' }], options = {}) {
  const store = storage();
  store.setItem('cinemate-settings-v1', JSON.stringify(options.settings || {}));
  let speechListener = () => {};
  const calls = [];
  const states = [];
  const refs = [];
  const effects = [];
  const timeouts = [];
  let cursor = 0;
  let firstRender = true;
  const hookSlot = () => cursor++;
  const react = {
    useState(initial) {
      const index = hookSlot();
      if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial;
      return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value; }];
    },
    useRef(value) { const index = hookSlot(); return refs[index] ??= { current: value }; },
    useEffect(callback) { hookSlot(); if (firstRender) effects.push(callback); },
    useCallback(callback) { hookSlot(); return callback; },
    useMemo(callback) { hookSlot(); return callback(); }
  };
  const mate = new Proxy({
    onSpeech(callback) { speechListener = callback; return () => {}; },
    speak(...args) { calls.push({ method: 'speak', args }); return options.speak ? options.speak(...args) : Promise.resolve({}); },
    onHubState(callback) { callback(true); return () => {}; },
    onIdle() { return () => {}; },
    getClickThrough: async () => false,
    nowPlaying: async () => null,
    ask: async (...args) => { calls.push({ method: 'ask', args }); return responses.shift() ?? { text: 'A thoughtful response', model: 'test-model' }; }
  }, { get(target, property) { return target[property] ?? ((...args) => { calls.push({ method: property, args }); return Promise.resolve(''); }); } });
  const jsx = (type, props) => ({ type, props: props ?? {} });
  const hub = loadTS('src/renderer/src/HubStage.tsx', {
    localStorage: store,
    navigator: { clipboard: { readText: async () => '', writeText: async () => {} } },
    window: { mate, setTimeout: (callback, delay) => { timeouts.push({ callback, delay }); return timeouts.length; }, clearTimeout() {}, setInterval: () => 1, clearInterval() {} }
  }, {
    react,
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'fragment' },
    '../../../assets/cine.svg': 'cine.svg',
    './brain': loadBrain(store),
    './PetStage': { CHANNELS: {}, bus: { emit() {} } },
    './CompanionTools': { default: () => null },
    './voiceIntent': loadTS('src/renderer/src/voiceIntent.ts')
  });
  const render = () => { cursor = 0; const tree = hub.default(); firstRender = false; return tree; };
  const find = (tree, predicate) => {
    if (!tree || typeof tree !== 'object') return undefined;
    if (predicate(tree)) return tree;
    for (const child of [tree.props?.children].flat(Infinity)) { const result = find(child, predicate); if (result) return result; }
  };
  render();
  effects.forEach(callback => callback());
  return {
    calls,
    async hear(text) {
      render();
      speechListener({state:'heard',text,direct:true,manual:false});
      const timeout = timeouts.findIndex(job => job.delay === 0);
      assert.ok(timeout >= 0, 'A voice reply was queued');
      timeouts.splice(timeout, 1)[0].callback();
      await new Promise(resolve => setImmediate(resolve));
    },
    userMessages() {
      const log = find(render(), element => element.props.role === 'log');
      return Array.from(log.props.children.flat(Infinity).filter(element => element?.props?.className === 'message you').map(element => find(element, child => child.type === 'p').props.children));
    },
    async retry() {
      const button = find(render(), element => element.type === 'button' && element.props.className === 'retry-chat');
      assert.ok(button, 'A retry is offered for a temporary provider failure');
      assert.equal(button.props.disabled, false);
      button.props.onClick();
      await new Promise(resolve => setImmediate(resolve));
    },
    async send(text) {
      const input = find(render(), element => element.type === 'input' && element.props['aria-label'] === 'Ask');
      assert.ok(input, 'Chat input is visible');
      input.props.onChange({ target: { value: text } });
      find(render(), element => element.type === 'form').props.onSubmit({ preventDefault() {} });
      const timeout = timeouts.findIndex(job => job.delay === 0);
      assert.ok(timeout >= 0, 'A reply was queued');
      timeouts.splice(timeout, 1)[0].callback();
      await new Promise(resolve => setImmediate(resolve));
    }
  };
}

test('Spoken conversation arms follow-up listening after speech completes and retains context without another wake word', async () => {
  let finished;
  const speaking = new Promise(resolve => { finished = resolve; });
  const hub = hubHarness([{text:'Earth orbits the Sun.'}, {text:'Mars does too.'}], {
    settings: {voice:true,wakeListening:true}, speak: () => speaking
  });
  await hub.hear('Hey Cine, why does Earth orbit the Sun?');
  assert.equal(hub.calls.filter(call => call.method === 'armSpeech').length, 0);
  assert.match(hub.calls.find(call => call.method === 'ask').args[1], /spoken conversation/);
  finished({});
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(hub.calls.filter(call => call.method === 'armSpeech').length, 1);
  await hub.hear('What about Mars?');
  const requests = hub.calls.filter(call => call.method === 'ask');
  assert.equal(requests.length, 2);
  assert.ok(requests[1].args[0].some(turn => turn.text === 'Earth orbits the Sun.'));
  assert.equal(requests[1].args[0].at(-1).text, 'What about Mars?');
});

test('Chat sends the full conversation to Gemini and retains original user wording', async () => {
  const hub = hubHarness();
  await hub.send('What is time dilation?');
  await hub.send('How does that affect Satellites?');
  const requests = hub.calls.filter(call => call.method === 'ask');
  assert.equal(requests.length, 2);
  const turns = requests[1].args[0];
  assert.equal(turns.at(-1).text, 'How does that affect Satellites?');
  assert.ok(turns.some(turn => turn.role === 'user' && turn.text === 'What is time dilation?'));
  assert.ok(turns.some(turn => turn.role === 'model' && turn.text === 'A thoughtful response'));
});

test('Chat excludes provider failures from model context while retaining unanswered user messages', async () => {
  const hub = hubHarness([{ text: null, error: 'Gemini HTTP 429: quota exceeded' }, { text: 'Recovered', model: 'test-model' }]);
  await hub.send('Can we talk about space?');
  await hub.send('What about Mars?');
  const turns = hub.calls.filter(call => call.method === 'ask')[1].args[0];
  assert.ok(turns.some(turn => turn.text === 'Can we talk about space?'));
  assert.ok(turns.every(turn => !turn.text.includes('quota exceeded')));
});

test('Chat retries the exact failed request without duplicating the user message', async () => {
  const hub = hubHarness([{ text: null, error: 'Gemini is busy right now. Please try again in a moment.', detail: 'Gemini HTTP 503: high demand', retryable: true }, { text: 'Recovered after retry', model: 'gemini-3.5-flash-lite' }]);
  await hub.send('What makes a companion feel alive?');
  assert.deepEqual(hub.userMessages(), ['What makes a companion feel alive?']);
  await hub.retry();
  const requests = hub.calls.filter(call => call.method === 'ask');
  assert.equal(requests.length, 2);
  assert.strictEqual(requests[1].args[0], requests[0].args[0]);
  assert.equal(requests[1].args[1], requests[0].args[1]);
  assert.ok(requests[1].args[0].every(turn => !turn.text.includes('HTTP 503') && !turn.text.includes('busy right now')));
  assert.deepEqual(hub.userMessages(), ['What makes a companion feel alive?']);
});

test('Chat ordinary dialogue avoids operating-system actions', async () => {
  const hub = hubHarness();
  await hub.send('I love calculating probability. Can you explain it?');
  const actions = hub.calls.filter(call => ['launch', 'media', 'openFolder', 'window', 'spotify', 'openSite', 'screenshot'].includes(call.method));
  assert.equal(actions.length, 0);
  assert.equal(hub.calls.filter(call => call.method === 'ask').length, 1);
});

for (const text of [
  'How do I take a screenshot on Windows?',
  'Why does volume down sometimes mute audio?',
  'How do I open downloads in a browser?',
  'What happens when you lock pc?',
  'Why should I stop music while studying?'
]) {
  test(`Chat discusses a command without executing it: ${text}`, async () => {
    const hub = hubHarness();
    await hub.send(text);
    const actions = hub.calls.filter(call => ['launch', 'media', 'openFolder', 'window', 'spotify', 'openSite', 'screenshot', 'lock'].includes(call.method));
    assert.equal(actions.length, 0, `Unexpected desktop command: ${actions[0]?.method}`);
    assert.equal(hub.calls.filter(call => call.method === 'ask').length, 1);
  });
}
