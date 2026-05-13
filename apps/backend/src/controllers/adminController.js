import { prisma } from "../db/prisma.js";
import { config } from "../config/env.js";
import { sendError, sendOk } from "../utils/http.js";
import { isTimeRangeValid } from "../utils/blockedPeriods.js";
import { buildDefaultAvailabilityRules } from "../utils/defaultAvailability.js";
import {
  canViewAuditAction,
  getVisibleAuditActionsForRole,
  writeAuditLog
} from "../utils/audit.js";
import { buildPaginatedResponse, parsePagination } from "../utils/pagination.js";
import { toCsv } from "../utils/csv.js";

const defaultAvatarIcon = "dot";
const allowedAvatarIcons = new Set(["dot", "diamond", "sun", "leaf", "grid", "spark"]);
const appointmentStatusValues = [
  "SCHEDULED",
  "CONFIRMED",
  "CANCELED",
  "COMPLETED",
  "PENDING"
];
const staffAssignableRoles = new Set(["RECEPTION", "PROFESSIONAL"]);
const auditActionLabels = {
  APPOINTMENT_CREATED: "Agendamento criado",
  APPOINTMENT_STATUS_UPDATED: "Status do agendamento alterado",
  APPOINTMENT_SPACE_UPDATED: "Espaço do agendamento alterado",
  AVAILABILITY_UPDATED: "Disponibilidade atualizada",
  STAFF_SIGNUP_REQUEST_APPROVED: "Solicitação aprovada",
  STAFF_SIGNUP_REQUEST_REJECTED: "Solicitação rejeitada",
  SYSTEM_SETTING_UPDATED: "Configuração global alterada",
  SPACE_CREATED: "Espaço criado",
  SPACE_UPDATED: "Espaço atualizado",
  SPACE_DEACTIVATED: "Espaço desativado",
  BLOCKED_PERIOD_CREATED: "Bloqueio criado",
  BLOCKED_PERIOD_DELETED: "Bloqueio removido",
  NOTIFICATION_CANCELED: "Notificação cancelada"
};
const signupRequestSelect = {
  id: true,
  name: true,
  email: true,
  status: true,
  rejectionReason: true,
  reviewedAt: true,
  createdAt: true,
  updatedAt: true,
  reviewedBy: {
    select: { id: true, name: true, email: true }
  }
};
const appointmentInclude = {
  client: { select: { name: true, email: true, phone: true } },
  professional: { select: { id: true, name: true, email: true, role: true } },
  space: { select: { id: true, name: true } }
};

function formatGoogleCalendarDate(date) {
  return new Date(date).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function buildGoogleCalendarUrl(appointment) {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `Consolium | ${appointment.client?.name ?? "Atendimento"}`,
    dates: `${formatGoogleCalendarDate(appointment.startAt)}/${formatGoogleCalendarDate(appointment.endAt)}`,
    details: [
      `Cliente: ${appointment.client?.name ?? "-"}`,
      `E-mail: ${appointment.client?.email ?? "-"}`,
      `Profissional: ${appointment.professional?.name ?? "-"}`,
      `Status no Consolium: ${appointment.status}`,
      appointment.notes ? `Descrição: ${appointment.notes}` : null
    ]
      .filter(Boolean)
      .join("\n"),
    location: appointment.space?.name ?? "Consolium"
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function attachCalendarLinks(appointment) {
  return {
    ...appointment,
    googleCalendarUrl: buildGoogleCalendarUrl(appointment)
  };
}

function isAdminUser(req) {
  return req.user?.role === "ADMIN";
}

function isReceptionUser(req) {
  return req.user?.role === "RECEPTION";
}

function isProfessionalUser(req) {
  return req.user?.role === "PROFESSIONAL";
}

function hasGlobalOperationalAccess(req) {
  return isAdminUser(req) || isReceptionUser(req);
}

async function ensureGlobalAvatarSetting() {
  return prisma.systemSetting.upsert({
    where: { key: "globalAvatarIcon" },
    update: {},
    create: {
      key: "globalAvatarIcon",
      value: defaultAvatarIcon
    }
  });
}

function resolveManagedUserId(req, requestedUserId, { allowGlobal = false } = {}) {
  if (isProfessionalUser(req)) {
    return req.user.id;
  }

  if (typeof requestedUserId === "string" && requestedUserId.trim()) {
    return requestedUserId;
  }

  if (requestedUserId === null && allowGlobal) {
    return null;
  }

  return null;
}

function buildAppointmentScope(req, professionalId) {
  if (isProfessionalUser(req)) {
    return { professionalId: req.user.id };
  }

  if (typeof professionalId === "string" && professionalId.trim()) {
    return { professionalId };
  }

  return {};
}

function buildAppointmentAccessWhere(req, appointmentId) {
  return {
    id: appointmentId,
    ...buildAppointmentScope(req, null)
  };
}

async function findManagedAppointment(req, appointmentId) {
  return prisma.appointment.findFirst({
    where: buildAppointmentAccessWhere(req, appointmentId)
  });
}

function parseDateRange(query, defaults = {}) {
  const from = typeof query.from === "string" ? query.from : null;
  const to = typeof query.to === "string" ? query.to : null;
  const defaultFrom = defaults.from ?? new Date();
  const defaultTo = defaults.to ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const fromDate = from ? new Date(from) : defaultFrom;
  const toDate = to ? new Date(to) : defaultTo;

  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime()) || toDate <= fromDate) {
    return null;
  }

  return { fromDate, toDate };
}

