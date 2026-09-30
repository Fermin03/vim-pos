// Nombres con los que se puede llegar legítimamente a esta máquina (gateway y ui-server).
//
// Auditoría integral 30/09/2026, D3 — DNS rebinding. Una página web cualquiera abierta en el
// navegador de la caja puede hacer que su propio dominio (evil.example) resuelva a 127.0.0.1: a
// partir de ahí el navegador la trata como mismo origen, y Origin y Host coinciden entre sí
// (ambos dicen evil.example). Comparar Origin con Host, como se hacía, no distingue nada. Lo que el
// atacante NO puede cambiar es que el Host diga SU dominio: basta con aceptar solo los nombres que
// esta máquina reconoce como suyos.
//
// Válidos: loopback, las IP propias (LAN, para la cocina y la 2ª caja), el nombre de equipo de
// Windows (y su variante .local), y lo que diga VIM_HOSTS_PERMITIDOS (separado por comas) para una
// red donde la caja se alcance por un nombre DNS propio.
import os from "node:os";

const FIJOS = ["localhost", "127.0.0.1", "[::1]", "::1"];

/** Conjunto de hostnames (en minúsculas) que cuentan como "esta máquina". */
export function hostsPropios({ interfaces = os.networkInterfaces(), nombreEquipo = os.hostname(), extra = process.env.VIM_HOSTS_PERMITIDOS } = {}) {
  const hosts = new Set(FIJOS);
  for (const ifs of Object.values(interfaces ?? {})) {
    for (const i of ifs ?? []) {
      if (!i?.address) continue;
      if (i.family === "IPv4" || i.family === 4) hosts.add(i.address);
      else hosts.add(`[${i.address.split("%")[0].toLowerCase()}]`);
    }
  }
  const n = String(nombreEquipo ?? "").trim().toLowerCase();
  if (n) { hosts.add(n); hosts.add(`${n}.local`); }
  for (const h of String(extra ?? "").split(",")) if (h.trim()) hosts.add(h.trim().toLowerCase());
  return hosts;
}

// La IP de LAN puede cambiar (DHCP) sin reiniciar la caja, así que se recalcula, pero con una
// caché corta: esto corre en cada petición y no hace falta preguntarle al SO cada vez.
let cache = { at: 0, hosts: new Set() };
export function hostsPropiosCacheados() {
  if (Date.now() - cache.at > 60_000) cache = { at: Date.now(), hosts: hostsPropios() };
  return cache.hosts;
}

/** Hostname (minúsculas, IPv6 entre corchetes) de una cabecera Host, o null si es ilegible. */
export function hostnameDe(hostHeader) {
  try { return new URL(`http://${hostHeader}`).hostname.toLowerCase(); } catch { return null; }
}

/**
 * ¿La cabecera Host de esta petición nombra a esta máquina? Sin Host se acepta: no hay navegador
 * que lo omita (y el rebinding necesita un navegador); los clientes sin Host son procesos locales.
 */
export function hostPermitido(hostHeader, hosts = hostsPropiosCacheados()) {
  if (hostHeader === undefined || hostHeader === "") return true;
  const h = hostnameDe(hostHeader);
  return h !== null && hosts.has(h);
}
