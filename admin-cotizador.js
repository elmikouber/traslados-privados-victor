import {
    TARIFAS,
    VALLE_DESTINO,
    tipoLabels,
    calcularRango,
    determinarNivelServicio,
    calcularPrecioTraslado,
    calcularPrecioTour,
    detallePrecioTraslado,
    obtenerRequisitosViaje,
    obtenerBloqueoPlazoReserva,
    construirMensajeCotizacionCliente,
    normalizarTelefonoWa,
    crearFechaSalidaProgramada,
    formatearFecha,
    formatearHorario12h
} from "./cotizador-core.js";
import { obtenerRuta, mensajeErrorRuta, renderizarMapaRuta } from "./cotizador-rutas.js";
import { initPlacesAutocomplete } from "./places-autocomplete.js";
import { guardarCotizacionPendienteAdmin } from "./firebase-cotizacion-pendiente.js";

const panel = document.getElementById("adminCotizadorPanel");
const btnAbrir = document.getElementById("adminCotizadorBtn");
const btnCerrar = document.getElementById("adminCotizadorClose");
const form = document.getElementById("adminCotizadorForm");
const reqList = document.getElementById("adminCotRequisitos");
const reqAviso = document.getElementById("adminCotAviso");
const resultado = document.getElementById("adminCotResultado");
const routeStatus = document.getElementById("adminCotRouteStatus");
const btnEnviar = document.getElementById("adminCotEnviar");
const btnAgendar = document.getElementById("adminCotAgendar");

let cotizadorAbierto = false;
let ultimaCotizacionAdmin = null;
let routeDebounce = null;
let placesAdminInicializado = false;

function getTipo() {
    return document.getElementById("adminCotTipo")?.value || "traslado";
}

function actualizarCamposTipo() {
    const tipo = getTipo();
    document.getElementById("adminCotCamposTraslado")?.classList.toggle("admin-cot-hidden", tipo !== "traslado");
    document.getElementById("adminCotCamposTour")?.classList.toggle("admin-cot-hidden", tipo !== "tour");
    document.getElementById("adminCotOrigenDestino")?.classList.toggle("admin-cot-hidden", tipo === "tour");
    document.querySelectorAll(".admin-cot-tab").forEach(tab => {
        tab.classList.toggle("active", tab.dataset.tipo === tipo);
    });
    document.getElementById("adminCotTipo").value = tipo;
    actualizarRequisitos();
}

function leerDatosParciales() {
    const tipo = getTipo();
    const fecha = document.getElementById("adminCotFecha")?.value || "";
    const horario = document.getElementById("adminCotHorario")?.value || "";

    const datos = { tipo, fecha, horario, nivelServicio: "ejecutivo" };

    if (tipo === "traslado") {
        datos.origen = document.getElementById("adminCotOrigen")?.value.trim() || "";
        datos.destino = document.getElementById("adminCotDestino")?.value.trim() || "";
        datos.idaVuelta = Boolean(document.getElementById("adminCotIdaVuelta")?.checked);
        datos.horasExtra = parseFloat(document.getElementById("adminCotHorasExtra")?.value) || 0;
    } else {
        datos.origen = document.getElementById("adminCotOrigenTour")?.value.trim() || "";
        datos.destino = VALLE_DESTINO;
        datos.horasValle = parseFloat(document.getElementById("adminCotHorasTour")?.value) || 4;
        datos.vinedos = document.getElementById("adminCotVinedos")?.value.trim() || "";
    }

    return datos;
}

function actualizarRequisitos(promedio = 0) {
    const datos = leerDatosParciales();
    if (!reqList) return;

    if (!datos.fecha || !datos.horario) {
        reqList.innerHTML = "<li>Completa fecha y horario para ver los requisitos.</li>";
        if (reqAviso) reqAviso.textContent = "";
        return;
    }

    const bloqueo = obtenerBloqueoPlazoReserva(datos.fecha, datos.horario);
    const requisitos = obtenerRequisitosViaje(datos, promedio);

    reqList.innerHTML = requisitos.map(r => `<li>${r}</li>`).join("");

    if (reqAviso) {
        reqAviso.textContent = bloqueo ? `⚠ ${bloqueo}` : "";
        reqAviso.className = bloqueo ? "admin-cot-aviso is-warning" : "admin-cot-aviso";
    }
}

