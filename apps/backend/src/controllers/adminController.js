import { prisma } from "../db/prisma.js";
import { config } from "../config/env.js";
import { sendError, sendOk } from "../utils/http.js";
import { isTimeRangeValid } from "../utils/blockedPeriods.js";
import { buildDefaultAvailabilityRules } from "../utils/defaultAvailability.js";

const defaultAvatarIcon = "dot";
const allowedAvatarIcons = new Set([
  "dot",
  "diamond",
  "sun",
  "leaf",
  "grid",
  "spark"
]);
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

/**
 * Informa se a requisicao atual pertence a um usuario profissional.
 *
 * @param {import("express").Request} req Requisicao autenticada.
 * @return {boolean} True quando o papel do usuario e PROFESSIONAL.
 */
function isProfessionalUser(req) {
  return req.user?.role === "PROFESSIONAL";
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

/**
 * Resolve o escopo efetivo de usuario para consultas e mutacoes administrativas.
 *
 * @param {import("express").Request} req Requisicao autenticada.
 * @param {string|null|undefined} requestedUserId Usuario solicitado pelo cliente.
 * @param {{ allowGlobal?: boolean }} [options] Opcoes de resolucao de escopo.
 * @return {string|null} Usuario efetivo ou null para regras globais.
 */
function resolveScopedUserId(req, requestedUserId, { allowGlobal = false } = {}) {
  if (isProfessionalUser(req)) {
    return req.user.id;
  }

  if (requestedUserId === null && allowGlobal) {
    return null;
  }

  if (typeof requestedUserId === "string" && requestedUserId.trim()) {
    return requestedUserId;
  }

  return req.user.id;
}

/**
 * Monta o filtro base de acesso a um agendamento conforme o papel do usuario.
 *
 * @param {import("express").Request} req Requisicao autenticada.
 * @param {string} appointmentId Identificador do agendamento.
 * @return {object} Filtro Prisma para leitura segura do agendamento.
 */
function buildAppointmentAccessWhere(req, appointmentId) {
  return {
    id: appointmentId,
    ...(isProfessionalUser(req) ? { professionalId: req.user.id } : {})
  };
}

/**
 * Busca um agendamento respeitando o escopo do usuario logado.
 *
 * @param {import("express").Request} req Requisicao autenticada.
 * @param {string} appointmentId Identificador do agendamento.
 * @return {Promise<object|null>} Agendamento encontrado ou null.
 */
async function findManagedAppointment(req, appointmentId) {
  return prisma.appointment.findFirst({
    where: buildAppointmentAccessWhere(req, appointmentId)
  });
}

/**
 * Lista agendamentos dentro de um intervalo, respeitando o escopo do usuario.
 *
 * @param {import("express").Request} req Requisicao HTTP recebida.
 * @param {import("express").Response} res Resposta HTTP enviada ao cliente.
 * @return {Promise<void>}
 */
export async function listAppointments(req, res) {
  try {
    const from = typeof req.query.from === "string" ? req.query.from : null;
    const to = typeof req.query.to === "string" ? req.query.to : null;
    const professionalId =
      typeof req.query.professionalId === "string" ? req.query.professionalId : null;
    const includeCanceled = req.query.includeCanceled === "true";

    const fromDate = from ? new Date(from) : new Date();
    const toDate = to
      ? new Date(to)
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
      return sendError(res, 400, "Invalid date range");
    }

    const appointments = await prisma.appointment.findMany({
      where: {
        ...(isProfessionalUser(req)
          ? { professionalId: req.user.id }
          : professionalId
            ? { professionalId }
            : {}),
        startAt: { lt: toDate },
        endAt: { gt: fromDate },
        ...(includeCanceled ? {} : { status: { not: "CANCELED" } })
      },
      orderBy: { startAt: "asc" },
      include: {
        client: { select: { name: true, email: true, phone: true } },
        professional: { select: { name: true, email: true } },
        space: { select: { id: true, name: true } }
      }
    });

    return sendOk(res, appointments.map(attachCalendarLinks));
  } catch (error) {
    return sendError(res, 500, "Unexpected error");
  }
}

