"use client";
import { Nota, ReporteMarco, useConsulta, useRangoReporte, type Cifra } from "../../../components/reporte";
import { leerTiemposCocina, type FilaTiempos } from "../../../lib/reportes";
import { etiquetaModo } from "../../../lib/modo-servicio";
import type { Columna } from "../../../lib/reporte-tabla";

/**
 * Objetivo de preparación en minutos. La vista SQL corta en 15 (tickets_cocina_bajo_15min),
 * así que ese es el umbral con el que se puede medir cumplimiento sin recalcular por ticket.
 * Cuando el objetivo sea configurable por negocio, esto sale de la config, no de una constante.
 */
const OBJETIVO_MIN = 15;

export default function TiemposCocinaPage() {
  const { rango, cambiar } = useRangoReporte();
  const consulta = useConsulta((r) => leerTiemposCocina(r.desde, r.hasta), rango);
  const filas = consulta.datos ?? [];

  // Totales ponderados por comandas (no promedio de promedios).
  const comandas = filas.reduce((s, f) => s + f.tickets, 0);
  const promedio = comandas > 0 ? filas.reduce((s, f) => s + f.promedio * f.tickets, 0) / comandas : 0;
  const peorP95 = filas.reduce((m, f) => Math.max(m, f.p95), 0);
  const aTiempo = filas.reduce((s, f) => s + f.bajo15, 0);
  const tarde = comandas - aTiempo;
  const pctATiempo = comandas > 0 ? (aTiempo / comandas) * 100 : 0;

  // Ámbar y no rojo: una cocina lenta hay que revisarla, pero no es dinero perdido.
  const cifras: Cifra[] = [
    { etiqueta: "Tiempo promedio", valor: comandas > 0 ? `${promedio.toFixed(0)} min` : "—", tono: comandas === 0 ? "neutro" : promedio <= OBJETIVO_MIN ? "bien" : "atencion", pie: `objetivo: ${OBJETIVO_MIN} min` },
    { etiqueta: "Casi todas salen en", valor: comandas > 0 ? `${peorP95.toFixed(0)} min` : "—", pie: "o menos (95 de cada 100 comandas)" },
    { etiqueta: "A tiempo", valor: comandas > 0 ? pctATiempo : "—", tipo: "pct", tono: comandas === 0 ? "neutro" : pctATiempo >= 80 ? "bien" : "atencion", pie: `salieron en ${OBJETIVO_MIN} min o menos` },
    { etiqueta: "Tarde", valor: tarde, tipo: "entero", tono: tarde > 0 ? "atencion" : "neutro", pie: `de ${comandas} comandas` },
  ];

  const columnas: Columna<FilaTiempos>[] = [
    { id: "modo", titulo: "Tipo de servicio", valor: (f) => etiquetaModo(f.modo), ancho: 22 },
    { id: "comandas", titulo: "Comandas", tipo: "entero", valor: (f) => f.tickets, total: "suma" },
    { id: "promedio", titulo: "Promedio (min)", tipo: "decimal", valor: (f) => f.promedio, total: () => promedio, enfasis: "fuerte" },
    { id: "p95", titulo: "95 de cada 100 en (min)", tipo: "decimal", valor: (f) => f.p95, total: () => peorP95, enfasis: "suave", ancho: 22 },
    { id: "bajo", titulo: `${OBJETIVO_MIN} min o menos`, tipo: "entero", valor: (f) => f.bajo15, total: "suma" },
    { id: "medio", titulo: `${OBJETIVO_MIN + 1} a 30 min`, tipo: "entero", valor: (f) => f.entre16y30, total: "suma" },
    { id: "alto", titulo: "Más de 30 min", tipo: "entero", valor: (f) => f.mayor30, total: "suma" },
  ];

  return (
    <ReporteMarco
      titulo="Tiempos de cocina"
      subtitulo="Cuánto tarda en salir la comida contra tu objetivo, por tipo de servicio."
      rango={{ valor: rango, cambiar }}
      consulta={consulta}
      cifras={cifras}
      tabla={{ columnas, filas, clave: (f) => f.modo, orden: { id: "comandas", dir: "desc" }, vacio: "No hay tiempos de cocina en estas fechas." }}
    >
      <Nota>
        El tiempo va de que la comanda llega a cocina a que se marca lista en la pantalla de cocina. Sin pantalla
        de cocina no hay tiempos que medir.
      </Nota>
    </ReporteMarco>
  );
}
