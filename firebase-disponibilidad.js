import { doc, setDoc, deleteDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";

export const ESTADOS_OCUPAN = ["pendiente", "confirmado", "lista_espera"];

const MESES = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"
];

const MESES_CORTO = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

export function minutosDesdeMedianoche(horario) {
    if (!horario) return 0;
    const [h, m] = horario.split(":").map(Number);
    return (h || 0) * 60 + (m || 0);
}

export function calcularDuracionViaje(viaje = {}) {
    if (viaje.tipo === "tour") {
        const horasValle = Number(viaje.horasValle) || 4;
        const minutosIda = Number(viaje.minutos) || 75;
        return minutosIda * 2 + horasValle * 60 + 45;
    }

    let minutos = Number(viaje.minutos) || 90;
    if (viaje.idaVuelta) minutos *= 2;
    const horasExtra = Number(viaje.horasExtra) || 0;
    return minutos + horasExtra * 60 + 30;
}

export function haySolape(inicioA, duracionA, inicioB, duracionB) {
    const finA = inicioA + duracionA;
    const finB = inicioB + duracionB;
    return inicioA < finB && inicioB < finA;
}

export function viajeOcupaHorario(viaje, horario, duracionNueva) {
    const inicioNuevo = minutosDesdeMedianoche(horario);
    const inicioExistente = minutosDesdeMedianoche(viaje.horario);
    const duracionExistente = calcularDuracionViaje(viaje);
    return haySolape(inicioNuevo, duracionNueva, inicioExistente, duracionExistente);
}

export function construirSlotDesdeSolicitud(solicitud) {
    const viaje = solicitud.viaje || {};
    const ref = solicitud.refSolicitud;
    const fecha = viaje.fecha;
    if (!ref || !fecha || !viaje.horario) return null;

    return {
        ref,
        fecha,
        horario: viaje.horario,
        minutos: Number(viaje.minutos) || 90,
        tipo: viaje.tipo || "traslado",
        horasValle: viaje.horasValle ?? null,
        idaVuelta: Boolean(viaje.idaVuelta),
        horasExtra: Number(viaje.horasExtra) || 0,
        estado: solicitud.estado || "pendiente",
        updatedAt: serverTimestamp()
    };
}

export function slotDebePublicarse(estado) {
    return ESTADOS_OCUPAN.includes(estado);
}

export async function sincronizarSlotSolicitud(db, solicitud) {
    const slot = construirSlotDesdeSolicitud(solicitud);
    if (!slot) return;

    const refDoc = doc(db, "disponibilidad", slot.fecha, "slots", slot.ref);

    if (slotDebePublicarse(slot.estado)) {
        await setDoc(refDoc, slot, { merge: true });
    } else {
        try {
            await deleteDoc(refDoc);
        } catch {
            /* slot ya eliminado */
        }
    }
}

export async function sincronizarSlotsDesdeSolicitudes(db, solicitudes) {
    const tareas = solicitudes.map(s => sincronizarSlotSolicitud(db, s));
    await Promise.all(tareas);
}

export function agruparSolicitudesPorFecha(solicitudes, soloActivas = false) {
    const mapa = {};

    for (const solicitud of solicitudes) {
        const fecha = solicitud.viaje?.fecha;
        if (!fecha) continue;
        if (soloActivas && !slotDebePublicarse(solicitud.estado)) continue;

        if (!mapa[fecha]) mapa[fecha] = [];
        mapa[fecha].push(solicitud);
    }

    for (const fecha of Object.keys(mapa)) {
        mapa[fecha].sort((a, b) => {
            const ha = a.viaje?.horario || "";
            const hb = b.viaje?.horario || "";
            return ha.localeCompare(hb);
        });
    }

    return mapa;
}

export function evaluarDisponibilidadDia(viajes = []) {
    if (!viajes.length) {
        return { nivel: "libre", etiqueta: "Disponible" };
    }

    const minutosOcupados = viajes.reduce((total, viaje) => total + calcularDuracionViaje(viaje), 0);
    if (minutosOcupados >= 600 || viajes.length >= 2) {
        return { nivel: "ocupado", etiqueta: "Agenda completa" };
    }

    return { nivel: "parcial", etiqueta: "Consultar horario" };
}

export function evaluarHorarioDisponible(viajes, horario, viajeNuevo = {}) {
    const duracionNueva = calcularDuracionViaje(viajeNuevo);
    const conflicto = viajes.some(viaje => viajeOcupaHorario(viaje, horario, duracionNueva));
    return !conflicto;
}

export function formatearMesAnio(anio, mes) {
    return `${MESES[mes]} ${anio}`;
}

export function formatearMesCorto(mes) {
    return MESES_CORTO[mes];
}

export function fechaHoyLocal() {
    const hoy = new Date();
    return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-${String(hoy.getDate()).padStart(2, "0")}`;
}

export function diasDelMes(anio, mes) {
    return new Date(anio, mes + 1, 0).getDate();
}

export function primerDiaSemanaMes(anio, mes) {
    return new Date(anio, mes, 1).getDay();
}

export function fechaIso(anio, mes, dia) {
    return `${anio}-${String(mes + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}
