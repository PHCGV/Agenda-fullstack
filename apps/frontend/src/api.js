const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

async function request(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {})
    }
  });

  const contentType = response.headers.get("content-type") ?? "";

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    const message = data.error ?? "Unexpected error";
    throw new Error(message);
  }

  if (contentType.includes("application/json")) {
    return response.json();
  }

  return response;
}

async function downloadCsv(path, accessToken, filename) {
  const response = await fetch(`${API_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error ?? "Unexpected error");
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function getProfessionals() {
  return request("/api/public/professionals");
}

export function getAvailability(date, professionalId) {
  const params = new URLSearchParams({ date });
  if (professionalId) {
    params.set("professionalId", professionalId);
  }
  return request(`/api/public/availability?${params.toString()}`);
}

export function createAppointment(payload) {
  return request("/api/public/appointments", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function createStaffSignupRequest(payload) {
  return request("/api/public/staff-signup-requests", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function login(payload) {
  return request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function refreshAccessToken(refreshToken) {
  return request("/api/auth/refresh", {
    method: "POST",
    body: JSON.stringify({ refreshToken })
  });
}

export function logout(refreshToken) {
  return request("/api/auth/logout", {
    method: "POST",
    body: JSON.stringify({ refreshToken })
  });
}

export function getAppointments(filters, accessToken) {
  const params = new URLSearchParams();
  if (filters?.from) params.set("from", filters.from);
  if (filters?.to) params.set("to", filters.to);
  if (filters?.professionalId) params.set("professionalId", filters.professionalId);
  if (filters?.spaceId) params.set("spaceId", filters.spaceId);
  if (filters?.includeCanceled) params.set("includeCanceled", "true");
  if (filters?.page) params.set("page", `${filters.page}`);
  if (filters?.pageSize) params.set("pageSize", `${filters.pageSize}`);

  return request(`/api/admin/appointments?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
}

export function exportAppointmentsCsv(filters, accessToken) {
  const params = new URLSearchParams();
  if (filters?.from) params.set("from", filters.from);
  if (filters?.to) params.set("to", filters.to);
  if (filters?.professionalId) params.set("professionalId", filters.professionalId);
  if (filters?.spaceId) params.set("spaceId", filters.spaceId);
  if (filters?.includeCanceled) params.set("includeCanceled", "true");

  const query = params.toString();
  return downloadCsv(
    `/api/admin/appointments/export${query ? `?${query}` : ""}`,
    accessToken,
    "appointments.csv"
  );
}

export function getDashboardSummary(filters, accessToken) {
  const params = new URLSearchParams();
  if (filters?.from) params.set("from", filters.from);
  if (filters?.to) params.set("to", filters.to);
  if (filters?.professionalId) params.set("professionalId", filters.professionalId);
  if (filters?.spaceId) params.set("spaceId", filters.spaceId);

  return request(`/api/admin/dashboard/summary?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
}

export function getDashboardTimeseries(filters, accessToken) {
  const params = new URLSearchParams();
  if (filters?.from) params.set("from", filters.from);
  if (filters?.to) params.set("to", filters.to);
  if (filters?.professionalId) params.set("professionalId", filters.professionalId);
  if (filters?.spaceId) params.set("spaceId", filters.spaceId);

  return request(`/api/admin/dashboard/timeseries?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
}

export function getDashboardBreakdown(filters, accessToken) {
  const params = new URLSearchParams();
  if (filters?.from) params.set("from", filters.from);
  if (filters?.to) params.set("to", filters.to);
  if (filters?.professionalId) params.set("professionalId", filters.professionalId);
  if (filters?.spaceId) params.set("spaceId", filters.spaceId);

  return request(`/api/admin/dashboard/breakdown?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
}

export function exportDashboardCsv(filters, accessToken) {
  const params = new URLSearchParams();
  if (filters?.from) params.set("from", filters.from);
  if (filters?.to) params.set("to", filters.to);
  if (filters?.professionalId) params.set("professionalId", filters.professionalId);
  if (filters?.spaceId) params.set("spaceId", filters.spaceId);

  const query = params.toString();
  return downloadCsv(
    `/api/admin/dashboard/export${query ? `?${query}` : ""}`,
    accessToken,
    "dashboard-summary.csv"
  );
}

export function getAvailabilityRules(accessToken) {
  return request("/api/admin/availability", {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
}

export function updateAvailabilityRules(rules, accessToken) {
  return request("/api/admin/availability", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify({ rules })
  });
}

export function getGoogleCalendarStatus(accessToken) {
  return request("/api/admin/google-calendar/status", {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
}

export function exportAppointmentsToGoogle(accessToken) {
  return request("/api/admin/google-calendar/export", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
}

export function updateAppointmentStatus(id, status, reason, accessToken) {
  return request(`/api/admin/appointments/${id}/status`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify({ status, reason })
  });
}

export function updateAppointmentSpace(id, spaceId, accessToken) {
  return request(`/api/admin/appointments/${id}/space`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify({ spaceId })
  });
}

export function getSpaces(accessToken) {
  return request("/api/admin/spaces", {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
}

export function createSpace(payload, accessToken) {
  return request("/api/admin/spaces", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify(payload)
  });
}

export function updateSpace(id, payload, accessToken) {
  return request(`/api/admin/spaces/${id}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify(payload)
  });
}

export function deleteSpace(id, accessToken) {
  return request(`/api/admin/spaces/${id}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
}

export function getBlockedPeriods(accessToken) {
  return request("/api/admin/blocked-periods", {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
}

export function createBlockedPeriod(payload, accessToken) {
  return request("/api/admin/blocked-periods", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify(payload)
  });
}

export function deleteBlockedPeriod(id, accessToken) {
  return request(`/api/admin/blocked-periods/${id}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
}

export function getNotifications(filters, accessToken) {
  const params = new URLSearchParams();
  if (filters?.from) params.set("from", filters.from);
  if (filters?.to) params.set("to", filters.to);
  if (filters?.status) params.set("status", filters.status);
  if (filters?.page) params.set("page", `${filters.page}`);
  if (filters?.pageSize) params.set("pageSize", `${filters.pageSize}`);

  const query = params.toString();
  return request(`/api/admin/notifications${query ? `?${query}` : ""}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
}

export function cancelNotification(id, accessToken) {
  return request(`/api/admin/notifications/${id}/cancel`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
}

export function getStaffSignupRequests(filters, accessToken) {
  const params = new URLSearchParams();
  if (filters?.status) params.set("status", filters.status);
  if (filters?.page) params.set("page", `${filters.page}`);
  if (filters?.pageSize) params.set("pageSize", `${filters.pageSize}`);
  const query = params.toString();

  return request(`/api/admin/staff-signup-requests${query ? `?${query}` : ""}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
}

export function approveStaffSignupRequest(id, role, accessToken) {
  return request(`/api/admin/staff-signup-requests/${id}/approve`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify({ role })
  });
}

export function rejectStaffSignupRequest(id, rejectionReason, accessToken) {
  return request(`/api/admin/staff-signup-requests/${id}/reject`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify({ rejectionReason })
  });
}

export function getAuditLogs(filters, accessToken) {
  const params = new URLSearchParams();
  if (filters?.from) params.set("from", filters.from);
  if (filters?.to) params.set("to", filters.to);
  if (filters?.action) params.set("action", filters.action);
  if (filters?.actorId) params.set("actorId", filters.actorId);
  if (filters?.page) params.set("page", `${filters.page}`);
  if (filters?.pageSize) params.set("pageSize", `${filters.pageSize}`);

  const query = params.toString();
  return request(`/api/admin/audit-logs${query ? `?${query}` : ""}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
}

export function getAuditActions(accessToken) {
  return request("/api/admin/audit-actions", {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
}

export function getSystemSettings(accessToken) {
  return request("/api/admin/system-settings", {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
}

export function updateGlobalAvatar(icon, accessToken) {
  return request("/api/admin/system-settings/avatar", {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify({ icon })
  });
}
