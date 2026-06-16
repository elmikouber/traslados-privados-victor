import { cargarGooglePlaces } from "./cotizador-rutas.js";

let placesServiceDummy = null;
let placesAutocompleteService = null;

function obtenerPlacesService() {
    if (!placesServiceDummy) {
        placesServiceDummy = document.createElement("div");
        placesServiceDummy.setAttribute("aria-hidden", "true");
    }
    return new google.maps.places.PlacesService(placesServiceDummy);
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

export function crearAutocompleteDireccion(input, alSeleccionar) {
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

    return dropdown;
}

export async function initPlacesAutocomplete(campos = []) {
    try {
        await cargarGooglePlaces();

        for (const { input, onSelect } of campos) {
            const elemento = typeof input === "string" ? document.getElementById(input) : input;
            crearAutocompleteDireccion(elemento, onSelect);
        }
    } catch (err) {
        console.warn("Places autocomplete:", err);
    }
}