/**
 * Atualiza o status de um agendamento controlado pelo usuario autenticado.
 *
 * @param {import("express").Request} req Requisicao HTTP recebida.
 * @param {import("express").Response} res Resposta HTTP enviada ao cliente.
 * @return {Promise<void>}
 */
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

    const existing = await findManagedAppointment(req, req.params.id);
    if (!existing) {
      return sendError(res, 404, "Appointment not found");
    }

    const appointment = await prisma.$transaction(async (tx) => {
      const updatedAppointment = await tx.appointment.update({
        where: { id: existing.id },
        data: updates,
        include: {
          client: { select: { name: true, email: true, phone: true } },
          professional: { select: { name: true, email: true } },
          space: { select: { id: true, name: true } }
        }
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

      return updatedAppointment;
    });

    return sendOk(res, attachCalendarLinks(appointment));
  } catch (error) {
    return sendError(res, 500, "Unexpected error");
  }
}

/**
 * Vincula um espaco a um agendamento validando conflitos de ocupacao.
 *
 * @param {import("express").Request} req Requisicao HTTP recebida.
 * @param {import("express").Response} res Resposta HTTP enviada ao cliente.
 * @return {Promise<void>}
 */
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

    const updated = await prisma.appointment.update({
      where: { id: appointment.id },
      data: { spaceId }
    });

    return sendOk(res, updated);
  } catch (error) {
    return sendError(res, 500, "Unexpected error");
  }
}

/**
 * Lista as regras de disponibilidade do usuario efetivamente gerenciado.
 *
 * @param {import("express").Request} req Requisicao HTTP recebida.
 * @param {import("express").Response} res Resposta HTTP enviada ao cliente.
 * @return {Promise<void>}
 */
export async function listAvailability(req, res) {
  try {
    const requestedUserId =
      typeof req.query.userId === "string" ? req.query.userId : undefined;
    const userId = resolveScopedUserId(req, requestedUserId);
    const rules = await prisma.availabilityRule.findMany({
      where: { userId },
      orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }]
    });

    return sendOk(res, rules);
  } catch (error) {
    return sendError(res, 500, "Unexpected error");
  }
}

/**
 * Substitui integralmente as regras de disponibilidade do usuario alvo.
 *
 * @param {import("express").Request} req Requisicao HTTP recebida.
 * @param {import("express").Response} res Resposta HTTP enviada ao cliente.
 * @return {Promise<void>}
 */
export async function updateAvailability(req, res) {
  try {
    const { rules, userId: requestedUserId } = req.body ?? {};
    if (!Array.isArray(rules) || rules.length === 0) {
      return sendError(res, 400, "Rules array is required");
    }

    const userId = resolveScopedUserId(req, requestedUserId);
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
    });

    return sendOk(res, { ok: true });
  } catch (error) {
    return sendError(res, 500, "Unexpected error");
  }
}

/**
 * Retorna o estado atual da integracao com Google Calendar.
 *
 * @param {import("express").Request} req Requisicao HTTP recebida.
 * @param {import("express").Response} res Resposta HTTP enviada ao cliente.
 * @return {Promise<void>}
 */
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
        ? "OAuth configurado. Falta concluir callback e armazenamento seguro dos tokens."
        : "Configure GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET e GOOGLE_REDIRECT_URI para iniciar OAuth com Google Calendar."
    });
  } catch (error) {
    return sendError(res, 500, "Unexpected error");
  }
}

/**
 * Recebe o retorno do Google OAuth enquanto a troca de token ainda nao foi implementada.
 *
 * @param {import("express").Request} req Requisicao HTTP recebida.
 * @param {import("express").Response} res Resposta HTTP enviada ao cliente.
 * @return {void}
 */
