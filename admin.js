import { initializeApp } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-app.js";
import {
    getAuth,
    signInWithEmailAndPassword,
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js";
import {
    getFirestore,
    collection,
    onSnapshot,
    doc,
    getDoc,
    updateDoc,
    setDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";
import { firebaseConfig, SITE_BASE_URL } from "./firebase-config.js";
import {
    agruparSolicitudesPorFecha,
    evaluarDisponibilidadDia,
    formatearMesAnio,
    diasDelMes,
    primerDiaSemanaMes,
    fechaIso,
    fechaHoyLocal,
    sincronizarSlotSolicitud,
    sincronizarSlotsDesdeSolicitudes
} from "./firebase-disponibilidad.js";

const ESTADOS = [
    { id: "todas", label: "Todas", filtro: null },
    { id: "pendiente", label: "Pendientes", filtro: "pendiente" },
    { id: "confirmado", label: "Confirmadas", filtro: "confirmado" },
    { id: "lista_espera", label: "Lista de espera", filtro: "lista_espera" },
    { id: "completado", label: "Completadas", filtro: "completado" },
    { id: "rechazado", label: "Rechazadas", filtro: "rechazado" },
    { id: "cancelado", label: "Canceladas", filtro: "cancelado" }
];

const ACCIONES_ESTADO = [
    { id: "pendiente", label: "Pendiente" },
    { id: "confirmado", label: "Confirmar" },
    { id: "lista_espera", label: "Lista espera" },
    { id: "completado", label: "Completado" },
    { id: "rechazado", label: "Rechazar" },
    { id: "cancelado", label: "Cancelar" }
];

const ETIQUETAS_ESTADO = {
    pendiente: "Pendiente",
    confirmado: "Confirmado",
    lista_espera: "Lista de espera",
    completado: "Completado",
    rechazado: "Rechazado",
    cancelado: "Cancelado"
};

const TIPO_LABELS = {
    traslado: "Traslado punto a punto",
    tour: "Tour Valle de Guadalupe"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const loginView = document.getElementById("loginView");
const adminView = document.getElementById("adminView");
const loginForm = document.getElementById("loginForm");
const loginError = document.getElementById("loginError");
const loginBtn = document.getElementById("loginBtn");
const adminUserEmail = document.getElementById("adminUserEmail");
const logoutBtn = document.getElementById("logoutBtn");
const adminStats = document.getElementById("adminStats");
const adminFilters = document.getElementById("adminFilters");
const solicitudesList = document.getElementById("solicitudesList");
const adminLoading = document.getElementById("adminLoading");
const adminEmpty = document.getElementById("adminEmpty");
const refreshBtn = document.getElementById("refreshBtn");
const resenasPendientesList = document.getElementById("resenasPendientesList");
const resenasPendientesCount = document.getElementById("resenasPendientesCount");
const resenasPendientesEmpty = document.getElementById("resenasPendientesEmpty");
const adminCalendarGrid = document.getElementById("adminCalendarGrid");
const adminCalTitle = document.getElementById("adminCalTitle");
const adminCalPrev = document.getElementById("adminCalPrev");
const adminCalNext = document.getElementById("adminCalNext");
const adminCalendarDayDetail = document.getElementById("adminCalendarDayDetail");
const adminCalendarDayTitle = document.getElementById("adminCalendarDayTitle");
const adminCalendarDayList = document.getElementById("adminCalendarDayList");
const adminCalendarPanel = document.getElementById("adminCalendarPanel");
const adminCalendarBtn = document.getElementById("adminCalendarBtn");
const adminCalendarClose = document.getElementById("adminCalendarClose");

let filtroActivo = "todas";
let solicitudes = [];
let resenasPendientes = [];
let solicitudesConocidas = new Set();
let cargaInicialSolicitudes = true;
let unsubscribeSolicitudes = null;
let unsubscribeResenas = null;
let actualizandoId = null;
let aprobandoResenaId = null;
let rechazandoResenaId = null;
let notificacionesHabilitadas = localStorage.getItem("tpv_admin_notify") === "1";
let calendarioMes = new Date().getMonth();
let calendarioAnio = new Date().getFullYear();
let calendarioDiaSeleccionado = fechaHoyLocal();
let disponibilidadSincronizada = false;
let calendarioAbierto = false;

const notifyBtn = document.getElementById("notifyBtn");

function mostrarLoginError(mensaje) {
    if (!loginError) return;
    loginError.textContent = mensaje;
    loginError.hidden = !mensaje;
}

function formatearFechaCorta(fechaStr) {
    if (!fechaStr) return "—";
    const [y, m, d] = fechaStr.split("-").map(Number);
    const meses = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
    return `${d} ${meses[m - 1]} ${y}`;
}

function formatearHorario12h(horario) {
    if (!horario) return "—";
    const [h, m] = horario.split(":").map(Number);
    const periodo = h < 12 ? "a.m." : "p.m.";
    const hora12 = h % 12 || 12;
    return `${hora12}:${String(m).padStart(2, "0")} ${periodo}`;
}

function formatearTimestamp(timestamp) {
    if (!timestamp?.toDate) return "—";
    return timestamp.toDate().toLocaleString("es-MX", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    });
}

function normalizarTelefonoWa(tel) {
    const digitos = String(tel || "").replace(/\D/g, "");
    if (digitos.length === 10) return `52${digitos}`;
    return digitos;
}

function obtenerUrlPublicaCliente() {
    return `${SITE_BASE_URL}/index.html`;
}

function construirUrlResena(token, refSolicitud) {
    const base = obtenerUrlPublicaCliente();

    if (token) {
        return `${base}?t=${token}`;
    }
    if (refSolicitud) {
        return `${base}?ref=${encodeURIComponent(refSolicitud)}`;
    }
    return base;
}

function construirMensajeConfirmacion(item) {
    const c = item.cliente || {};
    const v = item.viaje || {};
    const cot = item.cotizacion || {};
    const nombre = c.nombre?.split(" ")[0] || "estimado cliente";

    return [
        `Hola ${nombre}, soy Víctor de Traslados Privados Víctor.`,
        "",
        `✅ Tu solicitud ${item.refSolicitud || ""} está *CONFIRMADA*.`,
        "",
        `📅 Fecha: ${formatearFechaCorta(v.fecha)}`,
        `🕐 Horario: ${formatearHorario12h(v.horario)}`,
        `📍 ${v.origen || ""} → ${v.destino || ""}`,
        `💰 Estimado: $${cot.estimado ?? "—"} MXN`,
        "",
        "Cualquier duda, responde a este mensaje. ¡Nos vemos pronto!"
    ].join("\n");
}

function estrellasAdminHtml(cantidad) {
    const n = Math.max(1, Math.min(5, Number(cantidad) || 5));
    return `<span class="admin-resena-stars" aria-label="${n} estrellas">${"★".repeat(n)}${"☆".repeat(5 - n)}</span>`;
}

function generarTokenResena() {
    if (crypto?.randomUUID) {
        return crypto.randomUUID().replace(/-/g, "");
    }
    return `${Date.now()}${Math.random().toString(36).slice(2, 12)}`;
}

async function crearInvitacionResena(item) {
    const telefono = normalizarTelefonoWa(item.cliente?.telefono);
    const refSolicitud = item.refSolicitud;

    if (!telefono || !refSolicitud) {
        console.warn("No se pudo crear invitación de reseña: falta teléfono o referencia.");
        return null;
    }

    const token = generarTokenResena();

    await setDoc(doc(db, "invitaciones_resena", token), {
        refSolicitud,
        solicitudId: item.id || null,
        telefono,
        usado: false,
        createdAt: serverTimestamp()
    });

    return token;
}

function construirUrlHistorial(historialToken) {
    if (!historialToken) return "";
    return `${SITE_BASE_URL}/historial.html?h=${historialToken}`;
}

async function obtenerOCrearTokenHistorial(item) {
    const telefono = normalizarTelefonoWa(item.cliente?.telefono);
    if (!telefono) return null;

    const indiceRef = doc(db, "historial_por_telefono", telefono);
    const indiceSnap = await getDoc(indiceRef);

    if (indiceSnap.exists()) {
        return indiceSnap.data().historialToken || null;
    }

    const historialToken = generarTokenResena();

    await setDoc(doc(db, "historial_clientes", historialToken), {
        telefono,
        nombreCliente: item.cliente?.nombre || "Cliente",
        createdAt: serverTimestamp()
    });

    await setDoc(indiceRef, {
        historialToken,
        telefono,
        updatedAt: serverTimestamp()
    });

    return historialToken;
}

async function registrarViajeHistorial(item, historialToken) {
    if (!historialToken || !item.refSolicitud) return;

    const v = item.viaje || {};
    const cot = item.cotizacion || {};

    await setDoc(doc(db, "historial_clientes", historialToken, "viajes", item.refSolicitud), {
        refSolicitud: item.refSolicitud,
        estado: "completado",
        fecha: v.fecha || null,
        horario: v.horario || null,
        origen: v.origen || "",
        destino: v.destino || "",
        km: v.km ?? null,
        estimado: cot.estimado ?? null,
        tipo: v.tipo || item.tipo || "traslado",
        completadoAt: serverTimestamp()
    }, { merge: true });
}

function construirMensajeResena(item, tokenResena, historialToken) {
    const c = item.cliente || {};
    const nombre = c.nombre?.split(" ")[0] || "estimado cliente";
    const linkResena = construirUrlResena(tokenResena, item.refSolicitud);
    const linkHistorial = construirUrlHistorial(historialToken);

    const lineas = [
        `Hola ${nombre}, gracias por viajar con Traslados Privados Víctor.`,
        "",
        "Esperamos que tu traslado haya sido excelente.",
        ""
    ];

    if (linkHistorial) {
        lineas.push(
            "Consulta tu historial de viajes:",
            linkHistorial,
            ""
        );
    }

    lineas.push(
        "¿Nos ayudas con una reseña? Solo toma 1 minuto.",
        "",
        "Deja tu reseña aquí:",
        linkResena,
        "",
        "¡Gracias por tu confianza!",
        "- Víctor"
    );

    return lineas.join("\n");
}

function abrirWhatsAppCliente(item, tipo, tokenResena = null, historialToken = null) {
    const telefono = normalizarTelefonoWa(item.cliente?.telefono);
    if (!telefono) return;

    const mensaje = tipo === "confirmado"
        ? construirMensajeConfirmacion(item)
        : construirMensajeResena(item, tokenResena, historialToken);

    window.open(`https://wa.me/${telefono}?text=${encodeURIComponent(mensaje)}`, "_blank", "noopener");
}

function escaparHtml(texto) {
    return String(texto ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function obtenerMillis(item) {
    const ts = item.createdAt;
    if (ts?.toMillis) return ts.toMillis();
    if (ts?.seconds) return ts.seconds * 1000;
    return 0;
}

function ordenarSolicitudes(lista) {
    return [...lista].sort((a, b) => obtenerMillis(b) - obtenerMillis(a));
}

function actualizarBotonAvisos() {
    if (!notifyBtn) return;

    if (!("Notification" in window)) {
        notifyBtn.textContent = "🔕 Sin avisos";
        notifyBtn.disabled = true;
        notifyBtn.classList.add("is-blocked");
        notifyBtn.title = "Este navegador no soporta notificaciones.";
        return;
    }

    if (Notification.permission === "denied") {
        notifyBtn.textContent = "🔕 Bloqueados";
        notifyBtn.classList.remove("is-active");
        notifyBtn.classList.add("is-blocked");
        notifyBtn.title = "Notificaciones bloqueadas. Actívalas en la configuración del navegador.";
        return;
    }

    notifyBtn.classList.remove("is-blocked");

    if (notificacionesHabilitadas && Notification.permission === "granted") {
        notifyBtn.textContent = "🔔 Avisos ON";
        notifyBtn.classList.add("is-active");
        notifyBtn.title = "Recibirás aviso al llegar una solicitud nueva.";
    } else {
        notifyBtn.textContent = "🔔 Activar avisos";
        notifyBtn.classList.remove("is-active");
        notifyBtn.title = "Activar avisos push de nuevas solicitudes.";
    }
}

async function registrarServiceWorkerAdmin() {
    if (!("serviceWorker" in navigator)) return;
    try {
        await navigator.serviceWorker.register("./admin-sw.js");
    } catch (err) {
        console.warn("Service worker admin:", err);
    }
}

async function solicitarPermisoAvisos() {
    if (!("Notification" in window)) {
        alert("Tu navegador no soporta notificaciones.");
        return false;
    }

    if (Notification.permission === "granted") {
        notificacionesHabilitadas = true;
        localStorage.setItem("tpv_admin_notify", "1");
        actualizarBotonAvisos();
        return true;
    }

    if (Notification.permission === "denied") {
        alert("Las notificaciones están bloqueadas. En Chrome: candado en la barra de direcciones → Notificaciones → Permitir.");
        actualizarBotonAvisos();
        return false;
    }

    const permiso = await Notification.requestPermission();
    notificacionesHabilitadas = permiso === "granted";
    if (notificacionesHabilitadas) {
        localStorage.setItem("tpv_admin_notify", "1");
    } else {
        localStorage.removeItem("tpv_admin_notify");
    }
    actualizarBotonAvisos();
    return notificacionesHabilitadas;
}

function mostrarAvisoNuevaSolicitud(item) {
    if (!notificacionesHabilitadas || Notification.permission !== "granted") return;

    const cliente = item.cliente || {};
    const viaje = item.viaje || {};
    const titulo = `Nueva solicitud ${item.refSolicitud || ""}`.trim();
    const cuerpo = [
        cliente.nombre || "Cliente",
        `${viaje.fecha || ""} ${viaje.horario || ""}`.trim(),
        viaje.origen && viaje.destino ? `${viaje.origen} → ${viaje.destino}` : ""
    ].filter(Boolean).join("\n");

    try {
        new Notification(titulo, {
            body: cuerpo,
            icon: "./icons/icon-192.png",
            badge: "./icons/favicon-32.png",
            tag: `solicitud-${item.id}`,
            requireInteraction: true
        });
    } catch (err) {
        console.warn("Notification:", err);
    }

    if (document.hidden && navigator.vibrate) {
        navigator.vibrate([200, 100, 200]);
    }
}

function procesarNuevasSolicitudes(lista) {
    if (cargaInicialSolicitudes) {
        lista.forEach(item => solicitudesConocidas.add(item.id));
        cargaInicialSolicitudes = false;
        return;
    }

    lista.forEach(item => {
        if (!solicitudesConocidas.has(item.id)) {
            solicitudesConocidas.add(item.id);
            if ((item.estado || "pendiente") === "pendiente") {
                mostrarAvisoNuevaSolicitud(item);
            }
        }
    });
}

function solicitudesFiltradas() {
    const config = ESTADOS.find(e => e.id === filtroActivo);
    if (!config?.filtro) return solicitudes;
    return solicitudes.filter(s => s.estado === config.filtro);
}

function renderStats() {
    if (!adminStats) return;

    const conteos = {
        pendiente: 0,
        confirmado: 0,
        lista_espera: 0,
        completado: 0
    };

    solicitudes.forEach(s => {
        if (conteos[s.estado] !== undefined) conteos[s.estado]++;
    });

    adminStats.innerHTML = `
        <div class="admin-stat">
            <span class="admin-stat-value">${solicitudes.length}</span>
            <span class="admin-stat-label">Total</span>
        </div>
        <div class="admin-stat">
            <span class="admin-stat-value">${conteos.pendiente}</span>
            <span class="admin-stat-label">Pendientes</span>
        </div>
        <div class="admin-stat">
            <span class="admin-stat-value">${conteos.confirmado}</span>
            <span class="admin-stat-label">Confirmadas</span>
        </div>
        <div class="admin-stat">
            <span class="admin-stat-value">${conteos.lista_espera}</span>
            <span class="admin-stat-label">Lista espera</span>
        </div>
    `;
}

function renderFiltros() {
    if (!adminFilters) return;

    adminFilters.innerHTML = ESTADOS.map(estado => `
        <button
            type="button"
            class="admin-filter-btn${filtroActivo === estado.id ? " is-active" : ""}"
            data-filtro="${estado.id}"
            role="tab"
            aria-selected="${filtroActivo === estado.id}"
        >${estado.label}</button>
    `).join("");

    adminFilters.querySelectorAll(".admin-filter-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            filtroActivo = btn.dataset.filtro;
            renderFiltros();
            renderLista();
        });
    });
}

function renderTarjetaSolicitud(item) {
    const c = item.cliente || {};
    const v = item.viaje || {};
    const cot = item.cotizacion || {};
    const estado = item.estado || "pendiente";
    const tipo = TIPO_LABELS[v.tipo] || v.tipo || "—";
    const waTel = normalizarTelefonoWa(c.telefono);
    const waMsg = encodeURIComponent(
        `Hola ${c.nombre}, soy Víctor de Traslados Privados. Sobre tu solicitud ${item.refSolicitud || ""}…`
    );

    const badges = [];
    if (v.esMadrugada) badges.push("Madrugada");
    if (v.esInmediato) badges.push("Inmediato");
    if (v.esForaneo) badges.push("Foráneo");
    if (v.idaVuelta) badges.push("Ida y vuelta");

    const acciones = ACCIONES_ESTADO.map(accion => {
        const esActual = estado === accion.id;
        const disabled = actualizandoId === item.id ? "disabled" : "";
        return `<button
            type="button"
            class="admin-estado-btn${esActual ? " is-current" : ""}"
            data-id="${item.id}"
            data-estado="${accion.id}"
            ${esActual ? "disabled" : disabled}
        >${accion.label}</button>`;
    }).join("");

    return `
        <article class="admin-card" data-id="${item.id}">
            <div class="admin-card-header">
                <div>
                    <div class="admin-card-ref">${escaparHtml(item.refSolicitud || "Sin ref.")}</div>
                    <div class="admin-card-meta">Recibida: ${formatearTimestamp(item.createdAt)}</div>
                </div>
                <span class="admin-estado admin-estado--${estado}">${ETIQUETAS_ESTADO[estado] || estado}</span>
            </div>
            <div class="admin-card-body">
                <div class="admin-card-block">
                    <h4>Cliente</h4>
                    <ul>
                        <li><strong>${escaparHtml(c.nombre)}</strong></li>
                        <li>${escaparHtml(c.telefono)}</li>
                        <li>${c.pasajeros || 1} pasajero(s)</li>
                        <li>Emergencia: ${escaparHtml(c.emergenciaNombre)} — ${escaparHtml(c.emergenciaTel)}</li>
                    </ul>
                </div>
                <div class="admin-card-block">
                    <h4>Viaje</h4>
                    <ul>
                        <li>${escaparHtml(tipo)}</li>
                        <li>${formatearFechaCorta(v.fecha)} · ${formatearHorario12h(v.horario)}</li>
                        <li><strong>${escaparHtml(v.origen)}</strong></li>
                        <li>→ ${escaparHtml(v.destino)}</li>
                        ${v.km != null ? `<li>${v.km} km · ${v.minutos || "—"} min</li>` : ""}
                        ${badges.length ? `<li>${badges.join(" · ")}</li>` : ""}
                    </ul>
                </div>
                <div class="admin-card-block">
                    <h4>Cotización</h4>
                    <p class="admin-card-price">$${cot.estimado ?? "—"} MXN</p>
                    <p>Tope imprevistos: $${cot.topeImprevistos ?? "—"} MXN</p>
                    <p>${escaparHtml(cot.nivelServicio || "")}</p>
                </div>
            </div>
            <div class="admin-card-footer">
                ${acciones}
                <a
                    class="admin-wa-link"
                    href="https://wa.me/${waTel}?text=${waMsg}"
                    target="_blank"
                    rel="noopener"
                >WhatsApp cliente</a>
            </div>
        </article>
    `;
}

function renderLista() {
    const lista = solicitudesFiltradas();

    if (adminLoading) adminLoading.hidden = true;

    if (!lista.length) {
        if (adminEmpty) adminEmpty.hidden = false;
        if (solicitudesList) solicitudesList.innerHTML = "";
        return;
    }

    if (adminEmpty) adminEmpty.hidden = true;
    if (solicitudesList) {
        solicitudesList.innerHTML = lista.map(renderTarjetaSolicitud).join("");
        solicitudesList.querySelectorAll(".admin-estado-btn:not(.is-current)").forEach(btn => {
            btn.addEventListener("click", () => cambiarEstado(btn.dataset.id, btn.dataset.estado));
        });
    }
}

function renderTodo() {
    renderStats();
    if (calendarioAbierto) renderCalendario();
    renderLista();
}

function abrirCalendario() {
    if (!adminCalendarPanel) return;
    calendarioAbierto = true;
    adminCalendarPanel.hidden = false;
    adminCalendarPanel.setAttribute("aria-hidden", "false");
    document.body.classList.add("admin-calendar-open");
    requestAnimationFrame(() => adminCalendarPanel.classList.add("is-open"));
    renderCalendario();
}

function cerrarCalendario() {
    if (!adminCalendarPanel) return;
    calendarioAbierto = false;
    adminCalendarPanel.classList.remove("is-open");
    adminCalendarPanel.setAttribute("aria-hidden", "true");
    document.body.classList.remove("admin-calendar-open");
    setTimeout(() => {
        if (!calendarioAbierto) adminCalendarPanel.hidden = true;
    }, 280);
}

function solicitudesActivasPorFecha() {
    return agruparSolicitudesPorFecha(solicitudes, true);
}

function renderCalendario() {
    if (!adminCalendarGrid || !adminCalTitle) return;

    const porFecha = solicitudesActivasPorFecha();
    const totalDias = diasDelMes(calendarioAnio, calendarioMes);
    const offset = primerDiaSemanaMes(calendarioAnio, calendarioMes);
    const hoy = fechaHoyLocal();

    adminCalTitle.textContent = formatearMesAnio(calendarioAnio, calendarioMes);

    const encabezado = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"]
        .map(dia => `<div class="admin-calendar-weekday">${dia}</div>`)
        .join("");

    let celdas = "";
    for (let i = 0; i < offset; i++) {
        celdas += `<div class="admin-calendar-cell is-empty" aria-hidden="true"></div>`;
    }

    for (let dia = 1; dia <= totalDias; dia++) {
        const fecha = fechaIso(calendarioAnio, calendarioMes, dia);
        const viajes = (porFecha[fecha] || []).map(s => s.viaje || {});
        const estadoDia = evaluarDisponibilidadDia(viajes);
        const esHoy = fecha === hoy;
        const esSeleccionado = fecha === calendarioDiaSeleccionado;
        const cantidad = porFecha[fecha]?.length || 0;

        celdas += `
            <button
                type="button"
                class="admin-calendar-cell admin-calendar-cell--${estadoDia.nivel}${esHoy ? " is-today" : ""}${esSeleccionado ? " is-selected" : ""}"
                data-fecha="${fecha}"
                aria-label="${dia}, ${estadoDia.etiqueta}${cantidad ? `, ${cantidad} reserva(s)` : ""}"
            >
                <span class="admin-calendar-day-num">${dia}</span>
                ${cantidad ? `<span class="admin-calendar-day-count">${cantidad}</span>` : ""}
            </button>
        `;
    }

    adminCalendarGrid.innerHTML = `${encabezado}${celdas}`;

    adminCalendarGrid.querySelectorAll(".admin-calendar-cell[data-fecha]").forEach(btn => {
        btn.addEventListener("click", () => {
            calendarioDiaSeleccionado = btn.dataset.fecha;
            renderCalendario();
            renderDetalleDiaCalendario();
        });
    });

    renderDetalleDiaCalendario();
}

function renderDetalleDiaCalendario() {
    if (!adminCalendarDayDetail || !adminCalendarDayTitle || !adminCalendarDayList) return;

    const porFecha = agruparSolicitudesPorFecha(solicitudes, false);
    const delDia = porFecha[calendarioDiaSeleccionado] || [];

    adminCalendarDayTitle.textContent = formatearFechaCorta(calendarioDiaSeleccionado);
    adminCalendarDayDetail.hidden = false;

    if (!delDia.length) {
        adminCalendarDayList.innerHTML = `<p class="admin-calendar-day-empty">Sin reservas este día.</p>`;
        return;
    }

    adminCalendarDayList.innerHTML = delDia.map(item => {
        const v = item.viaje || {};
        const c = item.cliente || {};
        const estado = item.estado || "pendiente";
        const tipo = TIPO_LABELS[v.tipo] || v.tipo || "—";

        return `
            <article class="admin-calendar-event admin-estado--${estado}">
                <div class="admin-calendar-event-head">
                    <strong>${formatearHorario12h(v.horario)}</strong>
                    <span class="admin-estado admin-estado--${estado}">${ETIQUETAS_ESTADO[estado] || estado}</span>
                </div>
                <p>${escaparHtml(tipo)} · ${escaparHtml(c.nombre || "Cliente")}</p>
                <p class="admin-calendar-event-route">${escaparHtml(v.origen || "")} → ${escaparHtml(v.destino || "")}</p>
                <p class="admin-calendar-event-ref">${escaparHtml(item.refSolicitud || "")}</p>
            </article>
        `;
    }).join("");
}

async function sincronizarDisponibilidadPublica() {
    if (!solicitudes.length) return;
    try {
        await sincronizarSlotsDesdeSolicitudes(db, solicitudes);
        disponibilidadSincronizada = true;
    } catch (err) {
        console.warn("Sync disponibilidad:", err);
    }
}

async function cambiarEstado(docId, nuevoEstado) {
    if (!docId || !nuevoEstado || actualizandoId) return;

    const item = solicitudes.find(s => s.id === docId);
    const estadoAnterior = item?.estado;

    actualizandoId = docId;
    renderLista();

    try {
        await updateDoc(doc(db, "solicitudes", docId), {
            estado: nuevoEstado,
            updatedAt: serverTimestamp()
        });

        if (item && estadoAnterior !== nuevoEstado) {
            const itemActualizado = { ...item, estado: nuevoEstado };
            await sincronizarSlotSolicitud(db, itemActualizado);

            if (nuevoEstado === "confirmado") {
                abrirWhatsAppCliente(item, "confirmado");
            } else if (nuevoEstado === "completado") {
                const itemCompleto = { ...item, id: docId };
                const historialToken = await obtenerOCrearTokenHistorial(itemCompleto);
                await registrarViajeHistorial(itemCompleto, historialToken);
                const tokenResena = await crearInvitacionResena(itemCompleto);
                abrirWhatsAppCliente(item, "completado", tokenResena, historialToken);
            }
        }
    } catch (err) {
        console.error(err);
        alert("No se pudo actualizar el estado. Verifica las reglas de Firestore.");
    } finally {
        actualizandoId = null;
        renderLista();
    }
}

function renderResenasPendientes() {
    const lista = [...resenasPendientes].sort(
        (a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)
    );

    if (resenasPendientesCount) {
        resenasPendientesCount.textContent = String(lista.length);
    }

    if (!lista.length) {
        if (resenasPendientesEmpty) resenasPendientesEmpty.hidden = false;
        if (resenasPendientesList) resenasPendientesList.innerHTML = "";
        return;
    }

    if (resenasPendientesEmpty) resenasPendientesEmpty.hidden = true;

    if (resenasPendientesList) {
        resenasPendientesList.innerHTML = lista.map(item => {
            const ref = item.refSolicitud
                ? `<span class="admin-resena-ref">${escaparHtml(item.refSolicitud)}</span>`
                : "";
            const busyAprobar = aprobandoResenaId === item.id;
            const busyRechazar = rechazandoResenaId === item.id;
            const busy = busyAprobar || busyRechazar;

            return `
                <article class="admin-resena-card" data-id="${item.id}">
                    <div class="admin-resena-card-head">
                        ${estrellasAdminHtml(item.estrellas)}
                        <strong>${escaparHtml(item.nombre)}</strong>
                        ${ref}
                    </div>
                    <p class="admin-resena-comentario">"${escaparHtml(item.comentario)}"</p>
                    <div class="admin-resena-card-foot">
                        <span class="admin-resena-fecha">${formatearTimestamp(item.createdAt)}</span>
                        <div class="admin-resena-actions">
                            <button
                                type="button"
                                class="admin-resena-rechazar"
                                data-id="${item.id}"
                                ${busy ? "disabled" : ""}
                            >${busyRechazar ? "Rechazando…" : "Rechazar"}</button>
                            <button
                                type="button"
                                class="admin-resena-aprobar"
                                data-id="${item.id}"
                                ${busy ? "disabled" : ""}
                            >${busyAprobar ? "Aprobando…" : "Aprobar y publicar"}</button>
                        </div>
                    </div>
                </article>
            `;
        }).join("");

        resenasPendientesList.querySelectorAll(".admin-resena-aprobar").forEach(btn => {
            btn.addEventListener("click", () => aprobarResena(btn.dataset.id));
        });
        resenasPendientesList.querySelectorAll(".admin-resena-rechazar").forEach(btn => {
            btn.addEventListener("click", () => rechazarResena(btn.dataset.id));
        });
    }
}

async function aprobarResena(docId) {
    if (!docId || aprobandoResenaId || rechazandoResenaId) return;

    aprobandoResenaId = docId;
    renderResenasPendientes();

    try {
        await updateDoc(doc(db, "resenas", docId), {
            estado: "aprobada",
            aprobadaAt: serverTimestamp()
        });
    } catch (err) {
        console.error(err);
        alert("No se pudo aprobar la reseña. Verifica las reglas de Firestore.");
    } finally {
        aprobandoResenaId = null;
        renderResenasPendientes();
    }
}

async function rechazarResena(docId) {
    if (!docId || aprobandoResenaId || rechazandoResenaId) return;

    if (!confirm("¿Rechazar esta reseña? No se publicará en la web.")) return;

    rechazandoResenaId = docId;
    renderResenasPendientes();

    try {
        await updateDoc(doc(db, "resenas", docId), {
            estado: "rechazada",
            rechazadaAt: serverTimestamp()
        });
    } catch (err) {
        console.error(err);
        alert("No se pudo rechazar la reseña. Verifica las reglas de Firestore.");
    } finally {
        rechazandoResenaId = null;
        renderResenasPendientes();
    }
}

function escucharResenasPendientes() {
    if (unsubscribeResenas) unsubscribeResenas();

    const q = collection(db, "resenas");

    unsubscribeResenas = onSnapshot(
        q,
        snapshot => {
            resenasPendientes = snapshot.docs
                .map(d => ({ id: d.id, ...d.data() }))
                .filter(r => r.estado === "pendiente");
            renderResenasPendientes();
        },
        err => {
            console.error("Reseñas admin:", err.code, err.message);
        }
    );
}

function escucharSolicitudes() {
    if (unsubscribeSolicitudes) unsubscribeSolicitudes();

    cargaInicialSolicitudes = true;
    solicitudesConocidas = new Set();

    if (adminLoading) {
        adminLoading.hidden = false;
        adminLoading.textContent = "Cargando solicitudes…";
    }
    if (adminEmpty) adminEmpty.hidden = true;

    const q = collection(db, "solicitudes");

    unsubscribeSolicitudes = onSnapshot(
        q,
        snapshot => {
            const lista = ordenarSolicitudes(
                snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
            );
            procesarNuevasSolicitudes(lista);
            solicitudes = lista;
            renderTodo();
            if (!disponibilidadSincronizada) {
                void sincronizarDisponibilidadPublica();
            }
            if (adminLoading) adminLoading.hidden = true;
            console.info(`Admin: ${solicitudes.length} solicitud(es) cargada(s).`);
        },
        err => {
            console.error("Firestore admin:", err.code, err.message);
            if (adminLoading) {
                adminLoading.hidden = false;
                const detalle = err.code === "permission-denied"
                    ? "Sin permiso de lectura. En Firestore → Reglas publica: allow read, update: if request.auth != null;"
                    : `Error al cargar (${err.code || "desconocido"}).`;
                adminLoading.textContent = detalle;
            }
        }
    );
}

function mostrarAdmin(user) {
    if (loginView) {
        loginView.hidden = true;
        loginView.setAttribute("hidden", "");
    }
    if (adminView) {
        adminView.hidden = false;
        adminView.removeAttribute("hidden");
    }
    if (adminUserEmail) adminUserEmail.textContent = user.email || "";
    registrarServiceWorkerAdmin();
    actualizarBotonAvisos();
    if (notificacionesHabilitadas && Notification.permission === "default") {
        solicitarPermisoAvisos();
    }
    escucharSolicitudes();
    escucharResenasPendientes();
}

function mostrarLogin() {
    if (unsubscribeSolicitudes) {
        unsubscribeSolicitudes();
        unsubscribeSolicitudes = null;
    }
    if (unsubscribeResenas) {
        unsubscribeResenas();
        unsubscribeResenas = null;
    }
    solicitudes = [];
    resenasPendientes = [];
    if (loginView) {
        loginView.hidden = false;
        loginView.removeAttribute("hidden");
    }
    if (adminView) {
        adminView.hidden = true;
        adminView.setAttribute("hidden", "");
    }
}

loginForm?.addEventListener("submit", async event => {
    event.preventDefault();
    mostrarLoginError("");

    const email = document.getElementById("adminEmail")?.value.trim();
    const password = document.getElementById("adminPassword")?.value;

    if (!email || !password) {
        mostrarLoginError("Ingresa correo y contraseña.");
        return;
    }

    if (loginBtn) {
        loginBtn.disabled = true;
        loginBtn.textContent = "Entrando…";
    }

    try {
        await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
        const mensajes = {
            "auth/invalid-credential": "Correo o contraseña incorrectos. Verifica en Firebase → Authentication → Usuarios.",
            "auth/user-not-found": "Usuario no encontrado. Créalo en Firebase → Authentication → Agregar usuario.",
            "auth/wrong-password": "Contraseña incorrecta.",
            "auth/invalid-email": "Correo con formato inválido.",
            "auth/operation-not-allowed": "Correo/contraseña no está activado. Firebase → Authentication → Método de acceso → Activar.",
            "auth/too-many-requests": "Demasiados intentos. Espera un momento.",
            "auth/network-request-failed": "Sin conexión o bloqueo de red. Prueba otra red o desactiva extensiones."
        };
        mostrarLoginError(mensajes[err.code] || `No se pudo iniciar sesión (${err.code || "error"}). Revisa que el usuario exista en Firebase y que Correo/contraseña esté activado.`);
        console.error("Login Firebase:", err.code, err.message);
    } finally {
        if (loginBtn) {
            loginBtn.disabled = false;
            loginBtn.textContent = "Iniciar sesión";
        }
    }
});

logoutBtn?.addEventListener("click", () => signOut(auth));

refreshBtn?.addEventListener("click", () => {
    if (auth.currentUser) {
        escucharSolicitudes();
        escucharResenasPendientes();
    }
});

notifyBtn?.addEventListener("click", async () => {
    if (notificacionesHabilitadas && Notification.permission === "granted") {
        notificacionesHabilitadas = false;
        localStorage.removeItem("tpv_admin_notify");
        actualizarBotonAvisos();
        return;
    }
    await solicitarPermisoAvisos();
});

onAuthStateChanged(auth, user => {
    if (user) {
        mostrarAdmin(user);
    } else {
        mostrarLogin();
    }
});

adminCalPrev?.addEventListener("click", () => {
    calendarioMes -= 1;
    if (calendarioMes < 0) {
        calendarioMes = 11;
        calendarioAnio -= 1;
    }
    renderCalendario();
});

adminCalNext?.addEventListener("click", () => {
    calendarioMes += 1;
    if (calendarioMes > 11) {
        calendarioMes = 0;
        calendarioAnio += 1;
    }
    renderCalendario();
});

adminCalendarBtn?.addEventListener("click", abrirCalendario);
adminCalendarClose?.addEventListener("click", cerrarCalendario);
adminCalendarPanel?.addEventListener("click", event => {
    if (event.target === adminCalendarPanel) cerrarCalendario();
});

document.addEventListener("keydown", event => {
    if (event.key === "Escape" && calendarioAbierto) cerrarCalendario();
});

renderFiltros();
