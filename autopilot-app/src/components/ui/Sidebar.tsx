import { NavLink } from 'react-router-dom';
import { useStore } from '../../store/useStore';
import styles from './Sidebar.module.css';

const NAV = [
  { to: '/',           label: 'Dashboard',    icon: '▦' },
  { to: '/gantt',      label: 'Gantt',        icon: '▬' },
  { to: '/pert',       label: 'PERT Network', icon: '◉' },
  { to: '/deps',       label: 'Dependencies', icon: '⟶' },
  { to: '/settings',   label: 'Settings',     icon: '⚙' },
];

export function Sidebar() {
  const workspace = useStore(s => s.workspace);
  const renameWorkspace = useStore(s => s.renameWorkspace);

  function handleRename() {
    const name = prompt('Workspace name:', workspace?.name ?? '');
    if (name?.trim()) renameWorkspace(name.trim());
  }

  return (
    <aside className={styles.sidebar}>
      <div className={styles.logo}>
        <div className={styles.logoMark}>Auto<span>pilot</span></div>
        <div className={styles.logoSub}>Portfolio Planning</div>
      </div>

      <nav className={styles.nav}>
        <div className={styles.sectionLabel}>Portfolio</div>
        {NAV.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `${styles.navItem} ${isActive ? styles.active : ''}`
            }
          >
            <span className={styles.icon}>{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className={styles.workspace}>
        <div className={styles.wsLabel}>Workspace</div>
        <div className={styles.wsRow}>
          <span className={styles.wsName}>{workspace?.name ?? '…'}</span>
          <button className={styles.wsBtn} onClick={handleRename}>rename</button>
        </div>
      </div>
    </aside>
  );
}
