import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-app.js";
import {
    getFirestore,
    doc,
    getDoc,
    updateDoc,
    setDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";
import {
    tipoLabels,
    formatearFecha,
    formatearHorario12h,
    crearFechaSalidaProgramada,
    HORAS_VALIDEZ_ENLACE_COTIZACION
} from "./cotizador-core.js";
import { renderizarMapaRuta } from "./cotizador-rutas.js";

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);

const TIPO_LABELS = tipoLabels;

const loadingEl = document.getElementById("cotizacionLoading");
const alertEl = document.getElementById("cotizacionAlert");
const contenidoEl = document.getElementById("cotizacionContenido");
const resumenEl = document.getElementById("cotizacionResumen");
const subEl = document.getElementById("cotizacionSub");
const refEl = document.getElementById("cotizacionRef");
const formEl = document.getElementById("cotizacionForm");
const btnAceptar = document.getElementById("cotBtnAceptar");
const btnRechazar = document.getElementById("cotBtnRechazar");

let confirmacionActual = null;
let tokenActual = null;
let procesando = false;

function escapeHtml(texto) {
    return String(texto ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function mostrarAlerta(mensaje, tipo = "") {
    if (!alertEl) return;
    alertEl.textContent = mensaje;
    alertEl.hidden = false;
    alertEl.className = "cotizacion-alert";
    if (tipo) alertEl.classList.add(`is-${tipo}`);
}

function ocultarCarga() {
    if (loadingEl) loadingEl.hidden = true;
}

function expiracionPasada(expiraAt) {
    if (!expiraAt) return false;
    const ms = expiraAt.toDate ? expiraAt.toDate().getTime() : new Date(expiraAt).getTime();
    return Date.now() > ms;
}

function formatearExpiracion(expiraAt) {
    if (!expiraAt?.toDate) return "";
    return expiraAt.toDate().toLocaleString("es-MX", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit"
    });
}

function renderResumen(conf) {
    const r = conf.resumen || {};
    const tipo = TIPO_LABELS[r.tipo] || r.tipo || "Traslado";
    const modalidad = r.tipo === "traslado"
        ? (r.idaVuelta ? "Ida y vuelta" : "Solo ida")
        : `${r.horasValle || 4} h en el valle`;

    return `
        <div class="cotizacion-price">$${r.estimado ?? "—"} <span>MXN</span></div>
        <p class="cotizacion-price-note">Precio fijo del servicio. Puede incrementar hasta $${r.topeImprevistos ?? "—"} MXN por tráfico, desvíos o imprevistos en ruta.</p>
        <div class="cotizacion-detail">
            <p><strong>${escapeHtml(tipo)}</strong></p>
            <p>${escapeHtml(formatearFecha(r.fecha))} · ${escapeHtml(formatearHorario12h(r.horario))}</p>
            <p><strong>${escapeHtml(r.origen)}</strong></p>
            <p>→ ${escapeHtml(r.destino)}</p>
            <p>${escapeHtml(modalidad)}${r.km != null ? ` · ${r.km} km` : ""}</p>
            ${r.vinedos ? `<p>Viñedos: ${escapeHtml(r.vinedos)}</p>` : ""}
        </div>
        <p class="cotizacion-expira" id="cotizacionExpira">Confirma en las próximas ${HORAS_VALIDEZ_ENLACE_COTIZACION} horas · Válido hasta: ${escapeHtml(formatearExpiracion(conf.expiraAt))}</p>
    `;
}

function mostrarEstadoFinal(mensaje, tipo = "success") {
    ocultarCarga();
    if (contenidoEl) contenidoEl.hidden = true;
    if (formEl) formEl.hidden = true;
    mostrarAlerta(mensaje, tipo);
    if (subEl) subEl.textContent = "";
}

async function marcarExpirada(conf, token) {
    await updateDoc(doc(db, "confirmaciones_cotizacion", token), {
        estado: "expirada",
        respondedAt: serverTimestamp()
    });

    if (conf.solicitudId) {
        await updateDoc(doc(db, "solicitudes", conf.solicitudId), {
            estado: "cancelado",
            updatedAt: serverTimestamp(),
            confirmacionToken: token
        });
    }

    const r = conf.resumen || {};
    if (conf.refSolicitud && r.fecha) {
        try {
            await setDoc(doc(db, "disponibilidad", r.fecha, "slots", conf.refSolicitud), {
                estado: "cancelado",
                updatedAt: serverTimestamp()
            }, { merge: true });
        } catch {
            /* slot ya liberado */
        }
    }
}

async function sincronizarSlot(conf, estado) {
    const r = conf.resumen || {};
    if (!conf.refSolicitud || !r.fecha) return;

    await setDoc(doc(db, "disponibilidad", r.fecha, "slots", conf.refSolicitud), {
        estado,
        updatedAt: serverTimestamp()
    }, { merge: true });
}

async function aceptarCotizacion(event) {
    event.preventDefault();
    if (!confirmacionActual || !tokenActual || procesando) return;

    const nombre = document.getElementById("cotNombre")?.value.trim();
    const pasajeros = parseInt(document.getElementById("cotPasajeros")?.value, 10);
    const emergenciaNombre = document.getElementById("cotEmergenciaNombre")?.value.trim();
    const emergenciaTel = document.getElementById("cotEmergenciaTel")?.value.trim();
    const aceptaPoliticas = document.getElementById("cotAceptaPoliticas")?.checked;

    if (!nombre || !emergenciaNombre || !emergenciaTel) {
        mostrarAlerta("Completa todos los campos para confirmar.", "error");
        return;
    }
    if (!aceptaPoliticas) {
        mostrarAlerta("Debes aceptar las políticas del servicio.", "error");
        return;
    }
    if (pasajeros < 1 || pasajeros > 4) {
        mostrarAlerta("Indica entre 1 y 4 pasajeros.", "error");
        return;
    }

    procesando = true;
    if (btnAceptar) {
        btnAceptar.disabled = true;
        btnAceptar.textContent = "Confirmando…";
    }
    if (btnRechazar) btnRechazar.disabled = true;

    try {
        if (expiracionPasada(confirmacionActual.expiraAt)) {
            await marcarExpirada(confirmacionActual, tokenActual);
            mostrarEstadoFinal("Esta cotización ya expiró. Escríbenos por WhatsApp si aún necesitas el servicio.", "error");
            return;
        }

        const clienteComplemento = {
            nombre,
            pasajeros,
            emergenciaNombre,
            emergenciaTel
        };

        await updateDoc(doc(db, "confirmaciones_cotizacion", tokenActual), {
            estado: "aceptada",
            respondedAt: serverTimestamp(),
            clienteComplemento
        });

        if (confirmacionActual.solicitudId) {
            await updateDoc(doc(db, "solicitudes", confirmacionActual.solicitudId), {
                estado: "confirmado",
                updatedAt: serverTimestamp(),
                confirmacionToken: tokenActual,
                cliente: {
                    nombre,
                    telefono: confirmacionActual.telefono,
                    pasajeros,
                    emergenciaNombre,
                    emergenciaTel
                },
                politicas: {
                    aceptadas: true,
                    anticipoAceptado: false
                }
            });
        }

        await sincronizarSlot(confirmacionActual, "confirmado");

        mostrarEstadoFinal(
            `¡Listo! Tu reserva ${confirmacionActual.refSolicitud || ""} quedó confirmada. Víctor te contactará por WhatsApp si hace falta algún detalle.`,
            "success"
        );
    } catch (err) {
        console.error(err);
        mostrarAlerta("No se pudo confirmar. Intenta de nuevo o escríbenos por WhatsApp.", "error");
        procesando = false;
        if (btnAceptar) {
            btnAceptar.disabled = false;
            btnAceptar.textContent = "Aceptar y confirmar reserva";
        }
        if (btnRechazar) btnRechazar.disabled = false;
    }
}

async function rechazarCotizacion() {
    if (!confirmacionActual || !tokenActual || procesando) return;

    if (!window.confirm("¿Seguro que deseas rechazar esta cotización?")) return;

    procesando = true;
    if (btnAceptar) btnAceptar.disabled = true;
    if (btnRechazar) {
        btnRechazar.disabled = true;
        btnRechazar.textContent = "Procesando…";
    }

    try {
        await updateDoc(doc(db, "confirmaciones_cotizacion", tokenActual), {
            estado: "rechazada",
            respondedAt: serverTimestamp()
        });

        if (confirmacionActual.solicitudId) {
            await updateDoc(doc(db, "solicitudes", confirmacionActual.solicitudId), {
                estado: "rechazado",
                updatedAt: serverTimestamp(),
                confirmacionToken: tokenActual
            });
        }

        await sincronizarSlot(confirmacionActual, "cancelado");

        mostrarEstadoFinal("Cotización rechazada. Si cambias de opinión, escríbenos por WhatsApp.", "error");
    } catch (err) {
        console.error(err);
        mostrarAlerta("No se pudo registrar el rechazo. Intenta de nuevo.", "error");
        procesando = false;
        if (btnRechazar) {
            btnRechazar.disabled = false;
            btnRechazar.textContent = "Rechazar cotización";
        }
        if (btnAceptar) btnAceptar.disabled = false;
    }
}

async function cargarCotizacion() {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("c");

    if (!token) {
        ocultarCarga();
        mostrarAlerta("Enlace no válido. Usa el enlace que recibiste por WhatsApp.", "error");
        if (subEl) subEl.textContent = "";
        return;
    }

    tokenActual = token;

    try {
        const snap = await getDoc(doc(db, "confirmaciones_cotizacion", token));

        if (!snap.exists()) {
            ocultarCarga();
            mostrarAlerta("Esta cotización no existe o el enlace no es válido.", "error");
            if (subEl) subEl.textContent = "";
            return;
        }

        const conf = snap.data();
        confirmacionActual = conf;

        if (conf.estado === "aceptada") {
            mostrarEstadoFinal(`Esta cotización ya fue aceptada (${conf.refSolicitud || ""}). ¡Nos vemos pronto!`, "success");
            return;
        }

        if (conf.estado === "rechazada") {
            mostrarEstadoFinal("Esta cotización fue rechazada anteriormente.", "error");
            return;
        }

        if (conf.estado === "expirada" || expiracionPasada(conf.expiraAt)) {
            if (conf.estado === "pendiente") {
                await marcarExpirada(conf, token);
            }
            mostrarEstadoFinal("Esta cotización expiró. Escríbenos por WhatsApp si aún necesitas el servicio.", "error");
            return;
        }

        ocultarCarga();
        if (subEl) {
            const nombre = conf.nombreCliente?.split(" ")[0] || "estimado cliente";
            subEl.textContent = `Hola ${nombre}, revisa los detalles y confirma tu reserva.`;
        }
        if (refEl) {
            refEl.textContent = `Ref. ${conf.refSolicitud || ""}`;
            refEl.hidden = false;
        }
        if (resumenEl) resumenEl.innerHTML = renderResumen(conf);
        if (contenidoEl) contenidoEl.hidden = false;

        const r = conf.resumen || {};
        let notaMapa = "";
        if (r.tipo === "traslado" && r.idaVuelta) {
            notaMapa = "Ruta de referencia (solo ida). El precio incluye ida y vuelta.";
        } else if (r.tipo === "tour") {
            notaMapa = "Ruta de ida al Valle de Guadalupe.";
        }

        const fechaSalida = crearFechaSalidaProgramada(r.fecha, r.horario);
        void renderizarMapaRuta(
            document.getElementById("cotRouteMap"),
            document.getElementById("cotRouteMapCaption"),
            r.origen,
            r.destino,
            notaMapa,
            fechaSalida
        );

        const nombreInput = document.getElementById("cotNombre");
        if (nombreInput && conf.nombreCliente && conf.nombreCliente !== "Cliente") {
            nombreInput.value = conf.nombreCliente;
        }
    } catch (err) {
        console.error(err);
        ocultarCarga();
        mostrarAlerta("No se pudo cargar la cotización. Verifica tu conexión e intenta de nuevo.", "error");
    }
}

formEl?.addEventListener("submit", aceptarCotizacion);
btnRechazar?.addEventListener("click", rechazarCotizacion);

void cargarCotizacion();
