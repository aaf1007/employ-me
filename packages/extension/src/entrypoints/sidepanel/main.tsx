import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { SidePanel } from '../../ui/sidepanel/SidePanel';
import '../../ui/styles.css';
import '../../ui/sidepanel/sidepanel.css';

const root = document.getElementById('root');
if (root === null) throw new Error('sidepanel.html is missing #root');
createRoot(root).render(
  <StrictMode>
    <SidePanel />
  </StrictMode>,
);
