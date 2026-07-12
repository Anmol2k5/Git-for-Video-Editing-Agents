import { randomBytes, createHash } from "node:crypto";

interface SessionRecord {
  tokenHash: string;
  expiresAt: number;
}

const SESSION_DURATION_MS = 8 * 60 * 60 * 1000; // 8 hours
const sessions = new Map<string, SessionRecord>(); // tokenHash -> SessionRecord

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export const sessionManager = {
  // Clear all sessions (used on companion restart)
  reset(): void {
    sessions.clear();
  },

  createSession(): { sessionToken: string; expiresAt: number } {
    const sessionToken = randomBytes(32).toString("base64url");
    const expiresAt = Date.now() + SESSION_DURATION_MS;
    
    sessions.set(hashToken(sessionToken), {
      tokenHash: hashToken(sessionToken),
      expiresAt
    });
    
    return { sessionToken, expiresAt };
  },
  
  isValid(token: string): boolean {
    const record = sessions.get(hashToken(token));
    if (!record) return false;
    
    if (Date.now() > record.expiresAt) {
      sessions.delete(record.tokenHash);
      return false;
    }
    
    return true;
  },
  
  refresh(token: string): { sessionToken: string; expiresAt: number } | null {
    if (!this.isValid(token)) return null;
    
    // Revoke the old token (rotation)
    this.revoke(token);
    // Create and return a new session
    return this.createSession();
  },
  
  revoke(token: string): void {
    sessions.delete(hashToken(token));
  }
};
