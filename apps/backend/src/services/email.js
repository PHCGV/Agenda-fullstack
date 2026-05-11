import { Resend } from "resend";
import { config } from "../config/env.js";

function createClient() {
  if (!config.resendApiKey || !config.resendFrom) {
    return null;
  }

  return new Resend(config.resendApiKey);
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(value);
}

export async function sendReminderEmail({ appointment, confirmUrl, cancelUrl }) {
  const client = createClient();
  if (!client) {
    return { ok: false, error: "Resend is not configured" };
  }

  const when = formatDateTime(appointment.startAt);
  const subject = `Consolium | Lembrete de atendimento - ${when}`;
  const html = `
    <div style="background:#f6f2ed;padding:24px;font-family:'Space Grotesk',Arial,sans-serif;">
      <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #efe9e2;border-radius:18px;padding:24px;">
        <p style="margin:0 0 8px;color:#1f1b16;">Ola, ${appointment.client.name}.</p>
        <h2 style="margin:0 0 12px;font-size:20px;color:#1f1b16;">Lembrete de atendimento</h2>
        <p style="margin:0 0 12px;color:#6b645f;">Seu horario esta marcado para <strong>${when}</strong>.</p>
        <p style="margin:0 0 20px;color:#6b645f;">Profissional: ${appointment.professional.name}</p>
        <div style="display:flex;gap:12px;margin-bottom:20px;">
          <a href="${confirmUrl}" style="background:#f97316;color:#ffffff;padding:10px 16px;text-decoration:none;border-radius:999px;font-weight:600;">Confirmar presenca</a>
          <a href="${cancelUrl}" style="border:1px solid #f97316;color:#f97316;padding:10px 16px;text-decoration:none;border-radius:999px;font-weight:600;">Cancelar</a>
        </div>
        <p style="margin:0;font-size:12px;color:#6b645f;">Consolium</p>
      </div>
    </div>
  `;

  const { data, error } = await client.emails.send({
    from: config.resendFrom,
    to: [appointment.client.email],
    subject,
    html
  });

  if (error) {
    return { ok: false, error: error.message ?? "Send failed" };
  }

  return { ok: true, data };
}

export async function sendBookingEmailToProfessional({ appointment, professionalEmail, confirmUrl, cancelUrl }) {
  const client = createClient();
  if (!client) {
    return { ok: false, error: "Resend is not configured" };
  }

  const when = formatDateTime(appointment.startAt);
  const subject = `Consolium | Novo agendamento - ${when}`;
  const html = `
    <div style="background:#f6f2ed;padding:24px;font-family:'Space Grotesk',Arial,sans-serif;">
      <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #efe9e2;border-radius:18px;padding:24px;">
        <p style="margin:0 0 8px;color:#1f1b16;">Olá, ${appointment.professional?.name ?? ''}.</p>
        <h2 style="margin:0 0 12px;font-size:20px;color:#1f1b16;">Novo agendamento</h2>
        <p style="margin:0 0 12px;color:#6b645f;">Cliente: <strong>${appointment.client.name}</strong></p>
        <p style="margin:0 0 12px;color:#6b645f;">Horário: <strong>${when}</strong></p>
        <div style="display:flex;gap:12px;margin-bottom:20px;">
          <a href="${confirmUrl}" style="background:#f97316;color:#ffffff;padding:10px 16px;text-decoration:none;border-radius:999px;font-weight:600;">Confirmar</a>
          <a href="${cancelUrl}" style="border:1px solid #f97316;color:#f97316;padding:10px 16px;text-decoration:none;border-radius:999px;font-weight:600;">Cancelar</a>
        </div>
        <p style="margin:0;font-size:12px;color:#6b645f;">Consolium</p>
      </div>
    </div>
  `;

  const { data, error } = await client.emails.send({
    from: config.resendFrom,
    to: [professionalEmail],
    subject,
    html
  });

  if (error) {
    return { ok: false, error: error.message ?? "Send failed" };
  }

  return { ok: true, data };
}
