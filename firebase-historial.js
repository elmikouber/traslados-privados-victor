import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-app.js";
import {
    getFirestore,
    doc,
    getDoc,
    collection,
    getDocs
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);

const TIPO_LABELS = {
    traslado: "Traslado punto a punto",
    tour: "Tour Valle de Guadalupe"
};

function escapeHtml(texto) {
    return String(texto ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function formatearFecha(fechaStr) {
    if (!fechaStr) return "Fecha por confirmar";
    const [y, m, d] = fechaStr.split("-").map(Number);
    const meses = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
    return `${d} ${meses[m - 1]} ${y}`;
}

function formatearHorario(horario) {
    if (!horario) return "—";
    const [h, m] = horario.split(":").map(Number);
    const periodo = h < 12 ? "a.m." : "p.m.";
    const hora12 = h % 12 || 12;
    return `${hora12}:${String(m).padStart(2, "0")} ${periodo}`;
}

function ordenarViajes(lista) {
    return [...lista].sort((a, b) => {
        const fa = a.fecha || "";
        const fb = b.fecha || "";
        if (fa !== fb) return fb.localeCompare(fa);
        return (b.completadoAt?.seconds || 0) - (a.completadoAt?.seconds || 0);
    });
}

function renderTarjetaViaje(viaje) {
    const tipo = TIPO_LABELS[viaje.tipo] || viaje.tipo || "Traslado";
    const km = viaje.km != null ? `${viaje.km} km` : null;
    const precio = viaje.estimado != null ? `$${viaje.estimado} MXN` : null;

    return `
        <article class="historial-card">
            <div class="historial-card-head">
                <span class="historial-card-ref">${escapeHtml(viaje.refSolicitud || "Viaje")}</span>
                <span class="historial-card-estado">Completado</span>
            </div>
            <p class="historial-card-fecha">${escapeHtml(formatearFecha(viaje.fecha))} · ${escapeHtml(formatearHorario(viaje.horario))}</p>
            <p class="historial-card-ruta">
                <strong>${escapeHtml(viaje.origen || "Origen")}</strong>
                → ${escapeHtml(viaje.destino || "Destino")}
            </p>
            <div class="historial-card-meta">
                <span>${escapeHtml(tipo)}</span>
                ${km ? `<span>${km}</span>` : ""}
                ${precio ? `<span class="historial-card-precio">${precio}</span>` : ""}
            </div>
        </article>
    `;
}

function mostrarAlerta(mensaje) {
    const alertEl = document.getElementById("historialAlert");
    const listEl = document.getElementById("historialList");
    const emptyEl = document.getElementById("historialEmpty");
    const subEl = document.getElementById("historialSub");

    if (subEl) subEl.textContent = "No pudimos cargar tu historial.";
    if (alertEl) {
        alertEl.textContent = mensaje;
        alertEl.hidden = false;
    }
    if (listEl) listEl.hidden = true;
    if (emptyEl) emptyEl.hidden = true;
}

async function cargarHistorial() {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("h");
    const subEl = document.getElementById("historialSub");
    const listEl = document.getElementById("historialList");
    const emptyEl = document.getElementById("historialEmpty");

    if (!token) {
        mostrarAlerta("Enlace no válido. Usa el enlace personal que recibiste por WhatsApp al completar tu viaje.");
        return;
    }

    try {
        const clienteSnap = await getDoc(doc(db, "historial_clientes", token));

        if (!clienteSnap.exists()) {
            mostrarAlerta("Este enlace de historial no es válido o ha expirado. Escríbenos por WhatsApp si necesitas ayuda.");
            return;
        }

        const cliente = clienteSnap.data();
        const nombre = cliente.nombreCliente?.split(" ")[0] || "Cliente";

        if (subEl) {
            subEl.textContent = `Hola ${nombre}, estos son tus viajes completados con Traslados Privados Víctor.`;
        }

        const viajesSnap = await getDocs(collection(db, "historial_clientes", token, "viajes"));
        const viajes = ordenarViajes(viajesSnap.docs.map(d => d.data()));

        if (!viajes.length) {
            if (emptyEl) emptyEl.hidden = false;
            if (listEl) listEl.hidden = true;
            return;
        }

        if (listEl) {
            listEl.innerHTML = viajes.map(renderTarjetaViaje).join("");
            listEl.hidden = false;
        }
        if (emptyEl) emptyEl.hidden = true;
    } catch (err) {
        console.error("Historial:", err.code, err.message);
        mostrarAlerta("No se pudo cargar tu historial. Intenta de nuevo en un momento.");
    }
}

cargarHistorial();
