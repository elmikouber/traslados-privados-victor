import { initializeApp } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-app.js";
import {
    getFirestore,
    collection,
    doc,
    getDoc,
    setDoc,
    query,
    where,
    orderBy,
    onSnapshot,
    writeBatch,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

function estrellasHtml(cantidad) {
    const n = Math.max(1, Math.min(5, Number(cantidad) || 5));
    return `<div class="stars" aria-label="${n} estrellas">${"★".repeat(n)}${"☆".repeat(5 - n)}</div>`;
}

function inicialesNombre(nombre) {
    const partes = String(nombre || "Cliente").trim().split(/\s+/).filter(Boolean);
    if (partes.length >= 2) {
        return `${partes[0][0]}${partes[1][0]}.`.toUpperCase();
    }
    return `${(partes[0] || "C")[0]}.`;
}

function renderTarjetaResena(resena) {
    const autor = resena.mostrarIniciales
        ? `— ${inicialesNombre(resena.nombre)}`
        : `— ${resena.nombre || "Cliente"}`;

    return `
        <article class="testimonial-card testimonial-card--dynamic">
            ${estrellasHtml(resena.estrellas)}
            <p>"${escapeHtml(resena.comentario)}"</p>
            <span class="testimonial-author">${escapeHtml(autor)}</span>
        </article>
    `;
}

function escapeHtml(texto) {
    return String(texto ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

let carouselIndex = 0;
let carouselListenersBound = false;
let carouselResizeTimer = null;

function obtenerVisibleResenas() {
    return window.innerWidth <= 768 ? 1 : 3;
}

function actualizarCarouselResenas() {
    const track = document.getElementById("resenasTrack");
    const viewport = track?.parentElement;
    const prevBtn = document.getElementById("resenasPrev");
    const nextBtn = document.getElementById("resenasNext");
    if (!track || !viewport || !prevBtn || !nextBtn) return;

    const cards = track.querySelectorAll(".testimonial-card");
    const total = cards.length;
    const visible = obtenerVisibleResenas();
    const maxIndex = Math.max(0, total - visible);
    const gap = 14;

    carouselIndex = Math.min(carouselIndex, maxIndex);

    const cardWidth = Math.max(0, (viewport.clientWidth - gap * (visible - 1)) / visible);
    viewport.style.setProperty("--carousel-card-basis", `${cardWidth}px`);

    const shift = carouselIndex * (cardWidth + gap);
    track.style.transform = `translateX(-${shift}px)`;

    const ocultarNav = total <= visible;
    prevBtn.disabled = ocultarNav || carouselIndex <= 0;
    nextBtn.disabled = ocultarNav || carouselIndex >= maxIndex;
    prevBtn.hidden = ocultarNav;
    nextBtn.hidden = ocultarNav;
}

function initCarouselResenas() {
    const track = document.getElementById("resenasTrack");
    if (!track) return;

    track.querySelectorAll("[data-rail-clone]").forEach(n => n.remove());
    track.classList.remove("is-animating");
    track.style.removeProperty("--rail-duration");

    requestAnimationFrame(() => {
        requestAnimationFrame(actualizarCarouselResenas);
    });

    if (carouselListenersBound) return;
    carouselListenersBound = true;

    document.getElementById("resenasPrev")?.addEventListener("click", () => {
        if (carouselIndex > 0) {
            carouselIndex -= 1;
            actualizarCarouselResenas();
        }
    });

    document.getElementById("resenasNext")?.addEventListener("click", () => {
        const track = document.getElementById("resenasTrack");
        const total = track?.querySelectorAll(".testimonial-card").length || 0;
        const maxIndex = Math.max(0, total - obtenerVisibleResenas());
        if (carouselIndex < maxIndex) {
            carouselIndex += 1;
            actualizarCarouselResenas();
        }
    });

    window.addEventListener("resize", () => {
        clearTimeout(carouselResizeTimer);
        carouselResizeTimer = setTimeout(() => {
            const track = document.getElementById("resenasTrack");
            const total = track?.querySelectorAll(".testimonial-card").length || 0;
            const maxIndex = Math.max(0, total - obtenerVisibleResenas());
            carouselIndex = Math.min(carouselIndex, maxIndex);
            actualizarCarouselResenas();
        }, 150);
    });
}

function actualizarResenasEnCarousel(tarjetasHtml) {
    const contenedor = document.getElementById("resenasDinamicas");
    if (!contenedor) return;

    contenedor.innerHTML = tarjetasHtml;
    initCarouselResenas();
}

function cargarResenasPublicas() {
    const contenedor = document.getElementById("resenasDinamicas");
    if (!contenedor) return;

    const q = query(
        collection(db, "resenas"),
        where("estado", "==", "aprobada"),
        orderBy("createdAt", "desc")
    );

    onSnapshot(
        q,
        snapshot => {
            const tarjetas = snapshot.docs.map(d => renderTarjetaResena(d.data()));
            actualizarResenasEnCarousel(tarjetas.join(""));
        },
        err => {
            console.warn("Reseñas públicas:", err.code);
            if (err.code === "failed-precondition") {
                cargarResenasSinOrden();
            } else {
                initCarouselResenas();
            }
        }
    );
}

function cargarResenasSinOrden() {
    const contenedor = document.getElementById("resenasDinamicas");
    if (!contenedor) return;

    const q = query(collection(db, "resenas"), where("estado", "==", "aprobada"));

    onSnapshot(q, snapshot => {
        const lista = snapshot.docs
            .map(d => d.data())
            .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        const tarjetas = lista.map(renderTarjetaResena);
        actualizarResenasEnCarousel(tarjetas.join(""));
    });
}

function normalizarTelefono(tel) {
    const digitos = String(tel || "").replace(/\D/g, "");
    if (digitos.length === 10) return `52${digitos}`;
    return digitos;
}

function bloquearFormularioResena(form, lockedEl, mensaje) {
    if (lockedEl) {
        lockedEl.textContent = mensaje;
        lockedEl.hidden = false;
    }
    form?.classList.add("is-locked");
}

function desbloquearFormularioResena(form, lockedEl) {
    if (lockedEl) lockedEl.hidden = true;
    form?.classList.remove("is-locked");
}

async function initFormularioResena() {
    const form = document.getElementById("reviewForm");
    if (!form) return;

    const params = new URLSearchParams(window.location.search);
    const token = params.get("t");
    const tokenInput = document.getElementById("reviewToken");
    const refInput = document.getElementById("reviewRef");
    const refNote = document.getElementById("reviewRefNote");
    const lockedEl = document.getElementById("reviewFormLocked");
    const telefonoInput = document.getElementById("reviewTelefono");

    let invitacionActiva = null;

    if (!token) {
        bloquearFormularioResena(
            form,
            lockedEl,
            "Las reseñas están disponibles solo para clientes que completaron un viaje. Al terminar tu traslado recibirás un enlace personal por WhatsApp."
        );
        return;
    }

    try {
        const invSnap = await getDoc(doc(db, "invitaciones_resena", token));

        if (!invSnap.exists()) {
            bloquearFormularioResena(
                form,
                lockedEl,
                "Este enlace de reseña no es válido. Si ya viajaste con nosotros, revisa el mensaje de WhatsApp o contáctanos."
            );
            return;
        }

        invitacionActiva = { id: invSnap.id, ...invSnap.data() };

        if (invitacionActiva.usado) {
            bloquearFormularioResena(
                form,
                lockedEl,
                "Ya enviaste una reseña para este viaje. ¡Gracias por tu confianza!"
            );
            return;
        }

        const resenaSnap = await getDoc(doc(db, "resenas", invitacionActiva.refSolicitud));
        if (resenaSnap.exists()) {
            bloquearFormularioResena(
                form,
                lockedEl,
                "Ya existe una reseña registrada para este viaje."
            );
            return;
        }

        if (tokenInput) tokenInput.value = token;
        if (refInput) refInput.value = invitacionActiva.refSolicitud || "";

        if (refNote && invitacionActiva.refSolicitud) {
            refNote.textContent = `Reseña vinculada a tu viaje (${invitacionActiva.refSolicitud}). ¡Gracias por confiar en nosotros!`;
            refNote.hidden = false;
        }

        desbloquearFormularioResena(form, lockedEl);
    } catch (err) {
        console.error("Cargar invitación:", err);
        bloquearFormularioResena(
            form,
            lockedEl,
            "No se pudo verificar tu invitación. Intenta de nuevo en un momento."
        );
        return;
    }

    if (window.location.hash === "#dejar-resena" || token) {
        document.getElementById("dejarResena")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    let estrellasSeleccionadas = 5;
    const estrellasInput = document.getElementById("reviewStars");
    const starBtns = form.querySelectorAll(".review-star-btn");

    function pintarEstrellas(valor) {
        starBtns.forEach(btn => {
            const star = Number(btn.dataset.star);
            btn.classList.toggle("is-active", star <= valor);
            btn.setAttribute("aria-pressed", star <= valor ? "true" : "false");
        });
        if (estrellasInput) estrellasInput.value = String(valor);
    }

    starBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            estrellasSeleccionadas = Number(btn.dataset.star);
            pintarEstrellas(estrellasSeleccionadas);
        });
    });

    pintarEstrellas(estrellasSeleccionadas);

    form.addEventListener("submit", async event => {
        event.preventDefault();

        if (!invitacionActiva) return;

        const nombre = document.getElementById("reviewNombre")?.value.trim();
        const comentario = document.getElementById("reviewComentario")?.value.trim();
        const telefono = normalizarTelefono(telefonoInput?.value);
        const estrellas = Math.min(5, Math.max(1, Math.round(Number(estrellasInput?.value) || 5)));
        const refSolicitud = invitacionActiva.refSolicitud || "";
        const tokenEnvio = tokenInput?.value.trim() || token;
        const errorEl = document.getElementById("reviewError");
        const okEl = document.getElementById("reviewSuccess");
        const submitBtn = document.getElementById("reviewSubmit");

        if (errorEl) errorEl.hidden = true;
        if (okEl) okEl.hidden = true;

        if (!nombre || nombre.length < 2) {
            if (errorEl) {
                errorEl.textContent = "Escribe tu nombre.";
                errorEl.hidden = false;
            }
            return;
        }

        if (!telefono || telefono.length < 10) {
            if (errorEl) {
                errorEl.textContent = "Escribe el teléfono con el que reservaste.";
                errorEl.hidden = false;
            }
            return;
        }

        if (telefono !== invitacionActiva.telefono) {
            if (errorEl) {
                errorEl.textContent = "El teléfono no coincide con el de tu reserva. Usa el mismo WhatsApp con el que solicitaste el traslado.";
                errorEl.hidden = false;
            }
            return;
        }

        if (!comentario || comentario.length < 10) {
            if (errorEl) {
                errorEl.textContent = "Cuéntanos un poco más sobre tu experiencia (mín. 10 caracteres).";
                errorEl.hidden = false;
            }
            return;
        }

        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = "Enviando…";
        }

        try {
            const batch = writeBatch(db);

            batch.set(doc(db, "resenas", refSolicitud), {
                nombre,
                comentario,
                estrellas,
                telefono,
                token: tokenEnvio,
                refSolicitud,
                estado: "pendiente",
                mostrarIniciales: true,
                createdAt: serverTimestamp()
            });

            batch.update(doc(db, "invitaciones_resena", tokenEnvio), {
                usado: true,
                usadoAt: serverTimestamp()
            });

            await batch.commit();

            form.reset();
            pintarEstrellas(5);
            invitacionActiva = null;
            bloquearFormularioResena(
                form,
                lockedEl,
                "¡Gracias! Tu reseña fue recibida y se publicará pronto en la web."
            );
            if (okEl) okEl.hidden = true;
        } catch (err) {
            console.error("Enviar reseña:", err.code, err.message);
            if (errorEl) {
                const mensajes = {
                    "permission-denied": "No se pudo validar tu reseña. Verifica el enlace de WhatsApp y que el teléfono sea el de tu reserva.",
                    "already-exists": "Ya existe una reseña para este viaje.",
                    "unavailable": "Servicio temporalmente no disponible. Intenta en unos segundos."
                };
                errorEl.textContent = mensajes[err.code]
                    || "No se pudo enviar la reseña. Intenta de nuevo en un momento.";
                errorEl.hidden = false;
            }
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = "Enviar reseña";
            }
        }
    });
}

cargarResenasPublicas();
initFormularioResena().catch(err => console.error("Formulario reseñas:", err));
initCarouselResenas();