function buildAppointmentsWhere(req, filters = {}) {
  const scope = buildAppointmentScope(req, filters.professionalId);
  const where = {
    ...scope
  };

  if (filters.fromDate && filters.toDate) {
    where.startAt = { lt: filters.toDate };
    where.endAt = { gt: filters.fromDate };
  }

  if (!filters.includeCanceled) {
    where.status = { not: "CANCELED" };
  }

  if (typeof filters.spaceId === "string" && filters.spaceId.trim()) {
    where.spaceId = filters.spaceId;
  }

  if (typeof filters.status === "string" && appointmentStatusValues.includes(filters.status)) {
    where.status = filters.status;
  }

  return where;
}

function getAuditVisibilityFilter(req) {
  if (isAdminUser(req)) {
    return {};
  }

  if (isReceptionUser(req)) {
    return {
      action: {
        in: getVisibleAuditActionsForRole("RECEPTION")
      }
    };
  }

  return {
    actorId: req.user.id
  };
}

function filterAuditItemsForRole(role, items) {
  if (role === "ADMIN") {
    return items;
  }

  if (role === "RECEPTION") {
    return items.filter((item) => canViewAuditAction(role, item.action));
  }

  return items;
}

async function buildDashboardContext(req, query) {
  const range = parseDateRange(query, {
    from: new Date(Date.now() - 29 * 24 * 60 * 60 * 1000),
    to: new Date(Date.now() + 24 * 60 * 60 * 1000)
  });

  if (!range) {
    return null;
  }

  const professionalId =
    typeof query.professionalId === "string" ? query.professionalId : null;
  const spaceId = typeof query.spaceId === "string" ? query.spaceId : null;
  const where = buildAppointmentsWhere(req, {
    professionalId,
    spaceId,
    includeCanceled: true,
    fromDate: range.fromDate,
    toDate: range.toDate
  });

  const [appointments, pendingNotifications, pendingRequests] = await Promise.all([
    prisma.appointment.findMany({
      where,
      select: {
        id: true,
        status: true,
        startAt: true,
        endAt: true,
        professionalId: true,
        spaceId: true,
        professional: { select: { id: true, name: true } },
        space: { select: { id: true, name: true } }
      },
      orderBy: { startAt: "asc" }
    }),
    prisma.notification.count({
      where: {
        status: "PENDING",
        ...(isProfessionalUser(req)
          ? { appointment: { is: { professionalId: req.user.id } } }
          : {})
      }
    }),
    hasGlobalOperationalAccess(req)
      ? prisma.staffSignupRequest.count({
          where: { status: "PENDING" }
        })
      : Promise.resolve(0)
  ]);

  return {
    range,
    appointments,
    pendingNotifications,
    pendingRequests
  };
}

function summarizeDashboard(appointments, pendingNotifications, pendingRequests) {
  const totals = {
    total: appointments.length,
    PENDING: 0,
    SCHEDULED: 0,
    CONFIRMED: 0,
    CANCELED: 0,
    COMPLETED: 0
  };

  for (const appointment of appointments) {
    if (Object.prototype.hasOwnProperty.call(totals, appointment.status)) {
      totals[appointment.status] += 1;
    }
  }

  const total = totals.total || 1;

  return {
    totalAppointments: totals.total,
    pendingAppointments: totals.PENDING,
    scheduledAppointments: totals.SCHEDULED,
    confirmedAppointments: totals.CONFIRMED,
    canceledAppointments: totals.CANCELED,
    completedAppointments: totals.COMPLETED,
    cancellationRate: Number(((totals.CANCELED / total) * 100).toFixed(1)),
    confirmationRate: Number(((totals.CONFIRMED / total) * 100).toFixed(1)),
    pendingNotifications,
    pendingStaffRequests: pendingRequests,
    pendingOperations: totals.PENDING + pendingNotifications + pendingRequests
  };
}

