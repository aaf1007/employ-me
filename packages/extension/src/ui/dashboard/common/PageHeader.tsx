import type { ReactNode } from 'react';

export function PageHeader({
  title,
  intro,
  actions,
}: {
  readonly title: string;
  readonly intro?: string;
  readonly actions?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        {intro === undefined ? null : <p>{intro}</p>}
      </div>
      {actions === undefined ? null : <div className="row">{actions}</div>}
    </header>
  );
}
