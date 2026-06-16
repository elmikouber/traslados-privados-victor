import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-app.js";
import {
    getFirestore,
    collection,
    addDoc,
    setDoc,
    doc,
    serverTimestamp,
    Timestamp
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";
import { firebaseConfig, SITE_BASE_URL } from "./firebase-config.js";
import { HORAS_VALIDEZ_ENLACE_COTIZACION } from "./cotizador-core.js";
import { construirSlotDesdeSolicitud } from "./firebase-disponibilidad.js";

function getDb() {
    const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    return getFirestore(app);
}

export function generarTokenConfirmacion() {
    if (crypto?.randomUUID) {
        return crypto.randomUUID().replace(/-/g, "");
    }
    return `${Date.now()}${Math.random().toString(36).slice(2, 14)}`;
}

export function generarRefSolicitud() {
    const sufijo = Date.now().toString(36).toUpperCase();
    return `TPV-${sufijo}`;
}

export function calcularExpiracionCotizacion() {
    const expiraMs = Date.now() + HORAS_VALIDEZ_ENLACE_COTIZACION * 60 * 60 * 1000;
    return Timestamp.fromDate(new Date(expiraMs));
}

export function formatearExpiracionWhatsApp(expiraAt) {
    if (!expiraAt?.toDate) return "";
    return expiraAt.toDate().toLocaleString("es-MX", {
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit"
    });
}

export function construirUrlConfirmacionCotizacion(token) {
    return `${SITE_BASE_URL}/cotizacion.html?c=${encodeURIComponent(token)}`;
}

function armarDocumentoSolicitud({ datos, promedio, confirmado, nombre, telefono, token, expiraAt }) {
    const refSolicitud = generarRefSolicitud();
    const esMadrugada = datos.franjaHorario === "madrugada" ||
        (datos.horario && parseInt(datos.horario.split(":")[0], 10) < 5);

    return {
        refSolicitud,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        estado: "cotizacion_pendiente",
        choferId: null,
        canal: "admin_whatsapp",
        tokenConfirmacion: token,
        expiraAt,
        cliente: {
            nombre: nombre || "Cliente",
            telefono,
            pasajeros: null,
            emergenciaNombre: null,
            emergenciaTel: null
        },
        viaje: {
            tipo: datos.tipo,
            origen: datos.origen || "",
            destino: datos.destino || "",
            fecha: datos.fecha,
            horario: datos.horario,
            km: datos.km ?? null,
            minutos: datos.minutos ?? null,
            franjaHorario: datos.franjaHorario || null,
            esMadrugada,
            esInmediato: false,
            idaVuelta: Boolean(datos.idaVuelta),
            esForaneo: Boolean(datos.esForaneo),
            horasExtra: datos.horasExtra ?? 0,
            horasValle: datos.horasValle ?? null,
            vinedos: datos.vinedos || ""
        },
        cotizacion: {
            estimado: promedio,
            topeImprevistos: confirmado,
            nivelServicio: datos.nivelServicio || "ejecutivo"
        },
        politicas: {
            aceptadas: false,
            anticipoAceptado: false
        }
    };
}

function armarConfirmacionCotizacion({ token, solicitudId, refSolicitud, telefono, nombre, datos, promedio, confirmado, expiraAt }) {
    return {
        token,
        solicitudId,
        refSolicitud,
        estado: "pendiente",
        telefono,
        nombreCliente: nombre || "Cliente",
        expiraAt,
        createdAt: serverTimestamp(),
        respondedAt: null,
        resumen: {
            tipo: datos.tipo,
            fecha: datos.fecha,
            horario: datos.horario,
            origen: datos.origen || "",
            destino: datos.destino || "",
            idaVuelta: Boolean(datos.idaVuelta),
            horasValle: datos.horasValle ?? null,
            vinedos: datos.vinedos || "",
            km: datos.km ?? null,
            minutos: datos.minutos ?? null,
            estimado: promedio,
            topeImprevistos: confirmado,
            nivelServicio: datos.nivelServicio || "ejecutivo",
            franjaHorario: datos.franjaHorario || null
        }
    };
}

export async function guardarCotizacionPendienteAdmin({ datos, promedio, confirmado, nombre, telefono }) {
    const db = getDb();
    const token = generarTokenConfirmacion();
    const expiraAt = calcularExpiracionCotizacion();
    const documento = armarDocumentoSolicitud({ datos, promedio, confirmado, nombre, telefono, token, expiraAt });

    const solicitudRef = await addDoc(collection(db, "solicitudes"), documento);
    const solicitudId = solicitudRef.id;

    const confirmacion = armarConfirmacionCotizacion({
        token,
        solicitudId,
        refSolicitud: documento.refSolicitud,
        telefono,
        nombre,
        datos,
        promedio,
        confirmado,
        expiraAt
    });

    await setDoc(doc(db, "confirmaciones_cotizacion", token), confirmacion);

    const slot = construirSlotDesdeSolicitud(documento);
    if (slot) {
        await setDoc(doc(db, "disponibilidad", slot.fecha, "slots", slot.ref), slot);
    }

    return {
        token,
        refSolicitud: documento.refSolicitud,
        solicitudId,
        urlConfirmacion: construirUrlConfirmacionCotizacion(token),
        expiraAt
    };
}