function buildDashboardTimeseries(appointments) {
  const points = new Map();

  for (const appointment of appointments) {
    const key = appointment.startAt.toISOString().slice(0, 10);
    if (!points.has(key)) {
      points.set(key, {
        date: key,
        total: 0,
        pending: 0,
        scheduled: 0,
        confirmed: 0,
        canceled: 0,
        completed: 0
      });
    }

    const point = points.get(key);
    point.total += 1;

    if (appointment.status === "PENDING") point.pending += 1;
    if (appointment.status === "SCHEDULED") point.scheduled += 1;
    if (appointment.status === "CONFIRMED") point.confirmed += 1;
    if (appointment.status === "CANCELED") point.canceled += 1;
    if (appointment.status === "COMPLETED") point.completed += 1;
  }

  return Array.from(points.values()).sort((a, b) => a.date.localeCompare(b.date));
}

function buildDashboardBreakdown(appointments) {
  const professionalMap = new Map();
  const spaceMap = new Map();

  for (const appointment of appointments) {
    const professionalKey = appointment.professionalId ?? "unknown";
    const currentProfessional = professionalMap.get(professionalKey) ?? {
      professionalId: appointment.professionalId,
      name: appointment.professional?.name ?? "Sem profissional",
      total: 0,
      pending: 0,
      confirmed: 0,
      canceled: 0,
      completed: 0
    };

    currentProfessional.total += 1;
    if (appointment.status === "PENDING") currentProfessional.pending += 1;
    if (appointment.status === "CONFIRMED") currentProfessional.confirmed += 1;
    if (appointment.status === "CANCELED") currentProfessional.canceled += 1;
    if (appointment.status === "COMPLETED") currentProfessional.completed += 1;
    professionalMap.set(professionalKey, currentProfessional);

    const spaceKey = appointment.spaceId ?? "unassigned";
    const currentSpace = spaceMap.get(spaceKey) ?? {
      spaceId: appointment.spaceId,
      name: appointment.space?.name ?? "Sem espaço",
      total: 0
    };

    currentSpace.total += 1;
    spaceMap.set(spaceKey, currentSpace);
  }

  return {
    byProfessional: Array.from(professionalMap.values()).sort((a, b) => b.total - a.total),
    bySpace: Array.from(spaceMap.values()).sort((a, b) => b.total - a.total)
  };
}

function sendCsv(res, filename, rows) {
  return res
    .type("text/csv")
    .attachment(filename)
    .send(`${toCsv(rows)}\n`);
}

export async function listAppointments(req, res) {
  try {
    const range = parseDateRange(req.query);
    if (!range) {
      return sendError(res, 400, "Invalid date range");
    }

    const professionalId =
      typeof req.query.professionalId === "string" ? req.query.professionalId : null;
    const spaceId = typeof req.query.spaceId === "string" ? req.query.spaceId : null;
    const includeCanceled = req.query.includeCanceled === "true";
    const pagination = parsePagination(req.query, { pageSize: 20, maxPageSize: 100 });

    const where = buildAppointmentsWhere(req, {
      professionalId,
      spaceId,
      includeCanceled,
      fromDate: range.fromDate,
      toDate: range.toDate
    });

    const [items, total] = await Promise.all([
      prisma.appointment.findMany({
        where,
        orderBy: { startAt: "asc" },
        include: appointmentInclude,
        skip: pagination.skip,
        take: pagination.take
      }),
      prisma.appointment.count({ where })
    ]);

    return sendOk(
      res,
      buildPaginatedResponse(
        items.map(attachCalendarLinks),
        pagination.page,
        pagination.pageSize,
        total
      )
    );
  } catch (error) {
    return sendError(res, 500, "Unexpected error");
  }
}