export function handleGoogleCalendarCallback(req, res) {
  const hasCode = typeof req.query.code === "string" && req.query.code.length > 0;
  const title = hasCode ? "Google retornou um codigo OAuth" : "Callback do Google Agenda";
  const message = hasCode
    ? "A configuracao basica esta correta. A proxima etapa e trocar este codigo por tokens e salva-los com seguranca."
    : "Nenhum codigo OAuth foi recebido. Revise o Client ID, redirect URI e permissoes do Google Cloud.";

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

/**
 * Informa que a exportacao para Google Calendar ainda depende da Fase 3.
 *
 * @param {import("express").Request} req Requisicao HTTP recebida.
 * @param {import("express").Response} res Resposta HTTP enviada ao cliente.
 * @return {Promise<void>}
 */
export async function exportAppointmentsToGoogle(req, res) {
  try {
    return sendError(
      res,
      501,
      "Google Calendar sync is not ready yet. OAuth callback and token storage still need to be implemented in Phase 3."
    );
  } catch (error) {
    return sendError(res, 500, "Unexpected error");
  }
}

export async function listStaffSignupRequests(req, res) {
  try {
    const status = typeof req.query.status === "string" ? req.query.status : null;
    const requests = await prisma.staffSignupRequest.findMany({
      where: status ? { status } : undefined,
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      select: signupRequestSelect
    });

    return sendOk(res, requests);
  } catch (error) {
    return sendError(res, 500, "Unexpected error");
  }
}

export async function approveStaffSignupRequest(req, res) {
  try {
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
          role: "PROFESSIONAL"
        }
      });

      await tx.availabilityRule.createMany({
        data: buildDefaultAvailabilityRules(createdUser.id)
      });

      return tx.staffSignupRequest.update({
        where: { id: existingRequest.id },
        data: {
          status: "APPROVED",
          reviewedAt: new Date(),
          reviewedById: req.user.id,
          rejectionReason: null
        },
        select: signupRequestSelect
      });
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

    const rejected = await prisma.staffSignupRequest.update({
      where: { id: existingRequest.id },
      data: {
        status: "REJECTED",
        reviewedAt: new Date(),
        reviewedById: req.user.id,
        rejectionReason: rejectionReason?.trim() || null
      },
      select: signupRequestSelect
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

    const avatarSetting = await prisma.systemSetting.upsert({
      where: { key: "globalAvatarIcon" },
      update: { value: icon },
      create: {
        key: "globalAvatarIcon",
        value: icon
      }
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

/**
 * Lista os bloqueios aplicaveis ao usuario alvo ou ao escopo global.
 *
 * @param {import("express").Request} req Requisicao HTTP recebida.
 * @param {import("express").Response} res Resposta HTTP enviada ao cliente.
 * @return {Promise<void>}
 */
export async function listBlockedPeriods(req, res) {
  try {
    const from = typeof req.query.from === "string" ? new Date(req.query.from) : null;
    const to = typeof req.query.to === "string" ? new Date(req.query.to) : null;
    const requestedUserId =
      typeof req.query.userId === "string" ? req.query.userId : undefined;
    const scopedUserId = resolveScopedUserId(req, requestedUserId);

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

/**
 * Cria um bloqueio pontual ou recorrente para a agenda administrada.
 *
 * @param {import("express").Request} req Requisicao HTTP recebida.
 * @param {import("express").Response} res Resposta HTTP enviada ao cliente.
 * @return {Promise<void>}
 */
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
    const userId = resolveScopedUserId(
      req,
      hasUserIdField ? requestedUserId : undefined,
      { allowGlobal: true }
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

/**
 * Remove um bloqueio respeitando o escopo do usuario autenticado.
 *
 * @param {import("express").Request} req Requisicao HTTP recebida.
 * @param {import("express").Response} res Resposta HTTP enviada ao cliente.
 * @return {Promise<void>}
 */
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

    const removed = await prisma.blockedPeriod.delete({
      where: { id: existing.id }
    });
    return sendOk(res, removed);
  } catch (error) {
    return sendError(res, 500, "Unexpected error");
  }
}

/**
 * Lista notificacoes de lembrete visiveis para o usuario autenticado.
 *
 * @param {import("express").Request} req Requisicao HTTP recebida.
 * @param {import("express").Response} res Resposta HTTP enviada ao cliente.
 * @return {Promise<void>}
 */
export async function listNotifications(req, res) {
  try {
    const status = typeof req.query.status === "string" ? req.query.status : null;
    const from = typeof req.query.from === "string" ? new Date(req.query.from) : null;
    const to = typeof req.query.to === "string" ? new Date(req.query.to) : null;

    const notifications = await prisma.notification.findMany({
      where: {
        ...(isProfessionalUser(req)
          ? { appointment: { is: { professionalId: req.user.id } } }
          : {}),
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

/**
 * Cancela manualmente uma notificacao para removela do fluxo pendente.
 *
 * @param {import("express").Request} req Requisicao HTTP recebida.
 * @param {import("express").Response} res Resposta HTTP enviada ao cliente.
 * @return {Promise<void>}
 */
export async function cancelNotification(req, res) {
  try {
    const existing = await prisma.notification.findFirst({
      where: {
        id: req.params.id,
        ...(isProfessionalUser(req)
          ? { appointment: { is: { professionalId: req.user.id } } }
          : {})
      }
    });

    if (!existing) {
      return sendError(res, 404, "Notification not found");
    }

    const updated = await prisma.notification.update({
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

    return sendOk(res, updated);
  } catch (error) {
    return sendError(res, 500, "Unexpected error");
  }
}
