import { useState } from 'react';
import type { ProjectVersion } from '../engine';
import { companionClient as client } from '../engine';
import { getErrorMessage } from '../utils';

export type DiffResultData = {
  confidence: string;
  summary: string[];
  groups: Array<{ title: string; items: string[] }>;
  unsupported: string[];
};

export function useDiff(currentProjectId: string | null) {
  const [diffVersionFrom, setDiffVersionFrom] = useState<ProjectVersion | null>(null);
  const [diffVersionTo, setDiffVersionTo] = useState<ProjectVersion | null>(null);
  const [diffResult, setDiffResult] = useState<DiffResultData | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffError, setDiffError] = useState<string | null>(null);

  const handleCompare = async (from: ProjectVersion, to: ProjectVersion) => {
    setDiffVersionFrom(from);
    setDiffVersionTo(to);
    setDiffLoading(true);
    setDiffError(null);
    setDiffResult(null);

    try {
      if (!currentProjectId) {
        setDiffError("No project ID available for comparison.");
        return;
      }
      const result = await client.getChanges(currentProjectId, from.id, to.id);
      if (!result) {
        setDiffError("Failed to fetch changes comparison.");
      } else {
        setDiffResult(result);
      }
    } catch (err: unknown) {
      setDiffError(getErrorMessage(err));
    } finally {
      setDiffLoading(false);
    }
  };

  const clearDiff = () => {
    setDiffVersionFrom(null);
    setDiffVersionTo(null);
    setDiffResult(null);
    setDiffError(null);
  };

  return {
    diffVersionFrom,
    diffVersionTo,
    diffResult,
    diffLoading,
    diffError,
    handleCompare,
    clearDiff
  };
}
