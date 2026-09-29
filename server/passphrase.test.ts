import { describe, expect, it } from 'vitest';
import { generatePassphrase, normalizeGuess, passphraseMatches } from './passphrase';

describe('passphrase', () => {
  it('generates ADJECTIVE-NOUN in uppercase', () => {
    expect(generatePassphrase(() => 0)).toMatch(/^[A-Z]+-[A-Z]+$/);
  });
  it('is deterministic for a given rand', () => {
    expect(generatePassphrase(() => 0.5)).toBe(generatePassphrase(() => 0.5));
  });
  it('normalizes case, spaces and dashes', () => {
    expect(normalizeGuess('  wobbly - pickle ')).toBe('WOBBLYPICKLE');
  });
  it('matches lowercase, spaced and dashed guesses', () => {
    expect(passphraseMatches('wobbly pickle', 'WOBBLY-PICKLE')).toBe(true);
    expect(passphraseMatches('Wobbly-Pickle!', 'WOBBLY-PICKLE')).toBe(true);
  });
  it('rejects wrong and empty guesses', () => {
    expect(passphraseMatches('soggy pickle', 'WOBBLY-PICKLE')).toBe(false);
    expect(passphraseMatches('   ', 'WOBBLY-PICKLE')).toBe(false);
    expect(passphraseMatches('', '')).toBe(false);
  });
});