export async function exportAppointmentsCsv(req, res) {
  try {
    const range = parseDateRange(req.query);
    if (!range) {
      return sendError(res, 400, "Invalid date range");
    }

    const where = buildAppointmentsWhere(req, {
      professionalId:
        typeof req.query.professionalId === "string" ? req.query.professionalId : null,
      spaceId: typeof req.query.spaceId === "string" ? req.query.spaceId : null,
      includeCanceled: req.query.includeCanceled === "true",
      fromDate: range.fromDate,
      toDate: range.toDate
    });

    const items = await prisma.appointment.findMany({
      where,
      orderBy: { startAt: "asc" },
      include: appointmentInclude
    });

    const rows = [
      [
        "id",
        "status",
        "inicio",
        "fim",
        "cliente",
        "email_cliente",
        "profissional",
        "espaco",
        "observacoes"
      ],
      ...items.map((appointment) => [
        appointment.id,
        appointment.status,
        appointment.startAt.toISOString(),
        appointment.endAt.toISOString(),
        appointment.client?.name ?? "",
        appointment.client?.email ?? "",
        appointment.professional?.name ?? "",
        appointment.space?.name ?? "",
        appointment.notes ?? ""
      ])
    ];

    return sendCsv(res, "appointments.csv", rows);
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

    if (!appointmentStatusValues.includes(status)) {
      return sendError(res, 400, "Invalid status");
    }

    const existing = await findManagedAppointment(req, req.params.id);
    if (!existing) {
      return sendError(res, 404, "Appointment not found");
    }

    const now = new Date();
    const updates = {
      status,
      cancellationReason: status === "CANCELED" ? reason ?? null : null,
      confirmedAt: status === "CONFIRMED" ? now : null,
      canceledAt: status === "CANCELED" ? now : null,
      completedAt: status === "COMPLETED" ? now : null
    };

    const appointment = await prisma.$transaction(async (tx) => {
      const updatedAppointment = await tx.appointment.update({
        where: { id: existing.id },
        data: updates,
        include: appointmentInclude
      });

      if (status === "CANCELED" || status === "COMPLETED") {
        await tx.notification.updateMany({
          where: {
            appointmentId: existing.id,
            status: { in: ["PENDING", "FAILED"] }
          },
          data: {
            status: "CANCELED",
            error: null
          }
        });
      }

      await writeAuditLog(tx, req.user, {
        action: "APPOINTMENT_STATUS_UPDATED",
        entityType: "Appointment",
        entityId: existing.id,
        summary: `Status do agendamento alterado para ${status}.`,
        metadata: {
          previousStatus: existing.status,
          nextStatus: status,
          reason: reason ?? null
        }
      });

      return updatedAppointment;
    });

    return sendOk(res, attachCalendarLinks(appointment));
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

    const appointment = await findManagedAppointment(req, req.params.id);
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

    const updated = await prisma.$transaction(async (tx) => {
      const nextAppointment = await tx.appointment.update({
        where: { id: appointment.id },
        data: { spaceId },
        include: appointmentInclude
      });

      await writeAuditLog(tx, req.user, {
        action: "APPOINTMENT_SPACE_UPDATED",
        entityType: "Appointment",
        entityId: appointment.id,
        summary: `Espaço do agendamento alterado para ${space.name}.`,
        metadata: {
          previousSpaceId: appointment.spaceId ?? null,
          nextSpaceId: space.id
        }
      });

      return nextAppointment;
    });

    return sendOk(res, attachCalendarLinks(updated));
  } catch (error) {
    return sendError(res, 500, "Unexpected error");
  }
}

export async function listAvailability(req, res) {
  try {
    const requestedUserId =
      typeof req.query.userId === "string" ? req.query.userId : undefined;
    const userId = resolveManagedUserId(req, requestedUserId);
    const where = userId ? { userId } : { userId: req.user.id };
    const rules = await prisma.availabilityRule.findMany({
      where,
      orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }]
    });

    return sendOk(res, rules);
  } catch (error) {
    return sendError(res, 500, "Unexpected error");
  }
}

export async function updateAvailability(req, res) {
  try {
    const { rules, userId: requestedUserId } = req.body ?? {};
    if (!Array.isArray(rules) || rules.length === 0) {
      return sendError(res, 400, "Rules array is required");
    }

    const userId = resolveManagedUserId(req, requestedUserId) ?? req.user.id;
    const normalized = rules.map((rule) => ({
      dayOfWeek: Number(rule.dayOfWeek),
      startTime: rule.startTime,
      endTime: rule.endTime,
      slotMinutes: Number(rule.slotMinutes ?? 60),
      isActive: rule.isActive !== false,
      userId
    }));

    if (
      normalized.some(
        (rule) =>
          Number.isNaN(rule.dayOfWeek) ||
          !isTimeRangeValid(rule.startTime, rule.endTime) ||
          Number.isNaN(rule.slotMinutes) ||
          rule.slotMinutes <= 0
      )
    ) {
      return sendError(res, 400, "Invalid availability rule");
    }

    await prisma.$transaction(async (tx) => {
      await tx.availabilityRule.deleteMany({
        where: { userId }
      });
      await tx.availabilityRule.createMany({ data: normalized });
      await writeAuditLog(tx, req.user, {
        action: "AVAILABILITY_UPDATED",
        entityType: "User",
        entityId: userId,
        summary: "Disponibilidade atualizada.",
        metadata: {
          rules: normalized.length
        }
      });
    });

    return sendOk(res, { ok: true });
  } catch (error) {
    return sendError(res, 500, "Unexpected error");
  }
}

