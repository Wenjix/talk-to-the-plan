import { create } from 'zustand';

export interface Toast {
  id: string;
  message: string;
  type: 'info' | 'warning' | 'error' | 'success';
  durationMs: number;
}

interface ToastState {
  toasts: Toast[];
  addToast: (message: string, type?: Toast['type'], durationMs?: number) => void;
  removeToast: (id: string) => void;
}

let nextId = 0;

export const useToastStore = create<ToastState>()((set) => ({
  toasts: [],

  addToast: (message, type = 'info', durationMs = 4000) => {
    const id = `toast-${nextId++}`;
    const toast: Toast = { id, message, type, durationMs };
    set((s) => ({ toasts: [...s.toasts, toast] }));

    // Auto-remove after duration
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, durationMs);
  },

  removeToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
