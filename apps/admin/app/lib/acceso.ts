/**
 * Qué jerarquía mínima exige cada sección del panel.
 *
 * Una sola tabla para el menú Y para el guardián de rutas. Con dos listas separadas, la primera
 * vez que alguien añade una sección se acuerda de una y olvida la otra — y el fallo resultante
 * (un enlace oculto pero una ruta abierta) no se nota mirando la pantalla.
 *
 * Jerarquías reales de la base: Dueño 5 · Administrador 4 · Supervisor 3 · Cajero 2 ·
 * Personal 1 · Dispositivo 0.
 *
 * ESTO NO ES UNA FRONTERA DE SEGURIDAD. Corre en el navegador y sirve para que nadie llegue por
 * accidente a donde no le toca. La frontera de verdad son las políticas RLS, que hoy filtran por
 * TENANT y no por rol: quien tenga sesión del tenant puede leer sus datos aunque la pantalla no
 * se los muestre. Cerrar eso es trabajo de la capa de datos y está anotado en la auditoría.
 */
export const MIN_JERARQUIA: { prefijo: string; min: number }[] = [
  { prefijo: "/dashboard", min: 0 },
  { prefijo: "/catalogo", min: 4 },
  { prefijo: "/promociones", min: 4 },
  { prefijo: "/inventario", min: 4 },
  { prefijo: "/clientes", min: 4 },
  { prefijo: "/reservaciones", min: 3 },
  { prefijo: "/conciliacion", min: 3 },
  { prefijo: "/usuarios", min: 4 },
  { prefijo: "/facturacion", min: 4 },
  { prefijo: "/configuracion", min: 4 },
  { prefijo: "/reportes", min: 3 },
  { prefijo: "/bienvenida", min: 0 },
];

/**
 * Jerarquía mínima para una ruta. Gana el prefijo MÁS LARGO que coincida, para que una subruta
 * pueda ser más estricta que su sección sin que el orden de la lista importe.
 *
 * Una ruta desconocida devuelve `null` y el guardián la deja pasar: bloquear lo que no está en la
 * tabla convertiría cualquier página nueva en un muro silencioso hasta que alguien la registrara.
 */
export function jerarquiaRequerida(ruta: string): number | null {
  const coincidencias = MIN_JERARQUIA
    .filter((r) => ruta === r.prefijo || ruta.startsWith(r.prefijo + "/"))
    .sort((a, b) => b.prefijo.length - a.prefijo.length);
  return coincidencias[0]?.min ?? null;
}

/** ¿Esta jerarquía alcanza para esta ruta? */
export function puedeVer(jerarquia: number, ruta: string): boolean {
  const min = jerarquiaRequerida(ruta);
  return min === null || jerarquia >= min;
}