export async function getGoogleCalendarStatus(req, res) {
  try {
    const configured = Boolean(
      config.googleClientId &&
      config.googleClientSecret &&
      config.googleRedirectUri
    );
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
        ? "OAuth configurado. O fluxo ativo no produto continua sendo o link para o Google Agenda."
        : "Configure GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET e GOOGLE_REDIRECT_URI para iniciar OAuth com Google Calendar."
    });
  } catch (error) {
    return sendError(res, 500, "Unexpected error");
  }
}

export function handleGoogleCalendarCallback(req, res) {
  const hasCode = typeof req.query.code === "string" && req.query.code.length > 0;
  const title = hasCode ? "Google retornou um código OAuth" : "Callback do Google Agenda";
  const message = hasCode
    ? "A configuração básica está correta. O fluxo de produto atual usa links do Google Agenda, então não há troca de token habilitada nesta etapa."
    : "Nenhum código OAuth foi recebido. Revise o Client ID, redirect URI e permissões do Google Cloud.";

  res
    .status(hasCode ? 200 : 400)
    .type("html")
    .send(`<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <title>${title}</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 48px; line-height: 1.5; }
      main { max-width: 720px; }
      code { background: #f2f2f2; padding: 2px 6px; border-radius: 4px; }
    </style>
  </head>
  <body>
    <main>
      <h1>${title}</h1>
      <p>${message}</p>
      <p>Volte ao painel do Consolium para continuar.</p>
    </main>
  </body>
</html>`);
}

export async function exportAppointmentsToGoogle(req, res) {
  try {
    return sendError(
      res,
      501,
      "A sincronização OAuth com Google Calendar continua desativada. Use o link de abertura no Google Agenda disponível nos agendamentos."
    );
  } catch (error) {
    return sendError(res, 500, "Unexpected error");
  }
}

export async function listDashboardSummary(req, res) {
  try {
    const context = await buildDashboardContext(req, req.query);
    if (!context) {
      return sendError(res, 400, "Invalid date range");
    }

    return sendOk(
      res,
      summarizeDashboard(
        context.appointments,
        context.pendingNotifications,
        context.pendingRequests
      )
    );
  } catch (error) {
    return sendError(res, 500, "Unexpected error");
  }
}

export async function listDashboardTimeseries(req, res) {
  try {
    const context = await buildDashboardContext(req, req.query);
    if (!context) {
      return sendError(res, 400, "Invalid date range");
    }

    return sendOk(res, buildDashboardTimeseries(context.appointments));
  } catch (error) {
    return sendError(res, 500, "Unexpected error");
  }
}

export async function listDashboardBreakdown(req, res) {
  try {
    const context = await buildDashboardContext(req, req.query);
    if (!context) {
      return sendError(res, 400, "Invalid date range");
    }

    return sendOk(res, buildDashboardBreakdown(context.appointments));
  } catch (error) {
    return sendError(res, 500, "Unexpected error");
  }
}

export async function exportDashboardCsv(req, res) {
  try {
    const context = await buildDashboardContext(req, req.query);
    if (!context) {
      return sendError(res, 400, "Invalid date range");
    }

    const summary = summarizeDashboard(
      context.appointments,
      context.pendingNotifications,
      context.pendingRequests
    );
    const breakdown = buildDashboardBreakdown(context.appointments);

    const rows = [
      ["metrica", "valor"],
      ["totalAppointments", summary.totalAppointments],
      ["pendingAppointments", summary.pendingAppointments],
      ["scheduledAppointments", summary.scheduledAppointments],
      ["confirmedAppointments", summary.confirmedAppointments],
      ["canceledAppointments", summary.canceledAppointments],
      ["completedAppointments", summary.completedAppointments],
      ["cancellationRate", summary.cancellationRate],
      ["confirmationRate", summary.confirmationRate],
      ["pendingNotifications", summary.pendingNotifications],
      ["pendingStaffRequests", summary.pendingStaffRequests],
      ["pendingOperations", summary.pendingOperations],
      [],
      ["profissional", "total", "pendentes", "confirmados", "cancelados", "concluidos"],
      ...breakdown.byProfessional.map((item) => [
        item.name,
        item.total,
        item.pending,
        item.confirmed,
        item.canceled,
        item.completed
      ]),
      [],
      ["espaco", "total"],
      ...breakdown.bySpace.map((item) => [item.name, item.total])
    ];

    return sendCsv(res, "dashboard-summary.csv", rows);
  } catch (error) {
    return sendError(res, 500, "Unexpected error");
  }
}

