import React from 'react';

interface HeaderProps {
  onDisconnect: () => void;
}

export function Header({ onDisconnect }: HeaderProps) {
  return (
    <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-surface)' }}>
      <div className="flex items-center gap-2">
        <div className="w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-black bg-[var(--color-accent)] text-[var(--color-bg-base)]">
          E
        </div>
        <span className="text-sm font-semibold tracking-tight">EditVCS</span>
      </div>
      <button
        className="text-[10px] text-[var(--color-text-secondary)] hover:text-white uppercase tracking-wider font-semibold focus:outline-none"
        onClick={onDisconnect}
      >
        Disconnect
      </button>
    </div>
  );
}
