# 0033 — El cobro con terminal lo aplica la caja, y los tokens del restaurante viven en Vault

**Fecha:** 9 de octubre de 2026 · **Estado:** vigente (en construcción)

## Qué había antes

La tarjeta se cobraba en una terminal aparte y el cajero registraba el pago a mano en VIM. La
terminal integrada estaba pospuesta desde el 3 de septiembre.

## Qué hacemos ahora

La caja le manda el monto a una Mercado Pago Point y el resultado regresa solo al ticket. El estudio
completo está en [`docs/integraciones/mercado-pago-point/`](../integraciones/mercado-pago-point/README.md);
aquí van solo las decisiones que no son obvias leyendo el código.

- **VIM es el integrador.** Una sola aplicación de Mercado Pago, de VIM. El restaurante autoriza su
  cuenta desde el admin (OAuth) y no captura credenciales. Va incluido en todos los paquetes.
- **La nube dice «aprobado»; el pago lo aplica la caja.** El ticket de una caja instalada vive en su
  Postgres y puede no haber subido cuando se cobra. Por eso `terminal_cobros.ticket_id` no tiene
  llave foránea y es el POS quien llama a `aplicar_pago`, como con cualquier otro método. Al abrir
  sesión, la caja pregunta por cobros aprobados sin aplicar y los termina.
- **El id del cobro lo genera la caja** y es a la vez la `external_reference` y la llave de
  idempotencia en Mercado Pago. El aviso encuentra el cobro por esa referencia, no por la cuenta.
- **Los tokens del restaurante van cifrados en Vault**, no en una tabla. Permiten cobrar y devolver
  dinero en su cuenta: es el dato más delicado de la integración. Solo `service_role` los alcanza,
  por `terminal_guardar_tokens` / `terminal_leer_tokens`.
- **Lo que pasó en la terminal gana.** Un cobro aprobado no se revierte por un aviso que llegó tarde
  (un cancelado, un vencido). De aprobado solo se pasa a devuelto.
- **Un estado desconocido es «mira la terminal»**, nunca aprobado ni rechazado. Aceptar a mano un
  cobro dudoso pide PIN de encargado.
- **Las coordenadas de la sucursal** las pide el admin al conectar (Mercado Pago las exige) y se
  guardan en `terminal_config_sucursal`, no en `sucursales`, para no tocar lo que sincroniza la caja.
- **El registro manual de tarjeta se queda** como segunda opción: sin internet, o sin terminal, el
  ticket nunca se atora.

## Por qué

**No hay interfaz de «proveedor de terminal».** El diseño proponía una para que Clip entrara sin
tocar la caja. Con un solo proveedor sería una abstracción sin segundo caso: se extrae cuando
llegue Clip, con dos implementaciones reales delante.

**Los avisos no se deduplican.** Aplicar dos veces el mismo aviso deja el cobro igual, así que la
bitácora (`terminal_eventos`) es solo para diagnóstico.

**Una sola URL de avisos para prueba y producción.** Cada aviso trae de qué cobro es; uno que no
corresponde a ningún cobro nuestro se guarda y se ignora.

## Consecuencias

- La migración `0169` corre también en el Postgres de la caja, que no tiene Vault: las funciones de
  tokens fallan ahí con `VAULT_NO_DISPONIBLE` y nunca se llaman.
- El cobro integrado necesita internet en la caja y en la terminal.
- Lo verificado contra Mercado Pago (y lo que no) está marcado en
  `supabase/functions/_shared/terminal/mercado-pago.ts`.