export async function listStaffSignupRequests(req, res) {
  try {
    const status = typeof req.query.status === "string" ? req.query.status : null;
    const pagination = parsePagination(req.query, { pageSize: 10, maxPageSize: 50 });
    const where = status ? { status } : undefined;

    const [items, total] = await Promise.all([
      prisma.staffSignupRequest.findMany({
        where,
        orderBy: [{ status: "asc" }, { createdAt: "desc" }],
        select: signupRequestSelect,
        skip: pagination.skip,
        take: pagination.take
      }),
      prisma.staffSignupRequest.count({ where })
    ]);

    return sendOk(
      res,
      buildPaginatedResponse(items, pagination.page, pagination.pageSize, total)
    );
  } catch (error) {
    return sendError(res, 500, "Unexpected error");
  }
}

export async function approveStaffSignupRequest(req, res) {
  try {
    const requestedRole =
      typeof req.body?.role === "string" ? req.body.role.toUpperCase() : "PROFESSIONAL";
    const role = staffAssignableRoles.has(requestedRole) ? requestedRole : null;
    if (!role) {
      return sendError(res, 400, "Invalid role");
    }

    const existingRequest = await prisma.staffSignupRequest.findUnique({
      where: { id: req.params.id }
    });

    if (!existingRequest) {
      return sendError(res, 404, "Signup request not found");
    }

    if (existingRequest.status !== "PENDING") {
      return sendError(res, 409, "Signup request has already been reviewed");
    }

    const existingUser = await prisma.user.findUnique({
      where: { email: existingRequest.email }
    });

    if (existingUser) {
      return sendError(res, 409, "Email is already registered");
    }

    const approved = await prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          name: existingRequest.name,
          email: existingRequest.email,
          passwordHash: existingRequest.passwordHash,
          role
        }
      });

      if (role === "PROFESSIONAL") {
        await tx.availabilityRule.createMany({
          data: buildDefaultAvailabilityRules(createdUser.id)
        });
      }

      const updatedRequest = await tx.staffSignupRequest.update({
        where: { id: existingRequest.id },
        data: {
          status: "APPROVED",
          reviewedAt: new Date(),
          reviewedById: req.user.id,
          rejectionReason: null
        },
        select: signupRequestSelect
      });

      await writeAuditLog(tx, req.user, {
        action: "STAFF_SIGNUP_REQUEST_APPROVED",
        entityType: "StaffSignupRequest",
        entityId: existingRequest.id,
        summary: `Solicitação aprovada com criação do usuário ${role}.`,
        metadata: {
          userRole: role,
          email: existingRequest.email
        }
      });

      return updatedRequest;
    });

    return sendOk(res, approved);
  } catch (error) {
    return sendError(res, 500, "Unexpected error");
  }
}

export async function rejectStaffSignupRequest(req, res) {
  try {
    const { rejectionReason } = req.body ?? {};
    const existingRequest = await prisma.staffSignupRequest.findUnique({
      where: { id: req.params.id }
    });

    if (!existingRequest) {
      return sendError(res, 404, "Signup request not found");
    }

    if (existingRequest.status !== "PENDING") {
      return sendError(res, 409, "Signup request has already been reviewed");
    }

    const rejected = await prisma.$transaction(async (tx) => {
      const updatedRequest = await tx.staffSignupRequest.update({
        where: { id: existingRequest.id },
        data: {
          status: "REJECTED",
          reviewedAt: new Date(),
          reviewedById: req.user.id,
          rejectionReason: rejectionReason?.trim() || null
        },
        select: signupRequestSelect
      });

      await writeAuditLog(tx, req.user, {
        action: "STAFF_SIGNUP_REQUEST_REJECTED",
        entityType: "StaffSignupRequest",
        entityId: existingRequest.id,
        summary: "Solicitação rejeitada.",
        metadata: {
          reason: rejectionReason?.trim() || null,
          email: existingRequest.email
        }
      });

      return updatedRequest;
    });

    return sendOk(res, rejected);
  } catch (error) {
    return sendError(res, 500, "Unexpected error");
  }
}

export async function listSystemSettings(req, res) {
  try {
    const avatarSetting = await ensureGlobalAvatarSetting();

    return sendOk(res, {
      globalAvatarIcon: avatarSetting.value
    });
  } catch (error) {
    return sendError(res, 500, "Unexpected error");
  }
}

