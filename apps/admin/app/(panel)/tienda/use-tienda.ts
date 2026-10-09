"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { leerNegocio } from "../../lib/configuracion";
import { mensajeError } from "../../lib/errores";
import { leerModulos } from "../../lib/modulos";
import { ponerLogoTienda, quitarLogoTienda } from "../../lib/foto-producto";
import {
  contarPendientesDeCatalogo, encenderTienda, guardarConfigTienda, leerConfigTienda, guardarSucursalTienda, leerSucursalesTienda, leerTiendaEncendida, urlDelLogo,
  type DatosConfigTienda,
} from "../../lib/tienda";
import { normalizarDireccion, trasEscribir, type Escritura, type Leido } from "../../lib/tienda-pagina";
import { revisar, sugerirDireccion, type BorradorSucursal, type Revision } from "../../lib/tienda-reglas";
import type { DatosTienda } from "../../components/tienda-datos";
import type { MensajeTienda } from "../../components/tienda-mensaje";
import type { PedidosTienda } from "../../components/tienda-pedidos";

/** Cada sucursal es su propio bloque: su mensaje y su «Guardando…» salen en su tarjeta. */
export type Bloque = "estado" | "datos" | "logo" | "pedidos" | `sucursal:${string}`;
const deSucursal = (id: string): Bloque => `sucursal:${id}`;
type Formulario = DatosTienda & PedidosTienda;

const LECTURA = "No se pudo leer tu tienda.";
const GUARDADO = "Cambios guardados.";

/** Los mismos valores de fábrica que la tabla `tienda_config` (0161). */
const DE_FABRICA: DatosConfigTienda = {
  direccion: "", color: "#111111", descripcion: "", aceptacion: "MANUAL", minutosAceptacion: 5, pagoEfectivo: true, pagoTarjeta: false,
};

// Los módulos se leen frescos: el shell los lee una vez por sesión y un complemento puede vencer
// mientras el interruptor sigue en `true`. `leerModulos` lanza el mensaje crudo de la base: aquí se
// cambia por uno que el dueño entienda.
async function leerTodo(): Promise<Leido> {
  const [config, sucursales, interruptor, pendientes, modulos] = await Promise.all([
    leerConfigTienda(), leerSucursalesTienda(), leerTiendaEncendida(), contarPendientesDeCatalogo(),
    leerModulos().catch(() => { throw new Error(LECTURA); }),
  ]);
  return { config, sucursales, interruptor, pendientes, enPlan: modulos.permitidos.tienda === true };
}

function formularioDe(c: DatosConfigTienda): Formulario {
  return {
    direccion: c.direccion, color: c.color, descripcion: c.descripcion,
    aceptacion: c.aceptacion, minutos: String(c.minutosAceptacion), pagoEfectivo: c.pagoEfectivo, pagoTarjeta: c.pagoTarjeta,
  };
}

/**
 * Todo el estado de la página de la tienda: lo leído, lo escrito en los formularios y la única
 * escritura en curso. Los bloques solo pintan; aquí se lee, se guarda y se traducen los errores.
 */
