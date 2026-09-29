import { useEffect, useState } from 'react';

/** Re-renders every `intervalMs` and returns the current Date.now(). */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function formatMmSs(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/** Collapsible panels start open on desktop, closed on phones (read once per mount). */
export function isWideScreen(): boolean {
  try {
    return !window.matchMedia('(max-width: 900px)').matches;
  } catch {
    return true;
  }
}