function setRouteStatus(mensaje, estado) {
    if (!routeStatus) return;
    routeStatus.textContent = mensaje;
    routeStatus.className = "admin-cot-route-status";
    if (estado) routeStatus.classList.add(`is-${estado}`);
}

async function calcularRutaSiFalta() {
    const tipo = getTipo();
    const fecha = document.getElementById("adminCotFecha")?.value;
    const horario = document.getElementById("adminCotHorario")?.value;
    const kmInput = document.getElementById("adminCotKm");
    const minInput = document.getElementById("adminCotMinutos");

    let km = parseFloat(kmInput?.value);
    let minutos = parseFloat(minInput?.value);
    if (!isNaN(km) && !isNaN(minutos)) return { km, minutos };

    const origen = tipo === "traslado"
        ? document.getElementById("adminCotOrigen")?.value.trim()
        : document.getElementById("adminCotOrigenTour")?.value.trim();
    const destino = tipo === "traslado"
        ? document.getElementById("adminCotDestino")?.value.trim()
        : VALLE_DESTINO;

    if (!origen || !destino) return null;

    setRouteStatus("Calculando ruta...", "loading");

    try {
        const fechaSalida = crearFechaSalidaProgramada(fecha, horario);
        const ruta = await obtenerRuta(origen, destino, fechaSalida);
        if (kmInput) kmInput.value = ruta.km;
        if (minInput) minInput.value = ruta.minutos;
        setRouteStatus("Ruta calculada.", "ok");
        return { km: ruta.km, minutos: ruta.minutos };
    } catch (err) {
        setRouteStatus(mensajeErrorRuta(err), "error");
        return null;
    }
}

