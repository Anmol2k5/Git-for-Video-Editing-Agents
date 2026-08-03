import { useState } from 'react';
import type { ProjectVersion } from '../engine';
import { companionClient as client } from '../engine';
import { getErrorMessage } from '../utils';

export function useRestoreFlow(addActivity: (msg: string) => void) {
  const [restoringVersion, setRestoringVersion] = useState<ProjectVersion | null>(null);
  const [restoreDest, setRestoreDest] = useState("");
  const [restoreProgress, setRestoreProgress] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  const handleOpenRestoreConfirm = (v: ProjectVersion, projectPath?: string) => {
    setRestoringVersion(v);
    setRestoreError(null);
    if (projectPath) {
      const parentPath = projectPath.substring(0, Math.max(projectPath.lastIndexOf('/'), projectPath.lastIndexOf('\\')) + 1);
      setRestoreDest(parentPath);
    } else {
      setRestoreDest("");
    }
  };

  const handleConfirmRestore = async () => {
    if (!restoringVersion || !restoreDest) return;
    setRestoreProgress(true);
    setRestoreError(null);

    try {
      const restoredPath = await client.restore(restoringVersion, restoreDest);
      if (!restoredPath) {
        setRestoreError("Restore failed. Verify destination folder is writable and folder path is correct.");
      } else {
        addActivity(`Restore copy created: ${restoredPath.split(/[\\/]/).pop()}`);
        setRestoringVersion(null);
      }
    } catch (err: unknown) {
      setRestoreError(getErrorMessage(err));
    } finally {
      setRestoreProgress(false);
    }
  };

  return {
    restoringVersion,
    setRestoringVersion,
    restoreDest,
    setRestoreDest,
    restoreProgress,
    restoreError,
    handleOpenRestoreConfirm,
    handleConfirmRestore
  };
}
