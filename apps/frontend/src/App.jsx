import { useEffect, useMemo, useState } from "react";
import {
  cancelNotification,
  createAppointment,
  createBlockedPeriod,
  createSpace,
  deleteBlockedPeriod,
  deleteSpace,
  exportAppointmentsToGoogle,
  getAppointments,
  getAvailability,
  getAvailabilityRules,
  getBlockedPeriods,
  getGoogleCalendarStatus,
  getNotifications,
  getProfessionals,
  getSpaces,
  login,
  logout,
  updateAppointmentSpace,
  updateAppointmentStatus,
  updateAvailabilityRules
} from "./api.js";

const statusLabels = {
  SCHEDULED: "Agendado",
  CONFIRMED: "Confirmado",
  CANCELED: "Cancelado",
  COMPLETED: "Concluido",
  PENDING: "Pendente"
};

const statusClass = {
  SCHEDULED: "scheduled",
  CONFIRMED: "confirmed",
  CANCELED: "canceled",
  COMPLETED: "completed",
  PENDING: "pending"
};

const storageKey = "consolium-auth";
const legacyStorageKey = "consilium-auth";
const dayLabels = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];
const fullDayLabels = [
  "Domingo",
  "Segunda",
  "Terca",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sabado"
];
const calendarHours = Array.from({ length: 11 }, (_, index) => index + 8);

function BrandLogo({ compact = false }) {
  return (
    <span className={`brand-logo ${compact ? "brand-logo--compact" : ""}`}>
      <span>Con</span>
      <span className="brand-blue">s</span>
      <span className="brand-red">o</span>
      <span className="brand-green">l</span>
      <span>ium</span>
    </span>
  );
}

function formatDate(iso) {
  const date = new Date(iso);
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function formatTime(iso) {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(iso));
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function isValidDate(date) {
  return date instanceof Date && !Number.isNaN(date.getTime());
}

function parseDateInput(value) {
  if (typeof value !== "string" || !value) {
    return null;
  }

  const parsed = new Date(`${value}T00:00:00`);
  return isValidDate(parsed) ? parsed : null;
}

function toDateInput(date) {
  if (!isValidDate(date)) {
    return "";
  }
  return date.toISOString().slice(0, 10);
}

function addDays(date, days) {
  const next = new Date(date);
  if (!isValidDate(next)) {
    return new Date();
  }
  next.setDate(next.getDate() + days);
  return next;
}

function startOfWeek(date) {
  const start = new Date(date);
  if (!isValidDate(start)) {
    return new Date();
  }
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - start.getDay());
  return start;
}

function getHourPosition(iso) {
  const date = new Date(iso);
  return date.getHours() + date.getMinutes() / 60;
}

