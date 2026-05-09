import { prisma } from "../db/prisma.js";
import { config } from "../config/env.js";
import { sendError, sendOk } from "../utils/http.js";
import { isTimeRangeValid } from "../utils/blockedPeriods.js";

export async function listAppointments(req, res) {
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
        professional: { select: { name: true, email: true } },
        space: { select: { id: true, name: true } }
      }
    });

    return sendOk(res, appointments);
  } catch (error) {
    return sendError(res, 500, "Unexpected error");
  }
}

export async function updateAppointmentStatus(req, res) {
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
      return sendError(res, 400, "Invalid status");
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
        professional: { select: { name: true, email: true } },
        space: { select: { id: true, name: true } }
      }
    });

    return sendOk(res, appointment);
  } catch (error) {
    return sendError(res, 500, "Unexpected error");
  }
}

export async function updateAppointmentSpace(req, res) {
  try {
    const { spaceId } = req.body ?? {};
    if (!spaceId) {
      return sendError(res, 400, "spaceId is required");
    }

    const appointment = await prisma.appointment.findUnique({
      where: { id: req.params.id }
    });
    if (!appointment) {
      return sendError(res, 404, "Appointment not found");
    }

    const space = await prisma.space.findUnique({ where: { id: spaceId } });
    if (!space || !space.isActive) {
      return sendError(res, 400, "Invalid space");
    }

    const conflict = await prisma.appointment.findFirst({
      where: {
        id: { not: appointment.id },
        spaceId,
        status: { not: "CANCELED" },
        startAt: { lt: appointment.endAt },
        endAt: { gt: appointment.startAt }
      }
    });

    if (conflict) {
      return sendError(res, 409, "Space is unavailable");
    }

    const updated = await prisma.appointment.update({
      where: { id: appointment.id },
      data: { spaceId }
    });

    return sendOk(res, updated);
  } catch (error) {
    return sendError(res, 500, "Unexpected error");
  }
}

export async function listAvailability(req, res) {
  try {
    const userId = typeof req.query.userId === "string" ? req.query.userId : null;
    const rules = await prisma.availabilityRule.findMany({
      where: { userId },
      orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }]
    });

    return sendOk(res, rules);
  } catch (error) {
    return sendError(res, 500, "Unexpected error");
  }
}

export async function updateAvailability(req, res) {
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
      return sendError(res, 400, "Invalid dayOfWeek value");
    }

    await prisma.$transaction(async (tx) => {
      await tx.availabilityRule.deleteMany({
        where: { userId: userId ?? null }
      });
      await tx.availabilityRule.createMany({ data: normalized });
    });

    return sendOk(res, { ok: true });
  } catch (error) {
    return sendError(res, 500, "Unexpected error");
  }
}

export async function getGoogleCalendarStatus(req, res) {
  try {
    const configured = Boolean(config.googleClientId && config.googleRedirectUri);
    const authUrl = configured
      ? `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
          client_id: config.googleClientId,
          redirect_uri: config.googleRedirectUri,
          response_type: "code",
          scope: "https://www.googleapis.com/auth/calendar.events",
          access_type: "offline",
          prompt: "consent"
        }).toString()}`
      : null;

    return sendOk(res, {
      configured,
      connected: false,
      authUrl,
      scopes: ["calendar.events"],
      message: configured
        ? "OAuth configurado. Falta concluir callback e armazenamento seguro dos tokens."
        : "Configure GOOGLE_CLIENT_ID e GOOGLE_REDIRECT_URI para iniciar OAuth com Google Calendar."
    });
  } catch (error) {
    return sendError(res, 500, "Unexpected error");
  }
}

export async function exportAppointmentsToGoogle(req, res) {
  try {
    return sendError(
      res,
      501,
      "Google Calendar sync requires OAuth token storage before exporting appointments"
    );
  } catch (error) {
    return sendError(res, 500, "Unexpected error");
  }
}

export async function listSpaces(req, res) {
  try {
    const spaces = await prisma.space.findMany({
      orderBy: { name: "asc" }
    });
    return sendOk(res, spaces);
  } catch (error) {
    return sendError(res, 500, "Unexpected error");
  }
}

