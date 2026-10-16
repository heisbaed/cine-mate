import { createHash } from 'node:crypto';

export interface ChatTurn { role: 'user' | 'model'; text: string }
export interface AIReply { text: string | null; model?: string; error?: string; detail?: string; retryable?: boolean }

interface GeminiModel { name: string; supportedGenerationMethods?: string[] }
interface GeminiData {
  models?: GeminiModel[];
  nextPageToken?: string;
  error?: { message?: string };
  candidates?: Array<{ content?: { parts?: Array<{ thought?: boolean; text?: string }> }; finishReason?: string }>;
  promptFeedback?: { blockReason?: string };
}
interface ModelFailure { model: string; errors: GeminiFailure[] }
interface KeyState {
  models: GeminiModel[];
  expiresAt: number;
  discovery?: Promise<GeminiModel[]>;
  lastGood?: string;
  disabled: Map<string, { until: number; error: GeminiFailure }>;
}

const endpoint = 'https://generativelanguage.googleapis.com/v1beta';
const discoveryLifetime = 15 * 60_000;
const disabledLifetime = 5 * 60_000;
const requestBudget = 35_000;
const keyStates = new Map<string, KeyState>();

class GeminiFailure extends Error {
  constructor(message: string, readonly status?: number, readonly retryAfterMs = 0) { super(message); }
  get transient(): boolean {
    return this.status ? [500, 502, 503, 504].includes(this.status) : /fetch failed|network|connection|socket|ECONN|ENOTFOUND|timeout|abort/i.test(this.message);
  }
  get disabled(): boolean { return this.status === 404 || (this.status === 429 && /limit\s*:\s*0\b/i.test(this.message)); }
}

function redact(text: string, key: string): string { return text.split(key).join('[redacted]'); }
function failure(error: unknown, key: string): GeminiFailure {
  if (error instanceof GeminiFailure) return error;
  const message = typeof error === 'object' && error !== null && 'message' in error ? String(error.message) : String(error);
  return new GeminiFailure(redact(message, key));
}
function sleep(delay: number): Promise<void> { return new Promise(resolve => setTimeout(resolve, delay)); }

