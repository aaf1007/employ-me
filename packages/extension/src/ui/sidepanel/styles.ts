import type { CSSProperties } from 'react';

export const styles = {
  main: { padding: 16, display: 'grid', gap: 12 },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 16, margin: 0 },
  fill: { padding: '8px 12px' },
  groupTitle: { fontSize: 13, margin: '8px 0 4px' },
  empty: { margin: 0, color: 'var(--muted)' },
} satisfies Record<string, CSSProperties>;
