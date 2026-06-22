import { useLocation } from 'react-router-dom';
import { useStore } from '../../store/useStore';
import styles from './Topbar.module.css';

const TITLES: Record<string, string> = {
  '/':         'Portfolio Dashboard',
  '/gantt':    'Gantt Chart',
  '/pert':     'PERT Network',
  '/deps':     'Dependencies',
  '/settings': 'Settings',
};

interface Props {
  onNewProject: () => void;
}

export function Topbar({ onNewProject }: Props) {
  const { pathname } = useLocation();
  const title = TITLES[pathname] ?? 'Autopilot';
  const exportJSON = useStore(s => s.exportJSON);

  return (
    <header className={styles.topbar}>
      <span className={styles.title}>{title}</span>
      <div className={styles.actions}>
        <button className="btn btn-ghost" onClick={() => exportJSON()}>Backup JSON</button>
        <button className="btn btn-primary" onClick={onNewProject}>+ New Project</button>
      </div>
    </header>
  );
}
