const telefono = "526648196809";

const TARIFAS = {
    estandar: {
        kmMadrugada: 17,
        kmPico: 15,
        kmDia: 12,
        hora: 250,
        minima: 120,
        minimaDia: 140,
        etiqueta: "Traslado local",
        etiquetaCorta: "Local"
    },
    ejecutivo: {
        km: 14,
        hora: 300,
        minima: 150,
        etiqueta: "Programado premium",
        etiquetaCorta: "Premium"
    }
};

const KM_FORANEO_UMBRAL = 60;
const FORANEO_RETORNO_PORCENTAJE = 0.6;
const HORARIO_MADRUGADA_HASTA_HORA = 5;
const HORARIO_PICO_HASTA_HORA = 8;
const KM_TRAMO_1_MAX = 20;
const KM_TRAMO_2_MAX = 30;
const KM_ESCALON_DESCUENTO = 3;

const PATRONES_UBICACION_FORANEA = [
    /ensenada/i,
    /mexicali/i,
    /valle de guadalupe/i,
    /san diego/i,
    /\bvalle\b/i
];

const PATRONES_UBICACION_LOCAL = [
    /tijuana/i,
    /rosarito/i,
    /playas/i,
    /tecate/i,
    /san ysidro/i,
    /ysidro/i,
    /otay/i,
    /garita/i,
    /aeropuerto/i,
    /\btij\b/i
];

const NOTA_CIERRE_RESERVA =
    "Cotización estimada. El monto final se confirma contigo al reservar.";

const tipoLabels = {
    traslado: "Traslado punto a punto",
    tour: "Tour Valle de Guadalupe"
};

function getTipoServicio() {
    return document.getElementById("tipoServicio").value;
}

function actualizarFormulario() {
    const tipo = getTipoServicio();
    const camposOrigenDestino = document.getElementById("camposOrigenDestino");
    const camposTraslado = document.getElementById("camposTraslado");
    const camposTour = document.getElementById("camposTour");

    if (camposOrigenDestino) {
        camposOrigenDestino.style.display = tipo === "traslado" ? "block" : "none";
    }

    camposTraslado.style.display = tipo === "traslado" ? "block" : "none";
    camposTour.classList.toggle("active", tipo === "tour");

    resetResultado();
}

function resetResultado() {
    const resultado = document.getElementById("resultado");
    resultado.classList.remove("visible");
    resultado.innerHTML = `
        <div class="result-header">
            <h3>Tu cotización estimada</h3>
        </div>
        <div class="result-empty">
            <span class="result-empty-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 6h8M8 10h8M8 14h4"/></svg>
            </span>
            <p>Completa el formulario y presiona calcular para ver tu estimado al instante.</p>
        </div>
    `;
    document.getElementById("whatsappBtn").style.display = "none";
    limpiarMapaRuta();
}

