const LUGARES_REFERENCIA = {
    "aeropuerto de tijuana": "Aeropuerto Internacional de Tijuana, Baja California",
    "aeropuerto tij": "Aeropuerto Internacional de Tijuana, Baja California",
    tij: "Aeropuerto Internacional de Tijuana, Baja California",
    "playas de tijuana": "Playas de Tijuana, Baja California",
    rosarito: "Rosarito, Baja California",
    "valle de guadalupe": "Valle de Guadalupe, Baja California",
    ensenada: "Ensenada, Baja California",
    tecate: "Tecate, Baja California",
    mexicali: "Mexicali, Baja California",
    "garita san ysidro": "Puerto Fronterizo San Ysidro, Tijuana, Baja California",
    "san ysidro": "Puerto Fronterizo San Ysidro, Tijuana, Baja California",
    "garita otay": "Puerto Fronterizo Otay Mesa, Tijuana, Baja California",
    otay: "Puerto Fronterizo Otay Mesa, Tijuana, Baja California",
    tijuana: "Tijuana, Baja California"
};

const GOOGLE_ROUTE_TIMEOUT_MS = 5000;
let googleMapsLoadPromise = null;

export function normalizarLugar(texto) {
    const limpio = texto.trim();
    if (!limpio) return "";
    const clave = limpio.toLowerCase();
    return LUGARES_REFERENCIA[clave] || `${limpio}, Baja California, México`;
}

export function cargarGoogleMaps() {
    const apiKey = typeof GOOGLE_MAPS_API_KEY !== "undefined" ? GOOGLE_MAPS_API_KEY : "";
    if (!apiKey) return Promise.reject(new Error("NO_API_KEY"));
    if (googleMapsLoadPromise) return googleMapsLoadPromise;

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
        throw error;
    });

    return googleMapsLoadPromise;
}

export async function cargarGooglePlaces() {
    await cargarGoogleMaps();
    await google.maps.importLibrary("places");
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
        if (fechaSalida) request.drivingOptions = { departureTime: fechaSalida };
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
        minutos: Math.max(1, Math.round(duracion / 60))
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
    if (fechaSalida) request.drivingOptions = { departureTime: fechaSalida };
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
    return { ...directionsResult, routes: [mejorRuta] };
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
    return {
        km: Math.round(distanciaTotal / 100) / 10,
        minutos: Math.max(1, Math.round(duracionTotal / 60))
    };
}

async function geocodificarNominatim(texto) {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("format", "json");
    url.searchParams.set("q", normalizarLugar(texto));
    url.searchParams.set("limit", "1");
    url.searchParams.set("countrycodes", "mx");

    const respuesta = await fetch(url, {
        headers: {
            "Accept-Language": "es",
            "User-Agent": "TrasladosPrivadosVictor/1.0 (cotizador admin)"
        }
    });
    if (!respuesta.ok) throw new Error("OSRM_GEOCODE_FAILED");
    const resultados = await respuesta.json();
    if (!resultados.length) throw new Error("OSRM_NOT_FOUND");
    return { lat: parseFloat(resultados[0].lat), lon: parseFloat(resultados[0].lon) };
}

async function obtenerRutaOSRM(origen, destino) {
    const [origenCoords, destinoCoords] = await Promise.all([
        geocodificarNominatim(origen),
        geocodificarNominatim(destino)
    ]);
    const coords = `${origenCoords.lon},${origenCoords.lat};${destinoCoords.lon},${destinoCoords.lat}`;
    const respuesta = await fetch(`https://router.project-osrm.org/route/v1/driving/${coords}?overview=false&alternatives=3`);
    if (!respuesta.ok) throw new Error("OSRM_ROUTE_FAILED");
    const data = await respuesta.json();
    if (data.code !== "Ok" || !data.routes?.length) throw new Error("OSRM_NO_ROUTE");
    const ruta = data.routes.reduce((mejor, actual) => (actual.distance < mejor.distance ? actual : mejor));
    return {
        km: Math.round(ruta.distance / 100) / 10,
        minutos: Math.max(1, Math.round(ruta.duration / 60))
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

    const matrixService = new google.maps.DistanceMatrixService();
    const matrixResp = await solicitarDistancia(matrixService, origenNorm, destinoNorm, fechaSalida);
    if (matrixResp.status === google.maps.DistanceMatrixStatus.OK) {
        const rutaMatrix = parsearDistancia(matrixResp.response);
        if (rutaMatrix) return rutaMatrix;
    }

    throw new Error("ROUTE_BOTH_FAILED");
}

export async function obtenerRuta(origen, destino, fechaSalida = null) {
    try {
        return await obtenerRutaGoogle(origen, destino, fechaSalida);
    } catch (errorGoogle) {
        try {
            return await obtenerRutaOSRM(origen, destino);
        } catch {
            throw errorGoogle;
        }
    }
}

export function mensajeErrorRuta(error) {
    if (error.message === "NO_API_KEY") return "Configura Google Maps en config.js";
    if (error.message === "ROUTE_TIMEOUT") return "Google Maps no respondió. Intenta de nuevo.";
    if (error.message === "ROUTE_BOTH_FAILED") return "No se pudo calcular la ruta.";
    return "Error al calcular ruta. Verifica origen y destino.";
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

const mapasActivos = new WeakMap();

function limpiarMapaEnContenedor(container) {
    const actual = mapasActivos.get(container);
    if (actual?.renderer) actual.renderer.setMap(null);
    mapasActivos.delete(container);
}

export async function obtenerDireccionesParaMapa(origen, destino, fechaSalida = null) {
    await cargarGoogleMaps();

    const directionsService = new google.maps.DirectionsService();
    const dirResp = await solicitarDirecciones(
        directionsService,
        crearSolicitudDirecciones(origen, destino, fechaSalida)
    );

    if (dirResp.status === google.maps.DirectionsStatus.OK) {
        return seleccionarRutaMasCorta(dirResp.result);
    }

    return null;
}

export async function renderizarMapaRuta(container, captionEl, origen, destino, nota = "", fechaSalida = null) {
    if (!container) return;

    limpiarMapaEnContenedor(container);
    container.innerHTML = '<p class="route-map-loading">Cargando mapa...</p>';
    if (captionEl) captionEl.textContent = nota;

    try {
        const directionsResult = await obtenerDireccionesParaMapa(origen, destino, fechaSalida);
        if (!directionsResult?.routes?.[0]) {
            container.innerHTML = '<p class="route-map-error">No se pudo mostrar el mapa de la ruta.</p>';
            return;
        }

        container.innerHTML = "";

        const routeMap = new google.maps.Map(container, {
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

        const routeRenderer = new google.maps.DirectionsRenderer({
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
        mapasActivos.set(container, { map: routeMap, renderer: routeRenderer });
    } catch {
        container.innerHTML = '<p class="route-map-error">No se pudo cargar el mapa.</p>';
    }
}
