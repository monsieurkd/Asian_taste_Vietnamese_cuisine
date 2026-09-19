import { useSyncExternalStore } from 'react';

export interface ToastState {
  message: string;
  /** Increments on every show so a repeat of the same message still animates. */
  token: number;
}

/**
 * A single toast slot, shared by both front-ends.
 *
 * One at a time on purpose: the events that raise a toast here are "added to
 * your order", "status updated" and a failed mutation, and a queue of those
 * would outlive the action that caused them.
 *
 * Implemented as a tiny external store rather than pulling a state library into
 * the shared layer, so the one shared component set depends on React alone.
 */
let state: ToastState = { message: '', token: 0 };
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function show(message: string) {
  state = { message, token: state.token + 1 };
  for (const listener of listeners) listener();
}

interface ToastStore {
  <T>(selector: (state: ToastState) => T): T;
  getState: () => ToastState;
}

/**
 * Reads the toast slot. Keeps the selector call shape the storefront's host
 * already used, so `useToastStore((s) => s.message)` continues to work.
 */
export const useToastStore: ToastStore = Object.assign(
  function useToastStore<T>(selector: (state: ToastState) => T): T {
    return useSyncExternalStore(
      subscribe,
      () => selector(state),
      () => selector(state),
    );
  },
  { getState: () => state },
);

/** Raises a toast from anywhere, including outside React. */
export function showToast(message: string) {
  show(message);
}
