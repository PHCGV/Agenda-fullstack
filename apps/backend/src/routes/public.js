import express from "express";
import { prisma } from "../db/prisma.js";
import { config } from "../config/env.js";
import { sendError, sendOk } from "../utils/http.js";
import { buildSlots, filterConflicts } from "../utils/availability.js";
import { addMinutes, toUtcDate } from "../utils/time.js";

const router = express.Router();

function getDayRange(dateString) {
  const start = toUtcDate(dateString, "00:00");
  const end = toUtcDate(dateString, "23:59");
  return { start, end };
}

async function resolveProfessional(professionalId) {
  if (professionalId) {
    return prisma.user.findUnique({ where: { id: professionalId } });
  }

  return prisma.user.findFirst({
    where: { role: { in: ["PROFESSIONAL", "ADMIN"] } }
  });
}

router.get("/professionals", async (req, res, next) => {
  try {
    const professionals = await prisma.user.findMany({
      where: { role: { in: ["PROFESSIONAL", "ADMIN"] } },
      select: { id: true, name: true, email: true }
    });

    return sendOk(res, professionals);
  } catch (error) {
    return next(error);
  }
});

router.get("/availability", async (req, res, next) => {
  try {
    const date = req.query.date;
    const professionalId = req.query.professionalId;

    if (!date || typeof date !== "string") {
      return sendError(res, 400, "Date is required (YYYY-MM-DD)");
    }

    const parsedDate = new Date(`${date}T00:00:00Z`);
    if (Number.isNaN(parsedDate.getTime())) {
      return sendError(res, 400, "Invalid date format");
    }

    const professional = await resolveProfessional(
      typeof professionalId === "string" ? professionalId : undefined
    );
    if (!professional) {
      return sendError(res, 404, "Professional not found");
    }

    const dayOfWeek = parsedDate.getUTCDay();
    const rules = await prisma.availabilityRule.findMany({
      where: {
        dayOfWeek,
        isActive: true,
        OR: [{ userId: professional.id }, { userId: null }]
      }
    });

    const slots = buildSlots(date, rules, {
      startTime: config.defaultWorkStart,
      endTime: config.defaultWorkEnd,
      slotMinutes: config.defaultSlotMinutes
    });

    const { start, end } = getDayRange(date);
    const appointments = await prisma.appointment.findMany({
      where: {
        professionalId: professional.id,
        status: { not: "CANCELED" },
        startAt: { lt: end },
        endAt: { gt: start }
      },
      select: { startAt: true, endAt: true }
    });

    const available = filterConflicts(slots, appointments).map((slot) => ({
      startAt: slot.startAt.toISOString(),
      endAt: slot.endAt.toISOString()
    }));

    return sendOk(res, {
      professional: {
        id: professional.id,
        name: professional.name
      },
      slots: available
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/appointments", async (req, res, next) => {
  try {
    const { client, startAt, professionalId, notes } = req.body ?? {};
    if (!client?.name || !client?.email || !startAt) {
      return sendError(res, 400, "Client name, email, and startAt are required");
    }

    if (!client.email.includes("@")) {
      return sendError(res, 400, "Invalid email");
    }

    const professional = await resolveProfessional(professionalId);
    if (!professional) {
      return sendError(res, 404, "Professional not found");
    }

    const startDate = new Date(startAt);
    if (Number.isNaN(startDate.getTime())) {
      return sendError(res, 400, "Invalid startAt" );
    }

    const endDate = addMinutes(startDate, config.defaultSlotMinutes);
    const dateKey = startDate.toISOString().slice(0, 10);

    const availability = await prisma.availabilityRule.findMany({
      where: {
        dayOfWeek: startDate.getUTCDay(),
        isActive: true,
        OR: [{ userId: professional.id }, { userId: null }]
      }
    });

    const slots = buildSlots(dateKey, availability, {
      startTime: config.defaultWorkStart,
      endTime: config.defaultWorkEnd,
      slotMinutes: config.defaultSlotMinutes
    });

    const slotMatch = slots.find(
      (slot) => slot.startAt.getTime() === startDate.getTime()
    );
    if (!slotMatch) {
      return sendError(res, 400, "Selected time is outside availability");
    }

    const conflict = await prisma.appointment.findFirst({
      where: {
        professionalId: professional.id,
        status: { not: "CANCELED" },
        startAt: { lt: endDate },
        endAt: { gt: startDate }
      }
    });

    if (conflict) {
      return sendError(res, 409, "Slot already booked");
    }

    const appointment = await prisma.$transaction(async (tx) => {
      const savedClient = await tx.client.upsert({
        where: { email: client.email },
        update: { name: client.name, phone: client.phone ?? null },
        create: {
          name: client.name,
          email: client.email,
          phone: client.phone ?? null
        }
      });

      return tx.appointment.create({
        data: {
          clientId: savedClient.id,
          professionalId: professional.id,
          startAt: startDate,
          endAt: endDate,
          notes: notes ?? null
        },
        include: {
          client: { select: { name: true, email: true } },
          professional: { select: { name: true } }
        }
      });
    });

    return sendOk(res, appointment);
  } catch (error) {
    return next(error);
  }
});

export default router;
