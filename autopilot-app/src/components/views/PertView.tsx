import { useEffect, useRef, useCallback, useState } from 'react';
import dagre from 'dagre';
import { useStore } from '../../store/useStore';
import type { Project } from '../../types';
import styles from './PertView.module.css';

const NODE_W = 208;
const NODE_H = 92;

interface Transform { x: number; y: number; scale: number; }

function layoutNodes(projects: Project[], deps: Array<{ predecessorId: number; successorId: number }>): Map<number, { x: number; y: number }> {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'LR', nodesep: 40, ranksep: 60, marginx: 40, marginy: 40 });
  g.setDefaultEdgeLabel(() => ({}));

  for (const p of projects) {
    g.setNode(String(p.id), { width: NODE_W, height: NODE_H });
  }
  for (const d of deps) {
    if (projects.some(p => p.id === d.predecessorId) && projects.some(p => p.id === d.successorId)) {
      g.setEdge(String(d.predecessorId), String(d.successorId));
    }
  }

  dagre.layout(g);

  const positions = new Map<number, { x: number; y: number }>();
  for (const p of projects) {
    const node = g.node(String(p.id));
    if (node) {
      positions.set(p.id, { x: node.x - NODE_W / 2, y: node.y - NODE_H / 2 });
    }
  }
  return positions;
}

