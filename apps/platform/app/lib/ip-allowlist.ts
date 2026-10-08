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
 *
 * El análisis de direcciones y la máscara los hace `node:net` (`isIP`, `BlockList`). Antes iban a
 * mano y aceptaban cosas que no son direcciones: `:::` pasaba por `::`, y `01.2.3.4` por `1.2.3.4`.
 */
import { BlockList, isIP } from "node:net";

const sinCorchetes = (s: string) => s.trim().replace(/^\[|\]$/g, "");

/** ¿La IP cae dentro de la entrada (exacta o `red/bits`)? Lo que no se entiende, no coincide. */
export function coincide(ip: string, entrada: string): boolean {
  const limpia = sinCorchetes(ip);
  const [redCruda = "", bitsTxt] = entrada.trim().split("/");
  const red = sinCorchetes(redCruda);
  // Con identificador de zona ("fe80::1%eth0") no se acepta: `isIP` lo da por válido, y aquí lo
  // dudoso se rechaza.
  if (limpia.includes("%") || red.includes("%")) return false;
  const familia = isIP(limpia);
  // No se comparan familias distintas: una IPv4 nunca cae en un prefijo IPv6 ni al revés.
  if (familia === 0 || isIP(red) !== familia) return false;
  const tipo = familia === 4 ? "ipv4" : "ipv6";
  const max = familia === 4 ? 32 : 128;
  const bits = bitsTxt === undefined ? max : Number(bitsTxt);
  if (!Number.isInteger(bits) || bits < 0 || bits > max) return false;
  const lista = new BlockList();
  lista.addSubnet(red, bits, tipo);
  return lista.check(limpia, tipo);
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
