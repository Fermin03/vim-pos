/**
 * Coincidencia de IP contra la allowlist del panel, con soporte de prefijos CIDR.
 *
 * La comparación exacta no sirve en la práctica. Un proveedor doméstico o de oficina entrega
 * IPv6 con extensiones de privacidad: la segunda mitad de la dirección la rota el propio sistema
 * operativo, normalmente a diario. Y los navegadores prefieren IPv6 sobre IPv4 cuando ambas
 * están disponibles, así que una allowlist de direcciones exactas deja fuera al dueño del panel
 * en cuestión de horas — y el síntoma (401 desde su propia oficina) parece que el panel se rompió.
 *
 * Con prefijos se anota la red y no el dispositivo: `2806:2f0:6001:ed67::/64` sigue coincidiendo
 * aunque el sufijo cambie.
 *
 * Acepta por entrada: IPv4, IPv6, o cualquiera de las dos con `/bits`.
 */

/** Pasa una IP a bytes. Devuelve null si no se entiende (no se arriesga a dar acceso de más). */
export function aBytes(ip: string): Uint8Array | null {
  const limpia = ip.trim().replace(/^\[|\]$/g, "");
  if (limpia.includes(":")) return ipv6ABytes(limpia);
  return ipv4ABytes(limpia);
}

function ipv4ABytes(ip: string): Uint8Array | null {
  const partes = ip.split(".");
  if (partes.length !== 4) return null;
  const b = new Uint8Array(4);
  for (let i = 0; i < 4; i++) {
    if (!/^\d{1,3}$/.test(partes[i]!)) return null;
    const n = Number(partes[i]);
    if (n > 255) return null;
    b[i] = n;
  }
  return b;
}

function ipv6ABytes(ip: string): Uint8Array | null {
  // IPv4 embebido ("::ffff:189.203.137.208"): se normaliza a los últimos 4 bytes.
  let cola: Uint8Array | null = null;
  let texto = ip;
  const m = texto.match(/(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (m) {
    cola = ipv4ABytes(m[1]!);
    if (!cola) return null;
    texto = texto.slice(0, m.index);
  }

  const dobles = texto.split("::");
  if (dobles.length > 2) return null;
  const trozo = (s: string) => (s ? s.split(":").filter((x) => x !== "") : []);
  const izq = trozo(dobles[0] ?? "");
  const der = dobles.length === 2 ? trozo(dobles[1] ?? "") : [];
  const grupos = izq.length + der.length + (cola ? 2 : 0);
  if (dobles.length === 1 && grupos !== 8) return null;
  if (grupos > 8) return null;

  const b = new Uint8Array(16);
  let i = 0;
  const escribir = (g: string): boolean => {
    if (!/^[0-9a-fA-F]{1,4}$/.test(g)) return false;
    const n = parseInt(g, 16);
    b[i++] = n >> 8;
    b[i++] = n & 0xff;
    return true;
  };
  for (const g of izq) if (!escribir(g)) return null;
  i = 16 - (der.length * 2 + (cola ? 4 : 0));
  for (const g of der) if (!escribir(g)) return null;
  if (cola) b.set(cola, 12);
  return b;
}

/** ¿La IP cae dentro de la entrada (exacta o `red/bits`)? */
export function coincide(ip: string, entrada: string): boolean {
  const [red, bitsTxt] = entrada.trim().split("/");
  const a = aBytes(ip);
  const b = aBytes(red ?? "");
  if (!a || !b) return false;
  // No se comparan familias distintas: una IPv4 nunca cae en un prefijo IPv6 ni al revés.
  if (a.length !== b.length) return false;

  const bits = bitsTxt === undefined ? a.length * 8 : Number(bitsTxt);
  if (!Number.isInteger(bits) || bits < 0 || bits > a.length * 8) return false;

  const bytesEnteros = Math.floor(bits / 8);
  for (let i = 0; i < bytesEnteros; i++) if (a[i] !== b[i]) return false;
  const sobran = bits % 8;
  if (sobran === 0) return true;
  const mascara = 0xff << (8 - sobran);
  return (a[bytesEnteros]! & mascara) === (b[bytesEnteros]! & mascara);
}

/**
 * ¿Está permitida esta IP? Una lista vacía significa allowlist desactivada (todo pasa), que es
 * el estado por defecto: encenderla sin querer dejaría el panel inaccesible.
 */
export function permitida(ip: string, listaCruda: string | undefined | null): boolean {
  const lista = (listaCruda ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (lista.length === 0) return true;
  return lista.some((e) => coincide(ip, e));
}
