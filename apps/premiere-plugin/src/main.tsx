import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { createMockPanelHost } from './host/mock-panel-host';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App host={createMockPanelHost({ tracked: true })} />
  </React.StrictMode>,
);
