import express from "express";
import { config } from "./config/env.js";
import authRoutes from "./routes/auth.js";
import publicRoutes from "./routes/public.js";
import adminRoutes from "./routes/admin.js";
import cronRoutes from "./routes/cron.js";

const app = express();

app.use(express.json());
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "86400");

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  return next();
});

function sendHealth(res) {
  return res.json({ ok: true, service: "consolium-backend" });
}

app.get("/", (_, res) => sendHealth(res));
app.get("/health", (_, res) => sendHealth(res));
app.get("/favicon.ico", (_, res) => res.sendStatus(204));

app.use("/api/auth", authRoutes);
app.use("/api/public", publicRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/cron", cronRoutes);

if (!process.env.VERCEL) {
  app.listen(config.port, () => {
    console.log(`Consolium API running on port ${config.port}`);
  });
}

export default app;
