import { useState } from 'react';
import { useStore } from '../../store/useStore';
import type { ItemLevel, Phase, Task } from '../../types';
import styles from './ProjectActivitiesView.module.css';

const DEP_LABELS: Record<string, string> = {
  FS: 'Finish → Start', SS: 'Start → Start', FF: 'Finish → Finish', SF: 'Start → Finish',
};

interface Props {
  projectId: number;
}

type ActivityNode = { kind: 'phase'; id: number; label: string; owner?: string } | { kind: 'task'; id: number; label: string; phaseId: number; owner?: string };

function PhaseForm({ projectId, onDone }: { projectId: number; onDone: () => void }) {
  const addPhase = useStore(s => s.addPhase);
  const [label, setLabel] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [owner, setOwner] = useState('');
  const [pertO, setPertO] = useState('');
  const [pertM, setPertM] = useState('');
  const [pertP, setPertP] = useState('');
  const [err, setErr] = useState('');

  async function save() {
    if (!label.trim()) { setErr('Label is required.'); return; }
    const o = parseFloat(pertO), m = parseFloat(pertM), p = parseFloat(pertP);
    const hasPert = !isNaN(o) && !isNaN(m) && !isNaN(p);
    await addPhase({
      projectId,
      label: label.trim(),
      startDate: start || undefined,
      endDate: end || undefined,
      owner: owner.trim() || undefined,
      pertO: hasPert ? o : undefined,
      pertM: hasPert ? m : undefined,
      pertP: hasPert ? p : undefined,
    });
    onDone();
  }

  return (
    <div className={styles.inlineForm}>
      <div className={styles.formRow3}>
        <div className="form-group">
          <label className="form-label">Phase Label *</label>
          <input className="form-input" value={label} onChange={e => setLabel(e.target.value)} placeholder="Phase 0" autoFocus />
        </div>
        <div className="form-group">
          <label className="form-label">Owner</label>
          <input className="form-input" value={owner} onChange={e => setOwner(e.target.value)} placeholder="e.g. Saurav" />
        </div>
      </div>
      <div className={styles.formRow3}>
        <div className="form-group">
          <label className="form-label">Start Date</label>
          <input className="form-input" type="date" value={start} onChange={e => setStart(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">End Date</label>
          <input className="form-input" type="date" value={end} onChange={e => setEnd(e.target.value)} />
        </div>
      </div>
      <div className="form-group">
        <label className="form-label">PERT Estimate (weeks) — O / M / P</label>
        <div className={styles.pertRow}>
          <input className="form-input" type="number" min="0" step="0.5" placeholder="Optimistic" value={pertO} onChange={e => setPertO(e.target.value)} />
          <input className="form-input" type="number" min="0" step="0.5" placeholder="Most Likely" value={pertM} onChange={e => setPertM(e.target.value)} />
          <input className="form-input" type="number" min="0" step="0.5" placeholder="Pessimistic" value={pertP} onChange={e => setPertP(e.target.value)} />
        </div>
      </div>
      {err && <div className={styles.error}>{err}</div>}
      <div className={styles.formActions}>
        <button className="btn btn-ghost btn-sm" onClick={onDone}>Cancel</button>
        <button className="btn btn-primary btn-sm" onClick={save}>Add Phase</button>
      </div>
    </div>
  );
}

function TaskForm({ projectId, phases, onDone }: { projectId: number; phases: Phase[]; onDone: () => void }) {
  const addTask = useStore(s => s.addTask);
  const [phaseId, setPhaseId] = useState(phases[0]?.id ? String(phases[0].id) : '');
  const [name, setName] = useState('');
  const [owner, setOwner] = useState('');
  const [pertO, setPertO] = useState('');
  const [pertM, setPertM] = useState('');
  const [pertP, setPertP] = useState('');
  const [err, setErr] = useState('');

  async function save() {
    if (!name.trim()) { setErr('Task name is required.'); return; }
    if (!phaseId) { setErr('Select a phase.'); return; }
    const o = parseFloat(pertO), m = parseFloat(pertM), p = parseFloat(pertP);
    const hasPert = !isNaN(o) && !isNaN(m) && !isNaN(p);
    await addTask({
      phaseId: parseInt(phaseId),
      name: name.trim(),
      owner: owner.trim() || undefined,
      optimistic: hasPert ? o : undefined,
      mostLikely: hasPert ? m : undefined,
      pessimistic: hasPert ? p : undefined,
    });
    onDone();
  }

  return (
    <div className={styles.inlineForm}>
      <div className={styles.formRow3}>
        <div className="form-group">
          <label className="form-label">Task Name *</label>
          <input className="form-input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Write test cases" autoFocus />
        </div>
        <div className="form-group">
          <label className="form-label">Phase *</label>
          <select className="form-input" value={phaseId} onChange={e => setPhaseId(e.target.value)}>
            <option value="">Select phase…</option>
            {phases.map(ph => <option key={ph.id} value={ph.id}>{ph.label}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Owner</label>
          <input className="form-input" value={owner} onChange={e => setOwner(e.target.value)} placeholder="e.g. Saurav" />
        </div>
      </div>
      <div className="form-group">
        <label className="form-label">PERT Estimate (weeks) — O / M / P</label>
        <div className={styles.pertRow}>
          <input className="form-input" type="number" min="0" step="0.5" placeholder="Optimistic" value={pertO} onChange={e => setPertO(e.target.value)} />
          <input className="form-input" type="number" min="0" step="0.5" placeholder="Most Likely" value={pertM} onChange={e => setPertM(e.target.value)} />
          <input className="form-input" type="number" min="0" step="0.5" placeholder="Pessimistic" value={pertP} onChange={e => setPertP(e.target.value)} />
        </div>
      </div>
      {err && <div className={styles.error}>{err}</div>}
      <div className={styles.formActions}>
        <button className="btn btn-ghost btn-sm" onClick={onDone}>Cancel</button>
        <button className="btn btn-primary btn-sm" onClick={save}>Add Task</button>
      </div>
    </div>
  );
}

export function ProjectActivitiesView({ projectId }: Props) {
  const projects     = useStore(s => s.projects);
  const phases       = useStore(s => s.phases).filter(ph => ph.projectId === projectId);
  const tasks        = useStore(s => s.tasks).filter(t => phases.some(ph => ph.id === t.phaseId));
  const dependencies = useStore(s => s.dependencies);
  const deletePhase  = useStore(s => s.deletePhase);
  const deleteTask   = useStore(s => s.deleteTask);
  const addDependency    = useStore(s => s.addDependency);
  const removeDependency = useStore(s => s.removeDependency);

  const project = projects.find(p => p.id === projectId);

  // Intra-project deps (phase/task level)
  const intraDeps = dependencies.filter(d =>
    (d.predecessorLevel === 'phase' || d.predecessorLevel === 'task') &&
    (d.successorLevel   === 'phase' || d.successorLevel   === 'task'),
  );

  // Build activity nodes list for dep dropdowns
  const activities: ActivityNode[] = [
    ...phases.map(ph => ({ kind: 'phase' as const, id: ph.id, label: ph.label, owner: ph.owner })),
    ...tasks.map(t  => ({ kind: 'task'  as const, id: t.id,  label: t.name,   phaseId: t.phaseId, owner: t.owner })),
  ];

  function activityKey(kind: 'phase' | 'task', id: number) { return `${kind}:${id}`; }
  function activityByKey(key: string): ActivityNode | undefined {
    const [kind, idStr] = key.split(':');
    const id = parseInt(idStr);
    return activities.find(a => a.kind === kind && a.id === id);
  }
  function activityLabel(kind: 'phase' | 'task', id: number) {
    const a = activities.find(x => x.kind === kind && x.id === id);
    return a ? (kind === 'phase' ? `◈ ${a.label}` : `  ↳ ${a.label}`) : `#${id}`;
  }

  const [showPhaseForm, setShowPhaseForm] = useState(false);
  const [showTaskForm, setShowTaskForm]   = useState(false);

  // Dep add form
  const [depFrom, setDepFrom] = useState('');
  const [depTo,   setDepTo]   = useState('');
  const [depType, setDepType] = useState<'FS'|'SS'|'FF'|'SF'>('FS');
  const [lagDays, setLagDays] = useState('0');
  const [depErr,  setDepErr]  = useState('');
  const [depLoading, setDepLoading] = useState(false);

  async function handleAddDep() {
    if (!depFrom || !depTo) { setDepErr('Select both activities.'); return; }
    const [fromKind, fromId] = depFrom.split(':') as [ItemLevel, string];
    const [toKind,   toId]   = depTo.split(':')   as [ItemLevel, string];
    setDepLoading(true);
    setDepErr('');
    const result = await addDependency(
      parseInt(fromId), parseInt(toId),
      fromKind, toKind,
      depType, parseInt(lagDays) || 0,
    );
    setDepLoading(false);
    if (!result.ok) {
      setDepErr(result.cycleNames?.join(' → ') ?? 'Could not add dependency.');
    } else {
      setDepFrom(''); setDepTo(''); setLagDays('0');
    }
  }

  if (!project) return <div className={styles.empty}>Project not found.</div>;

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <div>
          <div className={styles.title}>{project.name}</div>
          <div className={styles.subtitle}>
            Activities &amp; Dependencies &nbsp;·&nbsp;
            {phases.length} phase{phases.length !== 1 ? 's' : ''} &nbsp;·&nbsp;
            {tasks.length} task{tasks.length !== 1 ? 's' : ''}
          </div>
        </div>
        <div className={styles.headerActions}>
          <button className="btn btn-ghost btn-sm" onClick={() => { setShowTaskForm(false); setShowPhaseForm(v => !v); }}>
            + Phase
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => { setShowPhaseForm(false); setShowTaskForm(v => !v); }} disabled={phases.length === 0}>
            + Task
          </button>
        </div>
      </div>

      <div className={styles.body}>

        {/* Phase / task add forms */}
        {showPhaseForm && (
          <PhaseForm projectId={projectId} onDone={() => setShowPhaseForm(false)} />
        )}
        {showTaskForm && (
          <TaskForm projectId={projectId} phases={phases} onDone={() => setShowTaskForm(false)} />
        )}

        {/* Activities tree */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Phases &amp; Tasks</div>
          {phases.length === 0 ? (
            <div className={styles.emptyInner}>No phases yet. Add a phase to start planning activities.</div>
          ) : (
            <div className={styles.activityTree}>
              {phases.map(ph => {
                const phaseTasks = tasks.filter(t => t.phaseId === ph.id);
                return (
                  <div key={ph.id} className={styles.phaseBlock}>
                    <div className={styles.phaseRow}>
                      <span className={styles.phaseIcon}>◈</span>
                      <span className={styles.phaseName}>{ph.label}</span>
                      {ph.owner && <span className={styles.owner}>{ph.owner}</span>}
                      {ph.startDate && <span className={styles.dates}>{ph.startDate}{ph.endDate ? ` → ${ph.endDate}` : ''}</span>}
                      {(ph.pertO != null && ph.pertM != null && ph.pertP != null) && (
                        <span className={styles.pertBadge}>
                          te {((ph.pertO + 4 * ph.pertM + ph.pertP) / 6).toFixed(1)}w
                        </span>
                      )}
                      <button className={styles.deleteBtn} onClick={() => { if (confirm(`Delete phase "${ph.label}"?`)) deletePhase(ph.id); }} title="Delete phase">×</button>
                    </div>
                    {phaseTasks.map(t => (
                      <div key={t.id} className={styles.taskRow}>
                        <span className={styles.taskIndent}>↳</span>
                        <span className={styles.taskName}>{t.name}</span>
                        {t.owner && <span className={styles.owner}>{t.owner}</span>}
                        {(t.optimistic != null && t.mostLikely != null && t.pessimistic != null) && (
                          <span className={styles.pertBadge}>
                            te {((t.optimistic + 4 * t.mostLikely + t.pessimistic) / 6).toFixed(1)}w
                          </span>
                        )}
                        <button className={styles.deleteBtn} onClick={() => { if (confirm(`Delete task "${t.name}"?`)) deleteTask(t.id); }} title="Delete task">×</button>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Dependencies */}
        {activities.length >= 2 && (
          <div className={styles.section}>
            <div className={styles.sectionTitle}>Intra-project Dependencies</div>

            <div className={styles.addCard}>
              <div className={styles.cardLabel}>Add activity dependency</div>
              <div className={styles.depAddRow}>
                <div className="form-group" style={{ flex: 1, minWidth: 180 }}>
                  <label className="form-label">Predecessor</label>
                  <select className="form-input" value={depFrom} onChange={e => setDepFrom(e.target.value)}>
                    <option value="">Select activity…</option>
                    {activities.map(a => (
                      <option key={activityKey(a.kind, a.id)} value={activityKey(a.kind, a.id)}>
                        {a.kind === 'phase' ? `[Phase] ${a.label}` : `[Task] ${a.label}`}
                      </option>
                    ))}
                  </select>
                </div>
                <div className={styles.arrow}>→</div>
                <div className="form-group" style={{ flex: 1, minWidth: 180 }}>
                  <label className="form-label">Successor</label>
                  <select className="form-input" value={depTo} onChange={e => setDepTo(e.target.value)}>
                    <option value="">Select activity…</option>
                    {activities.map(a => (
                      <option key={activityKey(a.kind, a.id)} value={activityKey(a.kind, a.id)}>
                        {a.kind === 'phase' ? `[Phase] ${a.label}` : `[Task] ${a.label}`}
                      </option>
                    ))}
                  </select>
                </div>
                <div style={{ width: 80, flexShrink: 0 }}>
                  <label className="form-label">Type</label>
                  <select className="form-input" value={depType} onChange={e => setDepType(e.target.value as typeof depType)}>
                    <option value="FS">FS</option>
                    <option value="SS">SS</option>
                    <option value="FF">FF</option>
                    <option value="SF">SF</option>
                  </select>
                </div>
                <div style={{ width: 80, flexShrink: 0 }}>
                  <label className="form-label">Lag (days)</label>
                  <input className="form-input" type="number" min="0" value={lagDays} onChange={e => setLagDays(e.target.value)} />
                </div>
                <div style={{ flexShrink: 0 }}>
                  <label className="form-label">&nbsp;</label>
                  <button className="btn btn-primary" onClick={handleAddDep} disabled={depLoading}>
                    {depLoading ? '…' : 'Add'}
                  </button>
                </div>
              </div>
              {depErr && <div className={styles.error}>{depErr}</div>}
            </div>

            {intraDeps.length === 0 ? (
              <div className={styles.emptyInner}>No intra-project dependencies yet. Add links between phases and tasks above.</div>
            ) : (
              <table className={styles.depTable}>
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
                  {intraDeps.map(d => {
                    const fromNode = activityByKey(`${d.predecessorLevel}:${d.predecessorId}`);
                    const toNode   = activityByKey(`${d.successorLevel}:${d.successorId}`);
                    if (!fromNode && !toNode) return null;
                    return (
                      <tr key={d.id} className={styles.depRow}>
                        <td>
                          <span className={styles.actPill} data-kind={d.predecessorLevel}>
                            <span className={styles.kindTag}>{d.predecessorLevel === 'phase' ? 'PH' : 'TK'}</span>
                            {fromNode?.label ?? `#${d.predecessorId}`}
                          </span>
                        </td>
                        <td className={styles.arrowCell}>→</td>
                        <td>
                          <span className={styles.actPill} data-kind={d.successorLevel}>
                            <span className={styles.kindTag}>{d.successorLevel === 'phase' ? 'PH' : 'TK'}</span>
                            {toNode?.label ?? `#${d.successorId}`}
                          </span>
                        </td>
                        <td><span className={styles.typeTag}>{d.type}</span></td>
                        <td className={styles.lagCell}>{d.lagDays > 0 ? `+${d.lagDays}d` : '—'}</td>
                        <td><span className={styles.normalPath}>{DEP_LABELS[d.type]}</span></td>
                        <td>
                          <button className={styles.removeBtn} onClick={() => removeDependency(d.id)} title="Remove">×</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