export async function updateGlobalAvatar(req, res) {
  try {
    const { icon } = req.body ?? {};
    if (!icon || !allowedAvatarIcons.has(icon)) {
      return sendError(res, 400, "Invalid avatar icon");
    }

    const avatarSetting = await prisma.$transaction(async (tx) => {
      const setting = await tx.systemSetting.upsert({
        where: { key: "globalAvatarIcon" },
        update: { value: icon },
        create: {
          key: "globalAvatarIcon",
          value: icon
        }
      });

      await writeAuditLog(tx, req.user, {
        action: "SYSTEM_SETTING_UPDATED",
        entityType: "SystemSetting",
        entityId: setting.id,
        summary: "Ícone global do perfil atualizado.",
        metadata: {
          key: "globalAvatarIcon",
          value: icon
        }
      });

      return setting;
    });

    return sendOk(res, {
      globalAvatarIcon: avatarSetting.value
    });
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

    const space = await prisma.$transaction(async (tx) => {
      const created = await tx.space.create({
        data: {
          name,
          capacity: capacity ? Number(capacity) : null,
          description: description ?? null
        }
      });

      await writeAuditLog(tx, req.user, {
        action: "SPACE_CREATED",
        entityType: "Space",
        entityId: created.id,
        summary: `Espaço ${created.name} criado.`,
        metadata: {
          capacity: created.capacity ?? null
        }
      });

      return created;
    });

    return sendOk(res, space);
  } catch (error) {
    return sendError(res, 500, "Unexpected error");
  }
}

export async function updateSpace(req, res) {
  try {
    const { name, capacity, description, isActive } = req.body ?? {};
    const current = await prisma.space.findUnique({ where: { id: req.params.id } });
    if (!current) {
      return sendError(res, 404, "Space not found");
    }

    const space = await prisma.$transaction(async (tx) => {
      const updated = await tx.space.update({
        where: { id: req.params.id },
        data: {
          name: name ?? undefined,
          capacity: capacity === undefined ? undefined : Number(capacity),
          description: description ?? undefined,
          isActive: isActive === undefined ? undefined : Boolean(isActive)
        }
      });

      await writeAuditLog(tx, req.user, {
        action: "SPACE_UPDATED",
        entityType: "Space",
        entityId: updated.id,
        summary: `Espaço ${updated.name} atualizado.`,
        metadata: {
          previous: {
            name: current.name,
            capacity: current.capacity,
            isActive: current.isActive
          },
          next: {
            name: updated.name,
            capacity: updated.capacity,
            isActive: updated.isActive
          }
        }
      });

      return updated;
    });

    return sendOk(res, space);
  } catch (error) {
    return sendError(res, 500, "Unexpected error");
  }
}

