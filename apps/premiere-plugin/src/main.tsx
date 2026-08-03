import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { createMockPanelHost } from './host/mock-panel-host';
import { createPremierePanelHost } from './host/premiere-uxp-adapter';
import './styles.css';

async function boot() {
  const productionHost = await createPremierePanelHost();
  const allowMock = import.meta.env.DEV || import.meta.env.VITE_EDITVCS_ALLOW_MOCK === 'true';

  const host = productionHost.project
    ? productionHost
    : allowMock
    ? createMockPanelHost({ tracked: true })
    : productionHost;

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App host={host} />
    </React.StrictMode>,
  );
}

void boot();
