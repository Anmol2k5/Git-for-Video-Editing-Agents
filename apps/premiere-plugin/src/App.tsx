import React, { useState } from 'react';
import { FirstRunState } from './components/FirstRunState';
import { NoProjectState } from './components/NoProjectState';
import { SavePointDialog } from './components/SavePointDialog';
import { TrackedProjectState } from './components/TrackedProjectState';

export function App({ host }: { host: any }) {
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
