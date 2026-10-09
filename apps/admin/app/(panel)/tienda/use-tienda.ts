"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { leerNegocio } from "../../lib/configuracion";
import { mensajeError } from "../../lib/errores";
import { leerModulos } from "../../lib/modulos";
import {
  contarPendientesDeCatalogo, encenderTienda, guardarConfigTienda, leerConfigTienda, leerSucursalesTienda, leerTiendaEncendida,
  type ConfigTienda, type DatosConfigTienda,
} from "../../lib/tienda";
import { revisar, sugerirDireccion, type Revision, type SucursalTienda } from "../../lib/tienda-reglas";
import type { DatosTienda } from "../../components/tienda-datos";
import type { MensajeTienda } from "../../components/tienda-mensaje";
import type { PedidosTienda } from "../../components/tienda-pedidos";

export type Bloque = "estado" | "datos" | "pedidos";
type Formulario = DatosTienda & PedidosTienda;

/** Lo que hay en la base. `config` null = el dueño todavía no elige dirección. */
type Leido = {
  config: ConfigTienda | null;
  sucursales: SucursalTienda[];
  /** El interruptor crudo: puede seguir en `true` con el complemento vencido. */
  interruptor: boolean;
  enPlan: boolean;
  pendientes: { sinFoto: number; sinDescripcion: number; enCategoriaInactiva: number };
};

/** Los mismos valores de fábrica que la tabla `tienda_config` (0161). */
const DE_FABRICA: DatosConfigTienda = {
  direccion: "", color: "#111111", descripcion: "", aceptacion: "MANUAL", minutosAceptacion: 5, pagoEfectivo: true, pagoTarjeta: false,
};

// Los módulos se leen frescos: el shell los lee una vez por sesión y un complemento puede vencer
// mientras el interruptor sigue en `true`.
async function leerTodo(): Promise<Leido> {
  const [config, sucursales, interruptor, pendientes, modulos] = await Promise.all([
    leerConfigTienda(), leerSucursalesTienda(), leerTiendaEncendida(), contarPendientesDeCatalogo(), leerModulos(),
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
  const [mensaje, setMensaje] = useState<(MensajeTienda & { bloque: Bloque }) | null>(null);
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
        if (vivo) setFalloLectura(mensajeError(e, "No se pudo leer tu tienda"));
      }
    })();
    return () => { vivo = false; };
  }, [intento]);

  function reintentar() {
    setFalloLectura(null);
    setLeido(null);
    setIntento((n) => n + 1);
  }

  /**
   * Vuelve a leer todo SIN tocar lo que el dueño tiene escrito en los formularios. Se llama después
   * de cada guardado (también lo llamará el bloque de sucursales). Si falla deja lo que había y lo
   * dice en el bloque de estado: una lista de revisión vacía se leería como «todo listo».
   */
  const releer = useCallback(async (): Promise<boolean> => {
    try {
      setLeido(await leerTodo());
      return true;
    } catch (e) {
      setMensaje({ bloque: "estado", tipo: "error", texto: mensajeError(e, "No se pudo leer tu tienda") });
      return false;
    }
  }, []);

  /** Una escritura. Con `enDialogo`, el error se pinta dentro del diálogo abierto y no detrás de él. */
  async function escribir(bloque: Bloque, accion: () => Promise<void>, fallo: string, exito: string | null, enDialogo: boolean) {
    if (enCurso.current) return;
    enCurso.current = true;
    setOcupado(bloque);
    setMensaje(null);
    setErrorDialogo(null);
    try {
      await accion();
      setDialogo(null);
      if ((await releer()) && exito) setMensaje({ bloque, tipo: "ok", texto: exito });
    } catch (e) {
      const texto = mensajeError(e, fallo);
      if (enDialogo) setErrorDialogo(texto);
      else setMensaje({ bloque, tipo: "error", texto });
    }
    setOcupado(null);
    enCurso.current = false;
  }

  function cambiar(cambio: Partial<Formulario>) {
    setForm((f) => ({ ...f, ...cambio }));
    setMensaje(null);
  }

  // Los bloques 2 y 3 guardan la misma fila: cada uno manda la configuración completa, con lo
  // guardado del otro bloque (no con lo que el dueño tenga a medio escribir allá).
  const guardada: DatosConfigTienda = leido?.config ?? DE_FABRICA;

  function enviarDatos(enDialogo: boolean) {
    void escribir(
      "datos",
      () => guardarConfigTienda({ ...guardada, direccion: form.direccion, color: form.color, descripcion: form.descripcion }),
      "No se pudo guardar la tienda", "Cambios guardados.", enDialogo,
    );
  }

  /** Cambiar una dirección ya guardada rompe los QR impresos y los seguimientos: se confirma antes. */
  function guardarDatos() {
    if (leido?.config && leido.config.direccion !== form.direccion) { setErrorDialogo(null); setDialogo("direccion"); return; }
    enviarDatos(false);
  }

  function guardarPedidos() {
    if (!leido?.config) return;
    void escribir(
      "pedidos",
      () => guardarConfigTienda({
        ...guardada, aceptacion: form.aceptacion,
        // En «Automática» el campo no se ve: se conserva el valor guardado.
        minutosAceptacion: form.aceptacion === "MANUAL" ? Number(form.minutos) : guardada.minutosAceptacion,
        pagoEfectivo: form.pagoEfectivo, pagoTarjeta: form.pagoTarjeta,
      }),
      "No se pudo guardar la tienda", "Cambios guardados.", false,
    );
  }

  /** Encender no pide confirmación; apagar sí. */
  function cambiarEncendido(encender: boolean) {
    if (!encender) { setErrorDialogo(null); setDialogo("apagar"); return; }
    void escribir("estado", () => encenderTienda(true), "No se pudo cambiar", null, false);
  }

  const revision: Revision[] = leido
    ? revisar({
        hayDireccion: leido.config !== null, sucursales: leido.sucursales,
        productosSinFoto: leido.pendientes.sinFoto, productosSinDescripcion: leido.pendientes.sinDescripcion,
        productosEnCategoriaInactiva: leido.pendientes.enCategoriaInactiva,
      })
    : [];

  return {
    leido, form, falloLectura, ocupado, dialogo, errorDialogo, revision,
    /** Lo que se le dice al dueño: el interruptor Y el complemento vigente. */
    encendida: leido !== null && leido.interruptor && leido.enPlan,
    mensajeDe: (b: Bloque): MensajeTienda | null => (mensaje?.bloque === b ? mensaje : null),
    reintentar, releer, cambiar, guardarDatos, guardarPedidos, cambiarEncendido,
    confirmarDireccion: () => enviarDatos(true),
    confirmarApagar: () => void escribir("estado", () => encenderTienda(false), "No se pudo cambiar", null, true),
    cerrarDialogo: () => setDialogo(null),
  };
}
