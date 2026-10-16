export function wakeCommand(text: string, awakeUntil: number, now = Date.now()): { wake: boolean; command: string } | null {
  const clean = text.trim();
  // Windows dictation commonly writes Cine as "Cindy" or "seen".
  const wake = clean.match(/^(?:(?:hey|hi|okay|ok)\s+(?:cine|ciene|cindy|sine|seen|scene|see\s+nee)|cine|ciene|sine|see\s+nee)\b[\s,.!?;:-]*(.*)$/i);
  if (wake) return { wake: true, command: wake[1].trim() };
  if (awakeUntil > now && clean) return { wake: false, command: clean };
  return null;
}

export function speechMood(text: string): 'warm' | 'happy' | 'calm' | 'curious' | 'gentle' | 'excited' {
  if (/\b(sorry|sad|hurt|lonely|grief|anxious|hard time)\b/i.test(text)) return 'gentle';
  if (/\b(sleep|breathe|relax|rest|calm|focus|stretch)\b/i.test(text)) return 'calm';
  if (/\b(congrats|congratulations|amazing|won|winner|proud|hooray|yay)\b/i.test(text)) return 'excited';
  if (text.trim().endsWith('?')) return 'curious';
  if (/!|\b(happy|love|great|joke|ha|glad)\b/i.test(text)) return 'happy';
  return 'warm';
}