const MAPA_ESTILOS_OSCURO = [
    { elementType: "geometry", stylers: [{ color: "#141414" }] },
    { elementType: "labels.text.fill", stylers: [{ color: "#7a7a7a" }] },
    { elementType: "labels.text.stroke", stylers: [{ color: "#141414" }] },
    { featureType: "road", elementType: "geometry", stylers: [{ color: "#2a2a2a" }] },
    { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#1a1a1a" }] },
    { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#3a3428" }] },
    { featureType: "water", elementType: "geometry", stylers: [{ color: "#0a0a0a" }] },
    { featureType: "poi", stylers: [{ visibility: "off" }] },
    { featureType: "transit", stylers: [{ visibility: "off" }] }
];

let routeMap = null;
let routeRenderer = null;

function limpiarMapaRuta() {
    if (routeRenderer) {
        routeRenderer.setMap(null);
        routeRenderer = null;
    }
    routeMap = null;
}

async function obtenerDireccionesParaMapa(origen, destino) {
    await cargarGoogleMaps();

    const directionsService = new google.maps.DirectionsService();
    const dirResp = await solicitarDirecciones(directionsService, crearSolicitudDirecciones(origen, destino));

    if (dirResp.status === google.maps.DirectionsStatus.OK) {
        return seleccionarRutaMasCorta(dirResp.result);
    }

    return null;
}

async function renderizarMapaRuta(origen, destino, nota = "") {
    const container = document.getElementById("routeMap");
    const caption = document.getElementById("routeMapCaption");
    if (!container) return;

    limpiarMapaRuta();
    container.innerHTML = '<p class="route-map-loading">Cargando mapa...</p>';
    if (caption) caption.textContent = nota;

    try {
        const directionsResult = await obtenerDireccionesParaMapa(origen, destino);
        if (!directionsResult?.routes?.[0]) {
            container.innerHTML = '<p class="route-map-error">No se pudo mostrar el mapa de la ruta.</p>';
            return;
        }

        container.innerHTML = "";

        routeMap = new google.maps.Map(container, {
            center: directionsResult.routes[0].bounds.getCenter(),
            zoom: 10,
            disableDefaultUI: true,
            zoomControl: true,
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: false,
            clickableIcons: false,
            styles: MAPA_ESTILOS_OSCURO
        });

        routeRenderer = new google.maps.DirectionsRenderer({
            map: routeMap,
            suppressMarkers: false,
            preserveViewport: false,
            polylineOptions: {
                strokeColor: "#D4AF37",
                strokeWeight: 5,
                strokeOpacity: 0.95
            }
        });

        routeRenderer.setDirections(directionsResult);
        routeMap.fitBounds(directionsResult.routes[0].bounds, 36);
    } catch {
        container.innerHTML = '<p class="route-map-error">No se pudo cargar el mapa.</p>';
    }
}

function calcularRango(base) {
    return {
        minimo: Math.round(base * 0.90),
        maximo: Math.round(base * 1.15),
        confirmado: Math.round(base * 1.15)
    };
}

function parsearHorario(horario) {
    if (!horario) return null;

    const [horas, minutos] = horario.split(":").map(Number);
    if (isNaN(horas) || isNaN(minutos)) return null;

    return { horas, minutos };
}

function resolverTarifaLocal(horario) {
    const parsed = parsearHorario(horario);
    const horas = parsed?.horas;
    const tarifa = TARIFAS.estandar;

    if (horas !== undefined && horas < HORARIO_MADRUGADA_HASTA_HORA) {
        return {
            franja: "madrugada",
            km: tarifa.kmMadrugada,
            minima: tarifa.minima,
            etiqueta: "Madrugada"
        };
    }

    if (horas !== undefined && horas < HORARIO_PICO_HASTA_HORA) {
        return {
            franja: "pico",
            km: tarifa.kmPico,
            minima: tarifa.minima,
            etiqueta: "Pico matutino"
        };
    }

    return {
        franja: "dia",
        km: tarifa.kmDia,
        minima: tarifa.minimaDia,
        etiqueta: "Horario diurno"
    };
}

function calcularCostoKmEscalonado(km, tarifaBase) {
    const tarifa2 = tarifaBase - KM_ESCALON_DESCUENTO;
    const tarifa3 = tarifaBase - KM_ESCALON_DESCUENTO * 2;
    const tramos = [];
    let restante = Math.max(0, km);
    let costo = 0;

    const km1 = Math.min(restante, KM_TRAMO_1_MAX);
    if (km1 > 0) {
        tramos.push({ km: km1, tarifa: tarifaBase });
        costo += km1 * tarifaBase;
        restante -= km1;
    }

    const km2 = Math.min(restante, KM_TRAMO_2_MAX - KM_TRAMO_1_MAX);
    if (km2 > 0) {
        tramos.push({ km: km2, tarifa: tarifa2 });
        costo += km2 * tarifa2;
        restante -= km2;
    }

    if (restante > 0) {
        tramos.push({ km: restante, tarifa: tarifa3 });
        costo += restante * tarifa3;
    }

    return { costo, tramos };
}

function formatearDesgloseKm(tramos) {
    if (!tramos?.length) return "";

    return tramos
        .map((tramo) => {
            const kmTexto = Number.isInteger(tramo.km) ? String(tramo.km) : (Math.round(tramo.km * 10) / 10).toString();
            return `${kmTexto} km × $${tramo.tarifa}`;
        })
        .join(" + ");
}

function formatearHorario12h(horario) {
    if (!horario) return "";

    const [horas, minutos] = horario.split(":").map(Number);
    if (isNaN(horas) || isNaN(minutos)) return horario;

    const periodo = horas >= 12 ? "p.m." : "a.m.";
    const hora12 = horas % 12 || 12;

    return `${hora12}:${String(minutos).padStart(2, "0")} ${periodo}`;
}

function obtenerEtiquetaFranjaPublica(franja) {
    if (franja === "madrugada") {
        return "Horario de madrugada — servicio programado";
    }

    if (franja === "pico") {
        return "Horario matutino de alta demanda";
    }

    if (franja === "dia") {
        return "Horario diurno";
    }

    return "";
}

function obtenerFechaSalidaProgramada() {
    const fecha = document.getElementById("fecha")?.value;
    const horario = document.getElementById("horario")?.value;
    if (!fecha || !horario) return null;

    const [anio, mes, dia] = fecha.split("-").map(Number);
    const parsed = parsearHorario(horario);
    if (!parsed) return null;

    const salida = new Date(anio, mes - 1, dia, parsed.horas, parsed.minutos, 0);
    if (salida.getTime() <= Date.now()) return null;

    return salida;
}

function textoUbicacion(texto) {
    return (texto || "").trim().toLowerCase();
}

function esUbicacionForanea(texto) {
    const ubicacion = textoUbicacion(texto);
    return PATRONES_UBICACION_FORANEA.some((patron) => patron.test(ubicacion));
}

function esUbicacionLocal(texto) {
    const ubicacion = textoUbicacion(texto);
    if (!ubicacion || esUbicacionForanea(texto)) return false;
    return PATRONES_UBICACION_LOCAL.some((patron) => patron.test(ubicacion));
}

function determinarNivelServicio(origen, destino, tipoServicio, km = null) {
    if (tipoServicio === "tour") {
        return "ejecutivo";
    }

    if (esUbicacionLocal(origen) && esUbicacionLocal(destino)) {
        return "estandar";
    }

    if (
        km !== null &&
        km <= KM_FORANEO_UMBRAL &&
        !esUbicacionForanea(origen) &&
        !esUbicacionForanea(destino)
    ) {
        return "estandar";
    }

    return "ejecutivo";
}

function calcularPrecioTraslado(
    km,
    minutos,
    idaVuelta,
    horasExtra,
    nivel,
    origen = "",
    destino = "",
    horario = ""
) {
    const tarifa = TARIFAS[nivel];
    const tarifaLocal = nivel === "estandar" ? resolverTarifaLocal(horario) : null;
    const tarifaKm = tarifaLocal ? tarifaLocal.km : tarifa.km;
    const tarifaMinima = tarifaLocal ? tarifaLocal.minima : tarifa.minima;

    let kmCobrados = km;
    let minutosCobrados = minutos;
    let esForaneo = false;

    if (idaVuelta) {
        kmCobrados = km * 2;
        minutosCobrados = minutos * 2;
    } else if (nivel === "ejecutivo" && km > KM_FORANEO_UMBRAL) {
        const factorRetorno = 1 + FORANEO_RETORNO_PORCENTAJE;
        kmCobrados = km * factorRetorno;
        minutosCobrados = minutosCobrados * factorRetorno;
        esForaneo = true;
    }

    let precioKm;
    let desgloseKm = null;
    if (tarifaLocal) {
        const escalonKm = calcularCostoKmEscalonado(kmCobrados, tarifaKm);
        precioKm = escalonKm.costo;
        if (escalonKm.tramos.length > 1) {
            desgloseKm = formatearDesgloseKm(escalonKm.tramos);
        }
    } else {
        precioKm = kmCobrados * tarifaKm;
    }
    const precioTiempo = (minutosCobrados / 60) * tarifa.hora;
    const precioTraslado = Math.max(precioKm, precioTiempo);
    const horasExtraCobradas = horasExtra >= 1 ? horasExtra : 0;
    const precioHorasExtra = horasExtraCobradas * tarifa.hora;
    const base = Math.max(precioTraslado + precioHorasExtra, tarifaMinima);

    return {
        base,
        nivel,
        esForaneo,
        franjaHorario: tarifaLocal?.franja || null,
        etiquetaFranja: tarifaLocal?.etiqueta || null,
        tarifaKm,
        desgloseKm,
        tarifaMinima,
        kmCobrados: Math.round(kmCobrados * 10) / 10,
        minutosCobrados: Math.round(minutosCobrados),
        precioHorasExtra,
        horasExtra: horasExtraCobradas,
        tarifa
    };
}

function calcularPrecioTour(km, minutos, horasValle) {
    const tarifa = TARIFAS.ejecutivo;
    const precioTraslado = Math.max(km * 2 * tarifa.km, (minutos * 2 / 60) * tarifa.hora);
    const precioValle = horasValle * tarifa.hora;

    return {
        base: Math.max(precioTraslado + precioValle, tarifa.minima),
        nivel: "ejecutivo",
        tarifa
    };
}

function detallePrecioTraslado(km, minutos, idaVuelta, calculo) {
    const tipo = TARIFAS[calculo.nivel].etiqueta;
    let texto = "Traslado privado programado, puerta a puerta.";

    if (idaVuelta) {
        texto = `${tipo}: traslado ida y vuelta.`;
    } else if (calculo.esForaneo) {
        texto = `${tipo}: trayecto foráneo solo ida, incluye retorno del vehículo.`;
    } else if (tipo !== TARIFAS.estandar.etiqueta) {
        texto = `${tipo}: traslado de origen a destino.`;
    }

    if (calculo.horasExtra > 0) {
        texto += ` Incluye ${calculo.horasExtra} h adicionales.`;
    }

    if (calculo.franjaHorario === "madrugada") {
        texto += " Servicio programado con chofer descansado y vehículo garantizado.";
    } else if (calculo.franjaHorario === "pico") {
        texto += " Horario matutino de alta demanda.";
    }

    return texto;
}

function formatearFecha(fecha) {
    if (!fecha) return "";
    const [anio, mes, dia] = fecha.split("-");
    return `${dia}/${mes}/${anio}`;
}

function leerCoordenadasDesdeInput(inputId) {
    const input = document.getElementById(inputId);
    if (!input) return null;

    const lat = parseFloat(input.dataset.lat);
    const lng = parseFloat(input.dataset.lng);

    if (isNaN(lat) || isNaN(lng)) return null;
    return { lat, lng };
}

function guardarCoordenadasEnInput(input, lat, lng) {
    if (!input) return;
    input.dataset.lat = String(lat);
    input.dataset.lng = String(lng);
}

function limpiarCoordenadasInput(input) {
    if (!input) return;
    delete input.dataset.lat;
    delete input.dataset.lng;
}

function crearEnlaceGoogleMaps(direccion, coords = null) {
    let destino = "";

    if (coords && !isNaN(coords.lat) && !isNaN(coords.lng)) {
        destino = `${coords.lat},${coords.lng}`;
    } else if (direccion) {
        destino = encodeURIComponent(direccion);
    } else {
        return null;
    }

    return `https://www.google.com/maps/dir/?api=1&destination=${destino}`;
}

function lineasUbicacionWhatsApp(etiqueta, direccion, coords = null) {
    const lineas = [`📍 ${etiqueta.toUpperCase()}`, direccion];
    const enlace = crearEnlaceGoogleMaps(direccion, coords);

    if (enlace) {
        lineas.push(`🗺️ ${enlace}`);
    }

    return lineas;
}

function construirMensaje(datos, promedio, minimo, maximo, confirmado) {
    const nivel = TARIFAS[datos.nivelServicio || "ejecutivo"];
    const lineas = [
        "🚗 SOLICITUD DE TRASLADO",
        "Traslados Privados Víctor",
        "",
        "━━━━━━━━━━━━━━━━━━",
        "📋 SERVICIO",
        `• Tipo: ${tipoLabels[datos.tipo]}`,
        `• Tarifa: ${nivel.etiqueta}`,
        `• Fecha: ${formatearFecha(datos.fecha)}`,
        `• Horario: ${formatearHorario12h(datos.horario)}`
    ];

    if (datos.franjaHorario && datos.franjaHorario !== "dia" && datos.nivelServicio === "estandar") {
        const etiquetaPublica = obtenerEtiquetaFranjaPublica(datos.franjaHorario);
        if (etiquetaPublica) {
            lineas.push(`• ${etiquetaPublica}`);
        }
    }

    lineas.push("");

    if (datos.tipo === "traslado") {
        lineas.push("📍 RUTA", "");
        lineas.push(...lineasUbicacionWhatsApp("Origen", datos.origen, datos.origenCoords));
        lineas.push("");
        lineas.push(...lineasUbicacionWhatsApp("Destino", datos.destino, datos.destinoCoords));
        lineas.push(
            "",
            `• Modalidad: ${datos.idaVuelta ? "Ida y vuelta" : "Solo ida"}`
        );

        if (datos.esForaneo) {
            lineas.push("• Trayecto foráneo (incluye retorno del vehículo)");
        }

        if (datos.horasExtra > 0) {
            lineas.push(`• Horas extra: ${datos.horasExtra} h`);
        }
    }

    if (datos.tipo === "tour") {
        lineas.push("📍 RUTA", "");
        lineas.push(...lineasUbicacionWhatsApp("Recogida", datos.origen, datos.origenCoords));
        lineas.push("");
        lineas.push(...lineasUbicacionWhatsApp("Destino", datos.destino, datos.destinoCoords));
        lineas.push(
            "",
            `• Horas en valle: ${datos.horasValle} h`
        );

        if (datos.vinedos) {
            lineas.push(`• Viñedos: ${datos.vinedos}`);
        }
    }

    lineas.push(
        "",
        "💰 COTIZACIÓN ESTIMADA",
        `• Referencia: $${promedio} MXN`,
        `• Rango estimado: $${minimo} – $${maximo} MXN`,
        `• Al reservar: hasta $${confirmado} MXN`,
        "",
        "━━━━━━━━━━━━━━━━━━",
        "Hola Víctor, me interesa confirmar este traslado.",
        "Quedo atento a tu confirmación. ¡Gracias!"
    );

    return lineas.join("\n");
}

function calcular(event) {
    if (event) event.preventDefault();

    const tipo = getTipoServicio();
    const fecha = document.getElementById("fecha").value;
    const horario = document.getElementById("horario").value;

    if (!fecha || !horario) return;

    let base = TARIFAS.ejecutivo.minima;
    let detalle = "";
    let datos = { tipo, fecha, horario };
    let nivelServicio = "ejecutivo";

    if (tipo === "traslado") {
        const origen = document.getElementById("origen").value.trim();
        const destino = document.getElementById("destino").value.trim();
        const km = parseFloat(document.getElementById("km").value);
        const minutos = parseFloat(document.getElementById("minutos").value);
        const idaVuelta = document.getElementById("idaVuelta").checked;
        const horasExtra = parseFloat(document.getElementById("horasExtra")?.value) || 0;

        if (!origen || !destino || isNaN(km) || isNaN(minutos)) return;
        if (horasExtra < 0) return;
        if (horasExtra > 0 && horasExtra < 1) return;

        nivelServicio = determinarNivelServicio(origen, destino, tipo, km);
        const calculo = calcularPrecioTraslado(
            km,
            minutos,
            idaVuelta,
            horasExtra,
            nivelServicio,
            origen,
            destino,
            horario
        );
        base = calculo.base;

        datos = {
            ...datos,
            origen,
            destino,
            origenCoords: leerCoordenadasDesdeInput("origen"),
            destinoCoords: leerCoordenadasDesdeInput("destino"),
            km,
            minutos,
            idaVuelta,
            horasExtra: calculo.horasExtra,
            esForaneo: calculo.esForaneo,
            nivelServicio,
            franjaHorario: calculo.franjaHorario,
            etiquetaFranja: calculo.etiquetaFranja,
            tarifaKm: calculo.tarifaKm,
            desgloseKm: calculo.desgloseKm,
            tarifaMinima: calculo.tarifaMinima
        };
        detalle = detallePrecioTraslado(km, minutos, idaVuelta, calculo);
    }

    if (tipo === "tour") {
        const origen = document.getElementById("origenTour").value.trim();
        const km = parseFloat(document.getElementById("kmTour").value);
        const minutos = parseFloat(document.getElementById("minutosTour").value);
        const horasValle = parseFloat(document.getElementById("horasTour").value);
        const vinedos = document.getElementById("vinedos").value.trim();

        if (!origen || isNaN(km) || isNaN(minutos) || isNaN(horasValle)) return;

        nivelServicio = "ejecutivo";
        const calculoTour = calcularPrecioTour(km, minutos, horasValle);
        base = calculoTour.base;

        datos = {
            ...datos,
            origen,
            destino: VALLE_DESTINO,
            origenCoords: leerCoordenadasDesdeInput("origenTour"),
            destinoCoords: null,
            km,
            minutos,
            horasValle,
            vinedos,
            nivelServicio
        };
        detalle = `${TARIFAS.ejecutivo.etiqueta}: tour con ${horasValle} h en el valle.`;
    }

    const { minimo, maximo, confirmado } = calcularRango(base);
    const promedio = Math.round((minimo + maximo) / 2);
    const resultado = document.getElementById("resultado");
    const mostrarMapa = tipo === "traslado" || tipo === "tour";

    resultado.innerHTML = construirResultado(datos, promedio, minimo, maximo, confirmado, detalle, mostrarMapa);
    resultado.classList.add("visible");

    const whatsappBtn = document.getElementById("whatsappBtn");
    whatsappBtn.href = `https://wa.me/${telefono}?text=${encodeURIComponent(construirMensaje(datos, promedio, minimo, maximo, confirmado))}`;
    whatsappBtn.style.display = "flex";

    if (mostrarMapa) {
        const origenMapa = datos.origen;
        const destinoMapa = tipo === "tour" ? VALLE_DESTINO : datos.destino;
        let notaMapa = "";

        if (tipo === "traslado" && datos.idaVuelta) {
            notaMapa = "Ruta de referencia (solo ida). El precio incluye ida y vuelta.";
        } else if (tipo === "tour") {
            notaMapa = "Ruta de ida al Valle de Guadalupe.";
        }

        renderizarMapaRuta(origenMapa, destinoMapa, notaMapa);
    } else {
        limpiarMapaRuta();
    }
}

function construirResultado(datos, promedio, minimo, maximo, confirmado, detalle, incluirMapa = false) {
    const nivel = TARIFAS[datos.nivelServicio || "ejecutivo"];
    const meta = [
        `<div class="result-meta-item">Servicio<strong>${tipoLabels[datos.tipo]}</strong></div>`,
        `<div class="result-meta-item">Tarifa<strong>${nivel.etiqueta}</strong></div>`,
        `<div class="result-meta-item">Fecha<strong>${formatearFecha(datos.fecha)}</strong></div>`,
        `<div class="result-meta-item">Horario<strong>${formatearHorario12h(datos.horario)}</strong></div>`
    ];

    if (datos.tipo === "traslado") {
        meta.push(
            `<div class="result-meta-item">Origen<strong>${datos.origen}</strong></div>`,
            `<div class="result-meta-item">Destino<strong>${datos.destino}</strong></div>`
        );
        if (datos.horasExtra > 0) {
            meta.push(
                `<div class="result-meta-item">Horas extra<strong>${datos.horasExtra} h</strong></div>`
            );
        }
    }

    const mapaHtml = incluirMapa
        ? `
            <div class="result-map-block">
                <div class="result-map-label">Ruta estimada</div>
                <div id="routeMap" class="result-route-map" role="img" aria-label="Mapa de la ruta estimada"></div>
                <p id="routeMapCaption" class="result-map-caption"></p>
            </div>
        `
        : "";

    return `
        <div class="result-header">
            <h3>Tu cotización estimada</h3>
        </div>
        <div class="result-body">
            <div class="result-meta">${meta.join("")}</div>
            <div class="result-price-block">
                <div class="result-price-label">Estimado aproximado</div>
                <div class="result-price-main">
                    <strong>$${promedio} MXN</strong>
                </div>
                <div class="result-price-range">Rango estimado: $${minimo} – $${maximo} MXN</div>
                <div class="result-price-confirm">Al reservar: hasta <strong>$${confirmado} MXN</strong></div>
            </div>
            ${mapaHtml}
            <div class="result-detail-text">${detalle}</div>
            <p class="result-policy-note">${NOTA_CIERRE_RESERVA}</p>
        </div>
    `;
}

/* ── Service tabs ── */

document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        document.getElementById("tipoServicio").value = btn.dataset.tipo;
        actualizarFormulario();
    });
});

