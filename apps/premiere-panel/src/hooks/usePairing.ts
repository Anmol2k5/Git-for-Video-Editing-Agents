import { useState, useEffect, useCallback } from 'react';
import { companionClient as client, COMPANION_PORT } from '../engine';

export function usePairing(addActivity: (msg: string) => void) {
  const [sessionToken, setSessionToken] = useState<string | null>(() => {
    return typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('editvcs_session_token') : null;
  });
  const [pairingId, setPairingId] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState("");
  const [pairingError, setPairingError] = useState<string | null>(null);
  const [pairingTimeLeft, setPairingTimeLeft] = useState(0);

  useEffect(() => {
    client.sessionToken = sessionToken;
    if (typeof sessionStorage !== 'undefined') {
      if (sessionToken) {
        sessionStorage.setItem('editvcs_session_token', sessionToken);
      } else {
        sessionStorage.removeItem('editvcs_session_token');
      }
    }
  }, [sessionToken]);

  useEffect(() => {
    client.onUnauthorized = () => {
      setSessionToken(null);
      setPairingError("Session expired or companion restarted. Pair again.");
    };
    return () => {
      client.onUnauthorized = undefined;
    };
  }, []);

  useEffect(() => {
    if (pairingTimeLeft <= 0) return;
    const timer = setInterval(() => {
      setPairingTimeLeft(prev => {
        if (prev <= 1) {
          setPairingId(null);
          setPairingError("Pairing session expired. Please start pairing again.");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [pairingTimeLeft]);

  const handleStartPairing = useCallback(async () => {
    setPairingError(null);
    setPairingCode("");
    const res = await client.startPairing();
    if (res) {
      setPairingId(res.pairingId);
      const remainingSecs = Math.max(0, Math.round((res.expiresAt - Date.now()) / 1000));
      setPairingTimeLeft(remainingSecs);
      addActivity("Pairing started. Enter the code shown in the companion.");
    } else {
      setPairingError("Failed to initiate pairing. Verify companion is running.");
    }
  }, [addActivity]);

  const handleCompletePairing = useCallback(async () => {
    if (!pairingId || !pairingCode) return;
    setPairingError(null);
    const success = await client.completePairing(pairingId, pairingCode);
    if (success) {
      setSessionToken(client.sessionToken);
      setPairingId(null);
      addActivity("Pairing completed. Panel successfully authenticated.");
    } else {
      setPairingError("Invalid code or too many invalid attempts.");
    }
  }, [pairingId, pairingCode, addActivity]);

  const handleDisconnect = useCallback(async () => {
    if (sessionToken) {
      try {
        await fetch(`http://127.0.0.1:${COMPANION_PORT}/sessions/revoke`, {
          method: "POST",
          headers: { authorization: `Bearer ${sessionToken}` }
        });
      } catch (err) {
        console.warn('Session revoke failed:', err);
      }
    }
    setSessionToken(null);
    addActivity("Session revoked. Disconnected.");
  }, [sessionToken, addActivity]);

  return {
    sessionToken,
    setSessionToken,
    pairingId,
    setPairingId,
    pairingCode,
    setPairingCode,
    pairingError,
    setPairingError,
    pairingTimeLeft,
    handleStartPairing,
    handleCompletePairing,
    handleDisconnect
  };
}
