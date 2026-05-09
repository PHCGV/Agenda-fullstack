import { prisma } from "../db/prisma.js";
import { config } from "../config/env.js";
import { sendError, sendOk } from "../utils/http.js";
import {
  generateRefreshToken,
  hashRefreshToken,
  signAccessToken,
  verifyPassword
} from "../utils/auth.js";

export async function login(req, res) {
  try {
    const { email, password } = req.body ?? {};
    if (!email || !password) {
      return sendError(res, 400, "Email and password are required");
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return sendError(res, 401, "Invalid credentials");
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      return sendError(res, 401, "Invalid credentials");
    }

    const accessToken = signAccessToken(user);
    const refreshToken = generateRefreshToken();
    const tokenHash = hashRefreshToken(refreshToken);
    const expiresAt = new Date(
      Date.now() + config.refreshTokenDays * 24 * 60 * 60 * 1000
    );

    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt
      }
    });

    return sendOk(res, {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    return sendError(res, 500, "Unexpected error");
  }
}

export async function refresh(req, res) {
  try {
    const { refreshToken } = req.body ?? {};
    if (!refreshToken) {
      return sendError(res, 400, "Refresh token is required");
    }

    const tokenHash = hashRefreshToken(refreshToken);
    const storedToken = await prisma.refreshToken.findFirst({
      where: {
        tokenHash,
        revokedAt: null,
        expiresAt: { gt: new Date() }
      },
      include: { user: true }
    });

    if (!storedToken) {
      return sendError(res, 401, "Invalid refresh token");
    }

    const accessToken = signAccessToken(storedToken.user);
    return sendOk(res, { accessToken });
  } catch (error) {
    return sendError(res, 500, "Unexpected error");
  }
}

export async function logout(req, res) {
  try {
    const { refreshToken } = req.body ?? {};
    if (!refreshToken) {
      return sendError(res, 400, "Refresh token is required");
    }

    const tokenHash = hashRefreshToken(refreshToken);
    await prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() }
    });

    return sendOk(res, { ok: true });
  } catch (error) {
    return sendError(res, 500, "Unexpected error");
  }
}