/* ── Gallery lightbox ── */

const galleryLightbox = document.getElementById("galleryLightbox");
const lightboxImg = document.getElementById("lightboxImg");
const lightboxCaption = document.getElementById("lightboxCaption");
const lightboxClose = document.querySelector(".lightbox-close");

function openLightbox(item) {
    const img = item.querySelector("img");
    const caption = item.querySelector("figcaption");
    if (!img || !galleryLightbox) return;

    lightboxImg.src = img.src;
    lightboxImg.alt = img.alt;
    lightboxCaption.textContent = caption?.textContent || img.alt;

    galleryLightbox.removeAttribute("hidden");
    galleryLightbox.setAttribute("aria-hidden", "false");
    requestAnimationFrame(() => galleryLightbox.classList.add("is-open"));
    document.body.style.overflow = "hidden";
}

function closeLightbox() {
    if (!galleryLightbox) return;

    galleryLightbox.classList.remove("is-open");
    galleryLightbox.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";

    setTimeout(() => {
        if (!galleryLightbox.classList.contains("is-open")) {
            galleryLightbox.setAttribute("hidden", "");
            lightboxImg.src = "";
        }
    }, 300);
}

document.querySelectorAll(".gallery-item").forEach(item => {
    item.addEventListener("click", () => openLightbox(item));
    item.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openLightbox(item);
        }
    });
});

