import { prisma } from "../db/prisma.js";
import { config } from "../config/env.js";
import { sendError, sendOk } from "../utils/http.js";
import { buildReminderLinks } from "../utils/notifications.js";
import { sendReminderEmail } from "../services/email.js";

function verifyCronSecret(req) {
  if (!config.cronSecret) {
    return true;
  }
  return req.headers.authorization === `Bearer ${config.cronSecret}`;
}

export async function runReminders(req, res) {
  try {
    if (!verifyCronSecret(req)) {
      return sendError(res, 401, "Unauthorized");
    }

    const now = new Date();
    const pending = await prisma.notification.findMany({
      where: {
        status: "PENDING",
        sendAt: { lte: now }
      },
      include: {
        appointment: {
          include: {
            client: { select: { name: true, email: true } },
            professional: { select: { name: true } }
          }
        }
      },
      orderBy: { sendAt: "asc" },
      take: 50
    });

    const results = [];

    for (const notification of pending) {
      if (
        notification.appointment.status === "CANCELED" ||
        notification.appointment.status === "COMPLETED"
      ) {
        await prisma.notification.update({
          where: { id: notification.id },
          data: { status: "CANCELED" }
        });
        results.push({ id: notification.id, status: "CANCELED" });
        continue;
      }

      const { confirmUrl, cancelUrl } = buildReminderLinks(
        config.publicApiUrl,
        notification.token
      );

      const response = await sendReminderEmail({
        appointment: notification.appointment,
        confirmUrl,
        cancelUrl
      });

      if (response.ok) {
        await prisma.notification.update({
          where: { id: notification.id },
          data: { status: "SENT", sentAt: new Date(), error: null }
        });
        results.push({ id: notification.id, status: "SENT" });
      } else {
        await prisma.notification.update({
          where: { id: notification.id },
          data: { status: "FAILED", error: response.error ?? "Send failed" }
        });
        results.push({ id: notification.id, status: "FAILED" });
      }
    }

    return sendOk(res, { processed: results.length, results });
  } catch (error) {
    return sendError(res, 500, "Unexpected error");
  }
}
