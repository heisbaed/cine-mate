import { useEffect, useState } from 'react';

function readList(key: string): string[] {
  try { const value = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(value) ? value.filter(v => typeof v === 'string') : []; }
  catch { return []; }
}

const today = () => new Date().toLocaleDateString();
interface Goal { text: string; done: boolean }

export default function CompanionTools() {
  const [clipboard, setClipboard] = useState(() => readList('cinemate-clipboard-v1'));
  const [noteList, setNoteList] = useState(() => readList('cinemate-notes-v1'));
  const [noteInput, setNoteInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [system, setSystem] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [shot, setShot] = useState('');
  const [takingShot, setTakingShot] = useState(false);
  const [goalInput, setGoalInput] = useState('');
  const [goals, setGoals] = useState<Goal[]>(() => {
    try { const saved = JSON.parse(localStorage.getItem('cinemate-daily-goals-v1') || '{}'); return saved.day === today() && Array.isArray(saved.items) ? saved.items.filter((v: Goal) => typeof v.text === 'string' && typeof v.done === 'boolean') : []; }
    catch { return []; }
  });
  const [day, setDay] = useState(today);
  const [math, setMath] = useState<{ a: number; b: number; multiply: boolean } | null>(null);
  const [answer, setAnswer] = useState('');
  const [mathResult, setMathResult] = useState('');
  const [mathWins, setMathWins] = useState(0);

  useEffect(() => { localStorage.setItem('cinemate-clipboard-v1', JSON.stringify(clipboard)); }, [clipboard]);
  useEffect(() => { localStorage.setItem('cinemate-notes-v1', JSON.stringify(noteList)); }, [noteList]);
  useEffect(() => { localStorage.setItem('cinemate-daily-goals-v1', JSON.stringify({ day, items: goals })); }, [day, goals]);
  useEffect(() => {
    const interval = window.setInterval(() => {
      const next = today();
      setDay(current => { if (current !== next) setGoals([]); return next; });
    }, 60000);
    return () => window.clearInterval(interval);
  }, []);

  const refresh = async () => {
    setRefreshing(true);
    try { setSystem(await window.mate.sysinfo()); }
    catch { setSystem('UNAVAILABLE'); }
    finally { setRefreshing(false); }
  };
  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => { void refresh(); }, 30000);
    return () => window.clearInterval(interval);
  }, []);

  const value = (key: string) => system.split(/\r?\n/).find(line => line.startsWith(`${key}=`))?.slice(key.length + 1);
  const challenge = () => {
    setMath({ a: 2 + Math.floor(Math.random() * 18), b: 2 + Math.floor(Math.random() * 10), multiply: Math.random() > .5 });
    setAnswer(''); setMathResult('');
  };

  return <div className="companion-tools">
    <div className="tool-heading"><strong>Quick launch</strong><small>Open a desktop tool</small></div>
    <div className="tool-actions">{['notepad', 'calculator', 'paint', 'terminal'].map(name => <button key={name} type="button" onClick={() => window.mate.launch(name)}>{name[0].toUpperCase() + name.slice(1)}</button>)}</div>

    <div className="tool-heading"><strong>System status</strong><small>Updates every 30 seconds while Tools is open</small></div>
    <div className="system-cards"><span>Battery<strong>{value('BATTERY') === 'AC' ? 'Plugged in' : value('BATTERY') ? `${value('BATTERY')}%` : 'Unavailable'}</strong></span><span>RAM free<strong>{value('MEMORY') ? `${value('MEMORY')} GB` : 'Unavailable'}</strong></span><span>CPU<strong>{value('CPU') ? `${value('CPU')}%` : 'Unavailable'}</strong></span></div>
    <button type="button" className="test-btn" disabled={refreshing} onClick={() => { void refresh(); }}>{refreshing ? 'Reading system...' : 'Refresh system status'}</button>

    <div className="tool-heading"><strong>Screenshot</strong><small>Save your screen to Pictures / CineMate</small></div>
    <div className="tool-actions"><button type="button" disabled={takingShot} onClick={() => {
      setTakingShot(true); setShot('');
      void window.mate.screenshot().then(file => setShot(file ? `Saved ${file.split(/[\\/]/).pop()}` : 'Screenshot failed.')).catch(() => setShot('Screenshot failed.')).finally(() => setTakingShot(false));
    }}>{takingShot ? 'Saving...' : 'Take screenshot'}</button><button type="button" onClick={() => window.mate.openFolder('pictures')}>Open Pictures</button></div>
    {shot && <small role="status">{shot}</small>}

    <div className="tool-heading"><strong>Clipboard history</strong><small>Only saves text when you ask. Up to 10 clips.</small></div>
    <div className="tool-actions"><button type="button" onClick={() => {
      void navigator.clipboard.readText().then(text => {
        if (!text.trim()) { setStatus('The clipboard has no text.'); return; }
        setClipboard(items => [text.slice(0, 12000), ...items.filter(item => item !== text)].slice(0, 10)); setStatus('Clipboard saved.');
      }).catch(() => setStatus('Could not read the clipboard.'));
    }}>Save clipboard</button><button type="button" disabled={!clipboard.length} onClick={() => { setClipboard([]); setStatus('Saved clipboard history cleared.'); }}>Clear clips</button></div>
    <div className="tool-list">{clipboard.map((text, index) => <div key={index}><button type="button" className="clip-text" title={text} onClick={() => { void navigator.clipboard.writeText(text).then(() => setStatus('Copied.')).catch(() => setStatus('Could not copy.')); }}>{text.slice(0, 90)}</button><button type="button" aria-label={`Delete clip ${index + 1}`} onClick={() => setClipboard(items => items.filter((_, i) => i !== index))}>×</button></div>)}</div>
    {status && <small role="status">{status}</small>}

    <div className="tool-heading"><strong>Notes</strong><small>Includes notes saved in chat</small></div>
    <input aria-label="Search notes" placeholder="Search notes" value={search} onChange={e => setSearch(e.target.value)} />
    <form className="tool-form" onSubmit={e => { e.preventDefault(); if (!noteInput.trim()) return; setNoteList(items => [...items, noteInput.trim()].slice(-50)); setNoteInput(''); }}><input aria-label="New note" placeholder="A thought to keep" value={noteInput} maxLength={2000} onChange={e => setNoteInput(e.target.value)} /><button type="submit" disabled={!noteInput.trim()}>Save</button></form>
    <div className="tool-list">{noteList.map((text, index) => text.toLowerCase().includes(search.toLowerCase()) && <div key={index}><span>{text}</span><button type="button" aria-label={`Delete note ${index + 1}`} onClick={() => setNoteList(items => items.filter((_, i) => i !== index))}>×</button></div>)}</div>

    <div className="tool-heading"><strong>Today’s goals</strong><small>{goals.filter(goal => goal.done).length} / {goals.length} complete · resets each day</small></div>
    <form className="tool-form" onSubmit={e => { e.preventDefault(); if (!goalInput.trim()) return; setGoals(items => [...items, { text: goalInput.trim(), done: false }].slice(-20)); setGoalInput(''); }}><input aria-label="New daily goal" placeholder="One small win" value={goalInput} maxLength={160} onChange={e => setGoalInput(e.target.value)} /><button type="submit" disabled={!goalInput.trim()}>Add</button></form>
    <div className="tool-list">{goals.map((goal, index) => <div key={index}><label className="check"><input type="checkbox" checked={goal.done} onChange={e => setGoals(items => items.map((g, i) => i === index ? { ...g, done: e.target.checked } : g))} /><span className={goal.done ? 'goal-done' : ''}>{goal.text}</span></label><button type="button" aria-label={`Delete goal ${index + 1}`} onClick={() => setGoals(items => items.filter((_, i) => i !== index))}>×</button></div>)}</div>

    <div className="tool-heading"><strong>Brain break</strong><small>A quick maths challenge · {mathWins} solved this visit</small></div>
    {math && <form className="tool-form" onSubmit={e => {
      e.preventDefault(); if (!answer.trim() || mathResult === 'Correct!') return;
      if (Number(answer) === (math.multiply ? math.a * math.b : math.a + math.b)) { setMathWins(wins => wins + 1); setMathResult('Correct!'); }
      else setMathResult('Try again.');
    }}><label>{math.a} {math.multiply ? '×' : '+'} {math.b} =<input aria-label="Maths answer" inputMode="numeric" value={answer} onChange={e => setAnswer(e.target.value)} /></label><button type="submit" disabled={!answer.trim() || mathResult === 'Correct!'}>Check</button></form>}
    {mathResult && <small role="status">{mathResult}</small>}
    <button type="button" className="test-btn" onClick={challenge}>{math ? 'Next challenge' : 'Start maths game'}</button>
    <div className="tool-heading"><strong>Keyboard shortcuts</strong><small>Ctrl + Alt + C: chat · Ctrl + Alt + H: hide / show Cine · Ctrl + Alt + M: ghost mode</small></div>
  </div>;
}
