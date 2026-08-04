import { useState } from 'react';
import type { ProjectVersion } from '../engine';
import { ChevronRight, X, Layers, Video, Volume2, ShieldCheck, AlertCircle } from 'lucide-react';

export type DiffPanelProps = {
  diffVersionFrom: ProjectVersion;
  diffVersionTo: ProjectVersion;
  diffLoading: boolean;
  diffError: string | null;
  diffResult: {
    confidence: string;
    summary: string[];
    groups: Array<{
      title: string;
      items: string[];
      clipChanges?: Array<{
        type: 'added' | 'removed' | 'moved' | 'trimmed' | 'track-changed';
        clipName: string;
        trackType: 'video' | 'audio';
        trackIndex: number;
        detail: string;
      }>;
    }>;
    unsupported: string[];
  } | null;
  onClear: () => void;
};

export function DiffPanel({
  diffVersionFrom,
  diffVersionTo,
  diffLoading,
  diffError,
  diffResult,
  onClear
}: DiffPanelProps) {
  const [activeTab, setActiveTab] = useState<string>('all');

  const getConfidenceBadge = (confidence: string) => {
    switch (confidence) {
      case 'exact':
        return (
          <span className="inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <ShieldCheck size={10} /> Exact Match
          </span>
        );
      case 'high':
        return (
          <span className="inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
            <ShieldCheck size={10} /> High Confidence
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <AlertCircle size={10} /> Best-Effort Comparison
          </span>
        );
    }
  };

  const getChangeBadge = (type: string) => {
    switch (type) {
      case 'added':
        return <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300">ADDED</span>;
      case 'removed':
        return <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300">REMOVED</span>;
      case 'moved':
        return <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300">MOVED</span>;
      case 'trimmed':
        return <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300">TRIMMED</span>;
      case 'track-changed':
        return <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300">TRACK</span>;
      default:
        return <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-gray-500/20 text-gray-300">CHANGED</span>;
    }
  };

  return (
    <div className="p-3 rounded-lg border border-[var(--color-border)] mb-3 bg-[var(--color-bg-surface)] fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-2 pb-2 border-b border-[rgba(255,255,255,0.05)]">
        <div className="flex items-center gap-2">
          <h4 className="text-xs font-semibold text-[var(--color-text-primary)]">
            Comparing v{diffVersionFrom.versionNumber} → v{diffVersionTo.versionNumber}
          </h4>
          {diffResult && getConfidenceBadge(diffResult.confidence)}
        </div>
        <button
          className="text-[10px] text-[var(--color-text-muted)] hover:text-white flex items-center gap-1 btn-ghost px-1.5 py-0.5"
          onClick={onClear}
        >
          <X size={12} /> Clear
        </button>
      </div>

      {diffLoading ? (
        <p className="text-[11px] text-[var(--color-text-secondary)] py-2">Computing differences...</p>
      ) : diffError ? (
        <p className="text-[11px] text-[#f87171] py-2">{diffError}</p>
      ) : diffResult ? (
        <div className="space-y-3">
          {/* Summary Section */}
          {diffResult.summary.length > 0 ? (
            <div>
              <p className="text-[10px] uppercase font-bold tracking-wider text-[var(--color-text-muted)] mb-1">
                Summary of Changes
              </p>
              <ul className="space-y-1">
                {diffResult.summary.map((s, idx) => (
                  <li key={idx} className="text-[11px] text-[var(--color-text-secondary)] flex items-start gap-1.5">
                    <span className="text-[var(--color-accent)] shrink-0">•</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-[11px] text-[var(--color-text-muted)] italic">
              No structural sequence or clip changes detected between these versions.
            </p>
          )}

          {/* Group Tabs */}
          {diffResult.groups.length > 0 && (
            <div className="space-y-2 border-t border-[rgba(255,255,255,0.05)] pt-2">
              <div className="flex gap-1 border-b border-[rgba(255,255,255,0.05)] pb-1">
                <button
                  className={`text-[10px] px-2 py-0.5 rounded ${activeTab === 'all' ? 'bg-[var(--color-accent-dim)] text-[var(--color-accent)] font-bold' : 'text-[var(--color-text-muted)]'}`}
                  onClick={() => setActiveTab('all')}
                >
                  All Details
                </button>
                {diffResult.groups.map(g => (
                  <button
                    key={g.title}
                    className={`text-[10px] px-2 py-0.5 rounded flex items-center gap-1 ${activeTab === g.title ? 'bg-[var(--color-accent-dim)] text-[var(--color-accent)] font-bold' : 'text-[var(--color-text-muted)]'}`}
                    onClick={() => setActiveTab(g.title)}
                  >
                    {g.title === 'Sequences' && <Layers size={10} />}
                    {g.title === 'Video timeline' && <Video size={10} />}
                    {g.title === 'Audio timeline' && <Volume2 size={10} />}
                    {g.title}
                  </button>
                ))}
              </div>

              {/* Group items display */}
              {diffResult.groups
                .filter(g => activeTab === 'all' || activeTab === g.title)
                .map(g => (
                  <div key={g.title} className="bg-[var(--color-bg-base)] p-2 rounded border border-[rgba(255,255,255,0.03)]">
                    <p className="text-[10px] font-bold text-[var(--color-text-primary)] mb-1 flex items-center gap-1">
                      {g.title === 'Sequences' && <Layers size={10} />}
                      {g.title === 'Video timeline' && <Video size={10} />}
                      {g.title === 'Audio timeline' && <Volume2 size={10} />}
                      {g.title}
                    </p>
                    
                    {g.clipChanges && g.clipChanges.length > 0 ? (
                      <div className="space-y-1">
                        {g.clipChanges.map((change, idx) => (
                          <div key={idx} className="flex items-center justify-between text-[10px] py-0.5 border-b border-[rgba(255,255,255,0.02)] last:border-0">
                            <div className="flex items-center gap-1.5 truncate min-w-0">
                              {getChangeBadge(change.type)}
                              <span className="font-medium text-[var(--color-text-primary)] truncate">{change.clipName}</span>
                            </div>
                            <span className="text-[9px] text-[var(--color-text-muted)] shrink-0 ml-2 font-mono">{change.detail}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <ul className="space-y-0.5 text-[10px] text-[var(--color-text-secondary)]">
                        {g.items.map((item, idx) => (
                          <li key={idx} className="flex items-center gap-1">
                            <ChevronRight size={8} className="text-[var(--color-text-muted)] shrink-0" />
                            {item}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
            </div>
          )}

          {/* Unsupported Warnings */}
          {diffResult.unsupported.length > 0 && (
            <div className="border-t border-[rgba(255,255,255,0.05)] pt-1.5">
              {diffResult.unsupported.map((u, idx) => (
                <p key={idx} className="text-[10px] text-amber-400 font-semibold flex items-center gap-1">
                  <AlertCircle size={10} /> {u}
                </p>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
