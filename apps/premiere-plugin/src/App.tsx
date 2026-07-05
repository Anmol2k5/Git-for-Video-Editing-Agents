import React, { useState } from 'react';

export function App({ host }: { host: any }) {
  const [showSaveDialog, setShowSaveDialog] = useState(false);

  if (!host.project) {
    return (
      <div>
        <p>Open a Premiere project to start protecting your edits.</p>
        <button disabled>Create Save Point</button>
      </div>
    );
  }

  if (!host.tracked) {
    return (
      <div>
        <p>EditVCS saves project versions, not your footage.</p>
        <button>Start version history</button>
      </div>
    );
  }

  return (
    <div>
      <button onClick={() => setShowSaveDialog(true)}>Create Save Point</button>
      {showSaveDialog && (
        <div role="dialog">
          <label htmlFor="save-point-name">Save point name</label>
          <input id="save-point-name" />
        </div>
      )}
    </div>
  );
}
