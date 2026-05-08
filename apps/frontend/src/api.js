const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

async function request(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {})
    },
    ...options
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data.error ?? "Unexpected error";
    throw new Error(message);
  }

  return data;
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

export function getAppointments(from, to, accessToken) {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);

  return request(`/api/admin/appointments?${params.toString()}`, {
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

export function getNotifications(accessToken) {
  return request("/api/admin/notifications", {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
}
