"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Api } from "../lib/tipos";
import { fmtInt } from "../lib/formato";
import { PALABRA_ELIMINAR, type ResumenEliminacion, type VistaPreviaEliminacion } from "../lib/eliminar";
import { DialogoConfirmar } from "./dialogo-confirmar";

/** Dónde deja el aviso para la lista de clientes, que es a donde se vuelve después de eliminar. */
export const CLAVE_AVISO_ELIMINADO = "vim.platform.cliente-eliminado";

const plural = (n: number, uno: string, varios: string) => `${fmtInt(n)} ${n === 1 ? uno : varios}`;

/** Lo que se borra, en el orden en que alguien lo preguntaría. Solo lo que tiene algo. */
function renglones(r: ResumenEliminacion): string[] {
  return [
    r.sucursales > 0 && plural(r.sucursales, "sucursal", "sucursales"),
    r.cajas > 0 && plural(r.cajas, "caja", "cajas"),
    r.usuarios > 0 && plural(r.usuarios, "usuario o empleado", "usuarios y empleados"),
    r.productos > 0 && plural(r.productos, "producto", "productos"),
    r.tickets > 0 && plural(r.tickets, "ticket", "tickets"),
    r.clientes > 0 && plural(r.clientes, "cliente del negocio", "clientes del negocio"),
    r.cfdi > 0 && plural(r.cfdi, "factura sin timbrar", "facturas sin timbrar"),
    r.cuentas > 0 && plural(r.cuentas, "cuenta de acceso", "cuentas de acceso"),
    r.archivos > 0 && plural(r.archivos, "archivo", "archivos"),
  ].filter((x): x is string => typeof x === "string");
}

/**
 * El segundo paso de la baja: eliminar por completo a un cliente ya CANCELADO (0144, ADR 0023).
 *
 * Solo aparece con el cliente cancelado, y aparte de los botones de arriba: es lo único del panel
 * que no se puede deshacer. Antes de pedir nada enseña el tamaño de lo que se va a borrar, leído
 * de la base en ese momento; si la base dice que no se puede (facturas timbradas), aquí se dice
 * por qué y no hay botón que pulsar.
 */
export function EliminarCliente({ api, tenantId, nombre }: { api: Api; tenantId: string; nombre: string }) {
  const router = useRouter();
  const [previa, setPrevia] = useState<VistaPreviaEliminacion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(async () => {
    try {
      setPrevia((await api(`/api/tenants/${tenantId}/eliminar`)) as unknown as VistaPreviaEliminacion);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo calcular qué se borraría.");
    }
  }, [api, tenantId]);
  useEffect(() => { void cargar(); }, [cargar]);

  async function abrir() {
    // Se vuelve a leer al abrir: las cifras que se confirman son las de AHORA, no las de cuando
    // se cargó la ficha.
    await cargar();
    setAbierto(true);
  }

  async function eliminar(r: { motivo: string; nombre: string; palabra?: string }) {
    setOcupado(true);
    try {
      const res = await api(`/api/tenants/${tenantId}/eliminar`, {
        method: "POST",
        body: JSON.stringify({ motivo: r.motivo, nombre: r.nombre, confirmacion: r.palabra ?? "" }),
      });
      const fallos = (res.archivos as { fallos?: string[] } | undefined)?.fallos ?? [];
      const conservadas = Array.isArray(res.cuentas_conservadas) ? res.cuentas_conservadas.length : 0;
      const extra = [
        conservadas > 0 ? `${plural(conservadas, "cuenta se conservó", "cuentas se conservaron")} porque otro negocio la usa` : "",
        fallos.length > 0 ? `${plural(fallos.length, "archivo no se pudo borrar", "archivos no se pudieron borrar")}: revisa la bitácora` : "",
      ].filter(Boolean).join(". ");
      try {
        sessionStorage.setItem(CLAVE_AVISO_ELIMINADO, JSON.stringify({ nombre, extra, problema: fallos.length > 0 }));
      } catch { /* sin sessionStorage solo se pierde el aviso */ }
      router.push("/clientes");
    } finally {
      setOcupado(false);
    }
  }

  const bloqueos = previa?.bloqueos ?? [];
  const lista = previa ? renglones(previa.resumen) : [];

  return (
    <div className="mt-5 border-t border-danger/30 pt-4">
      <h3 className="font-display text-14 font-semibold text-danger">Eliminar definitivamente</h3>
      <p className="mt-0.5 max-w-prose text-13 text-ink-2">
        Borra al cliente por completo: sus datos, sus ventas, sus cuentas de acceso. No se puede deshacer y no hay
        respaldo. Para altas de prueba y pruebas abandonadas; un cliente que operó de verdad se queda cancelado.
      </p>

      {error && <p className="mt-3 text-13 text-danger" role="alert">{error}</p>}
      {!previa && !error && <p className="mt-3 text-13 text-ink-3">Calculando qué se borraría…</p>}

      {previa && bloqueos.length > 0 && (
        <div className="mt-3 rounded border border-line-strong bg-surface p-3 text-13" role="status">
          <p className="font-semibold text-ink">No se puede eliminar.</p>
          {bloqueos.map((b) => <p key={b.codigo} className="mt-1 text-ink-2">{b.mensaje}</p>)}
        </div>
      )}

      {previa && previa.puede_eliminar && (
        <button onClick={() => void abrir()} disabled={ocupado} className="btn mt-3 h-10 rounded bg-danger px-4 text-13 font-semibold text-white disabled:opacity-50">
          Eliminar cliente…
        </button>
      )}

      <DialogoConfirmar
        abierto={abierto}
        onCerrar={() => setAbierto(false)}
        titulo="Eliminar cliente definitivamente"
        descripcion={<>Se borra <b>{nombre}</b> y todo lo suyo. <b>No se puede deshacer</b>: no queda respaldo, y sus cajas instaladas dejarán de sincronizar.</>}
        detalle={previa && (
          <div className="rounded border border-danger/30 bg-danger/5 p-3 text-13">
            <p className="font-semibold text-ink">Se va a borrar</p>
            {lista.length > 0
              ? <ul className="mt-1 list-disc pl-5 text-ink">{lista.map((l) => <li key={l} className="tabular-nums">{l}</li>)}</ul>
              : <p className="mt-1 text-ink-2">Nada de operación: el negocio no llegó a capturar datos.</p>}
            <p className="mt-2 tabular-nums text-ink-2">
              En total, {plural(previa.resumen.filas, "fila", "filas")} en {plural(previa.resumen.tablas_con_datos, "tabla", "tablas")}.
              {previa.resumen.cuentas_conservadas > 0 && ` ${plural(previa.resumen.cuentas_conservadas, "cuenta se conserva", "cuentas se conservan")} porque también ${previa.resumen.cuentas_conservadas === 1 ? "pertenece" : "pertenecen"} a otro negocio.`}
            </p>
            <p className="mt-2 text-ink-2">
              Queda una ficha en <b className="text-ink">Clientes eliminados</b> con el motivo, estas cifras, el contacto del dueño
              {previa.resumen.pagos_suscripcion > 0 ? ` y ${previa.resumen.pagos_suscripcion === 1 ? "su pago registrado" : `sus ${fmtInt(previa.resumen.pagos_suscripcion)} pagos registrados`}` : ""}; y lo que ya había en la bitácora.
            </p>
          </div>
        )}
        nombreEsperado={nombre}
        palabra={PALABRA_ELIMINAR}
        etiquetaBoton="Eliminar para siempre"
        textoOcupado="Eliminando…"
        peligroso
        ocupado={ocupado}
        onConfirmar={eliminar}
      />
    </div>
  );
}