lightboxClose?.addEventListener("click", closeLightbox);

galleryLightbox?.addEventListener("click", (e) => {
    if (e.target === galleryLightbox) closeLightbox();
});

document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && galleryLightbox?.classList.contains("is-open")) {
        closeLightbox();
    }
    if (e.key === "Escape" && destModal?.classList.contains("is-open")) {
        closeDestModal();
    }
});

/* ── Destination modals ── */

const DESTINOS = {
    aeropuerto: {
        label: "Aeropuerto de Tijuana",
        tagline: "Sin estrés · Puntual",
        titulo: "Tu traslado al aeropuerto, sin estrés",
        cotizar: "Aeropuerto de Tijuana (TIJ)",
        imagen: "images/destinos/aeropuerto.jpg",
        imagenAlt: "Aeropuerto de Tijuana",
        escena: "Sin taxi de último momento ni prisas con el equipaje. Te recojo o te dejo en TIJ con espacio, aire acondicionado y puntualidad — para que tu viaje empiece bien desde tu puerta.",
        highlights: [
            { icon: "✈️", text: "Coordinación según tu vuelo" },
            { icon: "🧳", text: "Espacio cómodo para equipaje" },
            { icon: "⏱️", text: "Ida, vuelta o solo un tramo" }
        ],
        servicio: "Yo me encargo del traslado; tú solo preocúpate por tu vuelo.",
        nota: "Indica número de vuelo y horario al reservar."
    },
    playas: {
        label: "Playas de Tijuana",
        tagline: "Costa · Mariscos",
        titulo: "La costa a minutos de la ciudad",
        cotizar: "Playas de Tijuana",
        imagen: "images/destinos/playas.jpg",
        imagenAlt: "Playas de Tijuana",
        escena: "Aire de mar, caminata por el malecón y mariscos frescos. Una tarde relajada sin planear demasiado: tú marcas la hora de regreso y yo te llevo y recojo.",
        highlights: [
            { icon: "🌊", text: "Playa y malecón de Tijuana" },
            { icon: "🍤", text: "Tiempo para comer frente al mar" },
            { icon: "🌅", text: "Salida flexible, regreso cuando quieras" }
        ],
        servicio: "Transporte privado puerta a puerta — tú disfrutas, yo manejo.",
        nota: "Zona costera de Tijuana (no Rosarito)."
    },
    rosarito: {
        label: "Rosarito",
        tagline: "Playa · Atardecer",
        titulo: "Escapada de playa sin complicaciones",
        cotizar: "Rosarito, B.C.",
        imagen: "images/destinos/rosarito.jpg",
        imagenAlt: "Rosarito, Baja California",
        escena: "Salir de Tijuana y estar frente al Pacífico en poco tiempo. Día en la arena, comida frente al mar o paseo al atardecer — como tú lo imagines, sin volante de regreso.",
        highlights: [
            { icon: "🏖️", text: "Playas y malecón de Rosarito" },
            { icon: "🍽️", text: "Restaurantes frente al mar" },
            { icon: "🕐", text: "Horario y regreso a tu medida" }
        ],
        servicio: "Tu escapada, mi responsabilidad: llevarte cómodo y a tiempo."
    },
    valle: {
        label: "Valle de Guadalupe",
        tagline: "Sin volante · A tu ritmo",
        titulo: "Tu día en el valle, sin volante",
        cotizar: "Valle de Guadalupe",
        imagen: "images/destinos/valle.jpg",
        imagenAlt: "Valle de Guadalupe",
        escena: "Disfruta el Valle de Guadalupe a tu ritmo. Visita viñedos, restaurantes y miradores sin preocuparte por conducir. Tú decides dónde detenerte, cuánto tiempo quedarte y cuándo regresar.",
        highlights: [
            { icon: "🍷", text: "Recorrido a tu medida" },
            { icon: "🚗", text: "Transporte ida y vuelta" },
            { icon: "📍", text: "Paradas en los lugares que elijas" }
        ],
        lugares: [
            { icon: "🍷", name: "Monte Xanic" },
            { icon: "🍷", name: "El Cielo" },
            { icon: "🍷", name: "Bruma" },
            { icon: "🍷", name: "Decantos" },
            { icon: "🍽️", name: "Fauna" },
            { icon: "🍽️", name: "Animalón" }
        ],
        lugaresNota: "Los lugares a visitar son completamente elección del cliente.",
        servicio: "Tú eliges dónde ir; yo te llevo y espero mientras disfrutas.",
        nota: "Transporte privado con chofer — no incluye guía turística.",
        boton: "🍷 Planear mi recorrido"
    },
    ensenada: {
        label: "Ensenada",
        tagline: "Mar · Gastronomía",
        titulo: "Ensenada a tu ritmo",
        cotizar: "Ensenada, B.C.",
        imagen: "images/destinos/ensenada.jpg",
        imagenAlt: "Ensenada, Baja California",
        escena: "Un día frente al mar con malecón, brisa del océano y buena mesa. ¿La Bufadora, el centro o una cena especial? Lo planificamos contigo antes de salir.",
        highlights: [
            { icon: "🌊", text: "Malecón y zona portuaria" },
            { icon: "🦪", text: "Gastronomía y paseos a tu ritmo" },
            { icon: "🚗", text: "Viaje cómodo desde Tijuana" }
        ],
        servicio: "El itinerario lo defines tú; yo me encargo del transporte.",
        nota: "No incluye guía turística ni recomendaciones como experto local."
    },
    tecate: {
        label: "Tecate",
        tagline: "Pueblo · Cerveza artesanal",
        titulo: "Pueblo con alma y buena comida",
        cotizar: "Tecate, B.C.",
        imagen: "images/destinos/tecate.jpg",
        imagenAlt: "Tecate, Baja California",
        escena: "Calles tranquilas, cerveza artesanal y ese ritmo más pausado que la ciudad. Un día diferente para desconectar, comer bien y regresar sin manejar.",
        highlights: [
            { icon: "🍺", text: "Centro y zona cervecera" },
            { icon: "🌄", text: "Paisaje de sierra y pueblo" },
            { icon: "🚗", text: "Ida, regreso o espera según tu plan" }
        ],
        servicio: "Te llevo a donde indiques; tú vives el día, yo el traslado.",
        nota: "Si necesitas cruzar a EE.UU. por la garita de Tecate: solo traslado hasta la garita, sin cruce ni servicio del otro lado."
    },
    mexicali: {
        label: "Mexicali",
        tagline: "Cómodo · Descansado",
        titulo: "Llega descansado a Mexicali",
        cotizar: "Mexicali, B.C.",
        imagen: "images/destinos/mexicali.jpg",
        imagenAlt: "Mexicali, Baja California",
        escena: "Negocios, familia o trámites en la capital del estado — llegas con comodidad y tiempo de sobra. El trayecto se vuelve parte del plan, no un obstáculo.",
        highlights: [
            { icon: "☀️", text: "Ideal para negocios o visitas" },
            { icon: "🚗", text: "Trayecto cómodo desde Tijuana" },
            { icon: "📅", text: "Reserva con anticipación" }
        ],
        servicio: "Destino y paradas acordadas contigo — yo me encargo del camino.",
        nota: "Servicio de transporte, no guía turística."
    },
    sandiego: {
        label: "San Diego",
        tagline: "Solo hasta garita",
        titulo: "Hasta la frontera, sin complicaciones",
        cotizar: "Garita San Ysidro",
        imagen: "images/destinos/sandiego.jpg",
        imagenAlt: "Garita fronteriza hacia San Diego",
        badge: "Solo hasta garita",
        escena: "Traslado privado hasta las garitas de San Ysidro u Otay para que cruces de forma cómoda y puntual. Del lado mexicano yo me encargo; del otro, continúas por tu cuenta.",
        highlights: [
            { icon: "🚗", text: "Traslado directo a la garita" },
            { icon: "🔄", text: "Recogida en garita al regreso (lado MX)" },
            { icon: "⏱️", text: "Cruce cómodo y puntual" }
        ],
        servicio: "Comodidad hasta el cruce — tú decides el resto del camino.",
        nota: "No cruzo la frontera ni continúo en EE.UU. Documentación y tiempos de espera: responsabilidad del pasajero."
    }
};

