import { useRef, useState } from 'react';
import { useStore } from '../../store/useStore';
import styles from './SettingsView.module.css';

export function SettingsView() {
  const workspace     = useStore(s => s.workspace);
  const renameWorkspace = useStore(s => s.renameWorkspace);
  const exportJSON    = useStore(s => s.exportJSON);
  const importJSON    = useStore(s => s.importJSON);
  const clearAll      = useStore(s => s.clearAll);
  const projects      = useStore(s => s.projects);
  const dependencies  = useStore(s => s.dependencies);

  const [wsName, setWsName] = useState(workspace?.name ?? '');
  const [importError, setImportError] = useState('');
  const [imported, setImported] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleRename() {
    if (!wsName.trim()) return;
    await renameWorkspace(wsName.trim());
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError('');
    setImported(false);
    try {
      const text = await file.text();
      await importJSON(text);
      setImported(true);
    } catch {
      setImportError('Invalid backup file. Make sure you selected an Autopilot JSON backup.');
    }
    e.target.value = '';
  }

  async function handleClear() {
    if (!confirm(`This will permanently delete all ${projects.length} projects, ${dependencies.length} dependencies, and all versions/phases/tasks. This cannot be undone.\n\nContinue?`)) return;
    await clearAll();
  }

  // Storage estimate
  const dataStr = JSON.stringify({ projects, dependencies });
  const approxKB = Math.round(new Blob([dataStr]).size / 1024);

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <div className={styles.title}>Settings</div>
        <div className={styles.subtitle}>Workspace configuration, backup & restore, data management</div>
      </div>

      <div className={styles.body}>

        {/* Workspace */}
        <section className={styles.section}>
          <div className={styles.sectionTitle}>Workspace</div>
          <div className={styles.row}>
            <div className={styles.fieldWrap}>
              <label className="form-label" htmlFor="ws-name">Workspace Name</label>
              <input id="ws-name" className="form-input" style={{ maxWidth: '320px' }} value={wsName} onChange={e => setWsName(e.target.value)} onBlur={handleRename} />
            </div>
          </div>
          <div className={styles.meta}>
            Created: {workspace?.createdAt ? new Date(workspace.createdAt).toLocaleDateString() : '—'}
            &nbsp;·&nbsp;Schema v{workspace?.schemaVersion ?? 1}
            &nbsp;·&nbsp;{projects.length} projects&nbsp;·&nbsp;{dependencies.length} dependencies
            &nbsp;·&nbsp;~{approxKB} KB in browser storage
          </div>
        </section>

        {/* Backup & Restore */}
        <section className={styles.section}>
          <div className={styles.sectionTitle}>Backup & Restore</div>
          <div className={styles.cardGrid}>
            <div className={styles.card}>
              <div className={styles.cardLabel}>Export JSON backup</div>
              <div className={styles.cardDesc}>Downloads a human-readable JSON file with all your projects, versions, phases, tasks, and dependencies. Use this to move between browsers or devices.</div>
              <button className="btn btn-primary" onClick={() => exportJSON()}>Download backup</button>
            </div>
            <div className={styles.card}>
              <div className={styles.cardLabel}>Import JSON backup</div>
              <div className={styles.cardDesc}>Restores from a previously exported backup file. This replaces all current data — export first if you want to keep it.</div>
              <button className="btn btn-ghost" onClick={() => fileRef.current?.click()}>Choose file…</button>
              <input ref={fileRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleImport} />
              {importError && <div className={styles.errorMsg}>{importError}</div>}
              {imported && <div className={styles.successMsg}>Import complete. Workspace restored.</div>}
            </div>
          </div>
        </section>

        {/* Danger zone */}
        <section className={`${styles.section} ${styles.dangerSection}`}>
          <div className={styles.sectionTitle}>Danger Zone</div>
          <div className={styles.dangerRow}>
            <div>
              <div className={styles.dangerLabel}>Clear all data</div>
              <div className={styles.dangerDesc}>Permanently deletes all projects, dependencies, versions, phases, and tasks. The workspace name is reset. This cannot be undone.</div>
            </div>
            <button className="btn btn-danger" onClick={handleClear}>Clear all data</button>
          </div>
        </section>

        {/* About */}
        <section className={styles.section}>
          <div className={styles.sectionTitle}>About</div>
          <div className={styles.aboutGrid}>
            <div className={styles.aboutItem}><span className={styles.aboutKey}>Version</span><span>1.0.0</span></div>
            <div className={styles.aboutItem}><span className={styles.aboutKey}>Storage</span><span>IndexedDB (local browser)</span></div>
            <div className={styles.aboutItem}><span className={styles.aboutKey}>Privacy</span><span>No data leaves your browser</span></div>
            <div className={styles.aboutItem}><span className={styles.aboutKey}>Offline</span><span>Works without internet after first load</span></div>
          </div>
        </section>
      </div>
    </div>
  );
}
