import { create } from 'zustand';

interface ToastState {
  message: string;
  /** Increments on every show so a repeat of the same message still animates. */
  token: number;
  show: (message: string) => void;
}

/**
 * A single toast slot.
 *
 * One at a time on purpose: the only events that raise a toast here are
 * "added to your order" and its failure, and a queue of those would outlive the
 * action that caused them.
 */
export const useToastStore = create<ToastState>((set) => ({
  message: '',
  token: 0,
  show: (message) => set((s) => ({ message, token: s.token + 1 })),
}));

/** Raises a toast from anywhere, including outside React. */
export function showToast(message: string) {
  useToastStore.getState().show(message);
}
