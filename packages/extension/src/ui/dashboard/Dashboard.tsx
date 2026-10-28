import { useEffect, useState, type ReactNode } from 'react';
import { ToastProvider } from './common/ToastProvider';
import { StoreProvider } from './data/StoreProvider';
import { ProfileView } from './profile/ProfileView';
import { ResumesView } from './resumes/ResumesView';
import { ROUTES, routeFromHash, type RouteId } from './routes';
import { SavedAnswersView } from './saved-answers/SavedAnswersView';
import { SettingsView } from './settings/SettingsView';
import { SetupView } from './setup/SetupView';
import { TrackerView } from './tracker/TrackerView';

const VIEWS: Readonly<Record<RouteId, () => ReactNode>> = {
  setup: () => <SetupView />,
  profile: () => <ProfileView />,
  resumes: () => <ResumesView />,
  'saved-answers': () => <SavedAnswersView />,
  tracker: () => <TrackerView />,
  settings: () => <SettingsView />,
};

export function Dashboard() {
  const [route, setRoute] = useState<RouteId>(() => routeFromHash(location.hash));

  useEffect(() => {
    const onHashChange = () => {
      setRoute(routeFromHash(location.hash));
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', onHashChange);
    return () => {
      window.removeEventListener('hashchange', onHashChange);
    };
  }, []);

  return (
    <ToastProvider>
      <div data-testid="dashboard" className="shell">
        <nav aria-label="Dashboard" className="nav">
          <div className="nav-brand">employ-me</div>
          {ROUTES.map((r) => (
            <a key={r.id} href={`#${r.id}`} aria-current={r.id === route ? 'page' : undefined}>
              {r.title}
            </a>
          ))}
        </nav>
        <main data-testid={`view-${route}`} className="main">
          <StoreProvider>{VIEWS[route]()}</StoreProvider>
        </main>
      </div>
    </ToastProvider>
  );
}
