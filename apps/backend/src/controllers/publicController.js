import { prisma } from "../db/prisma.js";
import { config } from "../config/env.js";
import { sendError, sendOk } from "../utils/http.js";
import { buildSlots, filterConflicts } from "../utils/availability.js";
import { filterBlockedSlots, isSlotBlocked } from "../utils/blockedPeriods.js";
import { addMinutes, toUtcDate } from "../utils/time.js";
import { buildReminderNotifications } from "../utils/notifications.js";

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

export async function listProfessionals(req, res) {
  try {
    const professionals = await prisma.user.findMany({
      where: { role: { in: ["PROFESSIONAL", "ADMIN"] } },
      select: { id: true, name: true, email: true }
    });

    return sendOk(res, professionals);
  } catch (error) {
    return sendError(res, 500, "Unexpected error");
  }
}

export async function getAvailability(req, res) {
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

    const blockedPeriods = await prisma.blockedPeriod.findMany({
      where: {
        OR: [{ userId: professional.id }, { userId: null }],
        OR: [
          { isRecurring: false, startAt: { lt: end }, endAt: { gt: start } },
          { isRecurring: true, dayOfWeek }
        ]
      }
    });

    const freeSlots = filterConflicts(slots, appointments);
    const available = filterBlockedSlots(freeSlots, blockedPeriods, date).map((slot) => ({
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
    return sendError(res, 500, "Unexpected error");
  }
}

export async function createAppointment(req, res) {
  try {
    const { client, startAt, professionalId, notes, spaceId } = req.body ?? {};
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
      return sendError(res, 400, "Invalid startAt");
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

    const blockedPeriods = await prisma.blockedPeriod.findMany({
      where: {
        OR: [{ userId: professional.id }, { userId: null }],
        OR: [
          { isRecurring: false, startAt: { lt: endDate }, endAt: { gt: startDate } },
          { isRecurring: true, dayOfWeek: startDate.getUTCDay() }
        ]
      }
    });

    if (isSlotBlocked(startDate, endDate, blockedPeriods, dateKey)) {
      return sendError(res, 409, "Selected time is blocked");
    }

    if (spaceId) {
      const space = await prisma.space.findUnique({ where: { id: spaceId } });
      if (!space || !space.isActive) {
        return sendError(res, 400, "Invalid space");
      }

      const spaceConflict = await prisma.appointment.findFirst({
        where: {
          spaceId,
          status: { not: "CANCELED" },
          startAt: { lt: endDate },
          endAt: { gt: startDate }
        }
      });

      if (spaceConflict) {
        return sendError(res, 409, "Space is unavailable");
      }
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

      const created = await tx.appointment.create({
        data: {
          clientId: savedClient.id,
          professionalId: professional.id,
          startAt: startDate,
          endAt: endDate,
          notes: notes ?? null,
          spaceId: spaceId ?? null
        },
        include: {
          client: { select: { name: true, email: true } },
          professional: { select: { name: true } }
        }
      });

      const reminders = buildReminderNotifications(created, config.reminderOffsets);
      if (reminders.length) {
        await tx.notification.createMany({
          data: reminders.map((reminder) => ({
            appointmentId: created.id,
            sendAt: reminder.sendAt,
            token: reminder.token
          }))
        });
      }

      return created;
    });

    return sendOk(res, appointment);
  } catch (error) {
    return sendError(res, 500, "Unexpected error");
  }
}

export async function confirmNotification(req, res) {
  try {
    const { token } = req.params;
    const notification = await prisma.notification.findUnique({
      where: { token },
      include: { appointment: true }
    });

    if (!notification) {
      return sendError(res, 404, "Notification not found");
    }

    const updated = await prisma.appointment.update({
      where: { id: notification.appointmentId },
      data: {
        status: "CONFIRMED",
        confirmedAt: new Date()
      }
    });

    return sendOk(res, { ok: true, appointment: updated });
  } catch (error) {
    return sendError(res, 500, "Unexpected error");
  }
}

export async function cancelNotification(req, res) {
  try {
    const { token } = req.params;
    const notification = await prisma.notification.findUnique({
      where: { token },
      include: { appointment: true }
    });

    if (!notification) {
      return sendError(res, 404, "Notification not found");
    }

    const updated = await prisma.appointment.update({
      where: { id: notification.appointmentId },
      data: {
        status: "CANCELED",
        canceledAt: new Date()
      }
    });

    return sendOk(res, { ok: true, appointment: updated });
  } catch (error) {
    return sendError(res, 500, "Unexpected error");
  }
}
