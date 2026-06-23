import { useEffect, useState } from 'react';
import { useStore } from '../../store/useStore';
import type { Project, ItemStatus } from '../../types';
import styles from './ProjectModal.module.css';

const COLORS = [
  '#6E40C9','#1F6FEB','#238636','#9E6A03','#DA3633',
  '#58A6FF','#3FB950','#D2A8FF','#F78166','#E3B341',
  '#6E7681','#79C0FF','#56D364','#FF7B72','#FFA657',
];

interface Props {
  projectId?: number | null;
  onClose: () => void;
}

function pertTe(o: number, m: number, p: number) { return (o + 4 * m + p) / 6; }
function pertVar(o: number, p: number) { return Math.pow((p - o) / 6, 2); }

export function ProjectModal({ projectId, onClose }: Props) {
  const projects    = useStore(s => s.projects);
  const addProject  = useStore(s => s.addProject);
  const updateProject = useStore(s => s.updateProject);
  const deleteProject = useStore(s => s.deleteProject);
  const dependencies = useStore(s => s.dependencies);

  const editing = projectId != null ? projects.find(p => p.id === projectId) : null;

  const [name,    setName]    = useState('');
  const [owner,   setOwner]   = useState('');
  const [desc,    setDesc]    = useState('');
  const [start,   setStart]   = useState('');
  const [end,     setEnd]     = useState('');
  const [status,  setStatus]  = useState<ItemStatus>('on-track');
  const [color,   setColor]   = useState(COLORS[0]);
  const [pertO,   setPertO]   = useState('');
  const [pertM,   setPertM]   = useState('');
  const [pertP,   setPertP]   = useState('');
  const [error,   setError]   = useState('');

  useEffect(() => {
    if (editing) {
      setName(editing.name);
      setOwner(editing.owner ?? '');
      setDesc(editing.description ?? '');
      setStart(editing.startDate ?? '');
      setEnd(editing.endDate ?? '');
      setStatus(editing.status);
      setColor(editing.color);
      setPertO(editing.pertO != null ? String(editing.pertO) : '');
      setPertM(editing.pertM != null ? String(editing.pertM) : '');
      setPertP(editing.pertP != null ? String(editing.pertP) : '');
    } else {
      setColor(COLORS[projects.length % COLORS.length]);
    }
    setError('');
  }, [projectId]);

  const o = parseFloat(pertO), m = parseFloat(pertM), p = parseFloat(pertP);
  const hasPert = !isNaN(o) && !isNaN(m) && !isNaN(p);
  const te = hasPert ? pertTe(o, m, p) : null;
  const variance = hasPert ? pertVar(o, p) : null;

  async function handleSave() {
    if (!name.trim()) { setError('Project name is required.'); return; }
    if (start && end && end < start) { setError('End date must be ≥ start date.'); return; }
    setError('');

    const payload: Omit<Project, 'id' | 'workspaceId' | 'order'> = {
      name: name.trim(),
      description: desc.trim() || undefined,
      owner: owner.trim() || undefined,
      startDate: start || undefined,
      endDate: end || undefined,
      status,
      color,
      pertO: hasPert ? o : undefined,
      pertM: hasPert ? m : undefined,
      pertP: hasPert ? p : undefined,
    };

    if (editing) {
      await updateProject(editing.id, payload);
    } else {
      await addProject(payload);
    }
    onClose();
  }

  async function handleDelete() {
    if (!editing) return;
    const depCount = dependencies.filter(d => d.predecessorId === editing.id || d.successorId === editing.id).length;
    const msg = depCount > 0
      ? `Delete "${editing.name}" and its ${depCount} dependency link(s)?`
      : `Delete "${editing.name}"?`;
    if (!confirm(msg)) return;
    await deleteProject(editing.id);
    onClose();
  }

  function handleOverlayClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    <div className={styles.overlay} onClick={handleOverlayClick} role="dialog" aria-modal="true" aria-label="Project editor">
      <div className={styles.modal}>
        <div className={styles.header}>
          <span className={styles.title}>{editing ? 'Edit Project' : 'New Project'}</span>
          <button className={styles.close} onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className={styles.body}>
          <div className="form-group">
            <label className="form-label" htmlFor="proj-name">Project Name *</label>
            <input id="proj-name" className="form-input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Automation Testing" autoFocus />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label" htmlFor="proj-owner">Owner</label>
              <input id="proj-owner" className="form-input" value={owner} onChange={e => setOwner(e.target.value)} placeholder="e.g. Shankar" />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="proj-status">Status</label>
              <select id="proj-status" className="form-input" value={status} onChange={e => setStatus(e.target.value as ItemStatus)}>
                <option value="on-track">On Track</option>
                <option value="at-risk">At Risk</option>
                <option value="critical">Critical</option>
                <option value="pending">Pending</option>
                <option value="done">Done</option>
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label" htmlFor="proj-start">Start Date</label>
              <input id="proj-start" className="form-input" type="date" value={start} onChange={e => setStart(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="proj-end">End Date</label>
              <input id="proj-end" className="form-input" type="date" value={end} onChange={e => setEnd(e.target.value)} />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">PERT Estimate (weeks) — O / M / P</label>
            <div className={styles.pertRow}>
              <div>
                <div className={styles.pertHint}>Optimistic</div>
                <input className="form-input" type="number" min="0" step="0.5" value={pertO} onChange={e => setPertO(e.target.value)} placeholder="2" />
              </div>
              <div>
                <div className={styles.pertHint}>Most Likely</div>
                <input className="form-input" type="number" min="0" step="0.5" value={pertM} onChange={e => setPertM(e.target.value)} placeholder="4" />
              </div>
              <div>
                <div className={styles.pertHint}>Pessimistic</div>
                <input className="form-input" type="number" min="0" step="0.5" value={pertP} onChange={e => setPertP(e.target.value)} placeholder="8" />
              </div>
            </div>
            {hasPert && (
              <div className={styles.pertResult}>
                te = (O + 4M + P) / 6 = <strong>{te!.toFixed(2)}w</strong>
                &nbsp;·&nbsp;
                σ² = <strong>{variance!.toFixed(3)}</strong>
              </div>
            )}
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="proj-desc">Description</label>
            <textarea id="proj-desc" className={`form-input ${styles.textarea}`} value={desc} onChange={e => setDesc(e.target.value)} placeholder="Optional context…" rows={2} />
          </div>

          <div className="form-group">
            <div className="form-label">Color Tag</div>
            <div className={styles.colorPicker}>
              {COLORS.map(c => (
                <button
                  key={c}
                  className={`${styles.swatch} ${c === color ? styles.selected : ''}`}
                  style={{ background: c }}
                  onClick={() => setColor(c)}
                  aria-label={`Color ${c}`}
                  type="button"
                />
              ))}
            </div>
          </div>

          {error && <div className={styles.error}>{error}</div>}
        </div>

        <div className={styles.footer}>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          {editing && (
            <button className="btn btn-danger" onClick={handleDelete}>Delete Project</button>
          )}
          <button className="btn btn-primary" onClick={handleSave}>
            {editing ? 'Save Changes' : 'Add Project'}
          </button>
        </div>
      </div>
    </div>
  );
}
