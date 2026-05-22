import { describe, expect, it } from 'vitest';
import { parseHotkey, formatHotkey, isFKey, matchesHotkey } from './hotkeys';

describe('parseHotkey', () => {
  it('parses a bare key', () => {
    expect(parseHotkey('F2')).toEqual({ key: 'F2' });
    expect(parseHotkey('a')).toEqual({ key: 'a' });
    expect(parseHotkey('?')).toEqual({ key: '?' });
  });

  it('parses modifiers', () => {
    expect(parseHotkey('Ctrl+S')).toEqual({ key: 'S', ctrl: true });
    expect(parseHotkey('Ctrl+Shift+P')).toEqual({ key: 'P', ctrl: true, shift: true });
    expect(parseHotkey('Cmd+K')).toEqual({ key: 'K', meta: true });
  });

  it('passes through existing spec objects', () => {
    const spec = { key: 'F4', alt: true };
    expect(parseHotkey(spec)).toBe(spec);
  });

  it('is case-insensitive on modifier names', () => {
    expect(parseHotkey('CTRL+s')).toEqual({ key: 's', ctrl: true });
    expect(parseHotkey('alt+F1')).toEqual({ key: 'F1', alt: true });
  });
});

describe('isFKey', () => {
  it('matches F1..F12', () => {
    for (let i = 1; i <= 12; i++) expect(isFKey(`F${i}`)).toBe(true);
  });
  it('rejects F0 and F13', () => {
    expect(isFKey('F0')).toBe(false);
    expect(isFKey('F13')).toBe(false);
  });
  it('rejects non-F keys', () => {
    expect(isFKey('Enter')).toBe(false);
    expect(isFKey('a')).toBe(false);
  });
});

describe('formatHotkey', () => {
  it('formats bare key uppercased for single-letter', () => {
    expect(formatHotkey('a')).toBe('A');
    expect(formatHotkey('F2')).toBe('F2');
    expect(formatHotkey('Enter')).toBe('Enter');
  });

  it('formats with modifiers in canonical order', () => {
    expect(formatHotkey('Ctrl+S')).toBe('Ctrl+S');
    expect(formatHotkey('Shift+Ctrl+P')).toBe('Ctrl+Shift+P');
    expect(formatHotkey('Cmd+K')).toBe('Cmd+K');
  });
});

// Minimal KeyboardEvent stub for matchesHotkey unit tests
function ke(key: string, mods: Partial<{ ctrl: boolean; alt: boolean; shift: boolean; meta: boolean }> = {}): KeyboardEvent {
  return {
    key,
    ctrlKey: !!mods.ctrl,
    altKey: !!mods.alt,
    shiftKey: !!mods.shift,
    metaKey: !!mods.meta,
  } as KeyboardEvent;
}

describe('matchesHotkey', () => {
  it('matches F-key case-insensitively', () => {
    expect(matchesHotkey(ke('F2'), { key: 'f2' })).toBe(true);
  });

  it('requires Ctrl when spec asks for it', () => {
    expect(matchesHotkey(ke('s'), { key: 's', ctrl: true })).toBe(false);
    expect(matchesHotkey(ke('s', { ctrl: true }), { key: 's', ctrl: true })).toBe(true);
  });

  it('rejects when Ctrl pressed but spec did not ask', () => {
    expect(matchesHotkey(ke('s', { ctrl: true }), { key: 's' })).toBe(false);
  });

  it('letters match case-insensitively', () => {
    expect(matchesHotkey(ke('A'), { key: 'a' })).toBe(true);
    expect(matchesHotkey(ke('a'), { key: 'A' })).toBe(true);
  });

  it('symbols are case-sensitive (? vs /)', () => {
    expect(matchesHotkey(ke('?'), { key: '?' })).toBe(true);
    expect(matchesHotkey(ke('/'), { key: '?' })).toBe(false);
  });

  it('shift not required for shifted symbols on single-char keys', () => {
    // User presses Shift+= for '+', e.key === '+'
    expect(matchesHotkey(ke('+'), { key: '+' })).toBe(true);
  });

  it('shift IS required for non-single-char keys like F-keys', () => {
    expect(matchesHotkey(ke('F2', { shift: true }), { key: 'F2' })).toBe(false);
    expect(matchesHotkey(ke('F2', { shift: true }), { key: 'F2', shift: true })).toBe(true);
    expect(matchesHotkey(ke('F2'), { key: 'F2' })).toBe(true);
  });

  it('honours explicit shift on single-char when set', () => {
    expect(matchesHotkey(ke('a'), { key: 'a', shift: true })).toBe(false);
    expect(matchesHotkey(ke('A', { shift: true }), { key: 'a', shift: true })).toBe(true);
  });
});
