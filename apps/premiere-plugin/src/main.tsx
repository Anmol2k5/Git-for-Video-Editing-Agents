import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { createMockPanelHost } from './host/mock-panel-host';
import { createPremierePanelHost } from './host/premiere-uxp-adapter';
import './styles.css';

async function boot() {
  const productionHost = await createPremierePanelHost();
  const host = productionHost.project
    ? productionHost
    : createMockPanelHost({ tracked: true });

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App host={host} />
    </React.StrictMode>,
  );
}

void boot();