async function request(path: string, key: string, deadline: number, body?: unknown): Promise<GeminiData> {
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new GeminiFailure('Gemini request timeout');
  let response: Response;
  try {
    response = await fetch(`${endpoint}/${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(Math.min(12_000, remaining))
    });
  } catch (error) { throw failure(error, key); }
  let data: GeminiData = {};
  try { data = await response.json() as GeminiData; } catch {
    if (response.ok) throw new GeminiFailure('Gemini returned an unreadable response. Please try again.');
  }
  if (!response.ok) {
    const reason = redact(String(data?.error?.message || response.statusText || 'Request failed'), key).slice(0, 400);
    const retryAfter = response.headers.get('retry-after');
    const retryAfterMs = retryAfter ? (Number.isFinite(Number(retryAfter)) ? Number(retryAfter) * 1000 : Date.parse(retryAfter) - Date.now()) : 0;
    throw new GeminiFailure(`Gemini HTTP ${response.status}: ${reason}`, response.status, Math.max(0, retryAfterMs || 0));
  }
  return data;
}

function stateFor(key: string): KeyState {
  // Keep credentials out of cache identifiers and never share discovery or quota state between keys.
  const fingerprint = createHash('sha256').update(key).digest('hex');
  let state = keyStates.get(fingerprint);
  if (!state) {
    if (keyStates.size >= 4) keyStates.delete(keyStates.keys().next().value!);
    state = { models: [], expiresAt: 0, disabled: new Map() };
    keyStates.set(fingerprint, state);
  }
  return state;
}

function modelRank(name: string): number {
  const preview = /preview|experimental|(?:^|-)exp(?:-|$)/.test(name);
  const alias = name.endsWith('-latest');
  if (name.includes('flash-lite')) return preview ? 30 : alias ? 70 : 80;
  if (name.includes('flash')) return preview ? 20 : alias ? 50 : 60;
  return preview ? 10 : 40;
}

async function discover(key: string, state: KeyState, deadline: number): Promise<GeminiModel[]> {
  if (state.expiresAt > Date.now()) return state.models;
  if (state.discovery) return state.discovery;
  state.discovery = (async () => {
    const models: GeminiModel[] = [];
    let page = '';
    const pages = new Set<string>();
    do {
      pages.add(page);
      const path = `models?pageSize=100${page ? `&pageToken=${encodeURIComponent(page)}` : ''}`;
      let data: GeminiData;
      try { data = await request(path, key, deadline); } catch (error) {
        const problem = failure(error, key);
        const delay = Math.max(1000 + Math.floor(Math.random() * 250), problem.retryAfterMs);
        if (!problem.transient || delay > 8000 || deadline - Date.now() <= delay + 250) throw problem;
        await sleep(delay);
        data = await request(path, key, deadline);
      }
      models.push(...(Array.isArray(data.models) ? data.models : []));
      page = typeof data.nextPageToken === 'string' ? data.nextPageToken : '';
      if (page && pages.has(page)) throw new GeminiFailure('Gemini returned a repeated model catalog page. Please try again.');
    } while (page);
    const candidates = models.filter(m => typeof m.name === 'string' && /^models\/gemini-[\w.-]+$/.test(m.name)
      && m.supportedGenerationMethods?.includes('generateContent')
      && !/image|vision|tts|robotics|computer-use|embedding|audio|live|deep-research|transcrib|customtools/.test(m.name));
    const unique = [...new Map(candidates.map(m => [m.name, m])).values()];
    unique.sort((a, b) => modelRank(b.name) - modelRank(a.name) || b.name.localeCompare(a.name, undefined, { numeric: true }));
    state.models = unique;
    state.expiresAt = Date.now() + discoveryLifetime;
    return unique;
  })();
  try { return await state.discovery; } finally { state.discovery = undefined; }
}

function unavailableReply(failures: ModelFailure[]): AIReply {
  const errors = failures.flatMap(item => item.errors);
  const detail = failures.map(item => `${item.model.replace('models/', '')}: ${item.errors.map(error => error.message).join('; ')}`).join('\n');
  const transient = errors.filter(error => error.transient);
  if (transient.length) {
    const timeout = transient.every(error => /timeout|abort/i.test(error.message));
    const providerBusy = transient.some(error => error.status);
    return {
      text: null,
      error: timeout ? 'Gemini took too long to respond. Please try again.' : providerBusy ? 'Gemini is busy right now. Please try again in a moment.' : 'Cine could not reach Gemini. Check your connection and try again.',
      detail,
      retryable: true
    };
  }
  return { text: null, error: 'The available Gemini models could not answer for this API key. Check your project in Google AI Studio.', detail, retryable: false };
}

export async function askGemini(key: string, system: string, turns: ChatTurn[]): Promise<AIReply> {
  key = key.trim();
  if (!key) return { text: null, error: 'Add your Gemini API key in Settings, then test the connection.', retryable: false };
  const deadline = Date.now() + requestBudget;
  try {
    const state = stateFor(key);
    const models = await discover(key, state, deadline);
    if (!models.length) throw new GeminiFailure('No Gemini text models are available for this key. Check the project in Google AI Studio.');
    for (const [name, disabled] of state.disabled) if (disabled.until <= Date.now()) state.disabled.delete(name);
    const candidates = models.filter(m => !state.disabled.has(m.name));
    if (state.lastGood) candidates.sort((a, b) => Number(b.name === state.lastGood) - Number(a.name === state.lastGood));
    const selected = candidates.slice(0, 3);
    const failures: ModelFailure[] = [];
    const retry: GeminiModel[] = [];
    let retryAfterMs = 0;
    const body = {
      systemInstruction: { parts: [{ text: system }] },
      contents: turns.slice(-24).map(t => ({ role: t.role, parts: [{ text: t.text.slice(0, 12_000) }] })),
      generationConfig: { maxOutputTokens: 2048 }
    };
    for (let round = 0; round < 2; round++) {
      if (round) {
        if (!retry.length) break;
        const delay = Math.max(1000 + Math.floor(Math.random() * 250), retryAfterMs);
        if (delay > 8000 || deadline - Date.now() <= delay + 250) break;
        await sleep(delay);
      }
      for (const model of round ? retry : selected) {
        if (deadline <= Date.now()) break;
        let data: GeminiData;
        try { data = await request(`${model.name}:generateContent`, key, deadline, body); } catch (error) {
          const problem = failure(error, key);
          if (!problem.transient && !problem.disabled) throw problem;
          let item = failures.find(item => item.model === model.name);
          if (!item) failures.push(item = { model: model.name, errors: [] });
          item.errors.push(problem);
          if (problem.disabled) state.disabled.set(model.name, { until: Date.now() + disabledLifetime, error: problem });
          if (problem.transient && !round) {
            retry.push(model);
            retryAfterMs = Math.max(retryAfterMs, problem.retryAfterMs);
          }
          continue;
        }
        const text = data.candidates?.[0]?.content?.parts?.filter(p => !p.thought && typeof p.text === 'string').map(p => p.text).join('').trim();
        if (!text) throw new GeminiFailure(`Gemini returned no text (${data.promptFeedback?.blockReason || data.candidates?.[0]?.finishReason || 'empty response'}). Try rephrasing your message.`);
        state.lastGood = model.name;
        return { text, model: model.name.replace('models/', '') };
      }
    }
    if (!failures.length) {
      for (const model of models) {
        const disabled = state.disabled.get(model.name);
        if (disabled) failures.push({ model: model.name, errors: [disabled.error] });
      }
    }
    if (!failures.length) throw new GeminiFailure('Gemini request timeout');
    return unavailableReply(failures);
  } catch (error) {
    const problem = failure(error, key);
    if (problem.transient) return unavailableReply([{ model: 'Gemini', errors: [problem] }]);
    return { text: null, error: redact(problem.message, key), retryable: false };
  }
}
