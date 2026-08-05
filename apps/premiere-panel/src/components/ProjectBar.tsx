import React from 'react';
import { FileText, RefreshCw } from 'lucide-react';

interface ProjectBarProps {
  projectPath: string;
  projectName: string;
  onRefresh: () => void;
}

export function ProjectBar({ projectPath, projectName, onRefresh }: ProjectBarProps) {
  return (
    <div className="px-4 py-2 flex items-center justify-between" style={{ borderBottom: '1px solid var(--color-border)' }}>
      <div className="flex items-center gap-2 overflow-hidden min-w-0">
        <FileText size={14} style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
        <span className="text-xs font-medium truncate" title={projectPath || undefined}>{projectName}</span>
      </div>
      <div className="flex items-center gap-1">
        <button className="btn-icon focus:ring-1 focus:ring-[var(--color-accent)]" onClick={onRefresh} title="Refresh Project">
          <RefreshCw size={14} />
        </button>
      </div>
    </div>
  );
}
