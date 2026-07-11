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
  createSession(): { token: string; expiresAt: number } {
    const token = randomBytes(32).toString("base64url");
    const expiresAt = Date.now() + SESSION_DURATION_MS;
    
    sessions.set(hashToken(token), {
      tokenHash: hashToken(token),
      expiresAt
    });
    
    return { token, expiresAt };
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
  
  refresh(token: string): { token: string; expiresAt: number } | null {
    if (!this.isValid(token)) return null;
    
    this.revoke(token);
    return this.createSession();
  },
  
  revoke(token: string): void {
    sessions.delete(hashToken(token));
  }
};
