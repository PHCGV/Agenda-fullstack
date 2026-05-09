import fs from "node:fs";
import path from "node:path";

function loadEnvFile() {
  const envPath = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) {
    return;
  }

  const contents = fs.readFileSync(envPath, "utf-8");
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, equalsIndex).trim();
    const rawValue = trimmed.slice(equalsIndex + 1).trim();
    const value = rawValue.replace(/^"|"$/g, "");

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadEnvFile();

function requireValue(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

function parseCsvNumbers(value, fallback) {
  if (!value) return fallback;
  const numbers = value
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((item) => !Number.isNaN(item) && item > 0);
  return numbers.length ? numbers : fallback;
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: requireValue("DATABASE_URL"),
  jwtSecret: requireValue("JWT_SECRET"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "1h",
  refreshTokenDays: Number(process.env.REFRESH_TOKEN_DAYS ?? 14),
  frontendOrigin: process.env.FRONTEND_ORIGIN ?? "http://localhost:5173",
  publicApiUrl: process.env.PUBLIC_API_URL ?? "http://localhost:4000",
  defaultSlotMinutes: Number(process.env.DEFAULT_SLOT_MINUTES ?? 60),
  defaultWorkStart: process.env.DEFAULT_WORK_START ?? "09:00",
  defaultWorkEnd: process.env.DEFAULT_WORK_END ?? "17:00",
  reminderOffsets: parseCsvNumbers(process.env.REMINDER_OFFSETS_MINUTES, [1440, 60]),
  resendApiKey: process.env.RESEND_API_KEY ?? "",
  resendFrom: process.env.RESEND_FROM ?? "",
  cronSecret: process.env.CRON_SECRET ?? "",
  adminEmail: process.env.ADMIN_EMAIL ?? "",
  adminPassword: process.env.ADMIN_PASSWORD ?? "",
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  googleRedirectUri: process.env.GOOGLE_REDIRECT_URI ?? ""
};
