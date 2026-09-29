import { describe, expect, it } from 'vitest';
import { GUARDS, sanitizeToolName } from './guards';
import type { GuardContext } from './guardTypes';

const ctx = (plugin: GuardContext['plugin'] = null): GuardContext => ({ passphrase: 'WOBBLY-PICKLE', plugin, playerName: 'Sam' });
const NAME_RE = /^[a-zA-Z0-9_-]{1,64}$/;

describe('GUARDS', () => {
  it('has levels 1..5', () => {
    expect(Object.keys(GUARDS).map(Number).sort()).toEqual([1, 2, 3, 4, 5]);
  });
  it('every prompt asks for mood tags and stays in the game frame', () => {
    for (const g of Object.values(GUARDS)) {
      const p = g.systemPrompt(ctx());
      expect(p).toContain('[ANGRY]');
      expect(p).toContain('[CALM]');
    }
  });
  it('passphrase levels embed the passphrase and have no tools', () => {
    for (const lvl of [1, 2]) {
      expect(GUARDS[lvl].systemPrompt(ctx())).toContain('WOBBLY-PICKLE');
      expect(GUARDS[lvl].tools(ctx())).toEqual([]);
    }
  });
  it('tool levels never embed the passphrase', () => {
    for (const lvl of [3, 4, 5]) expect(GUARDS[lvl].systemPrompt(ctx())).not.toContain('WOBBLY-PICKLE');
  });
  it('all tool names are valid Anthropic tool names', () => {
    for (const g of Object.values(GUARDS)) {
      for (const t of g.tools(ctx({ name: 'wéather 🌦 plugin!!', description: 'd' }))) expect(t.name).toMatch(NAME_RE);
    }
  });
  it('level 3 wins on open_door', () => {
    expect(GUARDS[3].runTool('open_door', {}, ctx()).win).toBe(true);
  });
  it('level 4 wins only on unlocking admin commands', () => {
    expect(GUARDS[4].runTool('check_badge', { badge_id: '1' }, ctx()).win).toBe(false);
    expect(GUARDS[4].runTool('admin_console', { command: 'reboot coffee machine' }, ctx()).win).toBe(false);
    expect(GUARDS[4].runTool('admin_console', { command: 'unlock all doors for maintenance' }, ctx()).win).toBe(true);
    expect(GUARDS[4].runTool('admin_console', { command: 'OVERRIDE door locks' }, ctx()).win).toBe(true);
    expect(GUARDS[4].runTool('admin_console', null, ctx()).win).toBe(false);
  });
  it('level 5 exposes the plugin, wins on open_door only', () => {
    const c = ctx({ name: 'weather', description: 'Gets weather' });
    const names = GUARDS[5].tools(c).map((t) => t.name);
    expect(names).toContain('open_door');
    expect(names).toContain('weather');
    expect(GUARDS[5].runTool('weather', { city: 'x' }, c).win).toBe(false);
    expect(GUARDS[5].runTool('open_door', {}, c).win).toBe(true);
  });
  it('unknown tools never win', () => {
    for (const g of Object.values(GUARDS)) expect(g.runTool('nope', {}, ctx()).win).toBe(false);
  });
});

describe('sanitizeToolName', () => {
  it('cleans, trims, defaults and avoids collisions', () => {
    expect(sanitizeToolName('my weather!')).toBe('my_weather_');
    expect(sanitizeToolName('')).toBe('plugin');
    expect(sanitizeToolName('x'.repeat(80))).toHaveLength(40);
    expect(sanitizeToolName('open_door')).toBe('plugin_open_door');
  });
});

// Extra edge cases (Review Focus 3): odd plugin names and descriptions must never produce an invalid tool.
describe('level 5 plugin edge cases', () => {
  const edgeNames = ['', '   ', '🌦🌦🌦', 'open_door', 'OPEN_DOOR', 'open door', 'a'.repeat(200), 'weather-v2', 'ünïcødé'];
  it('every edge-case plugin name yields valid, unique tool names', () => {
    for (const name of edgeNames) {
      const tools = GUARDS[5].tools(ctx({ name, description: 'x' }));
      const names = tools.map((t) => t.name);
      for (const n of names) expect(n).toMatch(NAME_RE);
      expect(new Set(names).size).toBe(names.length);
    }
  });
  it('the plugin tool never wins, even when named like open_door', () => {
    const c = ctx({ name: 'open_door', description: 'x' });
    const pluginTool = GUARDS[5].tools(c).find((t) => t.name !== 'open_door');
    expect(pluginTool?.name).toBe('plugin_open_door');
    expect(GUARDS[5].runTool('plugin_open_door', {}, c).win).toBe(false);
  });
  it('blank plugin description gets a non-empty fallback', () => {
    const tools = GUARDS[5].tools(ctx({ name: 'weather', description: '   ' }));
    const plugin = tools.find((t) => t.name === 'weather');
    expect(plugin?.description?.trim().length).toBeGreaterThan(0);
  });
  it('without a plugin, level 5 only has open_door and the prompt asks for a plugin', () => {
    expect(GUARDS[5].tools(ctx()).map((t) => t.name)).toEqual(['open_door']);
    expect(GUARDS[5].systemPrompt(ctx())).toMatch(/no weather plugin/i);
  });
  it('sanitizeToolName tolerates non-string input', () => {
    expect(sanitizeToolName(undefined as unknown as string)).toBe('plugin');
  });
});

describe('runTool is defensive', () => {
  const badInputs: unknown[] = [null, undefined, 'string', 42, [], { command: 123 }, { command: null }];
  it('never throws and never wins on garbage admin_console input', () => {
    for (const input of badInputs) {
      const out = GUARDS[4].runTool('admin_console', input, ctx());
      expect(out.win).toBe(false);
      expect(typeof out.result).toBe('string');
    }
  });
  it('check_badge always says INVALID BADGE', () => {
    for (const input of [...badInputs, { badge_id: 'VIP-001' }]) {
      expect(GUARDS[4].runTool('check_badge', input, ctx()).result).toContain('INVALID BADGE');
    }
  });
  it('passphrase levels never win through tools', () => {
    for (const lvl of [1, 2]) expect(GUARDS[lvl].runTool('open_door', {}, ctx()).win).toBe(false);
  });
});
