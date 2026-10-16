import { Request, Response, NextFunction } from "express";

export function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
  // Prevent browsers from MIME-sniffing the response
  res.setHeader("X-Content-Type-Options", "nosniff");

  // Prevent clickjacking by forbidding embedding in frames/iframes
  res.setHeader("X-Frame-Options", "DENY");

  // Disable browser legacy XSS auditor in favor of modern security headers
  res.setHeader("X-XSS-Protection", "0");

  // Referrer policy to prevent leaking referrers across origins
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");

  // Enforce HTTPS HSTS (1 year, subdomains)
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");

  // Feature / Permissions policy restricting sensitive device APIs
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");

  // Content Security Policy for API server preventing frame embedding
  res.setHeader("Content-Security-Policy", "default-src 'self'; frame-ancestors 'none';");

  next();
}
