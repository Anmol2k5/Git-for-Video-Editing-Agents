import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { createPanelHost } from './host/panel-host';
import './styles.css';

async function boot() {
  const host = await createPanelHost({
    demoMode: import.meta.env.VITE_EDITVCS_ALLOW_MOCK === 'true'
  });

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App host={host} />
    </React.StrictMode>,
  );
}

void boot();