export default function App() {
  const initialDate = new Date();
  const [view, setView] = useState("login");
  const [professionals, setProfessionals] = useState([]);
  const [professionalId, setProfessionalId] = useState("");
  const [date, setDate] = useState(today());
  const [slots, setSlots] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState("");
  const [client, setClient] = useState({ name: "", email: "", phone: "" });
  const [publicMessage, setPublicMessage] = useState("");
  const [loadingSlots, setLoadingSlots] = useState(false);

  const [auth, setAuth] = useState(() => {
    const stored =
      localStorage.getItem(storageKey) ??
      localStorage.getItem(legacyStorageKey);
    if (stored && !localStorage.getItem(storageKey)) {
      localStorage.setItem(storageKey, stored);
      localStorage.removeItem(legacyStorageKey);
    }
    try {
      return stored ? JSON.parse(stored) : null;
    } catch {
      localStorage.removeItem(storageKey);
      localStorage.removeItem(legacyStorageKey);
      return null;
    }
  });
  const [calendarAppointments, setCalendarAppointments] = useState([]);
  const [listAppointmentsData, setListAppointmentsData] = useState([]);
  const [adminMessage, setAdminMessage] = useState("");
  const [loadingAppointments, setLoadingAppointments] = useState(false);
  const [loadingListAppointments, setLoadingListAppointments] = useState(false);
  const [adminTab, setAdminTab] = useState("calendar");
  const [calendarMode, setCalendarMode] = useState("week");
  const [calendarDate, setCalendarDate] = useState(today());
  const [listFilters, setListFilters] = useState(() => ({
    from: toDateInput(initialDate),
    to: toDateInput(addDays(initialDate, 120))
  }));
  const [spaces, setSpaces] = useState([]);
  const [spaceForm, setSpaceForm] = useState({
    name: "",
    capacity: "",
    description: ""
  });
  const [blockedPeriods, setBlockedPeriods] = useState([]);
  const [blockedForm, setBlockedForm] = useState({
    type: "single",
    startAt: "",
    endAt: "",
    dayOfWeek: "1",
    startTime: "",
    endTime: "",
    reason: ""
  });
  const [notifications, setNotifications] = useState([]);
  const [notificationFilters, setNotificationFilters] = useState(() => ({
    from: "",
    to: "",
    status: "PENDING"
  }));
  const [availabilityRules, setAvailabilityRules] = useState([]);
  const [availabilityForm, setAvailabilityForm] = useState(() =>
    fullDayLabels.map((_, dayOfWeek) => ({
      dayOfWeek,
      isActive: dayOfWeek >= 1 && dayOfWeek <= 5,
      startTime: "09:00",
      endTime: "17:00",
      slotMinutes: 60
    }))
  );
  const [googleStatus, setGoogleStatus] = useState(null);
  const [loadingSpaces, setLoadingSpaces] = useState(false);
  const [loadingBlocked, setLoadingBlocked] = useState(false);
  const [loadingNotifications, setLoadingNotifications] = useState(false);
  const [processingNotificationId, setProcessingNotificationId] = useState("");
  const [loadingAvailability, setLoadingAvailability] = useState(false);
  const [loadingGoogle, setLoadingGoogle] = useState(false);
  const isAdmin = auth?.user?.role === "ADMIN";
  const panelTitle = isAdmin ? "Administrativo" : "Painel do profissional";

  useEffect(() => {
    getProfessionals()
      .then((data) => {
        setProfessionals(data);
        if (!professionalId && data.length) {
          setProfessionalId(data[0].id);
        }
      })
      .catch(() => {
        setProfessionals([]);
      });
  }, []);

  async function loadAvailability() {
    setLoadingSlots(true);
    setPublicMessage("");
    setSelectedSlot("");
    try {
      const data = await getAvailability(date, professionalId || undefined);
      setSlots(data.slots ?? []);
    } catch (error) {
      setSlots([]);
      setPublicMessage(error.message);
    } finally {
      setLoadingSlots(false);
    }
  }

  async function handleCreateAppointment(event) {
    event.preventDefault();
    if (!selectedSlot) {
      setPublicMessage("Selecione um horario disponivel.");
      return;
    }

    try {
      setPublicMessage("");
      await createAppointment({
        client,
        startAt: selectedSlot,
        professionalId: professionalId || undefined
      });
      setPublicMessage("Agendamento criado com sucesso!");
      setClient({ name: "", email: "", phone: "" });
      await loadAvailability();
    } catch (error) {
      setPublicMessage(error.message);
    }
  }

  async function handleLogin(event) {
    event.preventDefault();
    setAdminMessage("");

    const form = new FormData(event.currentTarget);
    const email = form.get("email");
    const password = form.get("password");

    try {
      const data = await login({ email, password });
      const payload = {
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        user: data.user
      };
      localStorage.setItem(storageKey, JSON.stringify(payload));
      localStorage.removeItem(legacyStorageKey);
      setAuth(payload);
      setAdminTab("calendar");
      setView("admin");
    } catch (error) {
      setAdminMessage(error.message);
    }
  }

  async function handleLogout() {
    if (auth?.refreshToken) {
      await logout(auth.refreshToken).catch(() => null);
    }
    localStorage.removeItem(storageKey);
    localStorage.removeItem(legacyStorageKey);
    setAuth(null);
    setCalendarAppointments([]);
    setListAppointmentsData([]);
    setNotifications([]);
    setView("login");
  }

  const calendarRange = useMemo(() => {
    const selected = parseDateInput(calendarDate) ?? parseDateInput(today()) ?? new Date();
    const start = calendarMode === "day" ? selected : startOfWeek(selected);
    const days = calendarMode === "day" ? 1 : 7;
    const end = addDays(start, days);
    return { start, end, days };
  }, [calendarDate, calendarMode]);

  async function loadCalendarAppointments() {
    if (!auth?.accessToken) return;
    setLoadingAppointments(true);
    setAdminMessage("");
    try {
      const from = calendarRange.start.toISOString();
      const to = calendarRange.end.toISOString();
      const data = await getAppointments(from, to, auth.accessToken);
      setCalendarAppointments(data);
    } catch (error) {
      setAdminMessage(error.message);
    } finally {
      setLoadingAppointments(false);
    }
  }

  async function loadListAppointments() {
    if (!auth?.accessToken) return;
    setLoadingListAppointments(true);
    setAdminMessage("");
    try {
      const fromDate = parseDateInput(listFilters.from);
      const toDate = parseDateInput(listFilters.to);
      const from = fromDate ? fromDate.toISOString() : null;
      const to = toDate
        ? new Date(`${listFilters.to}T23:59:59`).toISOString()
        : null;
      const data = await getAppointments(from, to, auth.accessToken);
      setListAppointmentsData(data);
    } catch (error) {
      setAdminMessage(error.message);
    } finally {
      setLoadingListAppointments(false);
    }
  }

  async function loadSpaces() {
    if (!auth?.accessToken) return;
    setLoadingSpaces(true);
    try {
      const data = await getSpaces(auth.accessToken);
      setSpaces(data);
    } catch (error) {
      setAdminMessage(error.message);
    } finally {
      setLoadingSpaces(false);
    }
  }

  async function loadBlockedPeriods() {
    if (!auth?.accessToken) return;
    setLoadingBlocked(true);
    try {
      const data = await getBlockedPeriods(auth.accessToken);
      setBlockedPeriods(data);
    } catch (error) {
      setAdminMessage(error.message);
    } finally {
      setLoadingBlocked(false);
    }
  }

  async function loadNotifications() {
    if (!auth?.accessToken) return;
    setLoadingNotifications(true);
    try {
      const fromDate = parseDateInput(notificationFilters.from);
      const toDate = parseDateInput(notificationFilters.to);
      const filters = {
        ...notificationFilters,
        from: fromDate ? fromDate.toISOString() : "",
        to: toDate ? new Date(`${notificationFilters.to}T23:59:59`).toISOString() : ""
      };
      const data = await getNotifications(filters, auth.accessToken);
      setNotifications(data);
    } catch (error) {
      setAdminMessage(error.message);
    } finally {
      setLoadingNotifications(false);
    }
  }

  async function loadAvailabilityRules() {
    if (!auth?.accessToken) return;
    setLoadingAvailability(true);
    try {
      const rules = await getAvailabilityRules(auth.accessToken);
      setAvailabilityRules(rules);
      setAvailabilityForm((prev) =>
        prev.map((day) => {
          const rule = rules.find((item) => item.dayOfWeek === day.dayOfWeek);
          return rule
            ? {
                dayOfWeek: rule.dayOfWeek,
                isActive: rule.isActive,
                startTime: rule.startTime,
                endTime: rule.endTime,
                slotMinutes: rule.slotMinutes
              }
            : day;
        })
      );
    } catch (error) {
      setAdminMessage(error.message);
    } finally {
      setLoadingAvailability(false);
    }
  }

  async function handleAvailabilitySave(event) {
    event.preventDefault();
    if (!auth?.accessToken) return;

    try {
      const rules = availabilityForm
        .filter((rule) => rule.isActive)
        .map((rule) => ({
          dayOfWeek: rule.dayOfWeek,
          startTime: rule.startTime,
          endTime: rule.endTime,
          slotMinutes: Number(rule.slotMinutes),
          isActive: true
        }));

      await updateAvailabilityRules(rules, auth.accessToken);
      setAdminMessage("Configuracao de agenda atualizada.");
      await loadAvailabilityRules();
    } catch (error) {
      setAdminMessage(error.message);
    }
  }

  async function loadGoogleStatus() {
    if (!auth?.accessToken) return;
    setLoadingGoogle(true);
    try {
      const status = await getGoogleCalendarStatus(auth.accessToken);
      setGoogleStatus(status);
    } catch (error) {
      setAdminMessage(error.message);
    } finally {
      setLoadingGoogle(false);
    }
  }

  async function handleGoogleExport() {
    if (!auth?.accessToken) return;
    try {
      await exportAppointmentsToGoogle(auth.accessToken);
      setAdminMessage("Exportacao enviada ao Google Agenda.");
    } catch (error) {
      setAdminMessage(error.message);
    }
  }

  async function handleSpaceCreate(event) {
    event.preventDefault();
    if (!spaceForm.name) {
      setAdminMessage("Informe o nome do espaco.");
      return;
    }

    try {
      await createSpace(
        {
          name: spaceForm.name,
          capacity: spaceForm.capacity || null,
          description: spaceForm.description || null
        },
        auth.accessToken
      );
      setSpaceForm({ name: "", capacity: "", description: "" });
      await loadSpaces();
    } catch (error) {
      setAdminMessage(error.message);
    }
  }

  async function handleSpaceDeactivate(id) {
    try {
      await deleteSpace(id, auth.accessToken);
      await loadSpaces();
    } catch (error) {
      setAdminMessage(error.message);
    }
  }

  async function handleBlockedCreate(event) {
    event.preventDefault();
    const payload =
      blockedForm.type === "recurring"
        ? {
            isRecurring: true,
            dayOfWeek: Number(blockedForm.dayOfWeek),
            startTime: blockedForm.startTime,
            endTime: blockedForm.endTime,
            reason: blockedForm.reason
          }
        : {
            isRecurring: false,
            startAt: blockedForm.startAt
              ? new Date(blockedForm.startAt).toISOString()
              : null,
            endAt: blockedForm.endAt
              ? new Date(blockedForm.endAt).toISOString()
              : null,
            reason: blockedForm.reason
          };

    try {
      await createBlockedPeriod(payload, auth.accessToken);
      setBlockedForm({
        type: "single",
        startAt: "",
        endAt: "",
        dayOfWeek: "1",
        startTime: "",
        endTime: "",
        reason: ""
      });
      await loadBlockedPeriods();
    } catch (error) {
      setAdminMessage(error.message);
    }
  }

  async function handleBlockedDelete(id) {
    try {
      await deleteBlockedPeriod(id, auth.accessToken);
      await loadBlockedPeriods();
    } catch (error) {
      setAdminMessage(error.message);
    }
  }

  async function handleSpaceAssign(appointmentId, spaceId) {
    if (!auth?.accessToken) return;
    try {
      await updateAppointmentSpace(appointmentId, spaceId, auth.accessToken);
      await Promise.all([loadCalendarAppointments(), loadListAppointments()]);
    } catch (error) {
      setAdminMessage(error.message);
    }
  }

  async function handleStatusChange(id, status) {
    if (!auth?.accessToken) return;
    try {
      await updateAppointmentStatus(id, status, null, auth.accessToken);
      await Promise.all([loadCalendarAppointments(), loadListAppointments(), loadNotifications()]);
    } catch (error) {
      setAdminMessage(error.message);
    }
  }

  async function handleNotificationCancel(id) {
    if (!auth?.accessToken) return;
    setProcessingNotificationId(id);
    try {
      await cancelNotification(id, auth.accessToken);
      await loadNotifications();
    } catch (error) {
      setAdminMessage(error.message);
    } finally {
      setProcessingNotificationId("");
    }
  }

  useEffect(() => {
    if (view === "public" || view === "register") {
      loadAvailability();
    }
  }, [view, date, professionalId]);

  useEffect(() => {
    if (auth?.accessToken && view === "admin") {
      loadCalendarAppointments();
      loadSpaces();
    }
  }, [auth, view, calendarRange.start, calendarRange.end]);

  useEffect(() => {
    if (auth?.accessToken && view === "admin") {
      loadListAppointments();
    }
  }, [auth, view, listFilters.from, listFilters.to]);

  useEffect(() => {
    if (auth?.accessToken && view === "admin") {
      loadNotifications();
    }
  }, [auth, view, notificationFilters.from, notificationFilters.to, notificationFilters.status]);

  useEffect(() => {
    if (!auth?.accessToken || view !== "admin") return;
    if (!isAdmin && adminTab === "spaces") {
      setAdminTab("calendar");
      return;
    }
    if (adminTab === "spaces") loadSpaces();
    if (adminTab === "blocked") loadBlockedPeriods();
    if (adminTab === "settings") loadAvailabilityRules();
    if (adminTab === "google") loadGoogleStatus();
  }, [adminTab, auth, view, isAdmin]);

  const slotItems = useMemo(() => {
    return slots.map((slot) => ({
      startAt: slot.startAt,
      label: formatTime(slot.startAt)
    }));
  }, [slots]);

  const calendarDays = useMemo(() => {
    return Array.from({ length: calendarRange.days }, (_, index) =>
      addDays(calendarRange.start, index)
    );
  }, [calendarRange]);

  const visibleAppointments = useMemo(() => {
    return calendarAppointments.filter((appointment) => {
      const start = new Date(appointment.startAt);
      return start >= calendarRange.start && start < calendarRange.end;
    });
  }, [calendarAppointments, calendarRange]);

  const activeSpaces = spaces.filter((space) => space.isActive).length;
  const pendingNotifications = notifications.filter(
    (notification) => notification.status === "PENDING"
  ).length;
  const summaryAppointments =
    adminTab === "appointments" ? listAppointmentsData.length : visibleAppointments.length;

  if (view === "login" || view === "register" || (view === "admin" && !auth)) {
    return (
      <main className="login-page">
        <form
          className={`login-card ${view === "register" ? "login-card--register" : ""}`}
          onSubmit={view === "register" ? handleCreateAppointment : handleLogin}
        >
          <BrandLogo />
          <div className="mode-tabs">
            <button
              type="button"
              className={view !== "register" ? "active" : ""}
              onClick={() => setView("login")}
            >
              Login
            </button>
            <button
              type="button"
              className={view === "register" ? "active" : ""}
              onClick={() => setView("register")}
            >
              Cadastrar
            </button>
          </div>
          {view === "register" ? (
            <>
              <label>
                Profissional
                <select
                  value={professionalId}
                  onChange={(event) => setProfessionalId(event.target.value)}
                >
                  {professionals.map((prof) => (
                    <option key={prof.id} value={prof.id}>
                      {prof.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Data
                <input
                  type="date"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                />
              </label>
              <div className="slot-area slot-area--login">
                {loadingSlots ? (
                  <span className="notice">Carregando horarios...</span>
                ) : slotItems.length ? (
                  <div className="slot-grid slot-grid--compact">
                    {slotItems.map((slot) => (
                      <button
                        type="button"
                        key={slot.startAt}
                        className={`slot ${
                          selectedSlot === slot.startAt ? "selected" : ""
                        }`}
                        onClick={() => setSelectedSlot(slot.startAt)}
                      >
                        {slot.label}
                      </button>
                    ))}
                  </div>
                ) : (
                  <span className="notice">Sem horarios para a data.</span>
                )}
              </div>
              <label>
                Nome
                <input
                  value={client.name}
                  onChange={(event) =>
                    setClient((prev) => ({ ...prev, name: event.target.value }))
                  }
                  required
                />
              </label>
              <label>
                E-mail
                <input
                  type="email"
                  value={client.email}
                  onChange={(event) =>
                    setClient((prev) => ({ ...prev, email: event.target.value }))
                  }
                  required
                />
              </label>
              <label>
                Telefone
                <input
                  value={client.phone}
                  onChange={(event) =>
                    setClient((prev) => ({ ...prev, phone: event.target.value }))
                  }
                />
              </label>
              <button className="pill-submit" type="submit">
                Agendar <span aria-hidden="true">-&gt;</span>
              </button>
              {publicMessage && <span className="notice">{publicMessage}</span>}
            </>
          ) : (
            <>
              <label>
                E-mail
                <input type="email" name="email" required />
              </label>
              <label>
                Senha
                <input type="password" name="password" required />
              </label>
              <button className="pill-submit" type="submit">
                Entrar <span aria-hidden="true">-&gt;</span>
              </button>
              {adminMessage && <span className="notice">{adminMessage}</span>}
            </>
          )}
        </form>
      </main>
    );
  }

  return (
    <div className="dashboard-page">
      <nav className="main-nav" aria-label="Navegacao principal">
        <div className="nav-left">
          <button
            type="button"
            className={view === "public" ? "active" : ""}
            onClick={() => setView("public")}
          >
            Agendamento
          </button>
          {isAdmin && (
            <button
              type="button"
              className={adminTab === "spaces" ? "active" : ""}
              onClick={() => {
                setView(auth ? "admin" : "login");
                setAdminTab("spaces");
              }}
            >
              Espaços
            </button>
          )}
        </div>

        <button
          type="button"
          className="nav-logo"
          onClick={() => setView("public")}
          aria-label="Voltar para agendamento"
        >
          <BrandLogo compact />
        </button>

        <div className="nav-right">
          <button
            type="button"
            className={view === "admin" && adminTab === "calendar" ? "active" : ""}
            onClick={() => {
              setView(auth ? "admin" : "login");
              setAdminTab("calendar");
            }}
          >
            {panelTitle}
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={() => {
              setView(auth ? "admin" : "login");
              setAdminTab("notifications");
            }}
            aria-label="Notificacoes"
            title="Notificacoes"
            >
            ⚙
          </button>
          <button
            type="button"
            className="avatar-button"
            onClick={() => setView(auth ? "admin" : "login")}
            aria-label="Perfil administrativo"
            title="Perfil administrativo"
          >
            <span />
          </button>
        </div>
      </nav>

      <main className="workspace">
        {view === "public" && (
          <section className="content-grid">
            <div className="section-panel section-panel--wide">
              <div className="section-title-row">
                <h1>Agendamento</h1>
                <span>{slotItems.length} horarios</span>
              </div>

              <form className="booking-form" onSubmit={handleCreateAppointment}>
                <div className="form-row">
                  <label>
                    Profissional
                    <select
                      value={professionalId}
                      onChange={(event) => setProfessionalId(event.target.value)}
                    >
                      {professionals.map((prof) => (
                        <option key={prof.id} value={prof.id}>
                          {prof.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Data
                    <input
                      type="date"
                      value={date}
                      onChange={(event) => setDate(event.target.value)}
                    />
                  </label>
                </div>

                <div className="slot-area">
                  {loadingSlots ? (
                    <span className="notice">Carregando horarios...</span>
                  ) : slotItems.length ? (
                    <div className="slot-grid">
                      {slotItems.map((slot) => (
                        <button
                          type="button"
                          key={slot.startAt}
                          className={`slot ${
                            selectedSlot === slot.startAt ? "selected" : ""
                          }`}
                          onClick={() => setSelectedSlot(slot.startAt)}
                        >
                          {slot.label}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <span className="notice">Sem horarios para a data.</span>
                  )}
                </div>

                <div className="form-row">
                  <label>
                    Nome
                    <input
                      value={client.name}
                      onChange={(event) =>
                        setClient((prev) => ({ ...prev, name: event.target.value }))
                      }
                      required
                    />
                  </label>
                  <label>
                    E-mail
                    <input
                      type="email"
                      value={client.email}
                      onChange={(event) =>
                        setClient((prev) => ({ ...prev, email: event.target.value }))
                      }
                      required
                    />
                  </label>
                  <label>
                    Telefone
                    <input
                      value={client.phone}
                      onChange={(event) =>
                        setClient((prev) => ({ ...prev, phone: event.target.value }))
                      }
                    />
                  </label>
                </div>

                <button className="solid-action" type="submit">
                  Confirmar agendamento
                </button>
                {publicMessage && <span className="notice">{publicMessage}</span>}
              </form>
            </div>

            <aside className="section-panel stat-panel">
              <h2>Resumo</h2>
              <div className="stat-box">
                <strong>{professionals.length}</strong>
                <span>Profissionais</span>
              </div>
              <div className="stat-box">
                <strong>{date}</strong>
                <span>Data selecionada</span>
              </div>
            </aside>
          </section>
        )}

        {view === "admin" && (
          <section className="section-panel admin-panel">
            <div className="section-title-row">
              <div>
                <h1>{panelTitle}</h1>
                <span>{auth.user.name} · {auth.user.email}</span>
              </div>
              <button className="outline-action" type="button" onClick={handleLogout}>
                Sair
              </button>
            </div>

            <div className="admin-tabs">
              <button
                type="button"
                className={adminTab === "calendar" ? "active" : ""}
                onClick={() => setAdminTab("calendar")}
              >
                Calendario
              </button>
              <button
                type="button"
                className={adminTab === "appointments" ? "active" : ""}
                onClick={() => setAdminTab("appointments")}
              >
                Lista
              </button>
              {isAdmin && (
                <button
                  type="button"
                  className={adminTab === "spaces" ? "active" : ""}
                  onClick={() => setAdminTab("spaces")}
                >
                  Espacos
                </button>
              )}
              <button
                type="button"
                className={adminTab === "blocked" ? "active" : ""}
                onClick={() => setAdminTab("blocked")}
              >
                Bloqueios
              </button>
              <button
                type="button"
                className={adminTab === "notifications" ? "active" : ""}
                onClick={() => setAdminTab("notifications")}
              >
                Notificacoes
              </button>
              <button
                type="button"
                className={adminTab === "settings" ? "active" : ""}
                onClick={() => setAdminTab("settings")}
              >
                Configuracoes
              </button>
              <button
                type="button"
                className={adminTab === "google" ? "active" : ""}
                onClick={() => setAdminTab("google")}
              >
                Google Agenda
              </button>
            </div>

            <div className="summary-strip">
              <div>
                <strong>{summaryAppointments}</strong>
                <span>Atendimentos</span>
              </div>
              <div>
                <strong>{activeSpaces}</strong>
                <span>Espacos ativos</span>
              </div>
              <div>
                <strong>{pendingNotifications}</strong>
                <span>Notificacoes pendentes</span>
              </div>
            </div>

                {adminTab === "calendar" && (
                  <section className="calendar-shell">
                    <div className="calendar-toolbar">
                      <div>
                        <strong>
                          {calendarRange.start.toLocaleDateString("pt-BR", {
                            day: "2-digit",
                            month: "short"
                          })}{" "}
                          -{" "}
                          {addDays(calendarRange.end, -1).toLocaleDateString("pt-BR", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric"
                          })}
                        </strong>
                        <span>{visibleAppointments.length} compromissos no periodo</span>
                      </div>
                      <div className="calendar-actions">
                        <button
                          type="button"
                          className={calendarMode === "day" ? "active" : ""}
                          onClick={() => setCalendarMode("day")}
                        >
                          Dia
                        </button>
                        <button
                          type="button"
                          className={calendarMode === "week" ? "active" : ""}
                          onClick={() => setCalendarMode("week")}
                        >
                          Semana
                        </button>
                        <input
                          type="date"
                          value={calendarDate}
                          onChange={(event) => setCalendarDate(event.target.value)}
                        />
                      </div>
                    </div>

                    <div
                      className={`calendar-grid ${
                        calendarMode === "day" ? "calendar-grid--day" : ""
                      }`}
                    >
                      <div className="calendar-time-column">
                        <span />
                        {calendarHours.map((hour) => (
                          <span key={hour}>{String(hour).padStart(2, "0")}:00</span>
                        ))}
                      </div>
                      {calendarDays.map((day) => {
                        const dayKey = toDateInput(day);
                        const dayAppointments = visibleAppointments.filter(
                          (appointment) => toDateInput(new Date(appointment.startAt)) === dayKey
                        );

                        return (
                          <div className="calendar-day" key={dayKey}>
                            <div className="calendar-day-head">
                              <span>{dayLabels[day.getDay()]}</span>
                              <strong>{day.getDate()}</strong>
                            </div>
                            <div className="calendar-day-body">
                              {calendarHours.map((hour) => (
                                <span className="calendar-hour-line" key={hour} />
                              ))}
                              {dayAppointments.map((appointment) => {
                                const startHour = getHourPosition(appointment.startAt);
                                const endHour = getHourPosition(appointment.endAt);
                                const top = Math.max(0, (startHour - 8) * 64);
                                const height = Math.max(44, (endHour - startHour) * 64);

                                return (
                                  <article
                                    className={`calendar-event ${
                                      statusClass[appointment.status] ?? "scheduled"
                                    }`}
                                    key={appointment.id}
                                    style={{ top: `${top}px`, minHeight: `${height}px` }}
                                  >
                                    <strong>{appointment.client.name}</strong>
                                    <span>
                                      {formatTime(appointment.startAt)} - {formatTime(appointment.endAt)}
                                    </span>
                                    <small>{appointment.space?.name ?? "Sem espaco"}</small>
                                  </article>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                )}

                {adminTab === "appointments" && (
                  <>
                    <form
                      className="inline-form"
                      onSubmit={(event) => {
                        event.preventDefault();
                        loadListAppointments();
                      }}
                    >
                      <input
                        type="date"
                        value={listFilters.from}
                        onChange={(event) =>
                          setListFilters((prev) => ({ ...prev, from: event.target.value }))
                        }
                      />
                      <input
                        type="date"
                        value={listFilters.to}
                        onChange={(event) =>
                          setListFilters((prev) => ({ ...prev, to: event.target.value }))
                        }
                      />
                      <button className="outline-action" type="submit">
                        Filtrar periodo
                      </button>
                    </form>
                    {loadingListAppointments ? (
                      <span className="notice">Carregando atendimentos...</span>
                    ) : listAppointmentsData.length ? (
                      <div className="record-grid">
                        {listAppointmentsData.map((appointment) => (
                          <article className="record-card" key={appointment.id}>
                            <div className="record-head">
                              <div>
                                <h3>{appointment.client.name}</h3>
                                <span>{formatDate(appointment.startAt)}</span>
                              </div>
                              <span
                                className={`status ${
                                  statusClass[appointment.status] ?? "scheduled"
                                }`}
                              >
                                {statusLabels[appointment.status] ?? appointment.status}
                              </span>
                            </div>
                            <label>
                              Status
                              <select
                                value={appointment.status}
                                onChange={(event) =>
                                  handleStatusChange(appointment.id, event.target.value)
                                }
                              >
                                {Object.keys(statusLabels).map((key) => (
                                  <option key={key} value={key}>
                                    {statusLabels[key]}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label>
                              Espaco
                              <select
                                value={appointment.space?.id ?? ""}
                                onChange={(event) => {
                                  const value = event.target.value;
                                  if (value) handleSpaceAssign(appointment.id, value);
                                }}
                              >
                                <option value="">Sem espaco</option>
                                {spaces
                                  .filter((space) => space.isActive)
                                  .map((space) => (
                                    <option key={space.id} value={space.id}>
                                      {space.name}
                                    </option>
                                  ))}
                              </select>
                            </label>
                          </article>
                        ))}
                      </div>
                    ) : (
                      <span className="notice">Sem atendimentos no periodo.</span>
                    )}
                  </>
                )}

                {isAdmin && adminTab === "spaces" && (
                  <>
                    <form className="inline-form" onSubmit={handleSpaceCreate}>
                      <input
                        value={spaceForm.name}
                        onChange={(event) =>
                          setSpaceForm((prev) => ({ ...prev, name: event.target.value }))
                        }
                        placeholder="Nome do espaco"
                        required
                      />
                      <input
                        type="number"
                        min="1"
                        value={spaceForm.capacity}
                        onChange={(event) =>
                          setSpaceForm((prev) => ({
                            ...prev,
                            capacity: event.target.value
                          }))
                        }
                        placeholder="Capacidade"
                      />
                      <input
                        value={spaceForm.description}
                        onChange={(event) =>
                          setSpaceForm((prev) => ({
                            ...prev,
                            description: event.target.value
                          }))
                        }
                        placeholder="Descricao"
                      />
                      <button className="solid-action" type="submit">
                        Adicionar
                      </button>
                    </form>
                    {loadingSpaces ? (
                      <span className="notice">Carregando espacos...</span>
                    ) : (
                      <div className="record-grid">
                        {spaces.map((space) => (
                          <article className="record-card" key={space.id}>
                            <h3>{space.name}</h3>
                            <span>Capacidade: {space.capacity ?? "-"}</span>
                            <span>{space.description ?? "Sem descricao"}</span>
                            <span>{space.isActive ? "Ativo" : "Inativo"}</span>
                            {space.isActive && (
                              <button
                                className="outline-action"
                                type="button"
                                onClick={() => handleSpaceDeactivate(space.id)}
                              >
                                Desativar
                              </button>
                            )}
                          </article>
                        ))}
                      </div>
                    )}
                  </>
                )}

                {adminTab === "blocked" && (
                  <>
                    <form className="inline-form" onSubmit={handleBlockedCreate}>
                      <select
                        value={blockedForm.type}
                        onChange={(event) =>
                          setBlockedForm((prev) => ({
                            ...prev,
                            type: event.target.value
                          }))
                        }
                      >
                        <option value="single">Pontual</option>
                        <option value="recurring">Recorrente</option>
                      </select>
                      {blockedForm.type === "single" ? (
                        <>
                          <input
                            type="datetime-local"
                            value={blockedForm.startAt}
                            onChange={(event) =>
                              setBlockedForm((prev) => ({
                                ...prev,
                                startAt: event.target.value
                              }))
                            }
                            required
                          />
                          <input
                            type="datetime-local"
                            value={blockedForm.endAt}
                            onChange={(event) =>
                              setBlockedForm((prev) => ({
                                ...prev,
                                endAt: event.target.value
                              }))
                            }
                            required
                          />
                        </>
                      ) : (
                        <>
                          <select
                            value={blockedForm.dayOfWeek}
                            onChange={(event) =>
                              setBlockedForm((prev) => ({
                                ...prev,
                                dayOfWeek: event.target.value
                              }))
                            }
                          >
                            <option value="0">Domingo</option>
                            <option value="1">Segunda</option>
                            <option value="2">Terca</option>
                            <option value="3">Quarta</option>
                            <option value="4">Quinta</option>
                            <option value="5">Sexta</option>
                            <option value="6">Sabado</option>
                          </select>
                          <input
                            type="time"
                            value={blockedForm.startTime}
                            onChange={(event) =>
                              setBlockedForm((prev) => ({
                                ...prev,
                                startTime: event.target.value
                              }))
                            }
                            required
                          />
                          <input
                            type="time"
                            value={blockedForm.endTime}
                            onChange={(event) =>
                              setBlockedForm((prev) => ({
                                ...prev,
                                endTime: event.target.value
                              }))
                            }
                            required
                          />
                        </>
                      )}
                      <input
                        value={blockedForm.reason}
                        onChange={(event) =>
                          setBlockedForm((prev) => ({
                            ...prev,
                            reason: event.target.value
                          }))
                        }
                        placeholder="Motivo"
                      />
                      <button className="solid-action" type="submit">
                        Criar
                      </button>
                    </form>
                    {loadingBlocked ? (
                      <span className="notice">Carregando bloqueios...</span>
                    ) : (
                      <div className="record-grid">
                        {blockedPeriods.map((period) => (
                          <article className="record-card" key={period.id}>
                            <h3>{period.isRecurring ? "Recorrente" : "Pontual"}</h3>
                            <span>
                              {period.isRecurring
                                ? `Dia ${period.dayOfWeek} ${period.startTime} - ${period.endTime}`
                                : `${formatDate(period.startAt)} - ${formatDate(period.endAt)}`}
                            </span>
                            <span>{period.reason ?? "Sem motivo"}</span>
                            <button
                              className="outline-action"
                              type="button"
                              onClick={() => handleBlockedDelete(period.id)}
                            >
                              Remover
                            </button>
                          </article>
                        ))}
                      </div>
                    )}
                  </>
                )}

                {adminTab === "notifications" && (
                  <>
                    <form
                      className="inline-form"
                      onSubmit={(event) => {
                        event.preventDefault();
                        loadNotifications();
                      }}
                    >
                      <input
                        type="date"
                        value={notificationFilters.from}
                        onChange={(event) =>
                          setNotificationFilters((prev) => ({
                            ...prev,
                            from: event.target.value
                          }))
                        }
                      />
                      <input
                        type="date"
                        value={notificationFilters.to}
                        onChange={(event) =>
                          setNotificationFilters((prev) => ({
                            ...prev,
                            to: event.target.value
                          }))
                        }
                      />
                      <select
                        value={notificationFilters.status}
                        onChange={(event) =>
                          setNotificationFilters((prev) => ({
                            ...prev,
                            status: event.target.value
                          }))
                        }
                      >
                        <option value="PENDING">Pendentes</option>
                        <option value="SENT">Enviadas</option>
                        <option value="FAILED">Falhas</option>
                        <option value="CANCELED">Canceladas</option>
                        <option value="">Todas</option>
                      </select>
                      <button className="outline-action" type="submit">
                        Filtrar notificacoes
                      </button>
                    </form>
                    {loadingNotifications ? (
                      <span className="notice">Carregando notificacoes...</span>
                    ) : notifications.length ? (
                      <div className="record-grid">
                        {notifications.map((notification) => (
                          <article className="record-card" key={notification.id}>
                            <h3>{notification.appointment.client.name}</h3>
                            <span>Começa em: {formatDate(notification.appointment.startAt)}</span>
                            <span>Foi enviado em: {formatDate(notification.sendAt)}</span>
                            <span>Status: {notification.status}</span>
                            <span>
                              Profissional: {notification.appointment.professional.name}
                            </span>
                            <button
                              className="outline-action"
                              type="button"
                              disabled={
                                processingNotificationId === notification.id ||
                                notification.status === "CANCELED"
                              }
                              onClick={() => handleNotificationCancel(notification.id)}
                            >
                              {processingNotificationId === notification.id
                                ? "Cancelando..."
                                : "Dispensar notificacao"}
                            </button>
                          </article>
                        ))}
                      </div>
                    ) : (
                      <span className="notice">Sem notificacoes.</span>
                    )}
                  </>
                )}

                {adminTab === "settings" && (
                  <form className="settings-panel" onSubmit={handleAvailabilitySave}>
                    <div className="settings-head">
                      <div>
                        <h2>Personalizacao da agenda</h2>
                        <span>
                          Defina dias de funcionamento, horarios e duracao padrao dos atendimentos.
                        </span>
                      </div>
                      <button className="solid-action" type="submit">
                        Salvar configuracao
                      </button>
                    </div>
                    {loadingAvailability ? (
                      <span className="notice">Carregando configuracoes...</span>
                    ) : (
                      <div className="availability-grid">
                        {availabilityForm.map((rule, index) => (
                          <div className="availability-row" key={rule.dayOfWeek}>
                            <label className="toggle-row">
                              <input
                                type="checkbox"
                                checked={rule.isActive}
                                onChange={(event) =>
                                  setAvailabilityForm((prev) =>
                                    prev.map((item, itemIndex) =>
                                      itemIndex === index
                                        ? { ...item, isActive: event.target.checked }
                                        : item
                                    )
                                  )
                                }
                              />
                              {fullDayLabels[rule.dayOfWeek]}
                            </label>
                            <input
                              type="time"
                              value={rule.startTime}
                              disabled={!rule.isActive}
                              onChange={(event) =>
                                setAvailabilityForm((prev) =>
                                  prev.map((item, itemIndex) =>
                                    itemIndex === index
                                      ? { ...item, startTime: event.target.value }
                                      : item
                                  )
                                )
                              }
                            />
                            <input
                              type="time"
                              value={rule.endTime}
                              disabled={!rule.isActive}
                              onChange={(event) =>
                                setAvailabilityForm((prev) =>
                                  prev.map((item, itemIndex) =>
                                    itemIndex === index
                                      ? { ...item, endTime: event.target.value }
                                      : item
                                  )
                                )
                              }
                            />
                            <input
                              type="number"
                              min="15"
                              step="15"
                              value={rule.slotMinutes}
                              disabled={!rule.isActive}
                              onChange={(event) =>
                                setAvailabilityForm((prev) =>
                                  prev.map((item, itemIndex) =>
                                    itemIndex === index
                                      ? { ...item, slotMinutes: event.target.value }
                                      : item
                                  )
                                )
                              }
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </form>
                )}

                {adminTab === "google" && (
                  <section className="google-panel">
                    <div>
                      <h2>Google Agenda</h2>
                      <p>
                        A Fase 3 prepara a conexao OAuth 2.0 para exportar compromissos
                        e futuramente importar eventos externos para evitar conflitos.
                      </p>
                    </div>
                    {loadingGoogle ? (
                      <span className="notice">Verificando integracao...</span>
                    ) : (
                      <div className="google-card">
                        <strong>
                          {googleStatus?.configured
                            ? "OAuth configurado"
                            : "OAuth pendente"}
                        </strong>
                        <span>
                          {googleStatus?.message ??
                            "Abra esta aba para verificar a configuracao do Google Calendar."}
                        </span>
                        <div className="google-actions">
                          {googleStatus?.authUrl && (
                            <a href={googleStatus.authUrl} target="_blank" rel="noreferrer">
                              Conectar Google
                            </a>
                          )}
                          <button
                            className="outline-action"
                            type="button"
                            onClick={handleGoogleExport}
                          >
                            Exportar agenda
                          </button>
                        </div>
                      </div>
                    )}
                  </section>
                )}

                {adminMessage && <span className="notice">{adminMessage}</span>}
          </section>
        )}
      </main>
    </div>
  );
}
