import { initializeApp } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-app.js";
import {
    getFirestore,
    collection,
    addDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

function generarRefSolicitud() {
    const sufijo = Date.now().toString(36).toUpperCase();
    return `TPV-${sufijo}`;
}

function armarDocumentoSolicitud({ datos, promedio, confirmado, reserva }) {
    const refSolicitud = generarRefSolicitud();
    const esMadrugada = datos.franjaHorario === "madrugada" ||
        (datos.horario && parseInt(datos.horario.split(":")[0], 10) < 5);

    return {
        refSolicitud,
        createdAt: serverTimestamp(),
        estado: "pendiente",
        choferId: null,
        canal: "web",
        cliente: {
            nombre: reserva.nombre,
            telefono: reserva.telefono,
            pasajeros: reserva.pasajeros,
            emergenciaNombre: reserva.emergenciaNombre,
            emergenciaTel: reserva.emergenciaTel
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
            esInmediato: Boolean(reserva.esInmediato),
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
            aceptadas: true,
            anticipoAceptado: Boolean(document.getElementById("reservaAceptaAnticipo")?.checked)
        }
    };
}

window.guardarSolicitudFirebase = async function guardarSolicitudFirebase(payload) {
    const documento = armarDocumentoSolicitud(payload);
    await addDoc(collection(db, "solicitudes"), documento);
    return documento.refSolicitud;
};

window.firebaseSolicitudesReady = true;
