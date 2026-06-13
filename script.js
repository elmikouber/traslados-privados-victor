const telefono = "526648196809";
const TARIFA_KM = 14;
const TARIFA_HORA = 300;
const TARIFA_MINIMA = 150;

const tipoLabels = {
    traslado: "Traslado punto a punto",
    horas: "Servicio por horas",
    tour: "Tour Valle de Guadalupe"
};

function getTipoServicio() {
    return document.getElementById("tipoServicio").value;
}

function actualizarFormulario() {
    const tipo = getTipoServicio();
    const camposTraslado = document.getElementById("camposTraslado");
    const camposHoras = document.getElementById("camposHoras");
    const camposTour = document.getElementById("camposTour");

    camposTraslado.style.display = tipo === "traslado" ? "block" : "none";
    camposHoras.classList.toggle("active", tipo === "horas");
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
    const dirResp = await solicitarDirecciones(directionsService, {
        origin: normalizarLugar(origen),
        destination: normalizarLugar(destino),
        travelMode: google.maps.TravelMode.DRIVING,
        region: "mx"
    });

    if (dirResp.status === google.maps.DirectionsStatus.OK) {
        return dirResp.result;
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
        maximo: Math.round(base * 1.15)
    };
}

function formatearFecha(fecha) {
    if (!fecha) return "";
    const [anio, mes, dia] = fecha.split("-");
    return `${dia}/${mes}/${anio}`;
}

