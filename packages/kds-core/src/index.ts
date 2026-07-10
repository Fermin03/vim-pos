// @vim/kds-core — lógica y UI de la pantalla de cocina, compartida entre el POS (modo cocina) y
// la app dedicada apps/kds. La caja/cocina lee y avanza comandas con la sesión de DISPOSITIVO
// (sin PIN); el endpoint del backend se resuelve de window.__VIM_SUPABASE_URL (hub local o remoto).
export { PantallaKds } from "./pantalla-kds";
export { VincularDispositivo } from "./vincular-dispositivo";
export {
  deviceClient,
  deviceSignIn,
  deviceEmail,
  deviceSignOut,
  deviceToken,
  cajaIdFromEmail,
  clienteConToken,
} from "./cliente";
export { leerCreds, guardarCreds, olvidarCreds, CREDS_DEV_FIXTURE, type DeviceCreds } from "./device-creds";
export { leerCaja, type CajaKds } from "./caja";
export {
  leerComandas,
  avanzarCocina,
  cerrarComanda,
  labelModo,
  siguienteEstado,
  minutosEnCocina,
  type ComandaKds,
  type ItemComanda,
  type EstadoCocina,
} from "./comandas";
export { areasDeComandas, comandasNuevas, SIN_AREA } from "./estado";
