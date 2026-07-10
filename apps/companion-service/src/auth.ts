import type { Request, Response, NextFunction } from "express";

export function createAuthenticator(getToken: () => string) {
  return function authenticate(req: Request, res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization;
    if (!authHeader || authHeader !== `Bearer ${getToken()}`) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    next();
  };
}
