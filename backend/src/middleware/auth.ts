import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config";
import { UserRole } from "../database";

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: UserRole;
  name: string;
  shopId?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export function generateToken(user: { id: string; email: string; role: UserRole; name: string; shopId?: string }): string {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      shopId: user.shopId,
    },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn as any }
  );
}

export function isPlatformAdmin(role?: string): boolean {
  return role === "ADMIN" || role === "PLATFORM_ADMIN";
}

export function isShopOwner(role?: string): boolean {
  return role === "SHOP_OWNER" || role === "SHOPKEEPER";
}

export function isShopStaffOrOwner(role?: string): boolean {
  return isPlatformAdmin(role) || isShopOwner(role) || role === "SHOP_STAFF";
}

export function authenticateToken(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  let token: string | undefined;

  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.split(" ")[1];
  } else if (req.query.token && typeof req.query.token === "string") {
    // Permit token query parameter for authenticated document downloads
    token = req.query.token;
  }

  if (!token) {
    res.status(401).json({ error: "Authentication token required" });
    return;
  }

  try {
    const decoded = jwt.verify(token, config.jwtSecret) as AuthenticatedUser;
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }
}

export function optionalAuthenticateToken(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  let token: string | undefined;

  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.split(" ")[1];
  } else if (req.query.token && typeof req.query.token === "string") {
    token = req.query.token;
  }

  if (token) {
    try {
      const decoded = jwt.verify(token, config.jwtSecret) as AuthenticatedUser;
      req.user = decoded;
    } catch {
      // Ignored for optional auth
    }
  }

  next();
}

export function requireRoles(...allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const userRole = req.user.role;

    // Platform admin has universal access to admin endpoints
    if (isPlatformAdmin(userRole)) {
      next();
      return;
    }

    const matches = allowedRoles.some((role) => {
      if (role === "ADMIN" || role === "PLATFORM_ADMIN") return isPlatformAdmin(userRole);
      if (role === "SHOP_OWNER" || role === "SHOPKEEPER") return isShopOwner(userRole);
      return userRole === role;
    });

    if (!matches) {
      res.status(403).json({ error: "Forbidden: Insufficient permissions for this action" });
      return;
    }

    next();
  };
}
