import { useEffect, useMemo, useState } from "react";
import {
  createAppointment,
  getAppointments,
  getAvailability,
  getProfessionals,
  login,
  logout,
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

function formatDate(iso) {
  const date = new Date(iso);
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function App() {
  const [view, setView] = useState("public");
  const [professionals, setProfessionals] = useState([]);
  const [professionalId, setProfessionalId] = useState("");
  const [date, setDate] = useState(today());
  const [slots, setSlots] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState("");
  const [client, setClient] = useState({ name: "", email: "", phone: "" });
  const [publicMessage, setPublicMessage] = useState("");
  const [loadingSlots, setLoadingSlots] = useState(false);

  const [auth, setAuth] = useState(() => {
    const stored = localStorage.getItem("consilium-auth");
    return stored ? JSON.parse(stored) : null;
  });
  const [appointments, setAppointments] = useState([]);
  const [adminMessage, setAdminMessage] = useState("");
  const [loadingAppointments, setLoadingAppointments] = useState(false);

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
      localStorage.setItem("consilium-auth", JSON.stringify(payload));
      setAuth(payload);
    } catch (error) {
      setAdminMessage(error.message);
    }
  }

  async function handleLogout() {
    if (auth?.refreshToken) {
      await logout(auth.refreshToken).catch(() => null);
    }
    localStorage.removeItem("consilium-auth");
    setAuth(null);
    setAppointments([]);
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
    if (view === "public") {
      loadAvailability();
    }
  }, [view, date, professionalId]);

  useEffect(() => {
    if (auth?.accessToken && view === "admin") {
      loadAppointments();
    }
  }, [auth, view]);

  const slotItems = useMemo(() => {
    return slots.map((slot) => ({
      startAt: slot.startAt,
      label: formatDate(slot.startAt)
    }));
  }, [slots]);

  return (
    <div className="app">
      <header className="header">
        <h1>Consilium</h1>
        <p>Agenda digital com status e visao clara dos atendimentos.</p>
        <div className="nav">
          <button
            type="button"
            className={view === "public" ? "active" : ""}
            onClick={() => setView("public")}
          >
            Agendar
          </button>
          <button
            type="button"
            className={view === "admin" ? "active" : ""}
            onClick={() => setView("admin")}
          >
            Painel
          </button>
        </div>
      </header>

      <main className="main">
        {view === "public" && (
          <section className="panel">
            <h2 className="section-title">Agendamento online</h2>
            <form className="form" onSubmit={handleCreateAppointment}>
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
              <label>
                Horarios disponiveis
                {loadingSlots ? (
                  <span className="notice">Carregando...</span>
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
                        {slot.label.split(" ").slice(-1)}
                      </button>
                    ))}
                  </div>
                ) : (
                  <span className="notice">Sem horarios para a data.</span>
                )}
              </label>
              <label>
                Nome
                <input
                  value={client.name}
                  onChange={(event) =>
                    setClient((prev) => ({ ...prev, name: event.target.value }))
                  }
                  placeholder="Seu nome"
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
                  placeholder="seu@email.com"
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
                  placeholder="(00) 00000-0000"
                />
              </label>
              <button className="primary" type="submit">
                Confirmar agendamento
              </button>
              {publicMessage && <span className="notice">{publicMessage}</span>}
            </form>
          </section>
        )}

        {view === "admin" && (
          <section className="panel">
            <h2 className="section-title">Painel administrativo</h2>
            {!auth ? (
              <form className="form" onSubmit={handleLogin}>
                <label>
                  Email
                  <input type="email" name="email" required />
                </label>
                <label>
                  Senha
                  <input type="password" name="password" required />
                </label>
                <button className="primary" type="submit">
                  Entrar
                </button>
                {adminMessage && <span className="notice">{adminMessage}</span>}
              </form>
            ) : (
              <div className="form">
                <div>
                  <strong>{auth.user.name}</strong>
                  <div className="code">{auth.user.email}</div>
                </div>
                <button className="primary" type="button" onClick={handleLogout}>
                  Sair
                </button>
                <button className="slot" type="button" onClick={loadAppointments}>
                  Atualizar agenda
                </button>
                {loadingAppointments ? (
                  <span className="notice">Carregando atendimentos...</span>
                ) : appointments.length ? (
                  <div className="list">
                    {appointments.map((appointment) => (
                      <div className="card" key={appointment.id}>
                        <h4>{appointment.client.name}</h4>
                        <small>{formatDate(appointment.startAt)}</small>
                        <span
                          className={`status ${
                            statusClass[appointment.status] ?? "scheduled"
                          }`}
                        >
                          {statusLabels[appointment.status] ?? appointment.status}
                        </span>
                        <label>
                          Status
                          <select
                            value={appointment.status}
                            onChange={(event) =>
                              handleStatusChange(
                                appointment.id,
                                event.target.value
                              )
                            }
                          >
                            {Object.keys(statusLabels).map((key) => (
                              <option key={key} value={key}>
                                {statusLabels[key]}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                    ))}
                  </div>
                ) : (
                  <span className="notice">Sem atendimentos no periodo.</span>
                )}
                {adminMessage && <span className="notice">{adminMessage}</span>}
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
