import crypto from "node:crypto";

export function buildReminderNotifications(appointment, offsets, now = new Date()) {
  return offsets
    .map((minutes) => {
      const sendAt = new Date(appointment.startAt.getTime() - minutes * 60 * 1000);
      if (sendAt <= now) {
        return null;
      }

      return {
        sendAt,
        token: crypto.randomBytes(20).toString("hex")
      };
    })
    .filter(Boolean);
}

export function buildReminderLinks(baseUrl, token) {
  const safeBase = baseUrl.replace(/\/$/, "");
  return {
    confirmUrl: `${safeBase}/api/public/notifications/${token}/confirm`,
    cancelUrl: `${safeBase}/api/public/notifications/${token}/cancel`
  };
}
