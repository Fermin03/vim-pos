"use client";
import { Pestanas } from "./pestanas";

const PESTANAS = [
  { label: "Zonas", href: "/configuracion/envios" },
  { label: "Colonias", href: "/configuracion/envios/colonias" },
];

/** Las dos pestañas de Configuración → Envíos. */
export function EnviosPestanas() {
  return <Pestanas etiqueta="Secciones de envíos" pestanas={PESTANAS} />;
}
