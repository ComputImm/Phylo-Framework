// @vitest-environment jsdom
import {act, cleanup, renderHook} from '@testing-library/react';
import {afterEach, expect, test, vi} from 'vitest';
import {useMediaQuery} from '../useMediaQuery';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function stubMatchMedia(initial: boolean) {
  const listeners = new Set<() => void>();
  const list = {
    matches: initial,
    addEventListener: (_: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
  };
  vi.stubGlobal('matchMedia', () => list);
  return {
    listeners,
    change(next: boolean) {
      list.matches = next;
      listeners.forEach((listener) => listener());
    },
  };
}

test('reports the query and follows changes', () => {
  const media = stubMatchMedia(true);
  const {result} = renderHook(() => useMediaQuery('(max-width: 100px)'));
  expect(result.current).toBe(true);
  act(() => media.change(false));
  expect(result.current).toBe(false);
});

test('stops listening on unmount', () => {
  const media = stubMatchMedia(false);
  const {unmount} = renderHook(() => useMediaQuery('(max-width: 100px)'));
  expect(media.listeners.size).toBe(1);
  unmount();
  expect(media.listeners.size).toBe(0);
});
