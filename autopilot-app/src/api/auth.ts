// Admin password stored in sessionStorage — user types it once per browser tab session.
// Never persisted to localStorage or transmitted except as a header.

const SESSION_KEY = 'autopilot_admin_pw';

export function getStoredPassword(): string {
  return sessionStorage.getItem(SESSION_KEY) ?? '';
}

export function storePassword(pw: string): void {
  sessionStorage.setItem(SESSION_KEY, pw);
}

export function clearPassword(): void {
  sessionStorage.removeItem(SESSION_KEY);
}

export function hasPassword(): boolean {
  return !!sessionStorage.getItem(SESSION_KEY);
}
