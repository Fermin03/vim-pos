"use client";
import { useState } from "react";
import type { Detalle } from "../lib/tipos";
import { fmtMxn, input, label } from "../lib/formato";
import { DialogoConfirmar } from "./dialogo-confirmar";
import { leerAjuste } from "../lib/folios";

type Accion = (b: Record<string, unknown>) => Promise<void>;

/**
 * Facturación: datos fiscales a la izquierda; folios (paquete y ajuste) a la derecha.
 *
 * Acreditar y ajustar mueven el saldo con el que el cliente timbra: pasan por un diálogo con
 * motivo. Antes eran un clic, y el ajuste se auditaba con un texto fijo ("Ajuste desde
 * plataforma") que no decía por qué se regalaron o quitaron folios.
 */
export function FichaFacturacion({ d, accion, busy }: { d: Detalle; accion: Accion; busy: boolean }) {
  const t = d.tenant;
  const nombre = String(t.nombre_comercial);
  const [paqueteSel, setPaqueteSel] = useState("");
  const [folioAdj, setFolioAdj] = useState("");
  const [dialogo, setDialogo] = useState<"paquete" | "ajuste" | null>(null);

  const paquete = d.paquetes.find((p) => p.id === paqueteSel) ?? null;
  const ajuste = leerAjuste(folioAdj);
  const ajusteInvalido = folioAdj.trim() !== "" && ajuste === null;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-lg border border-line p-3 text-[13px]">
        <div className="mb-1 text-[12px] font-semibold uppercase tracking-wide text-ink-2">Fiscal</div>
        <div>RFC: <b>{String(t.rfc ?? "—")}</b></div>
        <div>Razón social: {String(t.razon_social ?? "—")}</div>
        <div>Régimen: {String(t.regimen_fiscal ?? "—")} · CP {String(t.codigo_postal_fiscal ?? "—")}</div>
        <div className="mt-3 text-[12px] font-semibold uppercase tracking-wide text-ink-2">Folios</div>
        <div>
          Saldo de paquetes: <b>{d.foliosSaldo}</b>
          {d.foliosBase && (
            <> · base del mes: <b>{Math.max(d.foliosBase.mensuales - d.foliosBase.consumidos, 0)}</b> de {d.foliosBase.mensuales} ({d.foliosBase.periodo})</>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-4">
        {/* Acreditar un paquete de folios. La cantidad y el precio salen del catálogo. */}
        <div>
          <label className={label} htmlFor="paq">Acreditar paquete de folios</label>
          <div className="flex gap-2">
            <select id="paq" className={input} value={paqueteSel} onChange={(e) => setPaqueteSel(e.target.value)}>
              <option value="">Elige un paquete…</option>
              {d.paquetes.map((p) => <option key={p.id} value={p.id}>{p.nombre} · {fmtMxn(Number(p.precio_mxn))}</option>)}
            </select>
            <button
              onClick={() => setDialogo("paquete")}
              disabled={busy || !paquete}
              className="btn h-11 shrink-0 rounded bg-ink px-4 text-[13px] font-semibold text-white disabled:opacity-50"
            >
              Acreditar…
            </button>
          </div>
          <p className="mt-1 text-[12.5px] text-ink-2">Queda como compra de paquete con su precio, en la bitácora.</p>
        </div>

        {/* Ajuste manual: para correcciones y cortesías, no para vender. */}
        <div>
          <label className={label} htmlFor="adj">Ajuste manual de folios</label>
          <div className="flex gap-2">
            <input
              id="adj"
              className={input}
              inputMode="numeric"
              placeholder="+50 ó -10"
              value={folioAdj}
              aria-invalid={ajusteInvalido}
              aria-describedby="adj-ayuda"
              onChange={(e) => setFolioAdj(e.target.value.replace(/[^0-9+-]/g, ""))}
            />
            <button
              onClick={() => setDialogo("ajuste")}
              disabled={busy || ajuste === null}
              className="btn h-11 shrink-0 rounded bg-ink px-4 text-[13px] font-semibold text-white disabled:opacity-50"
            >
              Aplicar…
            </button>
          </div>
          <p id="adj-ayuda" className={`mt-1 text-[12.5px] ${ajusteInvalido ? "font-medium text-danger" : "text-ink-2"}`}>
            {ajusteInvalido ? "Escribe un número entero: +50 para regalar, -10 para descontar." : "Positivo = regalar folios · negativo = descontar."}
          </p>
        </div>
      </div>

      <DialogoConfirmar
        abierto={dialogo === "paquete"}
        onCerrar={() => setDialogo(null)}
        titulo="Acreditar paquete de folios"
        descripcion={paquete ? <>Se le suman a <b>{nombre}</b> los folios de <b>{paquete.nombre}</b>, vendido en {fmtMxn(Number(paquete.precio_mxn))}.</> : null}
        sinNombre
        nombreEsperado={nombre}
        etiquetaBoton="Acreditar"
        ocupado={busy}
        onConfirmar={async ({ motivo }) => {
          await accion({ accion: "acreditar_paquete", paquete_id: paqueteSel, motivo });
          setPaqueteSel("");
          setDialogo(null);
        }}
      />

      <DialogoConfirmar
        abierto={dialogo === "ajuste"}
        onCerrar={() => setDialogo(null)}
        titulo={ajuste !== null && ajuste < 0 ? "Descontar folios" : "Regalar folios"}
        descripcion={
          ajuste !== null ? (
            <>
              {ajuste > 0 ? `Se le suman ${ajuste}` : `Se le quitan ${-ajuste}`} folios a <b>{nombre}</b>. Saldo de paquetes: {d.foliosSaldo} → {Math.max(0, d.foliosSaldo + ajuste)}.
            </>
          ) : null
        }
        sinNombre
        nombreEsperado={nombre}
        etiquetaBoton="Aplicar ajuste"
        peligroso={ajuste !== null && ajuste < 0}
        ocupado={busy}
        onConfirmar={async ({ motivo }) => {
          await accion({ accion: "ajustar_folios", cantidad: ajuste, motivo });
          setFolioAdj("");
          setDialogo(null);
        }}
      />
    </div>
  );
}
