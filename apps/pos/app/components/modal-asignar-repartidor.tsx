"use client";
import { useEffect, useState } from "react";
import { Button, Modal } from "@vim/ui/styles";
import { asignarLote, crearRepartidor, leerDeliveries, listarRepartidores, type Repartidor } from "../lib/delivery";
import { listarCuentasAbiertas, type CuentaAbierta } from "../lib/cuentas-abiertas";
import { fmtMxn } from "../lib/turno";
import { useEscape } from "../lib/use-escape";

/**
 * Asignar repartidor a un pedido a domicilio — y, si se lleva más de uno, a todo el viaje.
 *
 * ASIGNAR ES SALIR. Antes esto se llamaba "marcar salida" y eran dos pasos, pero además había un
 * tercer camino que se los saltaba: imprimir el ticket marcaba la salida sin repartidor. Quedaban
 * pedidos "salidos" que nadie llevaba y dinero que no se podía cuadrar contra nadie. Ya no se
 * puede salir sin repartidor.
 *
 * VARIOS PEDIDOS, UN VIAJE. En hora pico el repartidor junta dos o tres de la misma zona. Se
 * marcan aquí, en la pantalla donde el cajero ya está, en vez de con un modo de selección múltiple
 * colgando de la lista el resto del día: un pedido solo cuesta los mismos toques que antes.
 *
 * ALTA EN SITIO. Como asignar es obligatorio, un catálogo vacío trabaría la caja hasta que alguien
 * entrara al panel web. Por eso se puede dar de alta a alguien desde aquí.
 */
