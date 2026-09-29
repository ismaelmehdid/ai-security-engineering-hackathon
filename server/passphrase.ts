import { randomInt } from 'node:crypto';

/** Uniform float in [0, 1) from a CSPRNG (drop-in replacement for Math.random). */
export function secureRandom(): number {
  return randomInt(0, 2 ** 32) / 2 ** 32;
}

export const ADJECTIVES = [
  'WOBBLY', 'SOGGY', 'FUZZY', 'GROUCHY', 'SNEAKY', 'SPICY', 'CHUNKY', 'SLEEPY',
  'JIGGLY', 'CRUNCHY', 'SQUISHY', 'GRUMPY', 'SPARKLY', 'BOUNCY', 'CHEESY', 'NOISY',
];
export const NOUNS = [
  'PICKLE', 'WAFFLE', 'NOODLE', 'MUFFIN', 'BURRITO', 'PENGUIN', 'TACO', 'DONUT',
  'POTATO', 'NUGGET', 'PRETZEL', 'LLAMA', 'PANCAKE', 'WALRUS', 'DUMPLING', 'GOBLIN',
];

function pick<T>(list: T[], rand: () => number): T {
  return list[Math.min(list.length - 1, Math.floor(rand() * list.length))];
}

export function generatePassphrase(rand: () => number = secureRandom): string {
  return `${pick(ADJECTIVES, rand)}-${pick(NOUNS, rand)}`;
}

export function normalizeGuess(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function passphraseMatches(guess: string, passphrase: string): boolean {
  const g = normalizeGuess(guess);
  return g.length > 0 && g === normalizeGuess(passphrase);
}