async function calcularCotizacion(event) {
    if (event) event.preventDefault();

    const telefono = document.getElementById("adminCotTelefono")?.value.trim();
    const nombre = document.getElementById("adminCotNombre")?.value.trim() || "";
    const fecha = document.getElementById("adminCotFecha")?.value;
    const horario = document.getElementById("adminCotHorario")?.value;
    const tipo = getTipo();

    if (!telefono || normalizarTelefonoWa(telefono).length < 12) {
        alert("Ingresa el WhatsApp del cliente (10 dígitos).");
        return;
    }
    if (!fecha || !horario) {
        alert("Ingresa fecha y horario.");
        return;
    }

    const ruta = await calcularRutaSiFalta();
    if (!ruta) {
        alert("No se pudo obtener km/minutos. Verifica origen y destino.");
        return;
    }

    const { km, minutos } = ruta;
    let datos = { tipo, fecha, horario };
    let base;
    let detalle = "";

    if (tipo === "traslado") {
        const origen = document.getElementById("adminCotOrigen")?.value.trim();
        const destino = document.getElementById("adminCotDestino")?.value.trim();
        const idaVuelta = Boolean(document.getElementById("adminCotIdaVuelta")?.checked);
        const horasExtra = parseFloat(document.getElementById("adminCotHorasExtra")?.value) || 0;

        if (!origen || !destino) {
            alert("Ingresa origen y destino.");
            return;
        }

        const nivelServicio = determinarNivelServicio(origen, destino, tipo, km);
        const calculo = calcularPrecioTraslado(km, minutos, idaVuelta, horasExtra, nivelServicio, origen, destino, horario);
        base = calculo.base;
        datos = {
            ...datos,
            origen,
            destino,
            km,
            minutos,
            idaVuelta,
            horasExtra: calculo.horasExtra,
            esForaneo: calculo.esForaneo,
            nivelServicio,
            franjaHorario: calculo.franjaHorario
        };
        detalle = detallePrecioTraslado(idaVuelta, calculo);
    } else {
        const origen = document.getElementById("adminCotOrigenTour")?.value.trim();
        const horasValle = parseFloat(document.getElementById("adminCotHorasTour")?.value) || 4;
        const vinedos = document.getElementById("adminCotVinedos")?.value.trim() || "";

        if (!origen) {
            alert("Ingresa dirección de recogida.");
            return;
        }

        const calculoTour = calcularPrecioTour(km, minutos, horasValle);
        base = calculoTour.base;
        datos = {
            ...datos,
            origen,
            destino: VALLE_DESTINO,
            km,
            minutos,
            horasValle,
            vinedos,
            nivelServicio: "ejecutivo"
        };
        detalle = `${TARIFAS.ejecutivo.etiqueta}: tour con ${horasValle} h en el valle.`;
    }

    const { minimo, maximo, confirmado } = calcularRango(base);
    const promedio = Math.round((minimo + maximo) / 2);
    const nivel = TARIFAS[datos.nivelServicio || "ejecutivo"];

    ultimaCotizacionAdmin = { datos, promedio, minimo, maximo, confirmado, nombre, telefono };

    if (resultado) {
        resultado.hidden = false;
        resultado.innerHTML = `
            <h3>Resultado</h3>
            <div class="admin-cot-result-price">$${promedio} <span>MXN</span></div>
            <p class="admin-cot-result-range">Hasta $${confirmado} MXN por tráfico, desvíos o imprevistos en ruta</p>
            <p class="admin-cot-result-meta">${tipoLabels[tipo]} · ${nivel.etiqueta}</p>
            <p class="admin-cot-result-meta">${formatearFecha(fecha)} · ${formatearHorario12h(horario)}</p>
            <p class="admin-cot-result-detail">${detalle}</p>
            <div class="admin-cot-map-block">
                <div class="result-map-label">Ruta estimada</div>
                <div id="adminCotRouteMap" class="result-route-map" role="img" aria-label="Mapa de la ruta estimada"></div>
                <p id="adminCotRouteMapCaption" class="result-map-caption"></p>
            </div>
        `;

        let notaMapa = "";
        if (tipo === "traslado" && datos.idaVuelta) {
            notaMapa = "Ruta de referencia (solo ida). El precio incluye ida y vuelta.";
        } else if (tipo === "tour") {
            notaMapa = "Ruta de ida al Valle de Guadalupe.";
        }

        const fechaSalida = crearFechaSalidaProgramada(fecha, horario);
        void renderizarMapaRuta(
            document.getElementById("adminCotRouteMap"),
            document.getElementById("adminCotRouteMapCaption"),
            datos.origen,
            datos.destino,
            notaMapa,
            fechaSalida
        );
    }

    if (btnEnviar) btnEnviar.disabled = false;
    if (btnAgendar) btnAgendar.disabled = false;
    actualizarRequisitos(promedio);
}

function enviarCotizacionWhatsApp() {
    if (!ultimaCotizacionAdmin) {
        alert("Calcula la cotización primero.");
        return;
    }

    const { datos, promedio, confirmado, nombre, telefono } = ultimaCotizacionAdmin;
    const waTel = normalizarTelefonoWa(telefono);

    if (!waTel || waTel.length < 12) {
        alert("WhatsApp del cliente inválido.");
        return;
    }

    const mensaje = construirMensajeCotizacionCliente(datos, promedio, confirmado, nombre);
    window.open(`https://wa.me/${waTel}?text=${encodeURIComponent(mensaje)}`, "_blank", "noopener");
}

async function enviarYAgendarPendiente() {
    if (!ultimaCotizacionAdmin) {
        alert("Calcula la cotización primero.");
        return;
    }

    const { datos, promedio, confirmado, nombre, telefono } = ultimaCotizacionAdmin;
    const waTel = normalizarTelefonoWa(telefono);

    if (!waTel || waTel.length < 12) {
        alert("WhatsApp del cliente inválido.");
        return;
    }

    if (btnAgendar) {
        btnAgendar.disabled = true;
        btnAgendar.textContent = "Guardando…";
    }

    try {
        const resultado = await guardarCotizacionPendienteAdmin({
            datos,
            promedio,
            confirmado,
            nombre,
            telefono: waTel
        });

        const mensaje = construirMensajeCotizacionCliente(
            datos,
            promedio,
            confirmado,
            nombre,
            resultado.urlConfirmacion
        );

        window.open(`https://wa.me/${waTel}?text=${encodeURIComponent(mensaje)}`, "_blank", "noopener");

        alert(`Cotización ${resultado.refSolicitud} guardada como pendiente. El cliente tiene hasta que expire el enlace para confirmar.`);
    } catch (err) {
        console.error(err);
        alert("No se pudo guardar la cotización. Verifica conexión y reglas de Firestore.");
    } finally {
        if (btnAgendar) {
            btnAgendar.disabled = false;
            btnAgendar.textContent = "Enviar y agendar pendiente";
        }
    }
}

