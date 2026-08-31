# 0002 — El precio lo fija el tamaño del paquete, no la vertical

**Fecha:** agosto de 2026 (migración `0086_planes_por_paquete.sql`) · **Estado:** vigente

## Qué decía el plan

`00-PLAN-MAESTRO-VIM-POS.md` cobra por vertical:

| Vertical | Código | Precio |
|---|---|---|
| Quick Service | QS | 999 |
| Café & Bar | CB | 999 |
| Full Service | FS | 1,299 |

## Qué hacemos ahora

Tres escalones por **tamaño**, iguales para cualquier vertical: **Esencial · Negocio · Cadena**.
La vertical dejó de determinar el precio; `planes.vertical` es nullable y los seis planes por
vertical se retiraron.

## Por qué

Cobrarle más a un restaurante de servicio a mesa que a uno de mostrador no se sostiene cuando
usan el mismo software: la diferencia de costo para nosotros es cero. Lo que sí escala el costo
es el tamaño — sucursales, cajas, folios.

## Consecuencias

- El plan maestro **está desactualizado en su tabla de precios y en la de márgenes** (§ de
  proyección financiera). No se editó; este ADR lo supera.
- Knock-Out sigue en el plan FS de $1,299 mientras Negocio cuesta $999. Migrarlo es una decisión
  comercial pendiente, no técnica.
