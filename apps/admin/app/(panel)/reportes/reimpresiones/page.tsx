"use client";
import { Nota, ReporteMarco, useConsulta, useRangoReporte, type Cifra } from "../../../components/reporte";
import { useSucursalReporte } from "../../../components/selector-sucursal";
import { leerReimpresionesPorCajero, type FilaReimpresion } from "../../../lib/reportes";
import { formatear, type Columna } from "../../../lib/reporte-tabla";

/** Reimpresiones por ticket a partir de las cuales conviene hablar con el cajero. */
const UMBRAL = 2;
const razon = (f: FilaReimpresion) => (f.ticketsDistintos > 0 ? f.reimpresiones / f.ticketsDistintos : 0);

/** Antifraude: cajeros que reimprimen comandas con frecuencia (posible salida sin cobrar), y
 *  reimpresiones del ticket del cliente (desde la 0126 las dos quedan registradas en la caja). */
export default function ReimpresionesPage() {
  const { rango, cambiar } = useRangoReporte();
  const sucursal = useSucursalReporte();
  const consulta = useConsulta((r) => leerReimpresionesPorCajero(r.desde, r.hasta, sucursal.id), sucursal.listo ? rango : null, sucursal.clave);
  const filas = consulta.datos ?? [];

  const reimpresiones = filas.reduce((s, f) => s + f.reimpresiones, 0);
  const tickets = filas.reduce((s, f) => s + f.ticketsDistintos, 0);
  const ticketsCliente = filas.reduce((s, f) => s + f.ticketsCliente, 0);
  const aRevisar = filas.filter((f) => razon(f) >= UMBRAL).length;

  const cifras: Cifra[] = [
    { etiqueta: "Comandas reimpresas", valor: reimpresiones, tipo: "entero", pie: tickets > 0 ? `de ${tickets} ${tickets === 1 ? "pedido" : "pedidos"}` : undefined },
    { etiqueta: "Tickets del cliente", valor: ticketsCliente, tipo: "entero", pie: "reimpresos" },
    { etiqueta: "Por ticket", valor: tickets > 0 ? `${(reimpresiones / tickets).toFixed(1)}×` : "—", pie: "en promedio" },
    {
      etiqueta: "Cajeros a revisar",
      valor: aRevisar,
      tipo: "entero",
      tono: aRevisar > 0 ? "atencion" : "bien",
      pie: aRevisar > 0 ? `reimprimen ${UMBRAL} veces o más por ticket` : "nadie reimprime de más",
    },
  ];

  const columnas: Columna<FilaReimpresion>[] = [
    { id: "cajero", titulo: "Cajero", valor: (f) => f.cajero, ancho: 24 },
    { id: "reimpresiones", titulo: "Comandas", tipo: "entero", valor: (f) => f.reimpresiones, total: "suma", enfasis: "fuerte" },
    { id: "tickets", titulo: "Pedidos distintos", tipo: "entero", valor: (f) => f.ticketsDistintos, total: "suma" },
    { id: "ticketsCliente", titulo: "Tickets del cliente", tipo: "entero", valor: (f) => f.ticketsCliente, total: "suma" },
    {
      id: "razon",
      titulo: "Por ticket",
      tipo: "decimal",
      valor: razon,
      total: () => (tickets > 0 ? reimpresiones / tickets : 0),
      celda: (f) => (
        <span className={`rounded px-2 py-0.5 text-13 font-semibold tabular-nums ${razon(f) >= UMBRAL ? "bg-warning-soft text-warning" : "text-ink-2"}`}>
          {formatear(razon(f), "decimal")}×
        </span>
      ),
    },
  ];

  return (
    <ReporteMarco
      sucursal={sucursal}
      titulo="Reimpresiones por cajero"
      subtitulo="Reimprimir comandas con frecuencia puede esconder producto que salió sin cobrar. Cada reimpresión pide motivo y autorización."
      rango={{ valor: rango, cambiar }}
      consulta={consulta}
      cifras={cifras}
      tabla={{ columnas, filas, clave: (f) => f.clave, orden: { id: "reimpresiones", dir: "desc" }, vacio: "Nadie reimprimió comandas ni tickets en estas fechas." }}
    >
      <Nota>
        Con {UMBRAL} reimpresiones de comanda o más por pedido conviene revisar con el cajero. Cada reimpresión queda
        registrada con su fecha, su ticket, el motivo y quién la autorizó. Se registran desde la versión 0.4.93 de la caja.
      </Nota>
    </ReporteMarco>
  );
}
