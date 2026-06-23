import { useRef, useState, useEffect } from 'react';
import { useStore } from '../../store/useStore';
import {
  listBackupVersions, createBackupVersion,
  downloadBackupVersion, deleteBackupVersion, listVisitors, publishSeedFile,
} from '../../db';
import type { BackupVersion, VisitorRecord } from '../../types';
import styles from './SettingsView.module.css';

export function SettingsView() {
  const workspace      = useStore(s => s.workspace);
  const renameWorkspace = useStore(s => s.renameWorkspace);
  const exportJSON     = useStore(s => s.exportJSON);
  const importJSON     = useStore(s => s.importJSON);
  const clearAll       = useStore(s => s.clearAll);
  const projects       = useStore(s => s.projects);
  const dependencies   = useStore(s => s.dependencies);

  const [wsName, setWsName]         = useState(workspace?.name ?? '');
  const [importError, setImportError] = useState('');
  const [imported, setImported]     = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Versioned backup state
  const [backups, setBackups]           = useState<BackupVersion[]>([]);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveName, setSaveName]         = useState('');
  const [saveLabel, setSaveLabel]       = useState('');
  const [saving, setSaving]             = useState(false);

  // Visitor analytics
  const [visitors, setVisitors] = useState<VisitorRecord[]>([]);

  // Clear-all password modal
  const [showClearModal, setShowClearModal] = useState(false);
  const [clearPassword, setClearPassword]   = useState('');
  const [clearError, setClearError]         = useState('');
  const [clearing, setClearing]             = useState(false);

  // SHA-256 of "AutopilotAdminDelete" — never store the plain text
  const ADMIN_HASH = '7be9377951db0256557aa6c4dd8a868e800b12eab51d0af476a50a45a691828e';

  useEffect(() => {
    loadBackups();
    listVisitors().then(setVisitors);
  }, []);

  async function loadBackups() {
    setBackups(await listBackupVersions());
  }

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
      setImportError('Invalid backup file.');
    }
    e.target.value = '';
  }

  function handleClear() {
    setClearPassword('');
    setClearError('');
    setShowClearModal(true);
  }

  async function handleClearConfirm() {
    if (!clearPassword) { setClearError('Password is required.'); return; }
    setClearing(true);
    try {
      const enc = new TextEncoder().encode(clearPassword);
      const hashBuffer = await crypto.subtle.digest('SHA-256', enc);
      const hashHex = Array.from(new Uint8Array(hashBuffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
      if (hashHex !== ADMIN_HASH) {
        setClearError('Incorrect password.');
        setClearing(false);
        return;
      }
      await clearAll();
      setShowClearModal(false);
    } finally {
      setClearing(false);
    }
  }

  async function handleSaveVersion() {
    if (!saveName.trim()) return;
    setSaving(true);
    await createBackupVersion(saveName.trim(), saveLabel.trim() || 'Manual snapshot');
    setSaving(false);
    setShowSaveModal(false);
    setSaveName('');
    setSaveLabel('');
    await loadBackups();
  }

  async function handleDelete(bv: BackupVersion) {
    if (!confirm(`Delete backup ${bv.version}?`)) return;
    await deleteBackupVersion(bv.id);
    await loadBackups();
  }

  const approxKB = Math.round(new Blob([JSON.stringify({ projects, dependencies })]).size / 1024);

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <div className={styles.title}>Settings</div>
        <div className={styles.subtitle}>Workspace configuration, backup history, and data management</div>
      </div>

      <div className={styles.body}>

        {/* Workspace */}
        <section className={styles.section}>
          <div className={styles.sectionTitle}>Workspace</div>
          <div className={styles.row}>
            <div className={styles.fieldWrap}>
              <label className="form-label" htmlFor="ws-name">Workspace Name</label>
              <input id="ws-name" className="form-input" style={{ maxWidth: '320px' }}
                value={wsName} onChange={e => setWsName(e.target.value)} onBlur={handleRename} />
            </div>
          </div>
          <div className={styles.meta}>
            Created: {workspace?.createdAt ? new Date(workspace.createdAt).toLocaleDateString() : '—'}
            &nbsp;·&nbsp;Schema v{workspace?.schemaVersion ?? 1}
            &nbsp;·&nbsp;{projects.length} projects&nbsp;·&nbsp;{dependencies.length} dependencies
            &nbsp;·&nbsp;~{approxKB} KB in browser storage
          </div>
        </section>

        {/* Versioned Backup History */}
        <section className={styles.section}>
          <div className={styles.sectionTitleRow}>
            <div className={styles.sectionTitle}>Backup History</div>
            <button className="btn btn-primary btn-sm" onClick={() => setShowSaveModal(true)}>
              + Save Version
            </button>
          </div>
          <div className={styles.cardDesc} style={{ marginBottom: 12 }}>
            Each saved version captures a full snapshot of the portfolio. Versions are stored locally in your browser and can be downloaded as JSON files.
          </div>

          {backups.length === 0 ? (
            <div className={styles.emptyBackups}>
              No saved versions yet. Click <strong>+ Save Version</strong> to create the first snapshot.
            </div>
          ) : (
            <table className={styles.backupTable}>
              <thead>
                <tr>
                  <th>Version</th>
                  <th>Label</th>
                  <th>Updated By</th>
                  <th>Date</th>
                  <th>Time</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {backups.map(bv => {
                  const d = new Date(bv.createdAt);
                  return (
                    <tr key={bv.id} className={styles.backupRow}>
                      <td><span className={styles.versionTag}>{bv.version}</span></td>
                      <td className={styles.backupLabel}>{bv.label}</td>
                      <td className={styles.backupUser}>{bv.updatedBy}</td>
                      <td className={styles.backupDate}>{d.toLocaleDateString()}</td>
                      <td className={styles.backupDate}>{d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                      <td className={styles.backupActions}>
                        <button
                          className={styles.actionBtn}
                          onClick={() => downloadBackupVersion(bv)}
                          title="Download this version as JSON"
                        >↓ Download</button>
                        <button
                          className={styles.deleteBtn}
                          onClick={() => handleDelete(bv)}
                          title="Delete this version"
                        >×</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>

        {/* Publish as source data */}
        <section className={styles.section}>
          <div className={styles.sectionTitleRow}>
            <div className={styles.sectionTitle}>Source Data for All Visitors</div>
            <span className={styles.seedBadge}>Cross-browser safe</span>
          </div>
          <div className={styles.cardDesc} style={{ marginBottom: 14 }}>
            Incognito windows and new devices have empty IndexedDB — they cannot see your browser's backup history.
            Publishing bakes the current portfolio into a <code className={styles.code}>seed.json</code> file
            that is served from GitHub Pages and loaded by <em>every</em> visitor on first open, regardless of browser or mode.
          </div>
          <div className={styles.seedSteps}>
            <div className={styles.seedStep}>
              <span className={styles.stepNum}>1</span>
              <div>
                <strong>Click "Publish seed.json"</strong> — downloads <code className={styles.code}>seed.json</code> with the current snapshot.
              </div>
            </div>
            <div className={styles.seedStep}>
              <span className={styles.stepNum}>2</span>
              <div>
                Move the downloaded file to <code className={styles.code}>autopilot-app/public/data/seed.json</code> in your project folder.
              </div>
            </div>
            <div className={styles.seedStep}>
              <span className={styles.stepNum}>3</span>
              <div>
                Commit and push — GitHub Actions deploys it automatically. All visitors (including incognito) will load this data.
              </div>
            </div>
          </div>
          <button className="btn btn-primary" style={{ marginTop: 6 }} onClick={() => publishSeedFile()}>
            Publish seed.json
          </button>
        </section>

        {/* Raw Export / Import */}
        <section className={styles.section}>
          <div className={styles.sectionTitle}>Export & Restore</div>
          <div className={styles.cardGrid}>
            <div className={styles.card}>
              <div className={styles.cardLabel}>Export current state</div>
              <div className={styles.cardDesc}>Downloads the latest snapshot as a JSON file. Use this to move to another browser or device.</div>
              <button className="btn btn-primary" onClick={() => exportJSON()}>Download JSON</button>
            </div>
            <div className={styles.card}>
              <div className={styles.cardLabel}>Restore from file</div>
              <div className={styles.cardDesc}>Replaces all data from a previously exported JSON file. Export first if you want to keep current data.</div>
              <button className="btn btn-ghost" onClick={() => fileRef.current?.click()}>Choose file…</button>
              <input ref={fileRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleImport} />
              {importError && <div className={styles.errorMsg}>{importError}</div>}
              {imported && <div className={styles.successMsg}>Restore complete.</div>}
            </div>
          </div>
        </section>

        {/* Danger zone */}
        <section className={`${styles.section} ${styles.dangerSection}`}>
          <div className={styles.sectionTitle}>Danger Zone</div>
          <div className={styles.dangerRow}>
            <div>
              <div className={styles.dangerLabel}>Clear all data</div>
              <div className={styles.dangerDesc}>Permanently deletes all projects, dependencies, versions, phases, and tasks. Backup history is preserved. Cannot be undone.</div>
            </div>
            <button className="btn btn-danger" onClick={handleClear}>Clear all data…</button>
          </div>
        </section>

        {/* Visitor Analytics */}
        <section className={styles.section}>
          <div className={styles.sectionTitle}>Visitor Analytics</div>
          <div className={styles.cardDesc} style={{ marginBottom: 14 }}>
            Tracked locally in your browser — no external service, no data ever leaves this device.
            Each unique browser or device that has opened this app is counted as one visitor.
          </div>

          <div className={styles.visitorSummary}>
            <div className={styles.visitorStat}>
              <span className={styles.visitorNum}>{visitors.length}</span>
              <span className={styles.visitorLabel}>Unique visitors</span>
            </div>
            <div className={styles.visitorStat}>
              <span className={styles.visitorNum}>{visitors.reduce((s, v) => s + (v.visitCount ?? 1), 0)}</span>
              <span className={styles.visitorLabel}>Total visits</span>
            </div>
            <div className={styles.visitorStat}>
              <span className={styles.visitorNum}>{new Set(visitors.map(v => v.timezone)).size}</span>
              <span className={styles.visitorLabel}>Timezones</span>
            </div>
          </div>

          {visitors.length === 0 ? (
            <div className={styles.emptyBackups}>No visitor records yet. They appear after the first page load.</div>
          ) : (
            <table className={styles.backupTable} style={{ marginTop: 14 }}>
              <thead>
                <tr>
                  <th>#</th>
                  <th>First seen</th>
                  <th>Last seen</th>
                  <th>Visits</th>
                  <th>Timezone</th>
                  <th>Locale</th>
                </tr>
              </thead>
              <tbody>
                {visitors.map((v, i) => (
                  <tr key={v.id} className={styles.backupRow}>
                    <td className={styles.backupDate}>{i + 1}</td>
                    <td className={styles.backupDate}>{new Date(v.firstSeen).toLocaleDateString()}</td>
                    <td className={styles.backupDate}>{new Date(v.lastSeen).toLocaleDateString()}</td>
                    <td><span className={styles.versionTag}>{v.visitCount}</span></td>
                    <td className={styles.backupLabel}>{v.timezone}</td>
                    <td className={styles.backupUser}>{v.locale}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
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

      {/* Clear All — Password Modal */}
      {showClearModal && (
        <div className={styles.modalOverlay} onClick={() => setShowClearModal(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalTitle}>Confirm Clear All Data</div>
            <div className={styles.modalSubtitle}>
              This will permanently delete all <strong>{projects.length}</strong> projects and <strong>{dependencies.length}</strong> dependencies.
              Backup history is preserved. Enter the admin password to continue.
            </div>

            <div className={styles.modalField}>
              <label className="form-label">Admin Password *</label>
              <input
                className="form-input"
                type="password"
                placeholder="Enter password"
                value={clearPassword}
                onChange={e => { setClearPassword(e.target.value); setClearError(''); }}
                onKeyDown={e => e.key === 'Enter' && handleClearConfirm()}
                autoFocus
              />
              {clearError && <div className={styles.errorMsg}>{clearError}</div>}
            </div>

            <div className={styles.modalActions}>
              <button className="btn btn-ghost" onClick={() => setShowClearModal(false)}>Cancel</button>
              <button
                className="btn btn-danger"
                onClick={handleClearConfirm}
                disabled={!clearPassword || clearing}
              >
                {clearing ? 'Verifying…' : 'Clear All Data'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Save Version Modal */}
      {showSaveModal && (
        <div className={styles.modalOverlay} onClick={() => setShowSaveModal(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalTitle}>Save Version</div>
            <div className={styles.modalSubtitle}>
              A full snapshot of all {projects.length} projects and {dependencies.length} dependencies will be saved.
            </div>

            <div className={styles.modalField}>
              <label className="form-label">Your name *</label>
              <input
                className="form-input"
                placeholder="e.g. Shankar"
                value={saveName}
                onChange={e => setSaveName(e.target.value)}
                autoFocus
              />
            </div>
            <div className={styles.modalField}>
              <label className="form-label">What changed? (optional)</label>
              <input
                className="form-input"
                placeholder="e.g. Updated VAPT dates and added SOV dependency"
                value={saveLabel}
                onChange={e => setSaveLabel(e.target.value)}
              />
            </div>

            <div className={styles.modalActions}>
              <button className="btn btn-ghost" onClick={() => setShowSaveModal(false)}>Cancel</button>
              <button
                className="btn btn-primary"
                onClick={handleSaveVersion}
                disabled={!saveName.trim() || saving}
              >
                {saving ? 'Saving…' : 'Save Version'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
