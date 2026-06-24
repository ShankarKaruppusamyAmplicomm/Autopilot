/**
 * Global auth-prompt store.
 * When a write fails with 401/403, call `requestAuth()`.
 * It resolves with the entered password (or rejects if user cancels).
 * The AuthPromptModal in App.tsx renders the UI.
 */
import { create } from 'zustand';
import { storePassword, getStoredPassword } from '../api/auth';

interface AuthPromptState {
  visible: boolean;
  error: string;
  _resolve: ((pw: string) => void) | null;
  _reject: (() => void) | null;

  /** Call this to show the prompt. Resolves with the validated password. */
  requestAuth: () => Promise<string>;
  /** Called by the modal on submit — verifies locally before resolving */
  submit: (pw: string) => Promise<void>;
  /** Called by the modal on cancel */
  cancel: () => void;
  /** Set an error message inside the modal */
  setError: (msg: string) => void;
}

export const useAuthPrompt = create<AuthPromptState>((set, get) => ({
  visible: false,
  error: '',
  _resolve: null,
  _reject: null,

  requestAuth() {
    return new Promise<string>((resolve, reject) => {
      set({ visible: true, error: '', _resolve: resolve, _reject: reject });
    });
  },

  async submit(pw) {
    const valid = await verifyPassword(pw);
    if (!valid) {
      set({ error: 'Incorrect password. Try again.' });
      return;
    }
    storePassword(pw);
    const resolve = get()._resolve;
    set({ visible: false, error: '', _resolve: null, _reject: null });
    resolve?.(pw);
  },

  cancel() {
    const reject = get()._reject;
    set({ visible: false, error: '', _resolve: null, _reject: null });
    reject?.();
  },

  setError(msg) {
    set({ error: msg });
  },
}));

/**
 * Wrap any admin API call with this helper.
 * - If the call succeeds: return the result.
 * - If 401/403: show the auth prompt, wait for a verified password, then retry once.
 * - If user cancels: throw.
 * Uses a loop (not recursion) to prevent cascading retries.
 */
export async function withAuth<T>(fn: () => Promise<T>): Promise<Exclude<T, { error: string }>> {
  const result = await fn();
  if (!isAuthError(result)) return result as Exclude<T, { error: string }>;

  // Need auth — loop until the user provides a correct password or cancels
  const { requestAuth, setError } = useAuthPrompt.getState();

  while (true) {
    const pw = await requestAuth(); // throws (rejects) if user cancels

    const valid = await verifyPassword(pw);
    if (!valid) {
      setError('Incorrect password. Try again.');
      continue;
    }

    // Password verified locally — retry the API call once
    const retried = await fn();
    if (!isAuthError(retried)) return retried as Exclude<T, { error: string }>;

    // Server still rejects (e.g. hash mismatch) — tell the user and loop
    setError('Incorrect password. Try again.');
  }
}

function isAuthError(result: unknown): boolean {
  if (result === null || result === undefined) return false;
  if (typeof result === 'object' && 'error' in result) {
    const r = result as { error: string; status?: number };
    return r.error === 'Admin password required' || r.error === 'Incorrect password'
      || r.status === 401 || r.status === 403;
  }
  return false;
}

const ADMIN_HASH = 'e3f47090f2ec633775b3058b412885d0eb99f53b02b6c1ac00f84580ce4867a7';

async function verifyPassword(pw: string): Promise<boolean> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pw));
  const hex = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  return hex === ADMIN_HASH;
}

/** Check if password is already stored and valid (used on first load) */
export async function ensureAuth(): Promise<boolean> {
  const stored = getStoredPassword();
  if (!stored) return false;
  return verifyPassword(stored);
}
