import "express-session";

declare module "express-session" {
  interface SessionData {
    userId?: number;
    role?: string;
  }
}

declare global {
  namespace Express {
    interface Request {
      session: import("express-session").Session & Partial<import("express-session").SessionData>;
    }
  }
}