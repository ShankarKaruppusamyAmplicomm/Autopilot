import { useEffect, useRef, useState } from 'react';
import { useStore } from '../../store/useStore';
import { createBackupVersion, listBackupVersions } from '../../db';
import styles from './SaveReminder.module.css';

const REMIND_AFTER_MS = 60 * 60 * 1000; // 1 hour

export function SaveReminder() {
  const lastEditAt = useStore(s => s.lastEditAt);
  const projects   = useStore(s => s.projects);
  const deps       = useStore(s => s.dependencies);

  const [visible, setVisible]     = useState(false);
  const [saving, setSaving]       = useState(false);
  const [saved, setSaved]         = useState(false);
  const [name, setName]           = useState('');
  const [showForm, setShowForm]   = useState(false);

  const timerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shownRef  = useRef(false); // don't show again after dismiss within same edit window

  useEffect(() => {
    if (!lastEditAt) return;
    shownRef.current = false;
    setSaved(false);
    setVisible(false);

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (!shownRef.current) {
        setVisible(true);
      }
    }, REMIND_AFTER_MS);

    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [lastEditAt]);

  function dismiss() {
    shownRef.current = true;
    setVisible(false);
    setShowForm(false);
    setName('');
  }

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    await createBackupVersion(name.trim(), 'Auto-prompted hourly snapshot');
    setSaving(false);
    setSaved(true);
    setTimeout(() => {
      dismiss();
      setSaved(false);
    }, 1800);
  }

  if (!visible) return null;

  return (
    <div className={styles.bar}>
      <div className={styles.left}>
        <span className={styles.icon}>💾</span>
        <span className={styles.msg}>
          Changes were made over an hour ago.
          <strong> Save a version</strong> so your work is captured in Backup History.
        </span>
      </div>
      <div className={styles.actions}>
        {!showForm && !saved && (
          <>
            <button className={styles.saveBtn} onClick={() => setShowForm(true)}>Save version</button>
            <button className={styles.snoozeBtn} onClick={dismiss}>Later</button>
          </>
        )}
        {showForm && !saved && (
          <div className={styles.inlineForm}>
            <input
              className={styles.nameInput}
              placeholder="Your name (required)"
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSave()}
              autoFocus
            />
            <button className={styles.saveBtn} onClick={handleSave} disabled={!name.trim() || saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button className={styles.snoozeBtn} onClick={dismiss}>Cancel</button>
          </div>
        )}
        {saved && <span className={styles.savedMsg}>Saved!</span>}
      </div>
    </div>
  );
}
