export const TARIFAS = {
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

export const KM_FORANEO_UMBRAL = 60;
export const FORANEO_RETORNO_PORCENTAJE = 0.6;
export const HORARIO_MADRUGADA_HASTA_HORA = 5;
export const HORARIO_PICO_HASTA_HORA = 8;
export const KM_TRAMO_1_MAX = 20;
export const KM_TRAMO_2_MAX = 30;
export const KM_ESCALON_DESCUENTO = 3;

export const RESERVA_CORTE_HORA = 22;
export const RESERVA_MADRUGADA_HORAS_MIN = 10;
export const RESERVA_DIURNO_HORAS_PREFERIDAS = 2;
export const RESERVA_MAX_PASAJEROS = 4;
export const RESERVA_CUENTA_BBVA = {
    banco: "BBVA",
    cuenta: "012028011137631534",
    titular: "Victor Palacios"
};

export const VALLE_DESTINO = "Valle de Guadalupe, Baja California";

export const tipoLabels = {
    traslado: "Traslado punto a punto",
    tour: "Tour Valle de Guadalupe"
};

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

const NOTA_POLITICA_COTIZACION =
    "El monto cotizado es el precio fijo del servicio, salvo incrementos por tráfico, desvíos, accidentes o imprevistos en ruta.";

export function calcularRango(base) {
    return {
        minimo: Math.round(base * 0.90),
        maximo: Math.round(base * 1.15),
        confirmado: Math.round(base * 1.15)
    };
}

export function parsearHorario(horario) {
    if (!horario) return null;
    const [horas, minutos] = horario.split(":").map(Number);
    if (isNaN(horas) || isNaN(minutos)) return null;
    return { horas, minutos };
}

export function resolverTarifaLocal(horario) {
    const parsed = parsearHorario(horario);
    const horas = parsed?.horas;
    const tarifa = TARIFAS.estandar;

    if (horas !== undefined && horas < HORARIO_MADRUGADA_HASTA_HORA) {
        return { franja: "madrugada", km: tarifa.kmMadrugada, minima: tarifa.minima, etiqueta: "Madrugada" };
    }
    if (horas !== undefined && horas < HORARIO_PICO_HASTA_HORA) {
        return { franja: "pico", km: tarifa.kmPico, minima: tarifa.minima, etiqueta: "Pico matutino" };
    }
    return { franja: "dia", km: tarifa.kmDia, minima: tarifa.minimaDia, etiqueta: "Horario diurno" };
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

export function formatearHorario12h(horario) {
    if (!horario) return "";
    const [horas, minutos] = horario.split(":").map(Number);
    if (isNaN(horas) || isNaN(minutos)) return horario;
    const periodo = horas >= 12 ? "p.m." : "a.m.";
    const hora12 = horas % 12 || 12;
    return `${hora12}:${String(minutos).padStart(2, "0")} ${periodo}`;
}

export function formatearFecha(fecha) {
    if (!fecha) return "";
    const [anio, mes, dia] = fecha.split("-");
    return `${dia}/${mes}/${anio}`;
}

function textoUbicacion(texto) {
    return (texto || "").trim().toLowerCase();
}

function esUbicacionForanea(texto) {
    return PATRONES_UBICACION_FORANEA.some(patron => patron.test(textoUbicacion(texto)));
}

function esUbicacionLocal(texto) {
    const ubicacion = textoUbicacion(texto);
    if (!ubicacion || esUbicacionForanea(texto)) return false;
    return PATRONES_UBICACION_LOCAL.some(patron => patron.test(ubicacion));
}

export function determinarNivelServicio(origen, destino, tipoServicio, km = null) {
    if (tipoServicio === "tour") return "ejecutivo";
    if (esUbicacionLocal(origen) && esUbicacionLocal(destino)) return "estandar";
    if (km !== null && km <= KM_FORANEO_UMBRAL && !esUbicacionForanea(origen) && !esUbicacionForanea(destino)) {
        return "estandar";
    }
    return "ejecutivo";
}

export function calcularPrecioTraslado(km, minutos, idaVuelta, horasExtra, nivel, origen = "", destino = "", horario = "") {
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
    if (tarifaLocal) {
        precioKm = calcularCostoKmEscalonado(kmCobrados, tarifaKm).costo;
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
        tarifaMinima,
        horasExtra: horasExtraCobradas,
        tarifa
    };
}

export function calcularPrecioTour(km, minutos, horasValle) {
    const tarifa = TARIFAS.ejecutivo;
    const precioTraslado = Math.max(km * 2 * tarifa.km, (minutos * 2 / 60) * tarifa.hora);
    const precioValle = horasValle * tarifa.hora;
    return {
        base: Math.max(precioTraslado + precioValle, tarifa.minima),
        nivel: "ejecutivo",
        tarifa
    };
}

export function detallePrecioTraslado(idaVuelta, calculo) {
    const tipo = TARIFAS[calculo.nivel].etiqueta;
    let texto = "Traslado privado programado, puerta a puerta.";

    if (idaVuelta) texto = `${tipo}: traslado ida y vuelta.`;
    else if (calculo.esForaneo) texto = `${tipo}: trayecto foráneo solo ida, incluye retorno del vehículo.`;
    else if (tipo !== TARIFAS.estandar.etiqueta) texto = `${tipo}: traslado de origen a destino.`;

    if (calculo.horasExtra > 0) texto += ` Incluye ${calculo.horasExtra} h adicionales.`;
    if (calculo.franjaHorario === "madrugada") texto += " Servicio programado con chofer descansado.";
    else if (calculo.franjaHorario === "pico") texto += " Horario matutino de alta demanda.";

    return texto;
}

export function parsearFechaHoraViaje(fecha, horario) {
    const [anio, mes, dia] = fecha.split("-").map(Number);
    const parsed = parsearHorario(horario);
    if (!parsed) return null;
    return new Date(anio, mes - 1, dia, parsed.horas, parsed.minutos, 0, 0);
}

export function esHorarioMadrugada(horario) {
    return resolverTarifaLocal(horario).franja === "madrugada";
}

export function esHorarioDiurno(horario) {
    const parsed = parsearHorario(horario);
    return parsed !== null && parsed.horas >= HORARIO_PICO_HASTA_HORA;
}

export function horasHastaViaje(fecha, horario) {
    const viaje = parsearFechaHoraViaje(fecha, horario);
    if (!viaje) return 0;
    return (viaje.getTime() - Date.now()) / (1000 * 60 * 60);
}

export function esServicioInmediatoDiurno(fecha, horario) {
    return esHorarioDiurno(horario) && horasHastaViaje(fecha, horario) < RESERVA_DIURNO_HORAS_PREFERIDAS;
}

function reservaRequierePlazoDiaAnterior(horario) {
    return !esHorarioDiurno(horario);
}

function obtenerLimiteReservaDiaAnterior(fechaViaje) {
    const limite = new Date(fechaViaje);
    limite.setDate(limite.getDate() - 1);
    limite.setHours(RESERVA_CORTE_HORA, 0, 0, 0);
    return limite;
}

export function obtenerBloqueoPlazoReserva(fecha, horario) {
    if (horasHastaViaje(fecha, horario) <= 0) {
        return "La fecha y hora de recogida ya pasaron.";
    }
    if (esHorarioDiurno(horario)) return null;

    const viaje = parsearFechaHoraViaje(fecha, horario);
    if (!viaje || new Date() > obtenerLimiteReservaDiaAnterior(viaje)) {
        return "El plazo para reservar este viaje ya venció (10:00 p.m. del día anterior).";
    }

    if (esHorarioMadrugada(horario) && horasHastaViaje(fecha, horario) < RESERVA_MADRUGADA_HORAS_MIN) {
        return `Madrugada: se requieren al menos ${RESERVA_MADRUGADA_HORAS_MIN} horas de anticipación.`;
    }

    return null;
}

export function obtenerPoliticasReserva(datos, promedio) {
    const politicas = [
        "Máximo 4 pasajeros por viaje.",
        "Al confirmar: nombre completo, teléfono y contacto de emergencia.",
        "Pago al llegar: efectivo o transferencia.",
        NOTA_POLITICA_COTIZACION,
        "Reserva sujeta a tu confirmación por WhatsApp."
    ];

    if (reservaRequierePlazoDiaAnterior(datos.horario)) {
        politicas.push("Recogida antes de las 8:00 a.m.: reservar antes de las 10:00 p.m. del día anterior.");
    }
    if (esHorarioMadrugada(datos.horario)) {
        politicas.push(`Madrugada: mínimo ${RESERVA_MADRUGADA_HORAS_MIN} h de anticipación (clientes nuevos).`);
        politicas.push(`Posible anticipo 50% (referencia: $${Math.round(promedio * 0.5)} MXN) — tú validas si aplica.`);
    }
    if (esHorarioDiurno(datos.horario)) {
        politicas.push(`Diurno: preferimos ${RESERVA_DIURNO_HORAS_PREFERIDAS} h de anticipación.`);
        if (esServicioInmediatoDiurno(datos.fecha, datos.horario)) {
            politicas.push("Servicio muy pronto: sujeto a disponibilidad, posible cargo extra.");
        }
    }

    return politicas;
}

function obtenerNotasDestino(datos) {
    const texto = `${datos.origen || ""} ${datos.destino || ""}`.toLowerCase();
    const notas = [];

    if (/garita|san ysidro|ysidro|otay/.test(texto)) {
        notas.push("Garita/frontera: solo traslado hasta la garita (lado MX). No cruzas a EE.UU.");
        notas.push("Documentación y tiempos de espera: responsabilidad del pasajero.");
    }
    if (/aeropuerto|\btij\b/.test(texto)) {
        notas.push("Aeropuerto: pide número de vuelo y terminal si ya los tiene.");
    }
    if (datos.esForaneo) {
        notas.push("Trayecto foráneo: precio incluye retorno del vehículo.");
    }
    if (datos.tipo === "tour") {
        notas.push("Tour valle: incluye traslado ida y vuelta + horas en el valle indicadas.");
    }

    return notas;
}

export function obtenerRequisitosViaje(datos, promedio = 0) {
    return [...obtenerPoliticasReserva(datos, promedio), ...obtenerNotasDestino(datos)];
}

export function construirMensajeCotizacionCliente(datos, promedio, confirmado, nombreCliente = "", urlConfirmacion = "", expiraTexto = "") {
    const nivel = TARIFAS[datos.nivelServicio || "ejecutivo"];
    const saludo = nombreCliente.trim() ? `Hola ${nombreCliente.trim()},` : "Hola,";

    const lineas = [
        saludo,
        "",
        "Te comparto la cotización de tu traslado con *Traslados Privados Víctor*:",
        "",
        "━━━━━━━━━━━━━━━━━━",
        "📋 SERVICIO",
        `• ${tipoLabels[datos.tipo] || datos.tipo}`,
        `• Tarifa: ${nivel.etiqueta}`,
        `• Fecha: ${formatearFecha(datos.fecha)}`,
        `• Horario: ${formatearHorario12h(datos.horario)}`
    ];

    if (datos.tipo === "traslado") {
        lineas.push(
            "",
            "📍 RUTA",
            `• Origen: ${datos.origen}`,
            `• Destino: ${datos.destino}`,
            `• Modalidad: ${datos.idaVuelta ? "Ida y vuelta" : "Solo ida"}`
        );
        if (datos.horasExtra > 0) lineas.push(`• Horas extra: ${datos.horasExtra} h`);
    } else {
        lineas.push(
            "",
            "📍 RUTA",
            `• Recogida: ${datos.origen}`,
            `• Destino: Valle de Guadalupe`,
            `• Horas en valle: ${datos.horasValle} h`
        );
        if (datos.vinedos) lineas.push(`• Viñedos: ${datos.vinedos}`);
    }

    lineas.push(
        "",
        "💰 COTIZACIÓN ESTIMADA",
        `• Referencia: $${promedio} MXN`,
        `• Puede incrementar hasta $${confirmado} MXN por tráfico, desvíos o imprevistos en ruta`,
        "",
        "📌 REQUISITOS PARA ESTE VIAJE"
    );

    obtenerRequisitosViaje(datos, promedio).forEach(req => lineas.push(`• ${req}`));

    if (urlConfirmacion) {
        const avisoTiempo = expiraTexto
            ? `⏳ Tienes *${HORAS_VALIDEZ_ENLACE_COTIZACION} horas* para confirmar (válido hasta *${expiraTexto}*). Si no confirmas, la cotización se cancela sola.`
            : `⏳ Tienes *${HORAS_VALIDEZ_ENLACE_COTIZACION} horas* para confirmar. Si no confirmas, la cotización se cancela sola.`;

        lineas.push(
            "",
            "✅ CONFIRMAR RESERVA",
            "Toca el enlace para aceptar o rechazar tu cotización:",
            urlConfirmacion,
            "",
            avisoTiempo
        );
    } else {
        lineas.push(
            "",
            "━━━━━━━━━━━━━━━━━━",
            "Si te parece bien, confírmame por aquí y te indico los datos para reservar."
        );
    }

    lineas.push(
        "",
        "— Víctor",
        "Traslados Privados Víctor"
    );

    return lineas.join("\n");
}

export const HORAS_VALIDEZ_ENLACE_COTIZACION = 3;

export function normalizarTelefonoWa(tel) {
    const digitos = String(tel || "").replace(/\D/g, "");
    if (digitos.length === 10) return `52${digitos}`;
    if (digitos.length === 12 && digitos.startsWith("52")) return digitos;
    return digitos.length >= 10 ? digitos : "";
}

export function crearFechaSalidaProgramada(fecha, horario) {
    if (!fecha || !horario) return null;
    const salida = parsearFechaHoraViaje(fecha, horario);
    if (!salida || salida.getTime() <= Date.now()) return null;
    return salida;
}
