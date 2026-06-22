import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../../store/useStore';
import type { Project } from '../../types';
import styles from './Dashboard.module.css';

interface Props {
  onEditProject: (id: number) => void;
  onNewProject: () => void;
}

const STATUS_BADGE: Record<string, string> = {
  'on-track': 'badge badge-on-track',
  'at-risk':  'badge badge-at-risk',
  'critical': 'badge badge-critical',
  'pending':  'badge badge-pending',
  'done':     'badge badge-done',
};

const STATUS_LABEL: Record<string, string> = {
  'on-track': 'On Track',
  'at-risk':  'At Risk',
  'critical': 'Critical',
  'pending':  'Pending',
  'done':     'Done',
};

export function Dashboard({ onEditProject, onNewProject }: Props) {
  const projects       = useStore(s => s.projects);
  const scheduleResult = useStore(s => s.scheduleResult);
  const [sortKey, setSortKey] = useState<keyof Project | 'te' | 'slack'>('order');
  const [sortDir, setSortDir] = useState<1 | -1>(1);

  const critCount   = projects.filter(p => p.isCritical).length;
  const onTrackCount = projects.filter(p => p.status === 'on-track').length;
  const totalWeeks  = scheduleResult?.projectEnd?.toFixed(1) ?? '—';

  function handleSort(key: typeof sortKey) {
    if (sortKey === key) setSortDir(d => (d === 1 ? -1 : 1));
    else { setSortKey(key); setSortDir(1); }
  }

  const sorted = [...projects].sort((a, b) => {
    const av = (a as unknown as Record<string, unknown>)[sortKey] ?? 0;
    const bv = (b as unknown as Record<string, unknown>)[sortKey] ?? 0;
    if (av < bv) return -1 * sortDir;
    if (av > bv) return 1 * sortDir;
    return 0;
  });

  const SortHdr = ({ col, label }: { col: typeof sortKey; label: string }) => (
    <th onClick={() => handleSort(col)} className={styles.sortable}>
      {label}
      {sortKey === col && <span className={styles.sortArrow}>{sortDir === 1 ? ' ↑' : ' ↓'}</span>}
    </th>
  );

  return (
    <div className={styles.root}>
      {/* Stats bar */}
      <div className={styles.statsBar}>
        <div className={styles.stat}>
          <div className={styles.statVal}>{projects.length}</div>
          <div className={styles.statLbl}>Projects</div>
        </div>
        <div className={styles.stat}>
          <div className={`${styles.statVal} ${styles.critical}`}>{critCount}</div>
          <div className={styles.statLbl}>On Critical Path</div>
        </div>
        <div className={styles.stat}>
          <div className={`${styles.statVal} ${styles.accent}`}>{totalWeeks}<span className={styles.statUnit}>w</span></div>
          <div className={styles.statLbl}>Portfolio Duration</div>
        </div>
        <div className={styles.stat}>
          <div className={`${styles.statVal} ${styles.success}`}>{onTrackCount}</div>
          <div className={styles.statLbl}>On Track</div>
        </div>
      </div>

      {/* Table */}
      {projects.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>◫</div>
          <div className={styles.emptyTitle}>No projects yet</div>
          <div className={styles.emptyDesc}>Add your first project. Autopilot computes the critical path automatically from your PERT estimates and dependency links.</div>
          <button className="btn btn-primary" onClick={onNewProject}>Add first project</button>
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <SortHdr col="name"   label="Project" />
                <SortHdr col="owner"  label="Owner" />
                <SortHdr col="startDate" label="Start" />
                <SortHdr col="endDate"   label="End" />
                <SortHdr col="te"     label="Duration (te)" />
                <SortHdr col="slack"  label="Slack" />
                <th>Status</th>
                <th>Weight</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(p => (
                <ProjectRow key={p.id} project={p} projectEnd={scheduleResult?.projectEnd ?? 0} onEdit={() => onEditProject(p.id)} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ProjectRow({ project: p, projectEnd, onEdit }: { project: Project; projectEnd: number; onEdit: () => void }) {
  const navigate = useNavigate();
  const weight = projectEnd > 0 ? Math.min(100, ((p.te ?? 0) / projectEnd) * 100) : 0;

  return (
    <tr
      className={`${styles.row} ${p.isCritical ? styles.critRow : ''}`}
      onClick={() => navigate(`/project/${p.id}`)}
      style={{ cursor: 'pointer' }}
    >
      <td>
        <div className={styles.projectName}>
          <span className={styles.dot} style={{ background: p.color }} />
          <span>{p.name}</span>
          {p.isCritical && <span className="badge badge-cp">CP</span>}
          {p.estimatePending && <span className="badge badge-pending" style={{ fontSize: '8px' }}>est?</span>}
        </div>
      </td>
      <td className={styles.muted}>{p.owner ?? '—'}</td>
      <td className={styles.date}>{p.startDate ?? '—'}</td>
      <td className={styles.date}>{p.endDate ?? '—'}</td>
      <td className={styles.num}>{p.te != null ? `${p.te.toFixed(1)}w` : '—'}</td>
      <td className={`${styles.num} ${p.isCritical ? styles.cpNum : ''}`}>
        {p.slack != null ? `${p.slack.toFixed(1)}w` : '—'}
      </td>
      <td><span className={STATUS_BADGE[p.status] ?? 'badge badge-pending'}>{STATUS_LABEL[p.status] ?? p.status}</span></td>
      <td>
        <div className={styles.progressWrap}>
          <div className={styles.progressBar}>
            <div
              className={`${styles.progressFill} ${p.isCritical ? styles.critFill : ''}`}
              style={{ width: `${weight}%` }}
            />
          </div>
          <span className={styles.progressPct}>{weight.toFixed(0)}%</span>
        </div>
      </td>
      <td onClick={e => e.stopPropagation()}>
        <button className={styles.editBtn} onClick={onEdit} aria-label="Edit project" title="Edit">✎</button>
      </td>
    </tr>
  );
}
