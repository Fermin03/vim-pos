/**
 * Llave pública Ed25519 con la que VIM firma `latest.json`. Es la MISMA que llevan las cajas en
 * `desktop/src/updater.mjs` (una prueba comprueba que coinciden). Pública: puede vivir en el repo.
 * La privada no está aquí ni en ningún servidor: vive en la máquina que publica.
 */
export const LLAVE_PUBLICA_ACTUALIZACIONES = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAuhG8DQnYVNubeVr1xwovi9ulC9M9L3GHtuqEnZJ2tCQ=
-----END PUBLIC KEY-----
`;