export function PertView({ onEditProject }: { onEditProject: (id: number) => void }) {
  const projects     = useStore(s => s.projects);
  const dependencies = useStore(s => s.dependencies);

  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const posRef       = useRef<Map<number, { x: number; y: number }>>(new Map());
  const [transform, setTransform] = useState<Transform>({ x: 0, y: 0, scale: 1 });
  const transformRef = useRef<Transform>({ x: 0, y: 0, scale: 1 });
  const panRef = useRef<{ active: boolean; startX: number; startY: number; tx: number; ty: number }>({ active: false, startX: 0, startY: 0, tx: 0, ty: 0 });

  const draw = useCallback((tf: Transform) => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const W = container.clientWidth;
    const H = container.clientHeight;
    const dpr = devicePixelRatio;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;

    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);

    const C = {
      ground: '#0D1117', surface: '#161B22', surface2: '#21262D',
      border: '#30363D', text: '#E6EDF3', muted: '#8B949E',
      accent: '#6E40C9', accentDim: '#2D1F5E',
      critical: '#DA3633', criticalDim: '#3D1210',
    };

    ctx.fillStyle = C.ground;
    ctx.fillRect(0, 0, W, H);

    if (projects.length === 0) {
      ctx.fillStyle = C.muted;
      ctx.font = `400 12px "JetBrains Mono"`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Add projects to see the PERT network', W / 2, H / 2);
      return;
    }

    const projDeps = dependencies.filter(d => d.predecessorLevel === 'project' && d.successorLevel === 'project');
    const positions = layoutNodes(projects, projDeps);
    posRef.current = positions;

    ctx.save();
    ctx.translate(tf.x, tf.y);
    ctx.scale(tf.scale, tf.scale);

    const idMap = new Map(projects.map(p => [p.id, p]));

    // Draw edges first
    for (const d of projDeps) {
      const from = idMap.get(d.predecessorId);
      const to   = idMap.get(d.successorId);
      if (!from || !to) continue;
      const fp = positions.get(from.id);
      const tp = positions.get(to.id);
      if (!fp || !tp) continue;

      const critEdge = from.isCritical && to.isCritical;
      const x1 = fp.x + NODE_W, y1 = fp.y + NODE_H / 2;
      const x2 = tp.x,          y2 = tp.y + NODE_H / 2;
      const mid = (x1 + x2) / 2;

      ctx.strokeStyle = critEdge ? C.critical : C.muted;
      ctx.lineWidth   = critEdge ? 2.5 : 1.5;
      ctx.globalAlpha = 0.8;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.bezierCurveTo(mid, y1, mid, y2, x2, y2);
      ctx.stroke();

      // Arrowhead
      const angle = Math.atan2(y2 - y1, x2 - x1);
      ctx.fillStyle = critEdge ? C.critical : C.muted;
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - 10 * Math.cos(angle - 0.35), y2 - 10 * Math.sin(angle - 0.35));
      ctx.lineTo(x2 - 10 * Math.cos(angle + 0.35), y2 - 10 * Math.sin(angle + 0.35));
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // Draw nodes
    for (const p of projects) {
      const pos = positions.get(p.id);
      if (!pos) continue;
      const { x, y } = pos;
      const crit = p.isCritical;

      // Node background
      ctx.fillStyle = crit ? C.criticalDim : C.surface;
      ctx.fillRect(x, y, NODE_W, NODE_H);

      // Border
      ctx.strokeStyle = crit ? C.critical : C.border;
      ctx.lineWidth   = crit ? 2 : 1;
      ctx.strokeRect(x, y, NODE_W, NODE_H);

      // Left color stripe
      ctx.fillStyle = crit ? C.critical : (p.color ?? C.accent);
      ctx.fillRect(x, y, 4, NODE_H);

      // Divider lines
      ctx.strokeStyle = crit ? 'rgba(218,54,51,0.35)' : C.border;
      ctx.lineWidth = 0.5;
      // Main divider below name
      ctx.beginPath(); ctx.moveTo(x + 4, y + 30); ctx.lineTo(x + NODE_W, y + 30); ctx.stroke();
      // Bottom divider above LS/LF
      ctx.beginPath(); ctx.moveTo(x + 4, y + NODE_H - 28); ctx.lineTo(x + NODE_W, y + NODE_H - 28); ctx.stroke();
      // Vertical center divider in bottom section
      ctx.beginPath(); ctx.moveTo(x + NODE_W / 2, y + NODE_H - 28); ctx.lineTo(x + NODE_W / 2, y + NODE_H); ctx.stroke();

      // Name
      ctx.fillStyle = C.text;
      ctx.font = `600 11px "JetBrains Mono"`;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      const name = p.name.length > 24 ? p.name.slice(0, 22) + '…' : p.name;
      ctx.fillText(name, x + 10, y + 16);

      // te
      ctx.fillStyle = crit ? C.critical : C.muted;
      ctx.font = `500 10px "JetBrains Mono"`;
      ctx.textAlign = 'right';
      ctx.fillText(`te ${p.te?.toFixed(1) ?? '?'}w`, x + NODE_W - 8, y + 16);

      // ES / EF row
      ctx.fillStyle = C.muted;
      ctx.font = `400 9px "JetBrains Mono"`;
      ctx.textAlign = 'left';
      ctx.fillText(`ES ${p.ES?.toFixed(1) ?? '—'}`, x + 10, y + 40);
      ctx.textAlign = 'right';
      ctx.fillText(`EF ${p.EF?.toFixed(1) ?? '—'}`, x + NODE_W - 8, y + 40);

      // LS / LF row
      ctx.fillStyle = C.muted;
      ctx.font = `400 9px "JetBrains Mono"`;
      ctx.textAlign = 'left';
      ctx.fillText(`LS ${p.LS != null && isFinite(p.LS) ? p.LS.toFixed(1) : '—'}`, x + 10, y + NODE_H - 15);
      ctx.textAlign = 'right';
      ctx.fillText(`LF ${p.LF != null && isFinite(p.LF) ? p.LF.toFixed(1) : '—'}`, x + NODE_W - 8, y + NODE_H - 15);

      // Slack / Critical label
      ctx.font = crit ? `700 8px "JetBrains Mono"` : `400 9px "JetBrains Mono"`;
      ctx.fillStyle = crit ? C.critical : C.muted;
      ctx.textAlign = 'center';
      ctx.fillText(
        crit ? 'CRITICAL' : (p.slack != null ? `Slack ${p.slack.toFixed(1)}w` : '—'),
        x + NODE_W / 2,
        y + NODE_H - 15,
      );

      // CP badge
      if (crit) {
        ctx.fillStyle = C.critical;
        ctx.fillRect(x + NODE_W - 26, y + 2, 24, 14);
        ctx.fillStyle = '#fff';
        ctx.font = `700 8px "JetBrains Mono"`;
        ctx.textAlign = 'center';
        ctx.fillText('CP', x + NODE_W - 14, y + 10);
      }

      // est? badge
      if (p.estimatePending && !crit) {
        ctx.fillStyle = '#9E6A03';
        ctx.fillRect(x + NODE_W - 30, y + 2, 28, 14);
        ctx.fillStyle = '#fff';
        ctx.font = `600 7px "JetBrains Mono"`;
        ctx.textAlign = 'center';
        ctx.fillText('EST?', x + NODE_W - 16, y + 10);
      }

      ctx.textAlign = 'left';
    }

    ctx.restore();
  }, [projects, dependencies]);

  function applyTransform(tf: Transform) {
    transformRef.current = tf;
    setTransform(tf);
    draw(tf);
  }

  useEffect(() => {
    draw(transformRef.current);
  }, [draw]);

  function fit() {
    const container = containerRef.current;
    if (!container || projects.length === 0) return;
    const projDeps = dependencies.filter(d => d.predecessorLevel === 'project' && d.successorLevel === 'project');
    const positions = layoutNodes(projects, projDeps);
    const W = container.clientWidth;
    const H = container.clientHeight;
    const PAD = 40;

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const pos of positions.values()) {
      minX = Math.min(minX, pos.x - PAD);
      maxX = Math.max(maxX, pos.x + NODE_W + PAD);
      minY = Math.min(minY, pos.y - PAD);
      maxY = Math.max(maxY, pos.y + NODE_H + PAD);
    }

    const scale = Math.min(W / (maxX - minX), H / (maxY - minY), 1.5);
    const tf: Transform = {
      x: (W - (maxX - minX) * scale) / 2 - minX * scale,
      y: (H - (maxY - minY) * scale) / 2 - minY * scale,
      scale,
    };
    applyTransform(tf);
  }

  // Auto-fit on first load when projects appear
  const hasFit = useRef(false);
  useEffect(() => {
    if (projects.length > 0 && !hasFit.current) {
      hasFit.current = true;
      setTimeout(fit, 50);
    }
  }, [projects.length]);

  // Pan
  function onMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return;
    panRef.current = { active: true, startX: e.clientX, startY: e.clientY, tx: transformRef.current.x, ty: transformRef.current.y };
  }
  function onMouseMove(e: React.MouseEvent) {
    if (!panRef.current.active) return;
    const { startX, startY, tx, ty } = panRef.current;
    const tf = { ...transformRef.current, x: tx + e.clientX - startX, y: ty + e.clientY - startY };
    applyTransform(tf);
  }
  function onMouseUp(e: React.MouseEvent) {
    if (!panRef.current.active) return;
    panRef.current.active = false;
    // Click detection: if barely moved, treat as click
    const dx = Math.abs(e.clientX - panRef.current.startX);
    const dy = Math.abs(e.clientY - panRef.current.startY);
    if (dx < 4 && dy < 4) {
      handleClick(e);
    }
  }

  function handleClick(e: React.MouseEvent) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const tf = transformRef.current;
    const mx = (e.clientX - rect.left - tf.x) / tf.scale;
    const my = (e.clientY - rect.top  - tf.y) / tf.scale;
    for (const [id, pos] of posRef.current) {
      if (mx >= pos.x && mx <= pos.x + NODE_W && my >= pos.y && my <= pos.y + NODE_H) {
        onEditProject(id);
        return;
      }
    }
  }

  function onWheel(e: React.WheelEvent) {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const tf = transformRef.current;
    applyTransform({
      x: cx - (cx - tf.x) * factor,
      y: cy - (cy - tf.y) * factor,
      scale: Math.max(0.15, Math.min(3, tf.scale * factor)),
    });
  }

  return (
    <div className={styles.root}>
      <div className={styles.toolbar}>
        <div>
          <span className={styles.viewTitle}>PERT Network</span>
          <span className={styles.viewSub}>&nbsp;· activity-on-node · critical path highlighted</span>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={fit}>Fit to Screen</button>
      </div>

      <div
        className={styles.container}
        ref={containerRef}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={() => { panRef.current.active = false; }}
        onWheel={onWheel}
        style={{ cursor: panRef.current.active ? 'grabbing' : 'grab' }}
      >
        <canvas ref={canvasRef} style={{ display: 'block', pointerEvents: 'none' }} />

        <div className={styles.zoomBtns}>
          <button className={styles.zoomBtn} onClick={() => applyTransform({ ...transformRef.current, scale: Math.min(3, transformRef.current.scale * 1.2) })} title="Zoom in">+</button>
          <button className={styles.zoomBtn} onClick={() => applyTransform({ ...transformRef.current, scale: Math.max(0.15, transformRef.current.scale / 1.2) })} title="Zoom out">−</button>
        </div>

        <div className={styles.legend}>
          <div className={styles.legendItem}>
            <div className={styles.legendDot} style={{ background: '#6E40C9' }} />
            <span>Normal node</span>
          </div>
          <div className={styles.legendItem}>
            <div className={styles.legendDot} style={{ background: '#DA3633' }} />
            <span>Critical path [CP]</span>
          </div>
        </div>
      </div>
    </div>
  );
}