const destModal = document.getElementById("destModal");
const destModalImg = document.getElementById("destModalImg");
const destModalLabel = document.getElementById("destModalLabel");
const destModalTitle = document.getElementById("destModalTitle");
const destModalBadge = document.getElementById("destModalBadge");
const destModalEscena = document.getElementById("destModalEscena");
const destModalHighlights = document.getElementById("destModalHighlights");
const destModalLugares = document.getElementById("destModalLugares");
const destModalLugaresList = document.getElementById("destModalLugaresList");
const destModalLugaresNota = document.getElementById("destModalLugaresNota");
const destModalServicio = document.getElementById("destModalServicio");
const destModalNota = document.getElementById("destModalNota");
const destModalCotizar = document.getElementById("destModalCotizar");
const destModalClose = document.querySelector(".dest-modal-close");

let destinoActivo = null;

function openDestModal(id) {
    const dest = DESTINOS[id];
    if (!dest || !destModal) return;

    destinoActivo = dest;

    if (destModalImg) {
        destModalImg.src = dest.imagen;
        destModalImg.alt = dest.imagenAlt || dest.titulo;
    }

    destModalLabel.textContent = dest.label || "";
    destModalTitle.textContent = dest.titulo;
    destModalEscena.textContent = dest.escena;
    destModalServicio.textContent = dest.servicio;

    if (destModalHighlights) {
        destModalHighlights.innerHTML = (dest.highlights || [])
            .map(h => `<li><span class="dest-highlight-icon" aria-hidden="true">${h.icon}</span>${h.text}</li>`)
            .join("");
    }

    if (dest.lugares?.length && destModalLugares && destModalLugaresList) {
        destModalLugaresList.innerHTML = dest.lugares
            .map(l => `<li><span aria-hidden="true">${l.icon}</span>${l.name}</li>`)
            .join("");
        if (destModalLugaresNota) {
            destModalLugaresNota.textContent = dest.lugaresNota || "";
        }
        destModalLugares.hidden = false;
    } else if (destModalLugares) {
        destModalLugares.hidden = true;
        if (destModalLugaresList) destModalLugaresList.innerHTML = "";
        if (destModalLugaresNota) destModalLugaresNota.textContent = "";
    }

    if (destModalCotizar) {
        destModalCotizar.textContent = dest.boton || "🚗 Solicitar cotización";
    }

    if (dest.nota) {
        destModalNota.textContent = dest.nota;
        destModalNota.hidden = false;
    } else {
        destModalNota.textContent = "";
        destModalNota.hidden = true;
    }

    if (dest.badge) {
        destModalBadge.textContent = dest.badge;
        destModalBadge.hidden = false;
    } else {
        destModalBadge.hidden = true;
    }

    destModal.removeAttribute("hidden");
    destModal.setAttribute("aria-hidden", "false");
    requestAnimationFrame(() => destModal.classList.add("is-open"));
    document.body.style.overflow = "hidden";
}

function closeDestModal() {
    if (!destModal) return;

    destModal.classList.remove("is-open");
    destModal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";

    setTimeout(() => {
        if (!destModal.classList.contains("is-open")) {
            destModal.setAttribute("hidden", "");
            destinoActivo = null;
            if (destModalImg) destModalImg.src = "";
        }
    }, 300);
}

function cotizarDestino() {
    if (!destinoActivo) return;

    const destInput = document.getElementById("destino");
    const tipoInput = document.getElementById("tipoServicio");

    if (destInput) destInput.value = destinoActivo.cotizar;

    if (destinoActivo.cotizar.toLowerCase().includes("valle")) {
        document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
        const tourBtn = document.querySelector('.tab-btn[data-tipo="tour"]');
        if (tourBtn) {
            tourBtn.classList.add("active");
            if (tipoInput) tipoInput.value = "tour";
            actualizarFormulario();
        }
        const origenTour = document.getElementById("origenTour");
        const origenGeneral = document.getElementById("origen")?.value.trim();
        if (origenTour && !origenTour.value && origenGeneral) {
            origenTour.value = origenGeneral;
        }
        programarCalculoRuta("tour");
    } else {
        document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
        const trasladoBtn = document.querySelector('.tab-btn[data-tipo="traslado"]');
        if (trasladoBtn) {
            trasladoBtn.classList.add("active");
            if (tipoInput) tipoInput.value = "traslado";
            actualizarFormulario();
        }
        programarCalculoRuta("traslado");
    }

    closeDestModal();

    const cotizarSection = document.getElementById("cotizar");
    if (cotizarSection) {
        cotizarSection.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    setTimeout(() => destInput?.focus(), 400);
}

document.querySelectorAll(".dest-card").forEach(card => {
    card.addEventListener("click", () => openDestModal(card.dataset.destino));
    card.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openDestModal(card.dataset.destino);
        }
    });
});

destModalClose?.addEventListener("click", closeDestModal);
destModalCotizar?.addEventListener("click", cotizarDestino);

destModal?.addEventListener("click", (e) => {
    if (e.target === destModal) closeDestModal();
});

/* ── Mobile nav ── */

const navToggle = document.getElementById("navToggle");
const navLinks = document.getElementById("navLinks");

navToggle?.addEventListener("click", () => {
    const open = navLinks.classList.toggle("open");
    navToggle.setAttribute("aria-expanded", open);
});

navLinks?.querySelectorAll("a").forEach(link => {
    link.addEventListener("click", () => {
        navLinks.classList.remove("open");
        navToggle.setAttribute("aria-expanded", "false");
    });
});

const navbar = document.getElementById("navbar");

function updateNavbar() {
    if (!navbar) return;
    navbar.classList.toggle("scrolled", window.scrollY > 40);
}

window.addEventListener("scroll", updateNavbar);
updateNavbar();

/* ── Nav active on scroll ── */

const sections = document.querySelectorAll("section[id], header[id]");
const navAnchors = document.querySelectorAll(".nav-links a");

window.addEventListener("scroll", () => {
    let current = "";
    sections.forEach(section => {
        const top = section.offsetTop - 100;
        if (window.scrollY >= top) {
            current = section.getAttribute("id");
        }
    });

    navAnchors.forEach(a => {
        a.classList.toggle("active", a.getAttribute("href") === `#${current}`);
    });
});

/* ── Auto route distance ── */

