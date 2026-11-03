import { useState, useEffect, useCallback, useRef } from 'react';
import { companionClient as client } from '../engine';

export function usePairing(addActivity: (msg: string) => void) {
  const [sessionToken, updateSessionToken] = useState<string | null>(() => {
    return typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('editvcs_session_token') : null;
  });
  const [pairingId, setPairingId] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState("");
  const [pairingError, setPairingError] = useState<string | null>(null);
  const [pairingTimeLeft, setPairingTimeLeft] = useState(0);
  const generation = useRef(0);
  const expiresAt = useRef(0);
  const mounted = useRef(true);

  const setSessionToken = useCallback((token: string | null) => {
    client.sessionToken = token;
    if (typeof sessionStorage !== 'undefined') {
      if (token) sessionStorage.setItem('editvcs_session_token', token);
      else sessionStorage.removeItem('editvcs_session_token');
    }
    updateSessionToken(token);
  }, []);

  useEffect(() => {
    mounted.current = true;
    client.sessionToken = sessionToken;
    return () => {
      mounted.current = false;
      generation.current++;
      client.cancelAuthentication();
    };
    // Initial hydration precedes App's startup effect. Updates use the setter above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCancelPairing = useCallback(() => {
    generation.current++;
    client.cancelAuthentication();
    expiresAt.current = 0;
    setPairingId(null);
    setPairingCode("");
    setPairingTimeLeft(0);
    setPairingError(null);
  }, []);

  useEffect(() => {
    client.onUnauthorized = () => {
      handleCancelPairing();
      setSessionToken(null);
      setPairingError("Session expired or companion restarted. Pair again.");
    };
    return () => { client.onUnauthorized = undefined; };
  }, [handleCancelPairing, setSessionToken]);

  useEffect(() => {
    if (!pairingId) return;
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((expiresAt.current - Date.now()) / 1000));
      setPairingTimeLeft(remaining);
      if (remaining === 0) {
        handleCancelPairing();
        setPairingError("Pairing session expired. Please start pairing again.");
      }
    };
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [pairingId, handleCancelPairing]);

  const handleStartPairing = useCallback(async () => {
    handleCancelPairing();
    const request = generation.current;
    const res = await client.startPairing();
    if (!mounted.current || request !== generation.current) return;
    if (res && res.expiresAt > Date.now()) {
      expiresAt.current = res.expiresAt;
      setPairingId(res.pairingId);
      setPairingTimeLeft(Math.ceil((res.expiresAt - Date.now()) / 1000));
      addActivity("Pairing started. Enter the code shown in the companion.");
    } else {
      setPairingError("Failed to initiate pairing. Verify companion is running.");
    }
  }, [addActivity, handleCancelPairing]);

  const handleCompletePairing = useCallback(async () => {
    if (!pairingId || pairingCode.length !== 6 || expiresAt.current <= Date.now()) return;
    const request = ++generation.current;
    client.cancelAuthentication();
    setPairingError(null);
    const success = await client.completePairing(pairingId, pairingCode);
    if (!mounted.current || request !== generation.current) return;
    if (success) {
      setSessionToken(client.sessionToken);
      setPairingId(null);
      setPairingTimeLeft(0);
      addActivity("Pairing completed. Panel successfully authenticated.");
    } else {
      setPairingError("Invalid code or too many invalid attempts.");
    }
  }, [pairingId, pairingCode, addActivity, setSessionToken]);

  const handleDisconnect = useCallback(() => {
    handleCancelPairing();
    const request = generation.current;
    const revocation = client.disconnect();
    setSessionToken(null);
    addActivity("Disconnected. Session revocation requested.");
    void revocation.then(success => {
      if (mounted.current && request === generation.current && !client.sessionToken && !success) addActivity("Warning: Remote session revocation failed; the panel remains disconnected.");
    });
  }, [handleCancelPairing, setSessionToken, addActivity]);

  return {
    sessionToken, setSessionToken, pairingId, setPairingId, pairingCode, setPairingCode,
    pairingError, setPairingError, pairingTimeLeft, handleStartPairing,
    handleCancelPairing, handleCompletePairing, handleDisconnect
  };
}
