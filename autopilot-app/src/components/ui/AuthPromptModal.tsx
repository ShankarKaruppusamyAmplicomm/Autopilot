import { useState, useEffect, useRef } from 'react';
import { useAuthPrompt } from '../../store/useAuthPrompt';
import styles from './AuthPromptModal.module.css';

export function AuthPromptModal() {
  const { visible, error, submit, cancel } = useAuthPrompt();
  const [pw, setPw] = useState('');
  const [verifying, setVerifying] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (visible) {
      setPw('');
      setVerifying(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [visible]);

  if (!visible) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!pw.trim() || verifying) return;
    setVerifying(true);
    await submit(pw.trim());
    setVerifying(false);
    // Only clear input if modal is still open (wrong password)
    if (useAuthPrompt.getState().visible) setPw('');
  }

  return (
    <div className={styles.overlay} onClick={cancel}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.icon}>🔒</div>
        <div className={styles.title}>Edit access required</div>
        <div className={styles.subtitle}>
          Enter the admin password to make changes. You won't be asked again this session.
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          <input
            ref={inputRef}
            className={`form-input ${styles.input}`}
            type="password"
            placeholder="Admin password"
            value={pw}
            onChange={e => setPw(e.target.value)}
            autoComplete="current-password"
          />
          {error && <div className={styles.error}>{error}</div>}
          <div className={styles.actions}>
            <button type="button" className="btn btn-ghost" onClick={cancel} disabled={verifying}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={!pw.trim() || verifying}>
              {verifying ? 'Verifying…' : 'Unlock'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
