import React, { useState } from 'react';
import type { HostCapabilities } from '@editvcs/shared-types';
import { FirstRunState } from './components/FirstRunState';
import { NoProjectState } from './components/NoProjectState';
import { SavePointDialog } from './components/SavePointDialog';
import { TrackedProjectState } from './components/TrackedProjectState';

export interface PanelHost {
  isMock?: boolean;
  project?: any;
  tracked?: boolean;
  companionConnected?: boolean;
  capabilities?: Partial<HostCapabilities> | Record<string, boolean | undefined>;
  snapshots?: any[];
  changes?: { summary?: string[]; unsupported?: string[] };
  streams?: string[];
}

export function App({ host }: { host: PanelHost }) {
  const [showSaveDialog, setShowSaveDialog] = useState(false);

  const demoBanner = host.isMock ? (
    <div style={{ background: '#b45309', color: '#ffffff', padding: '4px 8px', fontSize: '11px', fontWeight: 'bold', textAlign: 'center', letterSpacing: '0.05em' }}>
      DEMO DATA (MOCK MODE)
    </div>
  ) : null;

  if (!host.project) {
    return (
      <>
        {demoBanner}
        <NoProjectState />
      </>
    );
  }

  if (!host.tracked) {
    return (
      <>
        {demoBanner}
        <FirstRunState />
      </>
    );
  }

  return (
    <>
      {demoBanner}
      <TrackedProjectState host={host} onCreateSavePoint={() => setShowSaveDialog(true)} />
      {showSaveDialog && <SavePointDialog />}
    </>
  );
}