export async function deleteSpace(req, res) {
  try {
    const current = await prisma.space.findUnique({ where: { id: req.params.id } });
    if (!current) {
      return sendError(res, 404, "Space not found");
    }

    const space = await prisma.$transaction(async (tx) => {
      const updated = await tx.space.update({
        where: { id: req.params.id },
        data: { isActive: false }
      });

      await writeAuditLog(tx, req.user, {
        action: "SPACE_DEACTIVATED",
        entityType: "Space",
        entityId: updated.id,
        summary: `Espaço ${updated.name} desativado.`,
        metadata: {
          previousIsActive: current.isActive,
          nextIsActive: updated.isActive
        }
      });

      return updated;
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
    const requestedUserId =
      typeof req.query.userId === "string" ? req.query.userId : undefined;
    const scopedUserId = resolveManagedUserId(req, requestedUserId, {
      allowGlobal: hasGlobalOperationalAccess(req)
    });

    const blockedPeriods = await prisma.blockedPeriod.findMany({
      where: {
        AND: [
          ...(isProfessionalUser(req)
            ? [{ OR: [{ userId: scopedUserId }, { userId: null }] }]
            : scopedUserId
              ? [{ userId: scopedUserId }]
              : []),
          {
            OR: [
              { isRecurring: true },
              {
                isRecurring: false,
                ...(from && to
                  ? { startAt: { lt: to }, endAt: { gt: from } }
                  : {})
              }
            ]
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
    const payload = req.body ?? {};
    const {
      isRecurring,
      startAt,
      endAt,
      dayOfWeek,
      startTime,
      endTime,
      reason,
      userId: requestedUserId
    } = payload;
    const recurring = isRecurring === true || isRecurring === "true";
    const hasUserIdField = Object.prototype.hasOwnProperty.call(payload, "userId");
    const userId = resolveManagedUserId(
      req,
      hasUserIdField ? requestedUserId : undefined,
      { allowGlobal: hasGlobalOperationalAccess(req) }
    );

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

    const created = await prisma.$transaction(async (tx) => {
      const blocked = await tx.blockedPeriod.create({
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

      await writeAuditLog(tx, req.user, {
        action: "BLOCKED_PERIOD_CREATED",
        entityType: "BlockedPeriod",
        entityId: blocked.id,
        summary: "Bloqueio criado.",
        metadata: {
          isRecurring: blocked.isRecurring,
          userId: blocked.userId
        }
      });

      return blocked;
    });

    return sendOk(res, created);
  } catch (error) {
    return sendError(res, 500, "Unexpected error");
  }
}

export async function deleteBlockedPeriod(req, res) {
  try {
    const existing = await prisma.blockedPeriod.findFirst({
      where: {
        id: req.params.id,
        ...(isProfessionalUser(req) ? { userId: req.user.id } : {})
      }
    });

    if (!existing) {
      return sendError(res, 404, "Blocked period not found");
    }

    const removed = await prisma.$transaction(async (tx) => {
      const deleted = await tx.blockedPeriod.delete({
        where: { id: existing.id }
      });

      await writeAuditLog(tx, req.user, {
        action: "BLOCKED_PERIOD_DELETED",
        entityType: "BlockedPeriod",
        entityId: deleted.id,
        summary: "Bloqueio removido.",
        metadata: {
          userId: deleted.userId
        }
      });

      return deleted;
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
    const pagination = parsePagination(req.query, { pageSize: 15, maxPageSize: 100 });

    const where = {
      ...(isProfessionalUser(req)
        ? { appointment: { is: { professionalId: req.user.id } } }
        : {}),
      ...(status ? { status } : {}),
      ...(from && to ? { sendAt: { gte: from, lte: to } } : {})
    };

    const [items, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { sendAt: "asc" },
        include: {
          appointment: {
            include: {
              client: { select: { name: true, email: true } },
              professional: { select: { name: true } }
            }
          }
        },
        skip: pagination.skip,
        take: pagination.take
      }),
      prisma.notification.count({ where })
    ]);

    return sendOk(
      res,
      buildPaginatedResponse(items, pagination.page, pagination.pageSize, total)
    );
  } catch (error) {
    return sendError(res, 500, "Unexpected error");
  }
}

export async function cancelNotification(req, res) {
  try {
    const existing = await prisma.notification.findFirst({
      where: {
        id: req.params.id,
        ...(isProfessionalUser(req)
          ? { appointment: { is: { professionalId: req.user.id } } }
          : {})
      },
      include: {
        appointment: {
          include: {
            client: { select: { name: true, email: true } },
            professional: { select: { name: true } }
          }
        }
      }
    });

    if (!existing) {
      return sendError(res, 404, "Notification not found");
    }

    const updated = await prisma.$transaction(async (tx) => {
      const notification = await tx.notification.update({
        where: { id: existing.id },
        data: {
          status: "CANCELED",
          error: null
        },
        include: {
          appointment: {
            include: {
              client: { select: { name: true, email: true } },
              professional: { select: { name: true } }
            }
          }
        }
      });

      await writeAuditLog(tx, req.user, {
        action: "NOTIFICATION_CANCELED",
        entityType: "Notification",
        entityId: existing.id,
        summary: "Notificação cancelada manualmente.",
        metadata: {
          appointmentId: existing.appointmentId
        }
      });

      return notification;
    });

    return sendOk(res, updated);
  } catch (error) {
    return sendError(res, 500, "Unexpected error");
  }
}

export async function listAuditLogs(req, res) {
  try {
    const pagination = parsePagination(req.query, { pageSize: 20, maxPageSize: 100 });
    const from = typeof req.query.from === "string" ? new Date(req.query.from) : null;
    const to = typeof req.query.to === "string" ? new Date(req.query.to) : null;
    const action = typeof req.query.action === "string" ? req.query.action : null;
    const actorId = typeof req.query.actorId === "string" ? req.query.actorId : null;
    const visibility = getAuditVisibilityFilter(req);

    const where = {
      ...visibility,
      ...(action
        ? {
            action:
              visibility.action && visibility.action.in
                ? { in: visibility.action.in.filter((value) => value === action) }
                : action
          }
        : {}),
      ...(actorId ? { actorId } : {}),
      ...(from && to ? { createdAt: { gte: from, lte: to } } : {})
    };

    const [items, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        include: {
          actor: {
            select: { id: true, name: true, email: true, role: true }
          }
        },
        skip: pagination.skip,
        take: pagination.take
      }),
      prisma.auditLog.count({ where })
    ]);

    return sendOk(
      res,
      buildPaginatedResponse(
        filterAuditItemsForRole(req.user.role, items),
        pagination.page,
        pagination.pageSize,
        total
      )
    );
  } catch (error) {
    return sendError(res, 500, "Unexpected error");
  }
}

export async function listAuditActions(req, res) {
  try {
    const actions = Object.entries(auditActionLabels)
      .filter(([action]) => canViewAuditAction(req.user.role, action))
      .map(([value, label]) => ({ value, label }));

    return sendOk(res, actions);
  } catch (error) {
    return sendError(res, 500, "Unexpected error");
  }
}
