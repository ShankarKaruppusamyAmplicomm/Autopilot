import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, useParams } from 'react-router-dom';
import { useStore } from './store/useStore';
import { Sidebar } from './components/ui/Sidebar';
import { Topbar } from './components/ui/Topbar';
import { SaveReminder } from './components/ui/SaveReminder';
import { AuthPromptModal } from './components/ui/AuthPromptModal';
import { Dashboard } from './components/views/Dashboard';
import { GanttView } from './components/views/GanttView';
import { PertView } from './components/views/PertView';
import { DepsView } from './components/views/DepsView';
import { SettingsView } from './components/views/SettingsView';
import { ProjectDetailView } from './components/views/ProjectDetailView';
import { ProjectModal } from './components/modals/ProjectModal';
import styles from './App.module.css';

function ProjectDetailRoute({ onEdit }: { onEdit: (id: number) => void }) {
  const { id } = useParams<{ id: string }>();
  return <ProjectDetailView projectId={parseInt(id ?? '0')} onEdit={onEdit} />;
}

export default function App() {
  const init    = useStore(s => s.init);
  const loading = useStore(s => s.loading);
  const [modalProjectId, setModalProjectId] = useState<number | null | undefined>(undefined);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => { init(); }, []);

  if (loading) {
    return (
      <div className={styles.splash}>
        <div className={styles.splashLogo}>Auto<span>pilot</span></div>
        <div className={styles.splashSub}>Loading portfolio…</div>
      </div>
    );
  }

  const isModalOpen = modalProjectId !== undefined;

  const basename = import.meta.env.BASE_URL;

  return (
    <BrowserRouter basename={basename}>
      <div className={styles.shell}>
        <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(v => !v)} />
        <div className={styles.main}>
          <Topbar onNewProject={() => setModalProjectId(null)} />
          <div className={styles.content}>
            <Routes>
              <Route path="/"        element={<Dashboard onEditProject={id => setModalProjectId(id)} onNewProject={() => setModalProjectId(null)} />} />
              <Route path="/gantt"      element={<GanttView onEditProject={id => setModalProjectId(id)} />} />
              <Route path="/pert"       element={<PertView  onEditProject={id => setModalProjectId(id)} />} />
              <Route path="/deps"       element={<DepsView />} />
              <Route path="/settings"   element={<SettingsView />} />
              <Route path="/project/:id" element={<ProjectDetailRoute onEdit={id => setModalProjectId(id)} />} />
            </Routes>
          </div>
        </div>
      </div>

      {isModalOpen && (
        <ProjectModal
          projectId={modalProjectId}
          onClose={() => setModalProjectId(undefined)}
        />
      )}

      <SaveReminder />
      <AuthPromptModal />
    </BrowserRouter>
  );
}