const LUGARES_REFERENCIA = {
    "aeropuerto de tijuana": "Aeropuerto Internacional de Tijuana, Baja California",
    "aeropuerto tij": "Aeropuerto Internacional de Tijuana, Baja California",
    "tij": "Aeropuerto Internacional de Tijuana, Baja California",
    "playas de tijuana": "Playas de Tijuana, Baja California",
    "rosarito": "Rosarito, Baja California",
    "valle de guadalupe": "Valle de Guadalupe, Baja California",
    "ensenada": "Ensenada, Baja California",
    "tecate": "Tecate, Baja California",
    "mexicali": "Mexicali, Baja California",
    "garita san ysidro": "Puerto Fronterizo San Ysidro, Tijuana, Baja California",
    "san ysidro": "Puerto Fronterizo San Ysidro, Tijuana, Baja California",
    "garita otay": "Puerto Fronterizo Otay Mesa, Tijuana, Baja California",
    "otay": "Puerto Fronterizo Otay Mesa, Tijuana, Baja California",
    "tijuana": "Tijuana, Baja California"
};

const VALLE_DESTINO = "Valle de Guadalupe, Baja California";

let routeDebounceTimer = null;
let routeRequestCounter = 0;
let googleMapsLoadPromise = null;

function normalizarLugar(texto) {
    const limpio = texto.trim();
    if (!limpio) return "";
    const clave = limpio.toLowerCase();
    return LUGARES_REFERENCIA[clave] || `${limpio}, Baja California, México`;
}

function setRouteStatus(elemento, mensaje, estado) {
    if (!elemento) return;
    elemento.textContent = mensaje;
    elemento.classList.remove("is-loading", "is-ok", "is-error");
    if (estado) elemento.classList.add(estado);

    const panel = elemento.id === "routeStatus"
        ? document.getElementById("routeCalcTraslado")
        : elemento.id === "routeStatusTour"
            ? document.getElementById("routeCalcTour")
            : null;

    if (panel) {
        panel.hidden = estado !== "is-error";
    }
}

const DIRECTIONS_ERROR_MSG = {
    REQUEST_DENIED: "Google rechazó la solicitud. En tu Browser key agrega Maps JavaScript API, Distance Matrix API, Directions API y Places API.",
    OVER_QUERY_LIMIT: "Límite de consultas alcanzado. Intenta más tarde o ingresa km y minutos manualmente.",
    ZERO_RESULTS: "Google Maps no encontró ruta entre esos puntos.",
    NOT_FOUND: "No se reconoció el origen o el destino. Sé más específico (colonia, hotel, lugar).",
    INVALID_REQUEST: "Datos de ruta inválidos. Revisa origen y destino.",
    UNKNOWN_ERROR: "Error temporal de Google Maps. Intenta de nuevo."
};

function mensajeErrorRuta(error) {
    if (error.message === "NO_API_KEY") {
        return "Configura tu API key de Google Maps en config.js";
    }
    if (error.message === "GOOGLE_AUTH_FAILED") {
        return "Google Maps rechazó la key. Revisa restricciones web y que Maps JavaScript API esté habilitada.";
    }
    if (error.message === "GOOGLE_LOAD_FAILED") {
        return "No se pudo cargar Google Maps. Abre la web con Live Server (http://localhost), no como archivo.";
    }
    if (error.message === "ROUTE_TIMEOUT") {
        return "Google Maps no respondió. Se usará estimado alternativo o ingresa km y minutos manualmente.";
    }
    if (error.message === "ROUTE_BOTH_FAILED") {
        return "No se pudo calcular la ruta. Ingresa km y minutos manualmente.";
    }
    if (error.message?.startsWith("ROUTE_")) {
        const codigo = error.message.replace("ROUTE_", "");
        return DIRECTIONS_ERROR_MSG[codigo] || `Error de ruta (${codigo}). Ingresa km y minutos manualmente.`;
    }
    return "No se pudo conectar con Google Maps. Ingresa km y minutos manualmente.";
}

const GOOGLE_ROUTE_TIMEOUT_MS = 5000;

function cargarGoogleMaps() {
    const apiKey = typeof GOOGLE_MAPS_API_KEY !== "undefined" ? GOOGLE_MAPS_API_KEY : "";

    if (!apiKey) {
        return Promise.reject(new Error("NO_API_KEY"));
    }

    if (googleMapsLoadPromise) return googleMapsLoadPromise;

    window.gm_authFailure = () => {
        googleMapsLoadPromise = null;
    };

    googleMapsLoadPromise = (async () => {
        if (!window.google?.maps?.importLibrary) {
            await new Promise((resolve, reject) => {
                const params = new URLSearchParams({
                    key: apiKey,
                    v: "weekly",
                    language: "es",
                    region: "MX",
                    loading: "async"
                });
                const script = document.createElement("script");
                script.src = `https://maps.googleapis.com/maps/api/js?${params}`;
                script.async = true;
                script.onerror = () => reject(new Error("GOOGLE_LOAD_FAILED"));

                const deadline = Date.now() + 10000;
                const wait = setInterval(() => {
                    if (window.google?.maps?.importLibrary) {
                        clearInterval(wait);
                        resolve();
                    } else if (Date.now() > deadline) {
                        clearInterval(wait);
                        reject(new Error("GOOGLE_LOAD_FAILED"));
                    }
                }, 50);

                document.head.appendChild(script);
            });
        }

        await google.maps.importLibrary("maps");
    })().catch(error => {
        googleMapsLoadPromise = null;
        if (!window.google?.maps) {
            throw new Error("GOOGLE_AUTH_FAILED");
        }
        throw error;
    });

    return googleMapsLoadPromise;
}

async function cargarGooglePlaces() {
    await cargarGoogleMaps();
    await google.maps.importLibrary("places");
}

let placesServiceDummy = null;
let placesAutocompleteService = null;

function obtenerPlacesService() {
    if (!placesServiceDummy) {
        placesServiceDummy = document.createElement("div");
        placesServiceDummy.setAttribute("aria-hidden", "true");
    }
    return new google.maps.places.PlacesService(placesServiceDummy);
}

