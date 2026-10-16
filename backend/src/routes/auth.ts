import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { repository, UserRole } from "../database";
import { generateToken, authenticateToken } from "../middleware/auth";
import { authRateLimiter } from "../middleware/rateLimiter";

const router = Router();

// Constant-time dummy hash to mitigate user enumeration timing attacks
const DUMMY_HASH = "$2b$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ012";

// POST /api/auth/register
router.post("/register", authRateLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password, name, role } = req.body;

    if (!email || typeof email !== "string" || !email.includes("@")) {
      res.status(400).json({ error: "A valid email address is required" });
      return;
    }

    if (!password || typeof password !== "string" || password.length < 6) {
      res.status(400).json({ error: "Password must be at least 6 characters long" });
      return;
    }

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      res.status(400).json({ error: "Name is required" });
      return;
    }

    const normalizedEmail = email.toLowerCase().trim();
    const existingUser = repository.getUserByEmail(normalizedEmail);
    if (existingUser) {
      res.status(400).json({ error: "An account with this email already exists" });
      return;
    }

    // Role sanitization: Never permit public self-registration of platform admin!
    let assignedRole: UserRole = "CUSTOMER";
    if (role === "SHOPKEEPER" || role === "SHOP_OWNER") {
      assignedRole = "SHOP_OWNER";
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);
    const userId = `usr-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;

    const createdUser = repository.createUser({
      id: userId,
      email: normalizedEmail,
      password_hash: passwordHash,
      name: name.trim(),
      global_role: assignedRole,
    });

    let shopId: string | undefined;

    // If registering as a shopkeeper, create their shop and OWNER membership
    if (assignedRole === "SHOP_OWNER") {
      shopId = `shop-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
      repository.createShop({
        id: shopId,
        name: `${name.trim()}'s Print Shop`,
        description: "Printing • Documents • Stationery",
        distance: "1.0 km",
        price_starting: "From ₹2",
        owner_id: userId,
        pricing_config_json: JSON.stringify({
          a4BwPrice: 2,
          a4ColourPrice: 5,
          a3BwPrice: 4,
          a3ColourPrice: 7,
          doubleSideDiscount: 1,
          bindingPrice: 20,
          laminationPrice: 10,
        }),
      });
    }

    const safeUser = {
      id: createdUser.id,
      email: createdUser.email,
      name: createdUser.name,
      role: createdUser.global_role as UserRole,
      shopId,
    };

    const token = generateToken(safeUser);

    res.status(201).json({
      token,
      user: safeUser,
      ...safeUser,
    });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// POST /api/auth/login
router.post("/login", authRateLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (!email || !password || typeof email !== "string" || typeof password !== "string") {
      res.status(400).json({ error: "Email and password are required" });
      return;
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = repository.getUserByEmail(normalizedEmail);

    const passwordToCompare = user?.password_hash || DUMMY_HASH;
    const isMatch = await bcrypt.compare(password, passwordToCompare);

    if (!user || !isMatch) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    const memberships = repository.getUserMemberships(user.id);
    const shopId = memberships[0]?.shop_id;

    const safeUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.global_role as UserRole,
      shopId,
    };

    const token = generateToken(safeUser);

    res.json({
      token,
      user: safeUser,
      ...safeUser,
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// GET /api/auth/me
router.get("/me", authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const user = repository.getUserById(req.user!.id);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const memberships = repository.getUserMemberships(user.id);
    const shop = memberships[0] ? repository.getShopById(memberships[0].shop_id) : undefined;

    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.global_role as UserRole,
      shopId: shop?.id,
      shop,
      memberships,
    });
  } catch (error) {
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
