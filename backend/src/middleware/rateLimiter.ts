import rateLimit from "express-rate-limit";
import { config } from "../config";
import { Request, Response, NextFunction } from "express";

const bypassInTest = (limiter: any) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (process.env.NODE_ENV === "test" || config.nodeEnv === "test") {
      return next();
    }
    return limiter(req, res, next);
  };
};

export const authRateLimiter = bypassInTest(
  rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 30, // 30 attempts per IP per 15 min
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many login/registration attempts. Please try again after 15 minutes." },
  })
);

export const orderRateLimiter = bypassInTest(
  rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 60, // 60 order submissions per hour per IP
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Order submission rate limit exceeded. Please wait a while before placing more orders." },
  })
);

export const generalApiLimiter = bypassInTest(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 500,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests. Please slow down." },
  })
);
