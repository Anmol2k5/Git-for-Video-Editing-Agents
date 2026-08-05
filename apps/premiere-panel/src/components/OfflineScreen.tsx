import React from 'react';
import { RefreshCw, AlertTriangle } from 'lucide-react';
import type { CompanionStatus } from '../engine';

interface OfflineScreenProps {
  status: CompanionStatus;
  onTryAgain: () => void;
}

export function OfflineScreen({ status, onTryAgain }: OfflineScreenProps) {
  return (
    <div className="flex h-screen flex-col items-center justify-center p-6 text-center bg-[var(--color-bg-base)] text-[var(--color-text-primary)]">
      {status === "reconnecting" ? (
        <>
          <RefreshCw size={28} className="text-[var(--color-accent)] mb-3 animate-spin" />
          <h3 className="text-sm font-semibold mb-1">Reconnecting...</h3>
          <p className="text-[11px] text-[var(--color-text-secondary)] max-w-[220px] mb-4">
            The companion service went offline. Restarting automatically...
          </p>
        </>
      ) : (
        <>
          <AlertTriangle size={36} className="text-[#f87171] mb-3 animate-pulse" />
          <h3 className="text-sm font-semibold mb-1">Companion Service Unavailable</h3>
          <p className="text-[11px] text-[var(--color-text-secondary)] max-w-[220px] mb-4">
            Auto-restart failed after multiple attempts. Check companion logs at <span className="font-mono text-[10px]">%APPDATA%/EditVCS/logs/</span>.
          </p>
          <button className="btn btn-primary" onClick={onTryAgain}>
            <RefreshCw size={12} className="mr-1.5" /> Try Again
          </button>
        </>
      )}
    </div>
  );
}
