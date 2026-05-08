import express from "express";
import { prisma } from "../db/prisma.js";
import { sendError, sendOk } from "../utils/http.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = express.Router();

router.use(requireAuth);
router.use(requireRole("ADMIN"));

router.get("/appointments", async (req, res, next) => {
  try {
    const from = typeof req.query.from === "string" ? req.query.from : null;
    const to = typeof req.query.to === "string" ? req.query.to : null;

    const fromDate = from ? new Date(from) : new Date();
    const toDate = to
      ? new Date(to)
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
      return sendError(res, 400, "Invalid date range");
    }

    const appointments = await prisma.appointment.findMany({
      where: {
        startAt: { lt: toDate },
        endAt: { gt: fromDate }
      },
      orderBy: { startAt: "asc" },
      include: {
        client: { select: { name: true, email: true, phone: true } },
        professional: { select: { name: true, email: true } }
      }
    });

    return sendOk(res, appointments);
  } catch (error) {
    return next(error);
  }
});

router.patch("/appointments/:id/status", async (req, res, next) => {
  try {
    const { status, reason } = req.body ?? {};
    if (!status) {
      return sendError(res, 400, "Status is required");
    }

    const allowed = [
      "SCHEDULED",
      "CONFIRMED",
      "CANCELED",
      "COMPLETED",
      "PENDING"
    ];

    if (!allowed.includes(status)) {
      return sendError(res, 400, "Invalid status" );
    }

    const updates = {
      status,
      cancellationReason: status === "CANCELED" ? reason ?? null : null,
      confirmedAt: status === "CONFIRMED" ? new Date() : null,
      canceledAt: status === "CANCELED" ? new Date() : null,
      completedAt: status === "COMPLETED" ? new Date() : null
    };

    const appointment = await prisma.appointment.update({
      where: { id: req.params.id },
      data: updates,
      include: {
        client: { select: { name: true, email: true, phone: true } },
        professional: { select: { name: true, email: true } }
      }
    });

    return sendOk(res, appointment);
  } catch (error) {
    return next(error);
  }
});

router.post("/availability", async (req, res, next) => {
  try {
    const { rules, userId } = req.body ?? {};
    if (!Array.isArray(rules) || rules.length === 0) {
      return sendError(res, 400, "Rules array is required");
    }

    const normalized = rules.map((rule) => ({
      dayOfWeek: Number(rule.dayOfWeek),
      startTime: rule.startTime,
      endTime: rule.endTime,
      slotMinutes: Number(rule.slotMinutes ?? 60),
      isActive: rule.isActive !== false,
      userId: userId ?? null
    }));

    if (normalized.some((rule) => Number.isNaN(rule.dayOfWeek))) {
      return sendError(res, 400, "Invalid dayOfWeek value" );
    }

    await prisma.$transaction(async (tx) => {
      await tx.availabilityRule.deleteMany({
        where: { userId: userId ?? null }
      });
      await tx.availabilityRule.createMany({ data: normalized });
    });

    return sendOk(res, { ok: true });
  } catch (error) {
    return next(error);
  }
});

export default router;