function calcular(event) {
    if (event) event.preventDefault();

    const tipo = getTipoServicio();
    const fecha = document.getElementById("fecha").value;
    const horario = document.getElementById("horario").value;

    if (!fecha || !horario) return;

    let base = TARIFA_MINIMA;
    let detalle = "";
    let datos = { tipo, fecha, horario };

    if (tipo === "traslado") {
        const origen = document.getElementById("origen").value.trim();
        const destino = document.getElementById("destino").value.trim();
        const km = parseFloat(document.getElementById("km").value);
        const minutos = parseFloat(document.getElementById("minutos").value);
        const idaVuelta = document.getElementById("idaVuelta").checked;

        if (!origen || !destino || isNaN(km) || isNaN(minutos)) return;

        const factor = idaVuelta ? 2 : 1;
        const precioKm = km * TARIFA_KM * factor;
        const precioTiempo = (minutos / 60) * TARIFA_HORA * factor;
        base = Math.max(precioKm, precioTiempo, TARIFA_MINIMA);

        datos = { ...datos, origen, destino, km, minutos, idaVuelta };
        detalle = idaVuelta
            ? `Incluye ida y vuelta (${km * 2} km, ${minutos * 2} min).`
            : "Traslado sencillo de origen a destino.";
    }

    if (tipo === "horas") {
        const origen = document.getElementById("origenHoras").value.trim();
        const zona = document.getElementById("zonaHoras").value.trim();
        const horas = parseFloat(document.getElementById("horasServicio").value);

        if (!origen || isNaN(horas) || horas < 1) return;

        base = Math.max(horas * TARIFA_HORA, TARIFA_MINIMA);
        datos = { ...datos, origen, zona, horas };
        detalle = `Servicio por ${horas} h con vehículo y conductor a disposición.`;
    }

    if (tipo === "tour") {
        const origen = document.getElementById("origenTour").value.trim();
        const km = parseFloat(document.getElementById("kmTour").value);
        const minutos = parseFloat(document.getElementById("minutosTour").value);
        const horasValle = parseFloat(document.getElementById("horasTour").value);
        const vinedos = document.getElementById("vinedos").value.trim();

        if (!origen || isNaN(km) || isNaN(minutos) || isNaN(horasValle)) return;

        const precioTraslado = Math.max(km * 2 * TARIFA_KM, (minutos * 2 / 60) * TARIFA_HORA);
        const precioValle = horasValle * TARIFA_HORA;
        base = Math.max(precioTraslado + precioValle, TARIFA_MINIMA);

        datos = { ...datos, origen, km, minutos, horasValle, vinedos };
        detalle = `Traslado ida y vuelta (${km * 2} km) + ${horasValle} h en el valle.`;
    }

    const { minimo, maximo } = calcularRango(base);
    const promedio = Math.round((minimo + maximo) / 2);
    const resultado = document.getElementById("resultado");
    const mostrarMapa = tipo === "traslado" || tipo === "tour";

    resultado.innerHTML = construirResultado(datos, promedio, minimo, maximo, detalle, mostrarMapa);
    resultado.classList.add("visible");

    const whatsappBtn = document.getElementById("whatsappBtn");
    whatsappBtn.href = `https://wa.me/${telefono}?text=${encodeURIComponent(construirMensaje(datos, minimo, maximo))}`;
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

function construirResultado(datos, promedio, minimo, maximo, detalle, incluirMapa = false) {
    const meta = [
        `<div class="result-meta-item">Servicio<strong>${tipoLabels[datos.tipo]}</strong></div>`,
        `<div class="result-meta-item">Fecha<strong>${formatearFecha(datos.fecha)}</strong></div>`
    ];

    if (datos.tipo === "traslado") {
        meta.push(
            `<div class="result-meta-item">Origen<strong>${datos.origen}</strong></div>`,
            `<div class="result-meta-item">Destino<strong>${datos.destino}</strong></div>`
        );
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
                <div class="result-price-range">Rango: $${minimo} – $${maximo} MXN</div>
            </div>
            ${mapaHtml}
            <div class="result-detail-text">${detalle}</div>
        </div>
    `;
}

function construirMensaje(datos, minimo, maximo) {
    let lineas = [
        "Hola Víctor, me interesa un traslado privado.",
        "",
        `Tipo: ${tipoLabels[datos.tipo]}`,
        `Fecha: ${formatearFecha(datos.fecha)}`,
        `Horario: ${datos.horario}`
    ];

    if (datos.tipo === "traslado") {
        lineas.push(
            `Origen: ${datos.origen}`,
            `Destino: ${datos.destino}`,
            `Distancia: ${datos.km} km`,
            `Tiempo: ${datos.minutos} min`,
            datos.idaVuelta ? "Incluye ida y vuelta" : "Solo ida"
        );
    }

    if (datos.tipo === "horas") {
        lineas.push(
            `Recogida: ${datos.origen}`,
            `Horas: ${datos.horas} h`
        );
        if (datos.zona) lineas.push(`Zona: ${datos.zona}`);
    }

    if (datos.tipo === "tour") {
        lineas.push(
            `Recogida: ${datos.origen}`,
            `Km ida y vuelta: ${datos.km * 2} km`,
            `Horas en valle: ${datos.horasValle} h`
        );
        if (datos.vinedos) lineas.push(`Viñedos: ${datos.vinedos}`);
    }

    lineas.push("", `Estimado: $${minimo} - $${maximo} MXN`);
    return lineas.join("\n");
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
    let predictions = [];
    let activeIndex = -1;
    let sessionToken = new google.maps.places.AutocompleteSessionToken();

    if (!placesAutocompleteService) {
        placesAutocompleteService = new google.maps.places.AutocompleteService();
    }

    function ocultarSugerencias() {
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
                } else {
                    input.value = prediction.description;
                }

                sessionToken = new google.maps.places.AutocompleteSessionToken();
                ocultarSugerencias();
                clearTimeout(routeDebounceTimer);
                alSeleccionar?.();
            }
        );
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

            item.addEventListener("mousedown", (evento) => {
                evento.preventDefault();
            });

            item.addEventListener("touchstart", (evento) => {
                evento.preventDefault();
            }, { passive: false });

            item.addEventListener("click", () => {
                seleccionarPrediccion(prediction);
            });

            dropdown.appendChild(item);
        });

        dropdown.hidden = false;
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

    input.addEventListener("input", () => {
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

    input.addEventListener("blur", () => {
        setTimeout(ocultarSugerencias, 180);
    });

    document.addEventListener("click", (evento) => {
        if (!wrapper.contains(evento.target)) {
            ocultarSugerencias();
        }
    });
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

        crearAutocompleteDireccion(document.getElementById("origenHoras"));
    } catch {
        // Sin Places API la captura manual sigue funcionando
    }
}

function solicitarDistancia(matrixService, origen, destino) {
    return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => reject(new Error("ROUTE_TIMEOUT")), GOOGLE_ROUTE_TIMEOUT_MS);

        matrixService.getDistanceMatrix(
            {
                origins: [origen],
                destinations: [destino],
                travelMode: google.maps.TravelMode.DRIVING,
                region: "MX",
                unitSystem: google.maps.UnitSystem.METRIC
            },
            (response, status) => {
                clearTimeout(timeoutId);
                resolve({ response, status });
            }
        );
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

    return {
        km: Math.round(elemento.distance.value / 100) / 10,
        minutos: Math.max(1, Math.round(elemento.duration.value / 60)),
        conTrafico: false
    };
}

function parsearRuta(result) {
    const tramo = result.routes[0]?.legs[0];
    if (!tramo) return null;

    return {
        km: Math.round(tramo.distance.value / 100) / 10,
        minutos: Math.max(1, Math.round(tramo.duration.value / 60)),
        conTrafico: false
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
    const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=false`;
    const respuesta = await fetch(url);

    if (!respuesta.ok) throw new Error("OSRM_ROUTE_FAILED");

    const data = await respuesta.json();
    if (data.code !== "Ok" || !data.routes?.[0]) throw new Error("OSRM_NO_ROUTE");

    const ruta = data.routes[0];
    return {
        km: Math.round(ruta.distance / 100) / 10,
        minutos: Math.max(1, Math.round(ruta.duration / 60)),
        conTrafico: false
    };
}

async function obtenerRutaGoogle(origen, destino) {
    await cargarGoogleMaps();

    const origenNorm = normalizarLugar(origen);
    const destinoNorm = normalizarLugar(destino);
    const request = {
        origin: origenNorm,
        destination: destinoNorm,
        travelMode: google.maps.TravelMode.DRIVING,
        region: "mx"
    };

    const directionsService = new google.maps.DirectionsService();
    const dirResp = await solicitarDirecciones(directionsService, request);

    if (dirResp.status === google.maps.DirectionsStatus.OK) {
        const rutaDir = parsearRuta(dirResp.result);
        if (rutaDir) return rutaDir;
    }

    if (dirResp.status === google.maps.DirectionsStatus.REQUEST_DENIED) {
        throw new Error("ROUTE_REQUEST_DENIED");
    }

    const matrixService = new google.maps.DistanceMatrixService();
    const matrixResp = await solicitarDistancia(matrixService, origenNorm, destinoNorm);

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

async function obtenerRuta(origen, destino) {
    try {
        const ruta = await obtenerRutaGoogle(origen, destino);
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

function mensajeRutaOk(ruta, prefijo = "Ruta estimada") {
    if (ruta.fuente === "osrm") {
        return `${prefijo} (aprox., OpenStreetMap): ${ruta.km} km · ${ruta.minutos} min`;
    }
    const trafico = ruta.conTrafico ? "con tráfico" : "sin tráfico en vivo";
    return `${prefijo} (Google Maps, ${trafico}): ${ruta.km} km · ${ruta.minutos} min`;
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
            const ruta = await obtenerRuta(origen, destino);
            if (requestId !== routeRequestCounter) return;

            if (!ruta) {
                setRouteStatus(status, "Google Maps no encontró la ruta. Ingresa km y minutos manualmente.", "is-error");
                return;
            }

            llenarCamposRuta(kmInput, minInput, ruta);
            setRouteStatus(status, `${mensajeRutaOk(ruta)} — puedes ajustar si lo necesitas`, "is-ok");
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
            const ruta = await obtenerRuta(origen, VALLE_DESTINO);
            if (requestId !== routeRequestCounter) return;

            if (!ruta) {
                setRouteStatus(status, "Google Maps no encontró la ruta. Ingresa km y minutos manualmente.", "is-error");
                return;
            }

            llenarCamposRuta(kmInput, minInput, ruta);
            setRouteStatus(status, `${mensajeRutaOk(ruta, "Ida al valle")}`, "is-ok");
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