export async function createSpace(req, res) {
  try {
    const { name, capacity, description } = req.body ?? {};
    if (!name) {
      return sendError(res, 400, "Name is required");
    }

    const space = await prisma.space.create({
      data: {
        name,
        capacity: capacity ? Number(capacity) : null,
        description: description ?? null
      }
    });

    return sendOk(res, space);
  } catch (error) {
    return sendError(res, 500, "Unexpected error");
  }
}

export async function updateSpace(req, res) {
  try {
    const { name, capacity, description, isActive } = req.body ?? {};
    const space = await prisma.space.update({
      where: { id: req.params.id },
      data: {
        name: name ?? undefined,
        capacity: capacity === undefined ? undefined : Number(capacity),
        description: description ?? undefined,
        isActive: isActive === undefined ? undefined : Boolean(isActive)
      }
    });

    return sendOk(res, space);
  } catch (error) {
    return sendError(res, 500, "Unexpected error");
  }
}

export async function deleteSpace(req, res) {
  try {
    const space = await prisma.space.update({
      where: { id: req.params.id },
      data: { isActive: false }
    });

    return sendOk(res, space);
  } catch (error) {
    return sendError(res, 500, "Unexpected error");
  }
}

export async function listBlockedPeriods(req, res) {
  try {
    const from = typeof req.query.from === "string" ? new Date(req.query.from) : null;
    const to = typeof req.query.to === "string" ? new Date(req.query.to) : null;

    const blockedPeriods = await prisma.blockedPeriod.findMany({
      where: {
        OR: [
          { isRecurring: true },
          {
            isRecurring: false,
            ...(from && to
              ? { startAt: { lt: to }, endAt: { gt: from } }
              : {})
          }
        ]
      },
      orderBy: { createdAt: "desc" }
    });

    return sendOk(res, blockedPeriods);
  } catch (error) {
    return sendError(res, 500, "Unexpected error");
  }
}

export async function createBlockedPeriod(req, res) {
  try {
    const { isRecurring, startAt, endAt, dayOfWeek, startTime, endTime, reason, userId } =
      req.body ?? {};
    const recurring = isRecurring === true || isRecurring === "true";

    if (recurring) {
      if (dayOfWeek === undefined || !startTime || !endTime) {
        return sendError(res, 400, "Recurring blocks require dayOfWeek, startTime, endTime");
      }
      if (!isTimeRangeValid(startTime, endTime)) {
        return sendError(res, 400, "Invalid time range");
      }
    } else {
      if (!startAt || !endAt) {
        return sendError(res, 400, "startAt and endAt are required");
      }
      const startDate = new Date(startAt);
      const endDate = new Date(endAt);
      if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
        return sendError(res, 400, "Invalid date range");
      }
      if (endDate <= startDate) {
        return sendError(res, 400, "endAt must be after startAt");
      }
    }

    const created = await prisma.blockedPeriod.create({
      data: {
        isRecurring: recurring,
        startAt: startAt ? new Date(startAt) : null,
        endAt: endAt ? new Date(endAt) : null,
        dayOfWeek: dayOfWeek === undefined ? null : Number(dayOfWeek),
        startTime: startTime ?? null,
        endTime: endTime ?? null,
        reason: reason ?? null,
        userId: userId ?? null
      }
    });

    return sendOk(res, created);
  } catch (error) {
    return sendError(res, 500, "Unexpected error");
  }
}

export async function deleteBlockedPeriod(req, res) {
  try {
    const removed = await prisma.blockedPeriod.delete({
      where: { id: req.params.id }
    });
    return sendOk(res, removed);
  } catch (error) {
    return sendError(res, 500, "Unexpected error");
  }
}

export async function listNotifications(req, res) {
  try {
    const status = typeof req.query.status === "string" ? req.query.status : null;
    const from = typeof req.query.from === "string" ? new Date(req.query.from) : null;
    const to = typeof req.query.to === "string" ? new Date(req.query.to) : null;

    const notifications = await prisma.notification.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(from && to ? { sendAt: { gte: from, lte: to } } : {})
      },
      orderBy: { sendAt: "asc" },
      include: {
        appointment: {
          include: {
            client: { select: { name: true, email: true } },
            professional: { select: { name: true } }
          }
        }
      }
    });

    return sendOk(res, notifications);
  } catch (error) {
    return sendError(res, 500, "Unexpected error");
  }
}