function crearAutocompleteDireccion(input, alSeleccionar) {
    if (!input) return null;

    const wrapper = input.closest(".address-autocomplete-wrap");
    if (!wrapper) return null;

    const dropdown = document.createElement("div");
    dropdown.className = "address-suggestions";
    dropdown.setAttribute("role", "listbox");
    dropdown.hidden = true;
    wrapper.appendChild(dropdown);

    const bounds = new google.maps.LatLngBounds(
        { lat: 31.0, lng: -117.8 },
        { lat: 32.85, lng: -114.4 }
    );

    let debounceTimer = null;
    let blurOcultarTimer = null;
    let ultimaSeleccion = 0;
    let predictions = [];
    let activeIndex = -1;
    let sessionToken = new google.maps.places.AutocompleteSessionToken();

    if (!placesAutocompleteService) {
        placesAutocompleteService = new google.maps.places.AutocompleteService();
    }

    function cancelarOcultarSugerencias() {
        clearTimeout(blurOcultarTimer);
    }

    function programarOcultarSugerencias() {
        cancelarOcultarSugerencias();
        blurOcultarTimer = setTimeout(ocultarSugerencias, 400);
    }

    function ocultarSugerencias() {
        cancelarOcultarSugerencias();
        dropdown.hidden = true;
        dropdown.innerHTML = "";
        activeIndex = -1;
        predictions = [];
    }

    function marcarActiva(items) {
        items.forEach((item, index) => {
            item.classList.toggle("is-active", index === activeIndex);
        });
    }

    function seleccionarPrediccion(prediction) {
        const ahora = Date.now();
        if (ahora - ultimaSeleccion < 400) return;
        ultimaSeleccion = ahora;

        cancelarOcultarSugerencias();
        const placesService = obtenerPlacesService();

        placesService.getDetails(
            {
                placeId: prediction.place_id,
                fields: ["formatted_address", "geometry", "name"],
                sessionToken
            },
            (place, status) => {
                if (status === google.maps.places.PlacesServiceStatus.OK && place) {
                    input.value = place.formatted_address || place.name || prediction.description;

                    if (place.geometry?.location) {
                        guardarCoordenadasEnInput(
                            input,
                            place.geometry.location.lat(),
                            place.geometry.location.lng()
                        );
                    } else {
                        limpiarCoordenadasInput(input);
                    }
                } else {
                    input.value = prediction.description;
                    limpiarCoordenadasInput(input);
                }

                input.dispatchEvent(new Event("change", { bubbles: true }));
                sessionToken = new google.maps.places.AutocompleteSessionToken();
                ocultarSugerencias();
                clearTimeout(routeDebounceTimer);
                input.blur();
                alSeleccionar?.();
            }
        );
    }

    function enlazarSeleccionItem(item, prediction) {
        const activarSeleccion = (evento) => {
            evento.preventDefault();
            evento.stopPropagation();
            cancelarOcultarSugerencias();
            seleccionarPrediccion(prediction);
        };

        item.addEventListener("pointerdown", (evento) => {
            cancelarOcultarSugerencias();
            if (evento.pointerType === "mouse") {
                evento.preventDefault();
            }
        });

        item.addEventListener("pointerup", activarSeleccion);
        item.addEventListener("touchend", activarSeleccion, { passive: false });
    }

    function mostrarSugerencias(resultados) {
        predictions = resultados;
        dropdown.innerHTML = "";
        activeIndex = -1;

        resultados.forEach((prediction) => {
            const item = document.createElement("button");
            item.type = "button";
            item.className = "address-suggestion-item";
            item.setAttribute("role", "option");
            item.textContent = prediction.description;
            enlazarSeleccionItem(item, prediction);
            dropdown.appendChild(item);
        });

        dropdown.hidden = false;

        requestAnimationFrame(() => {
            if (!dropdown.hidden && window.matchMedia("(max-width: 768px)").matches) {
                dropdown.scrollIntoView({ block: "nearest", behavior: "smooth" });
            }
        });
    }

    function buscarSugerencias(texto) {
        if (texto.length < 3) {
            ocultarSugerencias();
            return;
        }

        placesAutocompleteService.getPlacePredictions(
            {
                input: texto,
                bounds,
                componentRestrictions: { country: "mx" },
                sessionToken
            },
            (resultados, status) => {
                if (status !== google.maps.places.PlacesServiceStatus.OK || !resultados?.length) {
                    ocultarSugerencias();
                    return;
                }

                mostrarSugerencias(resultados);
            }
        );
    }

    input.addEventListener("focus", () => {
        cancelarOcultarSugerencias();
        if (window.matchMedia("(max-width: 768px)").matches) {
            setTimeout(() => {
                input.scrollIntoView({ block: "center", behavior: "smooth" });
            }, 320);
        }
    });

    input.addEventListener("input", () => {
        limpiarCoordenadasInput(input);
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => buscarSugerencias(input.value.trim()), 250);
    });

    input.addEventListener("keydown", (evento) => {
        if (dropdown.hidden) return;

        const items = dropdown.querySelectorAll(".address-suggestion-item");
        if (!items.length) return;

        if (evento.key === "ArrowDown") {
            evento.preventDefault();
            activeIndex = Math.min(activeIndex + 1, items.length - 1);
            marcarActiva(items);
        } else if (evento.key === "ArrowUp") {
            evento.preventDefault();
            activeIndex = Math.max(activeIndex - 1, 0);
            marcarActiva(items);
        } else if (evento.key === "Enter" && activeIndex >= 0) {
            evento.preventDefault();
            seleccionarPrediccion(predictions[activeIndex]);
        } else if (evento.key === "Escape") {
            ocultarSugerencias();
        }
    });

    input.addEventListener("blur", programarOcultarSugerencias);

    dropdown.addEventListener("pointerdown", cancelarOcultarSugerencias);
    dropdown.addEventListener("touchstart", cancelarOcultarSugerencias, { passive: true });
}

async function initPlacesAutocomplete() {
    try {
        await cargarGooglePlaces();

        crearAutocompleteDireccion(document.getElementById("origen"), () => {
            if (getTipoServicio() === "traslado") calcularRutaAutomatica("traslado");
        });

        crearAutocompleteDireccion(document.getElementById("destino"), () => {
            if (getTipoServicio() === "traslado") calcularRutaAutomatica("traslado");
        });

        crearAutocompleteDireccion(document.getElementById("origenTour"), () => {
            if (getTipoServicio() === "tour") calcularRutaAutomatica("tour");
        });
    } catch {
        // Sin Places API la captura manual sigue funcionando
    }
}

function solicitarDistancia(matrixService, origen, destino, fechaSalida = null) {
    return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => reject(new Error("ROUTE_TIMEOUT")), GOOGLE_ROUTE_TIMEOUT_MS);
        const request = {
            origins: [origen],
            destinations: [destino],
            travelMode: google.maps.TravelMode.DRIVING,
            region: "MX",
            unitSystem: google.maps.UnitSystem.METRIC
        };

        if (fechaSalida) {
            request.drivingOptions = { departureTime: fechaSalida };
        }

        matrixService.getDistanceMatrix(request, (response, status) => {
            clearTimeout(timeoutId);
            resolve({ response, status });
        });
    });
}

function solicitarDirecciones(directionsService, request) {
    return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => reject(new Error("ROUTE_TIMEOUT")), GOOGLE_ROUTE_TIMEOUT_MS);

        directionsService.route(request, (result, status) => {
            clearTimeout(timeoutId);
            resolve({ result, status });
        });
    });
}

function parsearDistancia(response) {
    const elemento = response.rows[0]?.elements[0];
    if (!elemento || elemento.status !== "OK") return null;

    const duracion = elemento.duration_in_traffic?.value ?? elemento.duration?.value ?? 0;

    return {
        km: Math.round(elemento.distance.value / 100) / 10,
        minutos: Math.max(1, Math.round(duracion / 60)),
        conTrafico: Boolean(elemento.duration_in_traffic?.value)
    };
}

function crearSolicitudDirecciones(origen, destino, fechaSalida = null) {
    const request = {
        origin: normalizarLugar(origen),
        destination: normalizarLugar(destino),
        travelMode: google.maps.TravelMode.DRIVING,
        region: "mx",
        provideRouteAlternatives: true
    };

    if (fechaSalida) {
        request.drivingOptions = { departureTime: fechaSalida };
    }

    return request;
}

function obtenerDistanciaTotalRuta(ruta) {
    return ruta.legs.reduce((total, tramo) => total + (tramo.distance?.value || 0), 0);
}

function seleccionarRutaMasCorta(directionsResult) {
    if (!directionsResult?.routes?.length) return null;

    let mejorRuta = directionsResult.routes[0];
    let menorDistancia = obtenerDistanciaTotalRuta(mejorRuta);

    for (let i = 1; i < directionsResult.routes.length; i++) {
        const distancia = obtenerDistanciaTotalRuta(directionsResult.routes[i]);
        if (distancia < menorDistancia) {
            menorDistancia = distancia;
            mejorRuta = directionsResult.routes[i];
        }
    }

    return {
        ...directionsResult,
        routes: [mejorRuta]
    };
}

function parsearRuta(result) {
    const optimizado = seleccionarRutaMasCorta(result);
    const ruta = optimizado?.routes[0];
    if (!ruta?.legs?.length) return null;

    const distanciaTotal = obtenerDistanciaTotalRuta(ruta);
    const duracionTotal = ruta.legs.reduce((total, tramo) => {
        const duracion = tramo.duration_in_traffic?.value ?? tramo.duration?.value ?? 0;
        return total + duracion;
    }, 0);
    const conTrafico = ruta.legs.some((tramo) => Boolean(tramo.duration_in_traffic?.value));

    return {
        km: Math.round(distanciaTotal / 100) / 10,
        minutos: Math.max(1, Math.round(duracionTotal / 60)),
        conTrafico
    };
}

async function geocodificarNominatim(texto) {
    const consulta = normalizarLugar(texto);
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("format", "json");
    url.searchParams.set("q", consulta);
    url.searchParams.set("limit", "1");
    url.searchParams.set("countrycodes", "mx");

    const respuesta = await fetch(url, {
        headers: {
            "Accept-Language": "es",
            "User-Agent": "TrasladosPrivadosVictor/1.0 (cotizador web)"
        }
    });

    if (!respuesta.ok) throw new Error("OSRM_GEOCODE_FAILED");

    const resultados = await respuesta.json();
    if (!resultados.length) throw new Error("OSRM_NOT_FOUND");

    return {
        lat: parseFloat(resultados[0].lat),
        lon: parseFloat(resultados[0].lon)
    };
}