export function ModalAsignarRepartidor({
  token, tenantId, sucursalId, ticketId, folio, total, onListo, onCerrar,
}: {
  token: string;
  tenantId: string;
  sucursalId: string;
  ticketId: string;
  folio: string | null;
  /** Lo que el repartidor debe traer de vuelta por ESTE pedido. */
  total: number;
  onListo: () => void;
  onCerrar: () => void;
}) {
  const [repartidores, setRepartidores] = useState<Repartidor[] | null>(null);
  const [elegido, setElegido] = useState<string | null>(null);
  const [otros, setOtros] = useState<CuentaAbierta[]>([]);
  const [tambien, setTambien] = useState<Set<string>>(new Set());
  const [minutos, setMinutos] = useState<string>("30");
  const [altaAbierta, setAltaAbierta] = useState(false);
  const [altaNombre, setAltaNombre] = useState("");
  const [altaTelefono, setAltaTelefono] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [procesando, setProcesando] = useState(false);
  useEscape(() => { if (!procesando) onCerrar(); });

  useEffect(() => {
    listarRepartidores(token)
      .then((r) => {
        setRepartidores(r);
        // Con un solo repartidor no hay nada que decidir: se preselecciona para que asignar sea un toque.
        if (r.length === 1 && r[0]) setElegido(r[0].id);
      })
      .catch(() => setRepartidores([]));
  }, [token]);

  useEffect(() => {
    // Los demás domicilios que TODAVÍA no tienen repartidor. Los que ya van en reparto no pueden
    // subirse a este viaje: el repartidor ya se fue con ellos.
    Promise.all([
      listarCuentasAbiertas(token, sucursalId, "DELIVERY_PROPIO"),
      leerDeliveries(token, sucursalId),
    ])
      .then(([cuentas, asignados]) => {
        const yaVan = new Set(asignados.map((a) => a.ticketId));
        setOtros(cuentas.filter((c) => c.ticketId !== ticketId && !yaVan.has(c.ticketId)));
      })
      .catch(() => setOtros([]));
  }, [token, sucursalId, ticketId]);

  function alternar(id: string) {
    setTambien((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  async function darDeAlta() {
    setProcesando(true);
    setError(null);
    try {
      const r = await crearRepartidor(token, tenantId, { nombre: altaNombre, telefono: altaTelefono });
      setRepartidores((prev) => [...(prev ?? []), r].sort((a, b) => a.nombre.localeCompare(b.nombre)));
      setElegido(r.id);
      setAltaAbierta(false);
      setAltaNombre("");
      setAltaTelefono("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo dar de alta");
    } finally {
      setProcesando(false);
    }
  }

  async function confirmar() {
    if (!elegido) return;
    setProcesando(true);
    setError(null);
    try {
      // Una sola llamada con todo el viaje: la RPC es atómica, así que o salen todos anotados o no
      // sale ninguno. Con llamadas sueltas, si la tercera fallaba el repartidor se iba con tres
      // pedidos y dos anotados.
      await asignarLote(token, {
        ticketIds: [ticketId, ...tambien],
        repartidorId: elegido,
        tiempoPromesa: minutos.trim() ? Number(minutos) : null,
      });
      onListo();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo asignar el repartidor");
      setProcesando(false);
    }
  }

  const totalViaje = total + otros.filter((o) => tambien.has(o.ticketId)).reduce((s, o) => s + o.total, 0);

  return (
    <Modal
      open
      onClose={onCerrar}
      title="Asignar repartidor"
      hideTitle
      className="w-[440px] rounded-lg border border-line bg-surface p-6 shadow-[0_18px_44px_rgba(22,22,26,.18)]"
    >
      <h2 className="font-display text-xl font-semibold tracking-tight">¿Quién se lo lleva?</h2>
      <p className="mt-0.5 text-[13px] text-ink-3">
        {folio ? `${folio} · ` : ""}
        {fmtMxn(totalViaje)} a cobrar en la puerta.
      </p>

      <div className="mt-4">
        {repartidores === null && <p className="text-[13px] text-ink-3">Cargando repartidores…</p>}

        {repartidores !== null && repartidores.length > 0 && (
          <div className="max-h-[240px] overflow-y-auto rounded border border-line">
            {repartidores.map((r) => {
              const activo = elegido === r.id;
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setElegido(activo ? null : r.id)}
                  aria-pressed={activo}
                  className={[
                    "flex w-full items-center gap-3 border-b border-line px-3 py-2.5 text-left transition last:border-b-0",
                    activo ? "bg-sel" : "hover:bg-bg",
                  ].join(" ")}
                >
                  <span
                    className={[
                      "grid h-5 w-5 flex-shrink-0 place-items-center rounded-full border",
                      activo ? "border-ink bg-ink text-surface" : "border-line-strong",
                    ].join(" ")}
                    aria-hidden
                  >
                    {activo ? "✓" : ""}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-semibold text-ink">{r.nombre}</span>
                    {r.telefono && <span className="block text-[12px] text-ink-3">{r.telefono}</span>}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {repartidores !== null && repartidores.length === 0 && !altaAbierta && (
        <p className="mt-4 rounded border border-line bg-bg px-3 py-2.5 text-[12.5px] leading-snug text-ink-2">
          No hay repartidores dados de alta. Dale de alta a quien se lo lleve para que el pedido
          pueda salir; después se administran en el panel, en{" "}
          <span className="font-semibold">Usuarios → Repartidores</span>.
        </p>
      )}

      {!altaAbierta && (
        <button
          type="button"
          onClick={() => setAltaAbierta(true)}
          className="mt-2 text-[12.5px] font-semibold text-info underline-offset-2 hover:underline"
        >
          ¿Falta alguien? Darlo de alta
        </button>
      )}

      {altaAbierta && (
        <div className="mt-3 rounded border border-line-strong p-3">
          <input
            className="h-11 w-full rounded border border-line-strong px-3 text-sm outline-none focus:border-ink"
            placeholder="Nombre"
            value={altaNombre}
            maxLength={100}
            onChange={(e) => setAltaNombre(e.target.value)}
          />
          <input
            className="mt-2 h-11 w-full rounded border border-line-strong px-3 text-sm outline-none focus:border-ink"
            placeholder="Teléfono (opcional)"
            inputMode="tel"
            value={altaTelefono}
            maxLength={20}
            onChange={(e) => setAltaTelefono(e.target.value)}
          />
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => setAltaAbierta(false)}
              className="h-10 flex-1 rounded border border-line-strong text-[13px] font-semibold text-ink-2"
            >
              Cancelar
            </button>
            <Button className="flex-1" onClick={darDeAlta} disabled={procesando || altaNombre.trim().length < 2}>
              Dar de alta
            </Button>
          </div>
        </div>
      )}

      {otros.length > 0 && (
        <div className="mt-4">
          <p className="mb-1 text-[12.5px] font-semibold text-ink-2">¿Se lleva algo más?</p>
          <div className="max-h-[180px] overflow-y-auto rounded border border-line">
            {otros.map((o) => {
              const activo = tambien.has(o.ticketId);
              return (
                <button
                  key={o.ticketId}
                  type="button"
                  onClick={() => alternar(o.ticketId)}
                  aria-pressed={activo}
                  className={[
                    "flex w-full items-center gap-3 border-b border-line px-3 py-2.5 text-left transition last:border-b-0",
                    activo ? "bg-sel" : "hover:bg-bg",
                  ].join(" ")}
                >
                  <span
                    className={[
                      "grid h-5 w-5 flex-shrink-0 place-items-center rounded border",
                      activo ? "border-ink bg-ink text-surface" : "border-line-strong",
                    ].join(" ")}
                    aria-hidden
                  >
                    {activo ? "✓" : ""}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-ink">
                    {o.cliente ?? o.folio ?? "Cuenta"}
                  </span>
                  <span className="flex-shrink-0 text-[13px] font-semibold tabular-nums">{fmtMxn(o.total)}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-3">
        <label className="mb-1 block text-[12.5px] font-semibold text-ink-2" htmlFor="min">
          Tiempo prometido · minutos
        </label>
        <input
          id="min"
          className="h-11 w-full rounded border border-line-strong px-3 text-sm outline-none focus:border-ink focus:shadow-[0_0_0_3px_rgba(22,22,26,.06)]"
          inputMode="numeric"
          value={minutos}
          maxLength={3}
          onChange={(e) => setMinutos(e.target.value.replace(/[^0-9]/g, ""))}
        />
      </div>

      {error && <p className="mt-3 text-[13px] font-medium text-danger" role="alert">{error}</p>}

      <div className="mt-5 flex gap-2">
        <button
          type="button"
          onClick={onCerrar}
          disabled={procesando}
          className="h-11 flex-1 rounded border border-line-strong text-[14px] font-semibold text-ink-2 transition hover:border-ink hover:text-ink disabled:opacity-50"
        >
          Cancelar
        </button>
        {/* Sin repartidor no hay botón que apretar: ya no se puede salir sin que alguien lo lleve. */}
        <Button className="flex-1" onClick={confirmar} disabled={procesando || !elegido}>
          {procesando ? "Asignando…" : tambien.size > 0 ? `Asignar ${tambien.size + 1} pedidos` : "Asignar"}
        </Button>
      </div>
    </Modal>
  );
}
