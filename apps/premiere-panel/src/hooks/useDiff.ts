import { useState, useCallback, useEffect, useRef } from 'react';
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

  const generation = useRef(0);
  const clearDiff = useCallback(() => {
    generation.current++;
    setDiffVersionFrom(null);
    setDiffVersionTo(null);
    setDiffResult(null);
    setDiffError(null);
    setDiffLoading(false);
  }, []);
  useEffect(() => {
    clearDiff();
    return () => { generation.current++; };
  }, [currentProjectId, clearDiff]);

  const handleCompare = async (from: ProjectVersion, to: ProjectVersion) => {
    const request = ++generation.current;
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
      if (request !== generation.current) return;
      if (!result) {
        setDiffError("Failed to fetch changes comparison.");
      } else {
        setDiffResult(result);
      }
    } catch (err: unknown) {
      if (request === generation.current) setDiffError(getErrorMessage(err));
    } finally {
      if (request === generation.current) setDiffLoading(false);
    }
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
