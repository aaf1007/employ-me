import { browser } from 'wxt/browser';
import { styles } from './styles';

const GROUPS = [
  { id: 'filled', title: 'Filled', color: 'var(--filled)' },
  { id: 'needsReview', title: 'Needs your review', color: 'var(--review)' },
  { id: 'couldNotFill', title: "Couldn't fill", color: 'var(--failed)' },
] as const;

/** Stub. The side panel detects the Application Form, runs the Fill and lists every field's outcome. */
export function SidePanel() {
  const openDashboard = () => {
    void browser.tabs.create({ url: browser.runtime.getURL('/dashboard.html') });
  };

  return (
    <main data-testid="sidepanel" style={styles.main}>
      <header style={styles.header}>
        <h1 style={styles.title}>employ-me</h1>
        <button type="button" onClick={openDashboard}>
          Dashboard
        </button>
      </header>
      <button type="button" disabled style={styles.fill}>
        Fill
      </button>
      {GROUPS.map((group) => (
        <section key={group.id} data-testid={`outcome-${group.id}`}>
          <h2 style={{ ...styles.groupTitle, color: group.color }}>{group.title}</h2>
          <p style={styles.empty}>Nothing yet.</p>
        </section>
      ))}
    </main>
  );
}