export function useTienda() {
  /** null = leyendo. */
  const [leido, setLeido] = useState<Leido | null>(null);
  const [form, setForm] = useState<Formulario>(formularioDe(DE_FABRICA));
  /** No se pudo leer: no se pinta el formulario (guardarlo de fábrica pisaría la tienda real). */
  const [falloLectura, setFalloLectura] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);
  /** El bloque que se está guardando. Una escritura a la vez en toda la página. */
  const [ocupado, setOcupado] = useState<Bloque | null>(null);
  const [mensaje, setMensaje] = useState<{ bloque: Bloque; tipo: MensajeTienda["tipo"]; texto: string } | null>(null);
  /**
   * Un guardado entró pero no se pudo volver a leer. Lo guardado ya está en pantalla (`trasEscribir`),
   * pero la lista de revisión y lo demás pueden estar viejos: no se guarda nada más hasta leer bien.
   */
  const [sinLeer, setSinLeer] = useState(false);
  const [dialogo, setDialogo] = useState<"apagar" | "direccion" | null>(null);
  const [errorDialogo, setErrorDialogo] = useState<string | null>(null);
  const enCurso = useRef(false);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const l = await leerTodo();
        // El nombre solo sirve para proponer la dirección la primera vez; si no se puede leer, el campo sale vacío.
        const sugerida = l.config ? "" : await leerNegocio().then((n) => sugerirDireccion(n?.nombre_comercial ?? ""), () => "");
        if (!vivo) return;
        setLeido(l);
        setForm(formularioDe(l.config ?? { ...DE_FABRICA, direccion: sugerida }));
      } catch (e) {
        if (vivo) setFalloLectura(mensajeError(e, LECTURA));
      }
    })();
    return () => { vivo = false; };
  }, [intento]);

  function reintentar() {
    setFalloLectura(null);
    setLeido(null);
    setIntento((n) => n + 1);
  }

  /** Vuelve a leer todo SIN tocar lo escrito en los formularios. false = no se pudo; queda lo que había. */
  const releer = useCallback(async (): Promise<boolean> => {
    try {
      setLeido(await leerTodo());
      return true;
    } catch {
      return false;
    }
  }, []);

  /**
   * Una escritura. Con `enDialogo`, el error se pinta dentro del diálogo abierto y no detrás de él.
   * Devuelve true si la base la aceptó. Lo guardado se pone en pantalla ANTES de volver a leer: si la
   * relectura falla, ningún bloque manda de vuelta datos viejos ni se ve como sin guardar.
   * `escritura` puede ser una función cuando lo guardado solo se sabe al terminar (la ruta del logo).
   */
  async function escribir(
    bloque: Bloque, accion: () => Promise<void>, escritura: Escritura | (() => Escritura), fallo: string, exito: string | null, enDialogo: boolean,
  ): Promise<boolean> {
    if (enCurso.current || sinLeer) return false;
    enCurso.current = true;
    setOcupado(bloque);
    setMensaje(null);
    setErrorDialogo(null);
    let guardado = false;
    try {
      await accion();
      guardado = true;
    } catch (e) {
      const texto = mensajeError(e, fallo);
      if (enDialogo) setErrorDialogo(texto);
      else setMensaje({ bloque, tipo: "error", texto });
    }
    if (guardado) {
      const hecha = typeof escritura === "function" ? escritura() : escritura;
      setLeido((l) => l && trasEscribir(l, hecha));
      setDialogo(null);
      if (await releer()) {
        if (exito) setMensaje({ bloque, tipo: "ok", texto: exito });
      } else {
        setSinLeer(true);
        setMensaje({ bloque, tipo: "aviso", texto: "Se guardó, pero no se pudo actualizar la pantalla." });
      }
    }
    setOcupado(null);
    enCurso.current = false;
    return guardado;
  }

  /** El «Reintentar» de ese aviso: solo vuelve a leer; lo guardado ya está guardado. */
  async function reintentarLectura() {
    if (enCurso.current) return;
    enCurso.current = true;
    if (await releer()) {
      setSinLeer(false);
      setMensaje((m) => m && { ...m, tipo: "ok", texto: GUARDADO });
    }
    enCurso.current = false;
  }

  function cambiar(cambio: Partial<Formulario>) {
    setForm((f) => ({ ...f, ...cambio }));
    // El aviso de «se guardó pero no se pudo leer» no se borra escribiendo: lleva el «Reintentar».
    if (!sinLeer) setMensaje(null);
  }

  // Los bloques 2 y 3 guardan la misma fila: cada uno manda la configuración completa, con lo
  // guardado del otro bloque (no con lo que el dueño tenga a medio escribir allá).
  const guardada: DatosConfigTienda = leido?.config ?? DE_FABRICA;

  function guardarConfig(bloque: Bloque, datos: DatosConfigTienda, enDialogo: boolean) {
    void escribir(bloque, () => guardarConfigTienda(datos), { tipo: "config", datos }, "No se pudo guardar la tienda", GUARDADO, enDialogo);
  }

  function enviarDatos(enDialogo: boolean) {
    // Si el foco seguía en el campo, la dirección puede venir como se tecleó.
    const direccion = normalizarDireccion(form.direccion);
    setForm((f) => ({ ...f, direccion }));
    guardarConfig("datos", { ...guardada, direccion, color: form.color, descripcion: form.descripcion }, enDialogo);
  }

  /** Cambiar una dirección ya guardada rompe los QR impresos y los seguimientos: se confirma antes. */
  function guardarDatos() {
    if (leido?.config && leido.config.direccion !== normalizarDireccion(form.direccion)) { setErrorDialogo(null); setDialogo("direccion"); return; }
    enviarDatos(false);
  }

  function guardarPedidos() {
    if (!leido?.config) return;
    guardarConfig("pedidos", {
      ...guardada, aceptacion: form.aceptacion,
      // En «Automática» el campo no se ve: se conserva el valor guardado.
      minutosAceptacion: form.aceptacion === "MANUAL" ? Number(form.minutos) : guardada.minutosAceptacion,
      pagoEfectivo: form.pagoEfectivo, pagoTarjeta: form.pagoTarjeta,
    }, false);
  }

  /** Pasa por la misma guarda que todo lo demás; al releer se recalcula la lista de revisión. true = se guardó. */
  function guardarSucursal(id: string, datos: BorradorSucursal): Promise<boolean> {
    return escribir(deSucursal(id), () => guardarSucursalTienda(id, datos), { tipo: "sucursal", id, datos }, "No se pudo guardar la sucursal", GUARDADO, false);
  }

  // El logo pasa por la misma guarda: una escritura a la vez, y lo guardado queda en pantalla antes
  // de volver a leer (si no, el «Guardar» de al lado seguiría viendo el logo viejo).
  function subirLogo(archivo: File) {
    if (!leido?.config) return;
    const anterior = leido.config.logoRuta;
    let ruta: string | null = null;
    void escribir(
      "logo", async () => { ruta = await ponerLogoTienda(archivo, anterior); },
      () => ({ tipo: "logo", ruta, url: urlDelLogo(ruta) }), "No se pudo subir el logo", null, false,
    );
  }

  function quitarLogo() {
    const anterior = leido?.config?.logoRuta;
    if (!anterior) return;
    void escribir("logo", () => quitarLogoTienda(anterior), { tipo: "logo", ruta: null, url: null }, "No se pudo quitar el logo", null, false);
  }

  function encender(encendida: boolean, enDialogo: boolean) {
    void escribir("estado", () => encenderTienda(encendida), { tipo: "interruptor", encendida }, "No se pudo cambiar", null, enDialogo);
  }

  /** Encender no pide confirmación; apagar sí. */
  function cambiarEncendido(quiereEncender: boolean) {
    if (!quiereEncender) { setErrorDialogo(null); setDialogo("apagar"); return; }
    encender(true, false);
  }

  const revision: Revision[] = leido
    ? revisar({
        hayDireccion: leido.config !== null, sucursales: leido.sucursales,
        productosSinFoto: leido.pendientes.sinFoto, productosSinDescripcion: leido.pendientes.sinDescripcion,
        productosEnCategoriaInactiva: leido.pendientes.enCategoriaInactiva,
      })
    : [];

  /** El mensaje de un bloque; el aviso de «se guardó pero no se pudo leer» lleva su «Reintentar». */
  function mensajeDe(b: Bloque): MensajeTienda | null {
    if (mensaje?.bloque !== b) return null;
    return { tipo: mensaje.tipo, texto: mensaje.texto, ...(mensaje.tipo === "aviso" && { onReintentar: () => void reintentarLectura() }) };
  }

  return {
    leido, form, falloLectura, ocupado, dialogo, errorDialogo, revision,
    /** Un guardado entró pero falta volver a leer: nada más se guarda hasta entonces. */
    sinLeer,
    /** Lo que se le dice al dueño: el interruptor Y el complemento vigente. */
    encendida: leido !== null && leido.interruptor && leido.enPlan,
    mensajeDe,
    mensajeDeSucursal: (id: string): MensajeTienda | null => mensajeDe(deSucursal(id)),
    /** El id de la sucursal que se está guardando, si es una sucursal lo que se guarda. */
    sucursalGuardando: leido?.sucursales.find((s) => ocupado === deSucursal(s.id))?.id ?? null,
    reintentar, cambiar, guardarDatos, guardarPedidos, guardarSucursal, cambiarEncendido, subirLogo, quitarLogo,
    confirmarDireccion: () => enviarDatos(true),
    confirmarApagar: () => encender(false, true),
    cerrarDialogo: () => setDialogo(null),
  };
}
