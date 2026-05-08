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
