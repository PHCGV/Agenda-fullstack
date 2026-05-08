import { useEffect, useMemo, useState } from "react";
import {
  createAppointment,
  createBlockedPeriod,
  createSpace,
  deleteBlockedPeriod,
  deleteSpace,
  getAppointments,
  getAvailability,
  getBlockedPeriods,
  getNotifications,
  getProfessionals,
  getSpaces,
  login,
  logout,
  updateAppointmentSpace,
  updateAppointmentStatus
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

export default function App() {
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
  const [appointments, setAppointments] = useState([]);
  const [adminMessage, setAdminMessage] = useState("");
  const [loadingAppointments, setLoadingAppointments] = useState(false);
  const [adminTab, setAdminTab] = useState("appointments");
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
  const [loadingSpaces, setLoadingSpaces] = useState(false);
  const [loadingBlocked, setLoadingBlocked] = useState(false);
  const [loadingNotifications, setLoadingNotifications] = useState(false);

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
    setAppointments([]);
    setView("login");
  }

  async function loadAppointments() {
    if (!auth?.accessToken) return;
    setLoadingAppointments(true);
    setAdminMessage("");
    try {
      const from = new Date().toISOString();
      const to = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const data = await getAppointments(from, to, auth.accessToken);
      setAppointments(data);
    } catch (error) {
      setAdminMessage(error.message);
    } finally {
      setLoadingAppointments(false);
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
      const data = await getNotifications(auth.accessToken);
      setNotifications(data);
    } catch (error) {
      setAdminMessage(error.message);
    } finally {
      setLoadingNotifications(false);
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
      await loadAppointments();
    } catch (error) {
      setAdminMessage(error.message);
    }
  }

  async function handleStatusChange(id, status) {
    if (!auth?.accessToken) return;
    try {
      await updateAppointmentStatus(id, status, null, auth.accessToken);
      await loadAppointments();
    } catch (error) {
      setAdminMessage(error.message);
    }
  }

  useEffect(() => {
    if (view === "public" || view === "register") {
      loadAvailability();
    }
  }, [view, date, professionalId]);

  useEffect(() => {
    if (auth?.accessToken && view === "admin") {
      loadAppointments();
      loadSpaces();
    }
  }, [auth, view]);

  useEffect(() => {
    if (!auth?.accessToken || view !== "admin") return;
    if (adminTab === "spaces") loadSpaces();
    if (adminTab === "blocked") loadBlockedPeriods();
    if (adminTab === "notifications") loadNotifications();
  }, [adminTab, auth, view]);

  const slotItems = useMemo(() => {
    return slots.map((slot) => ({
      startAt: slot.startAt,
      label: formatTime(slot.startAt)
    }));
  }, [slots]);

  const activeSpaces = spaces.filter((space) => space.isActive).length;
  const pendingNotifications = notifications.filter(
    (notification) => notification.status === "PENDING"
  ).length;

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
                Username
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
          <button
            type="button"
            className={adminTab === "spaces" ? "active" : ""}
            onClick={() => {
              setView(auth ? "admin" : "login");
              setAdminTab("spaces");
            }}
          >
            Espacos
          </button>
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
            className={view === "admin" && adminTab === "appointments" ? "active" : ""}
            onClick={() => {
              setView(auth ? "admin" : "login");
              setAdminTab("appointments");
            }}
          >
            Administrativo
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
                <h1>Administrativo</h1>
                <span>{auth.user.name} · {auth.user.email}</span>
              </div>
              <button className="outline-action" type="button" onClick={handleLogout}>
                Sair
              </button>
            </div>

            <div className="admin-tabs">
              <button
                type="button"
                className={adminTab === "appointments" ? "active" : ""}
                onClick={() => setAdminTab("appointments")}
              >
                Agenda
              </button>
              <button
                type="button"
                className={adminTab === "spaces" ? "active" : ""}
                onClick={() => setAdminTab("spaces")}
              >
                Espacos
              </button>
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
            </div>

            <div className="summary-strip">
              <div>
                <strong>{appointments.length}</strong>
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

                {adminTab === "appointments" && (
                  <>
                    <button className="outline-action" type="button" onClick={loadAppointments}>
                      Atualizar agenda
                    </button>
                    {loadingAppointments ? (
                      <span className="notice">Carregando atendimentos...</span>
                    ) : appointments.length ? (
                      <div className="record-grid">
                        {appointments.map((appointment) => (
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

                {adminTab === "spaces" && (
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
                    <button className="outline-action" type="button" onClick={loadNotifications}>
                      Atualizar notificacoes
                    </button>
                    {loadingNotifications ? (
                      <span className="notice">Carregando notificacoes...</span>
                    ) : notifications.length ? (
                      <div className="record-grid">
                        {notifications.map((notification) => (
                          <article className="record-card" key={notification.id}>
                            <h3>{notification.appointment.client.name}</h3>
                            <span>{formatDate(notification.sendAt)}</span>
                            <span>{notification.status}</span>
                          </article>
                        ))}
                      </div>
                    ) : (
                      <span className="notice">Sem notificacoes.</span>
                    )}
                  </>
                )}

                {adminMessage && <span className="notice">{adminMessage}</span>}
          </section>
        )}
      </main>
    </div>
  );
}
