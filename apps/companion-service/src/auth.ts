import type { Request, Response, NextFunction } from "express";
import { sessionManager } from "./sessions";

export function createAuthenticator() {
  return function authenticate(req: Request, res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Missing or invalid authorization header" } });
    }
    
    const token = authHeader.substring(7);
    if (!sessionManager.isValid(token)) {
      return res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Session invalid or expired" } });
    }
    
    next();
  };
}
