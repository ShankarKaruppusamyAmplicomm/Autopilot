import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../../store/useStore';
import { ProjectActivitiesView } from './ProjectActivitiesView';
import { ProjectPertView } from './ProjectPertView';
import styles from './ProjectDetailView.module.css';

type Tab = 'activities' | 'pert';

interface Props {
  projectId: number;
  onEdit: (id: number) => void;
}

const STATUS_CLASS: Record<string, string> = {
  'on-track': 'badge-on-track',
  'at-risk':  'badge-at-risk',
  'critical': 'badge-critical',
  'pending':  'badge-pending',
  'done':     'badge-done',
};

export function ProjectDetailView({ projectId, onEdit }: Props) {
  const projects = useStore(s => s.projects);
  const navigate = useNavigate();
  const project  = projects.find(p => p.id === projectId);
  const [tab, setTab] = useState<Tab>('activities');

  if (!project) {
    return (
      <div className={styles.notFound}>
        <div className={styles.notFoundTitle}>Project not found</div>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/')}>← Back to portfolio</button>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      {/* Project header */}
      <div className={styles.projectHeader}>
        <button className={styles.back} onClick={() => navigate('/')} title="Back to portfolio">←</button>
        <div className={styles.colorBar} style={{ background: project.color }} />
        <div className={styles.headerInfo}>
          <div className={styles.projectName}>{project.name}</div>
          <div className={styles.projectMeta}>
            {project.owner && <span>{project.owner}</span>}
            {project.startDate && <span>{project.startDate}{project.endDate ? ` → ${project.endDate}` : ''}</span>}
            {project.te != null && <span>te {project.te.toFixed(1)}w</span>}
          </div>
        </div>
        <span className={`badge ${STATUS_CLASS[project.status] ?? 'badge-pending'}`}>{project.status.replace('-', ' ')}</span>
        {project.isCritical && <span className="badge badge-cp">CP</span>}
        <button className="btn btn-ghost btn-sm" onClick={() => onEdit(project.id)}>Edit</button>
      </div>

      {/* Tabs */}
      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${tab === 'activities' ? styles.active : ''}`}
          onClick={() => setTab('activities')}
        >
          Activities &amp; Deps
        </button>
        <button
          className={`${styles.tab} ${tab === 'pert' ? styles.active : ''}`}
          onClick={() => setTab('pert')}
        >
          PERT Network
        </button>
      </div>

      {/* Tab content */}
      <div className={styles.tabContent}>
        {tab === 'activities' && <ProjectActivitiesView projectId={projectId} />}
        {tab === 'pert'       && <ProjectPertView       projectId={projectId} />}
      </div>
    </div>
  );
}
