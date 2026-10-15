"use client";
import { Pestanas } from "./pestanas";

const PESTANAS = [
  { label: "Programa", href: "/lealtad" },
  { label: "Premios", href: "/lealtad/premios" },
  { label: "Movimientos", href: "/lealtad/movimientos" },
];

/** Las tres pestañas de la sección Lealtad. */
export function LealtadPestanas() {
  return <Pestanas etiqueta="Secciones de lealtad" pestanas={PESTANAS} />;
}
