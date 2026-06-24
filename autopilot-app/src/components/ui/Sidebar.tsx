import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useStore } from '../../store/useStore';
import styles from './Sidebar.module.css';

const NAV = [
  { to: '/',         label: 'Dashboard',    icon: '▦' },
  { to: '/gantt',    label: 'Gantt',        icon: '▬' },
  { to: '/pert',     label: 'PERT Network', icon: '◉' },
  { to: '/deps',     label: 'Dependencies', icon: '⟶' },
  { to: '/settings', label: 'Settings',     icon: '⚙' },
];

interface Props {
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ collapsed, onToggle }: Props) {
  const workspace      = useStore(s => s.workspace);
  const renameWorkspace = useStore(s => s.renameWorkspace);
  const projects        = useStore(s => s.projects);
  const [projectsExpanded, setProjectsExpanded] = useState(true);

  function handleRename() {
    const name = prompt('Workspace name:', workspace?.name ?? '');
    if (name?.trim()) renameWorkspace(name.trim());
  }

  return (
    <aside className={`${styles.sidebar} ${collapsed ? styles.collapsed : ''}`}>
      {/* Logo — hidden when collapsed, icon shown instead */}
      <div className={styles.logo}>
        {!collapsed && (
          <>
            <div className={styles.logoMark}>Auto<span>pilot</span></div>
            <div className={styles.logoSub}>Portfolio Planning</div>
          </>
        )}
        {collapsed && <div className={styles.logoIcon}>AP</div>}
      </div>

      {/* Collapse / expand toggle button */}
      <button
        className={styles.toggleBtn}
        onClick={onToggle}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? '›' : '‹'}
      </button>

      <nav className={styles.nav}>
        {!collapsed && <div className={styles.sectionLabel}>Portfolio</div>}
        {NAV.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `${styles.navItem} ${isActive ? styles.active : ''} ${collapsed ? styles.navItemCollapsed : ''}`
            }
            title={collapsed ? item.label : undefined}
          >
            <span className={styles.icon}>{item.icon}</span>
            {!collapsed && item.label}
          </NavLink>
        ))}

        {!collapsed && projects.length > 0 && (
          <>
            <button
              className={styles.projectsToggle}
              onClick={() => setProjectsExpanded(v => !v)}
            >
              <span className={styles.sectionLabel} style={{ marginBottom: 0 }}>Projects</span>
              <span className={styles.toggleChevron}>{projectsExpanded ? '▾' : '▸'}</span>
            </button>

            {projectsExpanded && (
              <div className={styles.projectList}>
                {projects.map(p => (
                  <NavLink
                    key={p.id}
                    to={`/project/${p.id}`}
                    className={({ isActive }) =>
                      `${styles.projectItem} ${isActive ? styles.active : ''}`
                    }
                  >
                    <span className={styles.projectDot} style={{ background: p.color }} />
                    <span className={styles.projectItemName}>{p.name}</span>
                    {p.isCritical && <span className={styles.cpDot} title="Critical path" />}
                  </NavLink>
                ))}
              </div>
            )}
          </>
        )}
      </nav>

      {!collapsed && (
        <div className={styles.workspace}>
          <div className={styles.wsLabel}>Workspace</div>
          <div className={styles.wsRow}>
            <span className={styles.wsName}>{workspace?.name ?? '…'}</span>
            <button className={styles.wsBtn} onClick={handleRename}>rename</button>
          </div>
          <div className={styles.version}>
            v{__APP_VERSION__}
            {__APP_COMMIT__ && (
              <span className={styles.commit}> · {__APP_COMMIT__}</span>
            )}
          </div>
        </div>
      )}
    </aside>
  );
}
