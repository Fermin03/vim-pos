// Teléfonos: el del cliente (se valida igual que la función, para decirle el error en el campo y no
// después de enviar) y el de la sucursal (texto libre del dueño, para llamar o escribir).

/**
 * Diez dígitos nacionales, o null. La MISMA regla que `normalizarTelefono` de la función
 * (supabase/functions/_shared/tienda/validar.ts): quita espacios y `()+-.` y el prefijo de México
 * (52, o 521 de celular); una letra no es adorno, y la lada no empieza en 0 ni en 1.
 */
export function normalizarTelefono(x: string): string | null {
  if (!/^[\d\s()+.-]+$/.test(x)) return null;
  let d = x.replace(/\D/g, "");
  if (d.length === 13 && d.startsWith("521")) d = d.slice(3);
  else if (d.length === 12 && d.startsWith("52")) d = d.slice(2);
  return /^[2-9]\d{9}$/.test(d) ? d : null;
}

/** «477 123 4567». Si no es un número nacional, se enseña como lo escribió el dueño. */
export function formatoTelefono(x: string): string {
  const d = normalizarTelefono(x);
  return d ? `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}` : x.trim();
}

/** `tel:+52…` para el botón «Llamar», o null si no hay un número al que llamar. */
export function enlaceTel(x: string | null): string | null {
  const d = x ? normalizarTelefono(x) : null;
  return d ? `tel:+52${d}` : null;
}

/** `https://wa.me/52…` para el botón «WhatsApp», con un mensaje de arranque opcional. */
export function enlaceWhatsApp(x: string | null, mensaje?: string): string | null {
  const d = x ? normalizarTelefono(x) : null;
  return d ? `https://wa.me/52${d}${mensaje ? `?text=${encodeURIComponent(mensaje)}` : ""}` : null;
}
