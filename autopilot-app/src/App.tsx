import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, useParams } from 'react-router-dom';
import { useStore } from './store/useStore';
import { Sidebar } from './components/ui/Sidebar';
import { Topbar } from './components/ui/Topbar';
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

  return (
    <BrowserRouter>
      <div className={styles.shell}>
        <Sidebar />
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
    </BrowserRouter>
  );
}
