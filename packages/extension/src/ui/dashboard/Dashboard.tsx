import { useEffect, useState, type ReactNode } from 'react';
import { ROUTES, routeFromHash, type RouteId } from './routes';

// Each view is a stub owned by a later agent. Keep one component per file
// under ui/dashboard/ when they grow.
const VIEWS: Readonly<Record<RouteId, ReactNode>> = {
  profile: <p>Your Profile: identity, contact, Work Authorization per country, Self-ID Answers, Resumes.</p>,
  'saved-answers': <p>Answers you accepted, reused when a question matches word for word.</p>,
  tracker: <p>Your Applications, with Status and Snapshot.</p>,
  settings: <p>Provider, models, export and import.</p>,
};

export function Dashboard() {
  const [route, setRoute] = useState<RouteId>(() => routeFromHash(location.hash));

  useEffect(() => {
    const onHashChange = () => {
      setRoute(routeFromHash(location.hash));
    };
    window.addEventListener('hashchange', onHashChange);
    return () => {
      window.removeEventListener('hashchange', onHashChange);
    };
  }, []);

  const current = ROUTES.find((r) => r.id === route) ?? ROUTES[0];

  return (
    <div
      data-testid="dashboard"
      style={{ display: 'grid', gridTemplateColumns: '200px 1fr', minHeight: '100vh' }}
    >
      <nav aria-label="Dashboard" style={{ borderRight: '1px solid var(--border)', padding: 16 }}>
        {ROUTES.map((r) => (
          <a
            key={r.id}
            href={`#${r.id}`}
            aria-current={r.id === route ? 'page' : undefined}
            style={{
              display: 'block',
              padding: '6px 0',
              color: 'inherit',
              fontWeight: r.id === route ? 600 : 400,
            }}
          >
            {r.title}
          </a>
        ))}
      </nav>
      <main data-testid={`view-${route}`} style={{ padding: 24 }}>
        <h1 style={{ marginTop: 0 }}>{current.title}</h1>
        {VIEWS[route]}
      </main>
    </div>
  );
}
