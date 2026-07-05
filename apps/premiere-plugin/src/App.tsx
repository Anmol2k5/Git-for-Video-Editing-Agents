import React, { useState } from 'react';
import { FirstRunState } from './components/FirstRunState';
import { NoProjectState } from './components/NoProjectState';
import { SavePointDialog } from './components/SavePointDialog';
import { TrackedProjectState } from './components/TrackedProjectState';

export function App({ host }: { host: any }) {
  const [showSaveDialog, setShowSaveDialog] = useState(false);

  if (!host.project) {
    return <NoProjectState />;
  }

  if (!host.tracked) {
    return <FirstRunState />;
  }

  return (
    <>
      <TrackedProjectState host={host} onCreateSavePoint={() => setShowSaveDialog(true)} />
      {showSaveDialog && <SavePointDialog />}
    </>
  );
}
