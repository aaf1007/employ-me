import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Dashboard } from '../../ui/dashboard/Dashboard';
import '../../ui/styles.css';
import '../../ui/dashboard/dashboard.css';
import '../../ui/dashboard/forms.css';
import '../../ui/dashboard/feedback.css';
import '../../ui/dashboard/tracker.css';

const root = document.getElementById('root');
if (root === null) throw new Error('dashboard.html is missing #root');
createRoot(root).render(
  <StrictMode>
    <Dashboard />
  </StrictMode>,
);
