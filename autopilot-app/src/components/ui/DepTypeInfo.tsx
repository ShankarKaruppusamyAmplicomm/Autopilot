import { useState, useRef } from 'react';
import styles from './DepTypeInfo.module.css';

const TYPES = [
  { code: 'FS', name: 'Finish → Start',   desc: 'Successor starts only after predecessor finishes. Most common.' },
  { code: 'SS', name: 'Start → Start',    desc: 'Successor can start only after predecessor has started.' },
  { code: 'FF', name: 'Finish → Finish',  desc: 'Successor can finish only after predecessor finishes.' },
  { code: 'SF', name: 'Start → Finish',   desc: 'Successor can finish only after predecessor starts. Rarely used.' },
];

export function DepTypeInfo() {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const iconRef = useRef<HTMLSpanElement>(null);

  function handleMouseEnter() {
    if (!iconRef.current) return;
    const rect = iconRef.current.getBoundingClientRect();
    setPos({ top: rect.bottom + 8, left: rect.left - 8 });
  }

  function handleMouseLeave() {
    setPos(null);
  }

  return (
    <span
      className={styles.wrap}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <span ref={iconRef} className={styles.icon} aria-label="Dependency type information">i</span>
      {pos && (
        <span
          className={styles.tooltip}
          style={{ top: pos.top, left: pos.left }}
          role="tooltip"
        >
          <span className={styles.heading}>Dependency Types</span>
          {TYPES.map(t => (
            <span key={t.code} className={styles.row}>
              <span className={styles.code}>{t.code}</span>
              <span className={styles.detail}>
                <span className={styles.name}>{t.name}</span>
                <span className={styles.desc}>{t.desc}</span>
              </span>
            </span>
          ))}
        </span>
      )}
    </span>
  );
}