function programarRuta() {
    clearTimeout(routeDebounce);
    routeDebounce = setTimeout(async () => {
        const kmInput = document.getElementById("adminCotKm");
        const minInput = document.getElementById("adminCotMinutos");
        if (kmInput) kmInput.value = "";
        if (minInput) minInput.value = "";
        await calcularRutaSiFalta();
    }, 1200);
}

function programarRutaTraslado() {
    if (getTipo() === "traslado") programarRuta();
}

function programarRutaTour() {
    if (getTipo() === "tour") programarRuta();
}

async function initAutocompleteAdmin() {
    if (placesAdminInicializado) return;

    await initPlacesAutocomplete([
        { input: "adminCotOrigen", onSelect: programarRutaTraslado },
        { input: "adminCotDestino", onSelect: programarRutaTraslado },
        { input: "adminCotOrigenTour", onSelect: programarRutaTour }
    ]);

    placesAdminInicializado = true;
}

export function abrirCotizadorAdmin() {
    if (!panel) return;
    cotizadorAbierto = true;
    panel.hidden = false;
    panel.setAttribute("aria-hidden", "false");
    document.body.classList.add("admin-cotizador-open");
    requestAnimationFrame(() => panel.classList.add("is-open"));

    const hoy = new Date().toISOString().split("T")[0];
    const fechaInput = document.getElementById("adminCotFecha");
    if (fechaInput && !fechaInput.value) {
        fechaInput.min = hoy;
        fechaInput.value = hoy;
    }
    actualizarRequisitos();
    void initAutocompleteAdmin();
}

export function cerrarCotizadorAdmin() {
    if (!panel) return;
    cotizadorAbierto = false;
    panel.classList.remove("is-open");
    panel.setAttribute("aria-hidden", "true");
    document.body.classList.remove("admin-cotizador-open");
    setTimeout(() => {
        if (!cotizadorAbierto) panel.hidden = true;
    }, 280);
}

export function initAdminCotizador() {
    if (!panel || !btnAbrir) return;

    btnAbrir.addEventListener("click", abrirCotizadorAdmin);
    btnCerrar?.addEventListener("click", cerrarCotizadorAdmin);
    panel.addEventListener("click", e => {
        if (e.target === panel) cerrarCotizadorAdmin();
    });

    document.querySelectorAll(".admin-cot-tab").forEach(tab => {
        tab.addEventListener("click", () => {
            document.getElementById("adminCotTipo").value = tab.dataset.tipo;
            actualizarCamposTipo();
        });
    });

    form?.addEventListener("submit", calcularCotizacion);
    btnEnviar?.addEventListener("click", enviarCotizacionWhatsApp);
    btnAgendar?.addEventListener("click", enviarYAgendarPendiente);

    ["adminCotFecha", "adminCotHorario", "adminCotOrigen", "adminCotDestino",
        "adminCotOrigenTour", "adminCotIdaVuelta", "adminCotHorasExtra",
        "adminCotHorasTour", "adminCotVinedos"].forEach(id => {
        const el = document.getElementById(id);
        el?.addEventListener("change", () => {
            actualizarRequisitos(ultimaCotizacionAdmin?.promedio || 0);
            if (["adminCotOrigen", "adminCotDestino", "adminCotOrigenTour"].includes(id)) {
                programarRuta();
            }
        });
        el?.addEventListener("input", () => {
            if (id === "adminCotFecha" || id === "adminCotHorario") {
                actualizarRequisitos(ultimaCotizacionAdmin?.promedio || 0);
            }
        });
    });

    document.addEventListener("keydown", e => {
        if (e.key === "Escape" && cotizadorAbierto) cerrarCotizadorAdmin();
    });

    actualizarCamposTipo();
    void initAutocompleteAdmin();
}
