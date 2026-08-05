import React from 'react';
import { Shield, Key } from 'lucide-react';

interface PairingScreenProps {
  pairingId: string | null;
  pairingCode: string;
  pairingError: string | null;
  pairingTimeLeft: number;
  onCodeChange: (code: string) => void;
  onCompletePairing: () => void;
  onCancelPairing: () => void;
  onStartAuthenticate: () => void;
}

export function PairingScreen({
  pairingId,
  pairingCode,
  pairingError,
  pairingTimeLeft,
  onCodeChange,
  onCompletePairing,
  onCancelPairing,
  onStartAuthenticate
}: PairingScreenProps) {
  return (
    <div className="flex h-screen flex-col p-6 bg-[var(--color-bg-base)] text-[var(--color-text-primary)]">
      <div className="flex items-center gap-2 mb-6">
        <div className="w-6 h-6 rounded-md flex items-center justify-center text-xs font-black bg-[var(--color-accent)] text-[var(--color-bg-base)]">
          E
        </div>
        <span className="text-sm font-bold tracking-tight">EditVCS Pairing</span>
      </div>

      {pairingId ? (
        <div className="flex-1 flex flex-col justify-center">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-secondary)] mb-2">
            Enter Pairing Code
          </h3>
          <p className="text-[11px] text-[var(--color-text-muted)] mb-4">
            Enter the 6-digit pairing code printed in the companion's terminal window.
          </p>
          
          <input
            type="text"
            className="input text-center text-lg font-mono tracking-widest mb-3 h-[44px]"
            maxLength={6}
            placeholder="000000"
            value={pairingCode}
            onChange={(e) => onCodeChange(e.target.value.replace(/\D/g, ''))}
          />

          {pairingError && (
            <p className="text-[11px] text-[#f87171] mb-3">{pairingError}</p>
          )}

          <p className="text-[10px] text-[var(--color-text-muted)] mb-4 text-center">
            Expires in: <span className="font-bold text-[var(--color-accent)]">{pairingTimeLeft}s</span>
          </p>

          <div className="flex gap-2">
            <button className="btn btn-ghost flex-1 h-[36px]" onClick={onCancelPairing}>
              Cancel
            </button>
            <button
              className="btn btn-primary flex-1 h-[36px]"
              disabled={pairingCode.length !== 6}
              onClick={onCompletePairing}
            >
              Pair Panel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col justify-center items-center text-center">
          <Shield size={32} className="text-[var(--color-accent)] mb-3 opacity-80" />
          <h3 className="text-sm font-semibold mb-1">Authorization Required</h3>
          <p className="text-[11px] text-[var(--color-text-secondary)] max-w-[200px] mb-6">
            The companion service session expired or was disconnected.
          </p>
          {pairingError && (
            <p className="text-[11px] text-[#f87171] mb-3 max-w-[220px]">{pairingError}</p>
          )}
          <button
            className="btn btn-primary w-full h-[44px]"
            onClick={onStartAuthenticate}
          >
            <Key size={14} /> Start & Authenticate
          </button>
        </div>
      )}
    </div>
  );
}
