/**
 * Marg-style keyboard-driven shortcut system.
 * Lifted from desktop/src/lib/hotkeys.ts, cleaned up for re-use across
 * the Cloud desktop, web, and (eventually) tablet apps.
 *
 * Design rules:
 *   - F-keys and Escape ALWAYS fire, even mid-typing inside an input.
 *   - Letter + digit shortcuts are silently ignored while typing, so a
 *     cashier typing "F" inside the medicine search doesn't navigate.
 *   - Multiple screens can register their own bindings independently —
 *     no global registry that can stomp.
 *   - Capture-phase listener so global shortcuts beat per-child handlers.
 */

import { useEffect, useMemo, useRef } from 'react';
import type { DependencyList } from 'react';

export interface HotkeySpec {
  key: string; // 'F2', 'Enter', 'Escape', '+', '?', 'a'
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  meta?: boolean;
}

export type HotkeyInput = string | HotkeySpec;
export type HotkeyMap = Record<string, (e: KeyboardEvent) => void>;

/** 'Ctrl+Shift+S' → { key: 's', ctrl: true, shift: true } */
export function parseHotkey(input: HotkeyInput): HotkeySpec {
  if (typeof input !== 'string') return input;
  const parts = input.split('+').map((p) => p.trim()).filter(Boolean);
  const spec: HotkeySpec = { key: '' };
  for (const p of parts) {
    const lower = p.toLowerCase();
    if (lower === 'ctrl' || lower === 'control') spec.ctrl = true;
    else if (lower === 'alt') spec.alt = true;
    else if (lower === 'shift') spec.shift = true;
    else if (lower === 'meta' || lower === 'cmd') spec.meta = true;
    else spec.key = p;
  }
  return spec;
}

export function isFKey(key: string): boolean {
  return /^F([1-9]|1[0-2])$/i.test(key);
}

/**
 * True when the user is currently typing into a form control. Used to
 * suppress letter/digit shortcuts so typing inside a search box doesn't
 * trigger navigation.
 */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (typeof HTMLElement === 'undefined') return false;
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT') {
    const type = (target as HTMLInputElement).type;
    if (['checkbox', 'radio', 'button', 'submit', 'reset'].includes(type)) return false;
    return true;
  }
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return false;
}

/**
 * Does a KeyboardEvent match the given HotkeySpec?
 * Exported so non-React consumers (tests, vanilla JS) can use the matcher
 * without dragging in the React hook.
 */
export function matchesHotkey(e: KeyboardEvent, spec: HotkeySpec): boolean {
  if ((spec.ctrl ?? false) !== e.ctrlKey) return false;
  if ((spec.alt ?? false) !== e.altKey) return false;
  if ((spec.meta ?? false) !== e.metaKey) return false;

  const isSingleChar = e.key.length === 1;
  if (!isSingleChar) {
    // F-keys, Arrows, Insert, Delete, Enter — enforce Shift strictly.
    if ((spec.shift ?? false) !== e.shiftKey) return false;
  } else if (spec.shift !== undefined) {
    if (spec.shift !== e.shiftKey) return false;
  }
  // Else: single-char without explicit shift requirement — e.key already
  // reflects the shifted character, so any shift state is acceptable.

  if (isFKey(spec.key)) return e.key.toUpperCase() === spec.key.toUpperCase();
  if (spec.key.length === 1 && /^[a-z]$/i.test(spec.key)) {
    return e.key.toLowerCase() === spec.key.toLowerCase();
  }
  return e.key === spec.key;
}

/** Should this hotkey be suppressed because the user is editing text? */
export function shouldSuppress(e: KeyboardEvent, spec: HotkeySpec): boolean {
  if (isFKey(spec.key)) return false; // F-keys always fire
  if (spec.key === 'Escape') return false; // Escape always fires
  if (spec.ctrl || spec.alt || spec.meta) return false; // explicit shortcut
  return isEditableTarget(e.target);
}

/** Register a single hotkey. */
export function useHotkey(
  input: HotkeyInput | null | false,
  handler: (e: KeyboardEvent) => void,
  deps: DependencyList = [],
): void {
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  const spec = useMemo(() => (input ? parseHotkey(input) : null), [input]);

  useEffect(() => {
    if (!spec) return;
    const onKey = (e: KeyboardEvent) => {
      if (!matchesHotkey(e, spec)) return;
      if (shouldSuppress(e, spec)) return;
      e.preventDefault();
      e.stopPropagation();
      handlerRef.current(e);
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [spec, ...deps]);
}

/** Register many hotkeys at once. */
export function useHotkeys(map: HotkeyMap | null | false, deps: DependencyList = []): void {
  const entries = useMemo(
    () => (map ? Object.entries(map).map(([k, fn]) => ({ spec: parseHotkey(k), fn })) : []),
    [map],
  );

  const fnsRef = useRef(entries);
  useEffect(() => {
    fnsRef.current = entries;
  }, [entries]);

  useEffect(() => {
    if (entries.length === 0) return;
    const onKey = (e: KeyboardEvent) => {
      for (const { spec, fn } of fnsRef.current) {
        if (!matchesHotkey(e, spec)) continue;
        if (shouldSuppress(e, spec)) continue;
        e.preventDefault();
        e.stopPropagation();
        fn(e);
        return; // stop on first match
      }
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [entries.length, ...deps]);
}

/** Pretty-print a hotkey for tooltips and help screens. e.g. 'Ctrl+S'. */
export function formatHotkey(input: HotkeyInput): string {
  const spec = parseHotkey(input);
  const parts: string[] = [];
  if (spec.ctrl) parts.push('Ctrl');
  if (spec.alt) parts.push('Alt');
  if (spec.shift) parts.push('Shift');
  if (spec.meta) parts.push('Cmd');
  parts.push(spec.key.length === 1 ? spec.key.toUpperCase() : spec.key);
  return parts.join('+');
}
