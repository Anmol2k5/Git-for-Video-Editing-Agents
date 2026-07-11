import { randomInt, randomUUID, timingSafeEqual, createHash } from "node:crypto";
import { sessionManager } from "./sessions";

interface PairingRecord {
  pairingId: string;
  codeHash: string;
  expiresAt: number;
  attemptsRemaining: number;
}

const PAIRING_EXPIRY_MS = 60 * 1000; // 60 seconds
const MAX_ATTEMPTS = 5;
const pairings = new Map<string, PairingRecord>();

function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

export const pairingService = {
  startPairing(): { pairingId: string; expiresAt: number; code: string } {
    const code = randomInt(0, 1000000).toString().padStart(6, "0");
    const pairingId = randomUUID();
    const expiresAt = Date.now() + PAIRING_EXPIRY_MS;
    
    pairings.set(pairingId, {
      pairingId,
      codeHash: hashCode(code),
      expiresAt,
      attemptsRemaining: MAX_ATTEMPTS
    });
    
    console.log(`\n\n=== EDITVCS PAIRING CODE ===\nCode: ${code}\nExpires in 60 seconds.\n============================\n\n`);
    
    return { pairingId, expiresAt, code };
  },
  
  completePairing(pairingId: string, code: string): { sessionToken: string; expiresAt: number } {
    const record = pairings.get(pairingId);
    if (!record) {
      throw new Error("Pairing session not found or expired.");
    }
    
    if (Date.now() > record.expiresAt) {
      pairings.delete(pairingId);
      throw new Error("Pairing session expired.");
    }
    
    if (record.attemptsRemaining <= 0) {
      pairings.delete(pairingId);
      throw new Error("Too many failed attempts. Start a new pairing session.");
    }
    
    const inputHash = Buffer.from(hashCode(code));
    const expectedHash = Buffer.from(record.codeHash);
    
    if (inputHash.length !== expectedHash.length || !timingSafeEqual(inputHash, expectedHash)) {
      record.attemptsRemaining -= 1;
      throw new Error(`Invalid code. ${record.attemptsRemaining} attempts remaining.`);
    }
    
    pairings.delete(pairingId);
    return sessionManager.createSession();
  }
};
