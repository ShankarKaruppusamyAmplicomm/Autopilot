import { useEffect, useRef, useState, useCallback } from 'react';
import { useStore } from '../../store/useStore';
import type { Project, Dependency } from '../../types';
import styles from './GanttView.module.css';

const ROW_H = 44;
const BAR_H = 22;
const HDR_H = 42;

function getMinDate(projects: Project[]): Date {
  const dates = projects.flatMap(p => [p.startDate, p.endDate].filter(Boolean) as string[]).map(d => new Date(d));
  if (!dates.length) {
    const d = new Date(); d.setDate(d.getDate() - d.getDay()); return d;
  }
  const min = new Date(Math.min(...dates.map(d => d.getTime())));
  min.setDate(min.getDate() - min.getDay());
  return min;
}

function getTotalWeeks(projects: Project[], minDate: Date): number {
  const dates = projects.flatMap(p => [p.startDate, p.endDate].filter(Boolean) as string[]).map(d => new Date(d));
  if (!dates.length) return 20;
  const max = new Date(Math.max(...dates.map(d => d.getTime())));
  return Math.max(20, Math.ceil((max.getTime() - minDate.getTime()) / (7 * 86400000)) + 3);
}

export function GanttView({ onEditProject }: { onEditProject: (id: number) => void }) {
  const projects     = useStore(s => s.projects);
  const dependencies = useStore(s => s.dependencies);
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const areaRef      = useRef<HTMLDivElement>(null);
  const labelsRef    = useRef<HTMLDivElement>(null);
  const [weekPx, setWeekPx] = useState(48);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const minDate  = getMinDate(projects);
    const totalWks = getTotalWeeks(projects, minDate);
    const W = totalWks * weekPx;
    const H = HDR_H + projects.length * ROW_H;
    const dpr = devicePixelRatio;

    canvas.width  = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width  = `${W}px`;
    canvas.style.height = `${H}px`;

    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);

    const C = {
      ground: '#0D1117', surface: '#161B22', surface2: '#21262D',
      border: '#30363D', text: '#E6EDF3', muted: '#8B949E',
      accent: '#6E40C9', critical: '#DA3633',
    };

    ctx.fillStyle = C.ground;
    ctx.fillRect(0, 0, W, H);

    // Vertical week grid
    for (let w = 0; w <= totalWks; w++) {
      const x = w * weekPx;
      ctx.strokeStyle = w % 4 === 0 ? C.surface2 : `${C.border}55`;
      ctx.lineWidth = w % 4 === 0 ? 1 : 0.5;
      ctx.beginPath(); ctx.moveTo(x, HDR_H); ctx.lineTo(x, H); ctx.stroke();
    }

    // Header background
    ctx.fillStyle = C.surface;
    ctx.fillRect(0, 0, W, HDR_H);
    ctx.strokeStyle = C.border; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, HDR_H); ctx.lineTo(W, HDR_H); ctx.stroke();

    // Week labels
    const step = weekPx < 28 ? 4 : weekPx < 48 ? 2 : 1;
    ctx.font = `500 9px "JetBrains Mono"`;
    ctx.fillStyle = C.muted;
    ctx.textBaseline = 'middle';
    for (let w = 0; w < totalWks; w += step) {
      const x = w * weekPx;
      const d = new Date(minDate);
      d.setDate(d.getDate() + w * 7);
      ctx.fillText(`W${w + 1} ${d.getMonth() + 1}/${d.getDate()}`, x + 4, HDR_H / 2);
    }

    // Today marker
    const today = new Date();
    const todayWk = (today.getTime() - minDate.getTime()) / (7 * 86400000);
    if (todayWk >= 0 && todayWk <= totalWks) {
      const tx = todayWk * weekPx;
      ctx.strokeStyle = '#9E6A03';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.moveTo(tx, HDR_H); ctx.lineTo(tx, H); ctx.stroke();
      ctx.setLineDash([]);
    }

    // Build bar rect map for dependency arrows
    const barRects: Record<number, { lx: number; rx: number; cy: number }> = {};

    projects.forEach((p, i) => {
      const y = HDR_H + i * ROW_H;

      // Row bg
      if (p.isCritical) {
        ctx.fillStyle = 'rgba(218,54,51,0.05)';
        ctx.fillRect(0, y, W, ROW_H);
      }
      ctx.strokeStyle = `${C.border}88`; ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.moveTo(0, y + ROW_H); ctx.lineTo(W, y + ROW_H); ctx.stroke();

      // Compute bar position
      let barStart = p.ES ?? 0;
      let barEnd   = (p.ES ?? 0) + (p.te ?? 1);
      if (p.startDate) barStart = (new Date(p.startDate).getTime() - minDate.getTime()) / (7 * 86400000);
      if (p.endDate)   barEnd   = (new Date(p.endDate).getTime()   - minDate.getTime()) / (7 * 86400000);

      const bx = barStart * weekPx;
      const bw = Math.max(4, (barEnd - barStart) * weekPx);
      const by = y + (ROW_H - BAR_H) / 2;
      const cy = by + BAR_H / 2;

      barRects[p.id] = { lx: bx, rx: bx + bw, cy };

      // Bar fill
      ctx.globalAlpha = 0.88;
      ctx.fillStyle = p.isCritical ? C.critical : (p.color ?? C.accent);
      ctx.fillRect(bx, by, bw, BAR_H);
      ctx.globalAlpha = 1;

      // Border on critical
      if (p.isCritical) {
        ctx.strokeStyle = C.critical; ctx.lineWidth = 1.5;
        ctx.strokeRect(bx, by, bw, BAR_H);
      }

      // Bar label
      if (bw > 36) {
        ctx.fillStyle = '#fff';
        ctx.font = `500 10px "JetBrains Mono"`;
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        const maxChars = Math.floor((bw - 14) / 7);
        const lbl = p.name.length > maxChars ? p.name.slice(0, maxChars - 1) + '…' : p.name;
        ctx.fillText(lbl, bx + 6, cy);
      }

      // CP badge
      if (p.isCritical && bw > 28) {
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(bx + bw - 24, by + 2, 22, 13);
        ctx.fillStyle = '#fff';
        ctx.font = `700 8px "JetBrains Mono"`;
        ctx.textAlign = 'center';
        ctx.fillText('CP', bx + bw - 13, by + 9);
      }

      ctx.textAlign = 'left';
    });

    // Dependency arrows (project-level FS)
    const idMap = new Map(projects.map(p => [p.id, p]));
    dependencies.forEach(d => {
      if (d.predecessorLevel !== 'project' || d.successorLevel !== 'project') return;
      const fr = barRects[d.predecessorId];
      const tr = barRects[d.successorId];
      if (!fr || !tr) return;

      const from = idMap.get(d.predecessorId);
      const to   = idMap.get(d.successorId);
      const critEdge = from?.isCritical && to?.isCritical;

      ctx.strokeStyle = critEdge ? C.critical : C.muted;
      ctx.lineWidth   = critEdge ? 1.5 : 1;
      ctx.globalAlpha = 0.65;

      const x1 = fr.rx, y1 = fr.cy;
      const x2 = tr.lx, y2 = tr.cy;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.bezierCurveTo(x1 + 16, y1, x2 - 16, y2, x2, y2);
      ctx.stroke();

      // Arrowhead
      ctx.fillStyle = critEdge ? C.critical : C.muted;
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - 7, y2 - 3.5);
      ctx.lineTo(x2 - 7, y2 + 3.5);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
    });
  }, [projects, dependencies, weekPx]);

  useEffect(() => { draw(); }, [draw]);

  // Sync scroll
  useEffect(() => {
    const area = areaRef.current;
    const labels = labelsRef.current;
    if (!area || !labels) return;
    const handler = () => { labels.scrollTop = area.scrollTop; };
    area.addEventListener('scroll', handler);
    return () => area.removeEventListener('scroll', handler);
  }, []);

  // Click on canvas → find project row
  function handleCanvasClick(e: React.MouseEvent<HTMLCanvasElement>) {
    const rect = canvasRef.current!.getBoundingClientRect();
    const y = e.clientY - rect.top;
    if (y < HDR_H) return;
    const idx = Math.floor((y - HDR_H) / ROW_H);
    const minDate = getMinDate(projects);
    const sorted = [...projects];
    if (idx >= 0 && idx < sorted.length) {
      onEditProject(sorted[idx].id);
    }
  }

  function zoom(dir: number) {
    setWeekPx(w => Math.max(16, Math.min(120, w + dir * 8)));
  }

  function fit() {
    const area = areaRef.current;
    if (!area) return;
    const minDate = getMinDate(projects);
    const totalWks = getTotalWeeks(projects, minDate);
    setWeekPx(Math.max(16, Math.floor(area.clientWidth / totalWks)));
  }

  return (
    <div className={styles.root}>
      <div className={styles.toolbar}>
        <div>
          <span className={styles.viewTitle}>Gantt Chart</span>
          <span className={styles.viewSub}>&nbsp;· portfolio · {projects.length} projects</span>
        </div>
        <div className={styles.controls}>
          <button className="btn btn-ghost btn-sm" onClick={() => zoom(-1)}>Zoom −</button>
          <button className="btn btn-ghost btn-sm" onClick={() => zoom(1)}>Zoom +</button>
          <button className="btn btn-ghost btn-sm" onClick={fit}>Fit All</button>
        </div>
      </div>

      <div className={styles.body}>
        {/* Labels panel */}
        <div className={styles.labels} ref={labelsRef}>
          <div className={styles.labelsHeader}>Project</div>
          {projects.map(p => (
            <div
              key={p.id}
              className={`${styles.labelRow} ${p.isCritical ? styles.critLabelRow : ''}`}
              onClick={() => onEditProject(p.id)}
              title={p.name}
            >
              <span className={styles.labelDot} style={{ background: p.isCritical ? '#DA3633' : (p.color ?? '#6E40C9') }} />
              <span className={styles.labelText}>{p.name}</span>
              {p.isCritical && <span className="badge badge-cp">CP</span>}
            </div>
          ))}
        </div>

        {/* Canvas area */}
        <div className={styles.chartArea} ref={areaRef}>
          <canvas ref={canvasRef} onClick={handleCanvasClick} style={{ cursor: 'pointer', display: 'block' }} />
        </div>
      </div>
    </div>
  );
}
