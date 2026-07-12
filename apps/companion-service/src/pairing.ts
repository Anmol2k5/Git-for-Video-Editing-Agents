import { randomInt, randomUUID, timingSafeEqual, createHash } from "node:crypto";
import { sessionManager } from "./sessions";

export interface PairingCodePresenter {
  showCode(code: string, expiresAt: number): Promise<void>;
  clearCode(): Promise<void>;
}

export class ConsolePairingPresenter implements PairingCodePresenter {
  async showCode(code: string, expiresAt: number): Promise<void> {
    console.log(`\n\n=== EDITVCS PAIRING CODE ===\nCode: ${code}\nExpires in 60 seconds.\n============================\n\n`);
  }
  async clearCode(): Promise<void> {
    // No-op for console
  }
}

interface PairingRecord {
  pairingId: string;
  codeHash: string;
  codeForTest?: string;
  expiresAt: number;
  attemptsRemaining: number;
}

const PAIRING_EXPIRY_MS = 60 * 1000; // 60 seconds
const MAX_ATTEMPTS = 5;
const pairings = new Map<string, PairingRecord>();

// Sliding window timestamps for /pair/start rate limiting
let pairStartTimestamps: number[] = [];

function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

export const pairingService = {
  presenter: new ConsolePairingPresenter() as PairingCodePresenter,

  // Exposed for tests/admin
  getPairingsCount(): number {
    this.cleanupExpired();
    return pairings.size;
  },

  getPairingCodeForTest(pairingId: string): string | undefined {
    return pairings.get(pairingId)?.codeForTest;
  },

  cleanupExpired(): void {
    const now = Date.now();
    for (const [id, record] of pairings.entries()) {
      if (now > record.expiresAt) {
        pairings.delete(id);
      }
    }
  },

  // Invalidate all pending codes (used during companion restart/reset)
  reset(): void {
    pairings.clear();
    pairStartTimestamps = [];
  },

  startPairing(): { pairingId: string; expiresAt: number } {
    const now = Date.now();

    // 1. Process-wide /pair/start rate limit (5 requests per minute)
    pairStartTimestamps = pairStartTimestamps.filter(t => now - t < 60000);
    if (pairStartTimestamps.length >= 5) {
      throw new Error("Too many pairing attempts. Please wait a minute before trying again.");
    }
    pairStartTimestamps.push(now);

    // 2. Cleanup expired sessions
    this.cleanupExpired();

    // 3. Limit to max 3 active pairing sessions
    if (pairings.size >= 3) {
      throw new Error("Too many active pairing sessions. Please wait for existing ones to expire.");
    }

    const code = randomInt(0, 1000000).toString().padStart(6, "0");
    const pairingId = randomUUID();
    const expiresAt = now + PAIRING_EXPIRY_MS;

    pairings.set(pairingId, {
      pairingId,
      codeHash: hashCode(code),
      codeForTest: code,
      expiresAt,
      attemptsRemaining: MAX_ATTEMPTS
    });

    // Show the code through presenter (console/terminal for dev)
    this.presenter.showCode(code, expiresAt).catch(console.error);

    // Do NOT return the code in the response
    return { pairingId, expiresAt };
  },

  completePairing(pairingId: string, code: string): { sessionToken: string; expiresAt: number } {
    this.cleanupExpired();

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
      const remaining = record.attemptsRemaining;
      if (remaining <= 0) {
        pairings.delete(pairingId);
        throw new Error("Too many failed attempts. Start a new pairing session.");
      }
      throw new Error(`Invalid code. ${remaining} attempts remaining.`);
    }

    // Success: delete record immediately
    pairings.delete(pairingId);
    this.presenter.clearCode().catch(console.error);

    // Return consistent naming
    return sessionManager.createSession();
  }
};
