import { useState } from 'react';
import { useStore } from '../../store/useStore';
import type { ItemLevel } from '../../types';
import styles from './DepsView.module.css';

const DEP_LABELS: Record<string, string> = { FS: 'Finish → Start', SS: 'Start → Start', FF: 'Finish → Finish', SF: 'Start → Finish' };

export function DepsView() {
  const projects     = useStore(s => s.projects);
  const dependencies = useStore(s => s.dependencies);
  const addDependency    = useStore(s => s.addDependency);
  const removeDependency = useStore(s => s.removeDependency);

  const [fromId,  setFromId]  = useState<string>('');
  const [toId,    setToId]    = useState<string>('');
  const [depType, setDepType] = useState<'FS'|'SS'|'FF'|'SF'>('FS');
  const [lagDays, setLagDays] = useState('0');
  const [error,   setError]   = useState('');
  const [loading, setLoading] = useState(false);

  const idMap = new Map(projects.map(p => [p.id, p]));
  const projDeps = dependencies.filter(d => d.predecessorLevel === 'project' && d.successorLevel === 'project');

  async function handleAdd() {
    const from = parseInt(fromId);
    const to   = parseInt(toId);
    if (!from || !to) { setError('Select both projects.'); return; }

    setLoading(true);
    setError('');
    const result = await addDependency(from, to, 'project' as ItemLevel, 'project' as ItemLevel, depType, parseInt(lagDays) || 0);
    setLoading(false);

    if (!result.ok) {
      if (result.cycleNames && result.cycleNames.length > 1) {
        setError(`Cycle detected: ${result.cycleNames.join(' → ')}`);
      } else {
        setError(result.cycleNames?.[0] ?? 'Could not add dependency.');
      }
    } else {
      setFromId('');
      setToId('');
      setLagDays('0');
    }
  }

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <div className={styles.title}>Dependencies</div>
        <div className={styles.subtitle}>{projDeps.length} link{projDeps.length !== 1 ? 's' : ''} · portfolio level · finish-to-start by default</div>
      </div>

      <div className={styles.body}>
        {/* Add form */}
        <div className={styles.addCard}>
          <div className={styles.cardTitle}>Add dependency</div>
          <div className={styles.addRow}>
            <div className={styles.formGroup}>
              <label className="form-label">Predecessor (finishes first)</label>
              <select className="form-input" value={fromId} onChange={e => setFromId(e.target.value)}>
                <option value="">Select project…</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            <div className={styles.arrow}>→</div>

            <div className={styles.formGroup}>
              <label className="form-label">Successor (starts after)</label>
              <select className="form-input" value={toId} onChange={e => setToId(e.target.value)}>
                <option value="">Select project…</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            <div className={styles.formGroupSm}>
              <label className="form-label">Type</label>
              <select className="form-input" value={depType} onChange={e => setDepType(e.target.value as typeof depType)}>
                <option value="FS">FS</option>
                <option value="SS">SS</option>
                <option value="FF">FF</option>
                <option value="SF">SF</option>
              </select>
            </div>

            <div className={styles.formGroupSm}>
              <label className="form-label">Lag (days)</label>
              <input className="form-input" type="number" min="0" value={lagDays} onChange={e => setLagDays(e.target.value)} />
            </div>

            <div className={styles.addBtnWrap}>
              <label className="form-label">&nbsp;</label>
              <button className="btn btn-primary" onClick={handleAdd} disabled={loading}>
                {loading ? '…' : 'Add'}
              </button>
            </div>
          </div>

          {error && <div className={styles.error}>{error}</div>}
        </div>

        {/* Dependency list */}
        <div className={styles.listWrap}>
          {projDeps.length === 0 ? (
            <div className={styles.empty}>
              <div className={styles.emptyIcon}>⟶</div>
              <div className={styles.emptyTitle}>No dependencies yet</div>
              <div className={styles.emptyDesc}>Add a finish-to-start link above. Without dependencies, all projects run in parallel and the critical path spans only the longest single project.</div>
            </div>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Predecessor</th>
                  <th></th>
                  <th>Successor</th>
                  <th>Type</th>
                  <th>Lag</th>
                  <th>Path</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {projDeps.map(d => {
                  const from = idMap.get(d.predecessorId);
                  const to   = idMap.get(d.successorId);
                  const critEdge = from?.isCritical && to?.isCritical;
                  return (
                    <tr key={d.id} className={`${styles.row} ${critEdge ? styles.critRow : ''}`}>
                      <td>
                        <span className={styles.projectPill} style={{ borderColor: from?.color ?? '#6E40C9' }}>
                          <span className={styles.pillDot} style={{ background: from?.color ?? '#6E40C9' }} />
                          {from?.name ?? `#${d.predecessorId}`}
                          {from?.isCritical && <span className="badge badge-cp">CP</span>}
                        </span>
                      </td>
                      <td className={styles.arrowCell}>→</td>
                      <td>
                        <span className={styles.projectPill} style={{ borderColor: to?.color ?? '#6E40C9' }}>
                          <span className={styles.pillDot} style={{ background: to?.color ?? '#6E40C9' }} />
                          {to?.name ?? `#${d.successorId}`}
                          {to?.isCritical && <span className="badge badge-cp">CP</span>}
                        </span>
                      </td>
                      <td><span className={styles.typeTag}>{d.type}</span></td>
                      <td className={styles.lagCell}>{d.lagDays > 0 ? `+${d.lagDays}d` : '—'}</td>
                      <td>
                        {critEdge
                          ? <span className="badge badge-critical">Critical</span>
                          : <span className={styles.normalPath}>Normal</span>
                        }
                      </td>
                      <td>
                        <button className={styles.removeBtn} onClick={() => removeDependency(d.id)} title="Remove dependency" aria-label="Remove">×</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Critical chain callout */}
        {projDeps.length > 0 && (() => {
          const critProjects = projects.filter(p => p.isCritical);
          if (!critProjects.length) return null;
          const sorted = critProjects.sort((a, b) => (a.ES ?? 0) - (b.ES ?? 0));
          return (
            <div className={styles.chainCard}>
              <div className={styles.chainTitle}>Critical Chain</div>
              <div className={styles.chain}>
                {sorted.map((p, i) => (
                  <span key={p.id} className={styles.chainItem}>
                    <span className={styles.chainNode} style={{ borderColor: p.color }}>{p.name}</span>
                    {i < sorted.length - 1 && <span className={styles.chainArrow}>→</span>}
                  </span>
                ))}
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