async function obtenerRutaOSRM(origen, destino) {
    const [origenCoords, destinoCoords] = await Promise.all([
        geocodificarNominatim(origen),
        geocodificarNominatim(destino)
    ]);

    const coords = `${origenCoords.lon},${origenCoords.lat};${destinoCoords.lon},${destinoCoords.lat}`;
    const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=false&alternatives=3`;
    const respuesta = await fetch(url);

    if (!respuesta.ok) throw new Error("OSRM_ROUTE_FAILED");

    const data = await respuesta.json();
    if (data.code !== "Ok" || !data.routes?.length) throw new Error("OSRM_NO_ROUTE");

    const ruta = data.routes.reduce((mejor, actual) =>
        actual.distance < mejor.distance ? actual : mejor
    );
    return {
        km: Math.round(ruta.distance / 100) / 10,
        minutos: Math.max(1, Math.round(ruta.duration / 60)),
        conTrafico: false
    };
}

async function obtenerRutaGoogle(origen, destino, fechaSalida = null) {
    await cargarGoogleMaps();

    const origenNorm = normalizarLugar(origen);
    const destinoNorm = normalizarLugar(destino);

    const directionsService = new google.maps.DirectionsService();
    const dirResp = await solicitarDirecciones(
        directionsService,
        crearSolicitudDirecciones(origen, destino, fechaSalida)
    );

    if (dirResp.status === google.maps.DirectionsStatus.OK) {
        const rutaDir = parsearRuta(dirResp.result);
        if (rutaDir) return rutaDir;
    }

    if (dirResp.status === google.maps.DirectionsStatus.REQUEST_DENIED) {
        throw new Error("ROUTE_REQUEST_DENIED");
    }

    const matrixService = new google.maps.DistanceMatrixService();
    const matrixResp = await solicitarDistancia(matrixService, origenNorm, destinoNorm, fechaSalida);

    if (matrixResp.status === google.maps.DistanceMatrixStatus.OK) {
        const rutaMatrix = parsearDistancia(matrixResp.response);
        if (rutaMatrix) return rutaMatrix;
    }

    if (matrixResp.status === google.maps.DistanceMatrixStatus.REQUEST_DENIED) {
        throw new Error("ROUTE_REQUEST_DENIED");
    }

    const codigo = dirResp.status !== google.maps.DirectionsStatus.OK
        ? dirResp.status
        : matrixResp.status;
    throw new Error(`ROUTE_${codigo}`);
}

async function obtenerRuta(origen, destino, fechaSalida = null) {
    try {
        const ruta = await obtenerRutaGoogle(origen, destino, fechaSalida);
        return { ...ruta, fuente: "google" };
    } catch (errorGoogle) {
        try {
            const ruta = await obtenerRutaOSRM(origen, destino);
            return { ...ruta, fuente: "osrm" };
        } catch {
            throw errorGoogle;
        }
    }
}

function llenarCamposRuta(kmInput, minInput, ruta) {
    if (!ruta || !kmInput || !minInput) return;
    kmInput.value = ruta.km;
    minInput.value = ruta.minutos;
}

function mensajeRutaOk(ruta, prefijo = "Ruta") {
    if (ruta.fuente === "osrm") {
        return `${prefijo} calculada (referencia aproximada).`;
    }

    const trafico = ruta.conTrafico ? "con tráfico" : "ruta más corta";
    return `${prefijo} calculada (${trafico}).`;
}

async function calcularRutaAutomatica(tipo) {
    const requestId = ++routeRequestCounter;

    if (tipo === "traslado") {
        const origen = document.getElementById("origen")?.value.trim();
        const destino = document.getElementById("destino")?.value.trim();
        const kmInput = document.getElementById("km");
        const minInput = document.getElementById("minutos");
        const status = document.getElementById("routeStatus");

        if (!origen || !destino || origen.length < 3 || destino.length < 3) {
            setRouteStatus(status, "", null);
            return;
        }

        setRouteStatus(status, "Calculando ruta...", "is-loading");

        try {
            const fechaSalida = obtenerFechaSalidaProgramada();
            const ruta = await obtenerRuta(origen, destino, fechaSalida);
            if (requestId !== routeRequestCounter) return;

            if (!ruta) {
                setRouteStatus(status, "Google Maps no encontró la ruta. Ingresa km y minutos manualmente.", "is-error");
                return;
            }

            llenarCamposRuta(kmInput, minInput, ruta);
            const notaHorario = fechaSalida ? " para tu horario programado" : "";
            setRouteStatus(status, `${mensajeRutaOk(ruta)}${notaHorario}`, "is-ok");
        } catch (error) {
            if (requestId !== routeRequestCounter) return;
            setRouteStatus(status, mensajeErrorRuta(error), "is-error");
        }
        return;
    }

    if (tipo === "tour") {
        const origen = document.getElementById("origenTour")?.value.trim();
        const kmInput = document.getElementById("kmTour");
        const minInput = document.getElementById("minutosTour");
        const status = document.getElementById("routeStatusTour");

        if (!origen || origen.length < 3) {
            setRouteStatus(status, "", null);
            return;
        }

        setRouteStatus(status, "Calculando ruta al valle...", "is-loading");

        try {
            const fechaSalida = obtenerFechaSalidaProgramada();
            const ruta = await obtenerRuta(origen, VALLE_DESTINO, fechaSalida);
            if (requestId !== routeRequestCounter) return;

            if (!ruta) {
                setRouteStatus(status, "Google Maps no encontró la ruta. Ingresa km y minutos manualmente.", "is-error");
                return;
            }

            llenarCamposRuta(kmInput, minInput, ruta);
            const notaHorario = fechaSalida ? " para tu horario programado" : "";
            setRouteStatus(status, `${mensajeRutaOk(ruta, "Ruta al valle")}${notaHorario}`, "is-ok");
        } catch (error) {
            if (requestId !== routeRequestCounter) return;
            setRouteStatus(status, mensajeErrorRuta(error), "is-error");
        }
    }
}

function programarCalculoRuta(tipo) {
    clearTimeout(routeDebounceTimer);
    routeDebounceTimer = setTimeout(() => calcularRutaAutomatica(tipo), 1200);
}

function initAutoRuta() {
    const origen = document.getElementById("origen");
    const destino = document.getElementById("destino");
    const origenTour = document.getElementById("origenTour");

    ["input", "change"].forEach(evento => {
        origen?.addEventListener(evento, () => {
            if (getTipoServicio() === "traslado") programarCalculoRuta("traslado");
        });
        destino?.addEventListener(evento, () => {
            if (getTipoServicio() === "traslado") programarCalculoRuta("traslado");
        });
        origenTour?.addEventListener(evento, () => {
            if (getTipoServicio() === "tour") programarCalculoRuta("tour");
        });
    });

    const fecha = document.getElementById("fecha");
    const horario = document.getElementById("horario");
    [fecha, horario].forEach(campo => {
        campo?.addEventListener("change", () => {
            const tipo = getTipoServicio();
            if (tipo === "traslado" || tipo === "tour") programarCalculoRuta(tipo);

            const resultado = document.getElementById("resultado");
            if (resultado?.classList.contains("visible")) {
                calcular();
            }
        });
    });
}

/* ── Init ── */

const fechaInput = document.getElementById("fecha");
const hoy = new Date().toISOString().split("T")[0];
fechaInput.min = hoy;
fechaInput.value = hoy;

actualizarFormulario();

function initDestCardTaglines() {
    document.querySelectorAll(".dest-card").forEach(card => {
        const dest = DESTINOS[card.dataset.destino];
        const tagline = card.querySelector(".dest-card-tagline");
        if (dest?.tagline && tagline) {
            tagline.textContent = dest.tagline;
        }
    });
}

initDestCardTaglines();
initAutoRuta();
initPlacesAutocomplete();
