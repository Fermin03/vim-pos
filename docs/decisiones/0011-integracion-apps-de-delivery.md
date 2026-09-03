# 0011 — Integración con apps de delivery: VIM es el integrador

**Fecha:** 2026-09-02 · **Estado:** vigente

## Qué decía el plan

Dark Kitchen §5 y §17: captura manual del pedido en MVP; "arquitectura preparada" para una
integración API futura sin decir cómo se conectaría el comercio ni dónde vivirían las
credenciales. 1C.2 §8: conciliación por CSV con `ingesta_metodo 'API'` reservado para Fase 5.

## Qué hacemos ahora

1. **VIM registra una sola aplicación por plataforma** (Uber Eats, DiDi Food, Rappi). Sus
   credenciales son de VIM y viven en secrets de Supabase; el comercio nunca captura
   credenciales: **autoriza su tienda** (OAuth en Uber/Rappi, URL de autorización en DiDi).
   La pantalla del admin y la Edge Function que lo hacen para Uber están en el spec
   `docs/superpowers/specs/2026-09-02-delivery-f1b-conectar-uber-design.md` (F1b).
2. Tablas nuevas con RLS: `delivery_conexiones` (sucursal × app), `delivery_pedidos` (pedido crudo
   y normalizado, independiente del ticket), `delivery_eventos` (bitácora de webhooks y llamadas),
   `delivery_credenciales_app` (token de aplicación cacheado, solo service_role).
3. Los pedidos entran por Edge Functions públicas que validan la firma de cada app; el ticket lo
   crea `crear_ticket_desde_app` (SECURITY DEFINER, solo service_role) en la caja con turno
   abierto, con `origen_creacion = 'API_EXTERNA'`, `modo_servicio = APP_*`, `folio_externo_app` y
   pago `metodo_pago = APP_*` por el total del ticket.
4. **Auto-aceptar es el modo por defecto** (Rappi da 4 minutos); el cajero puede rechazar dentro
   de la ventana y marcar listo. El precio del ítem en el ticket es el que pagó el cliente en la app.
5. El identificador que se manda a las apps es el `uuid` de VIM (`productos.id`,
   `opciones_modificador.id`): no hay tabla de mapeo.
6. Orden: Uber (sandbox autoservicio) → DiDi → Rappi. La primera fase solo cubre Uber.
7. **El ticket se crea donde está la cocina** (3 sep 2026, spec
   `docs/superpowers/specs/2026-09-03-delivery-espejo-escritorio-design.md`). Si una caja
   instalada de la sucursal está viva (latido `cajas.espejo_apps_at` < 90 s), el pedido se gestiona
   en ESCRITORIO: la nube no crea ticket; el agente de la caja espeja el pedido en su base local,
   crea el ticket ahí (folio local, KDS, comanda) y acepta en Uber vía `delivery-accion`. Si no hay
   caja instalada viva, se gestiona en NUBE como el POS web. La fuente de verdad del pedido sigue
   siendo la nube; el ticket sube con el push y se enlaza por `folio_externo_app`.

## Por qué

Es el modelo que exigen las tres plataformas (una app del POS, N tiendas). Guardar credenciales
por tenant sería inseguro e innecesario. Separar `delivery_pedidos` del ticket permite recibir
aunque no haya turno y auditar contra la app.

## Consecuencias

- El POS de escritorio no recibe webhooks: en F1 el flujo es nube; el espejo a la caja local es F1b.
- Comisiones y ajustes no están en el ticket; se conocen en la conciliación (F5).
- Un pedido con un producto que no existe en VIM se acepta con el "producto genérico de apps"
  configurado en la conexión; si no hay genérico, queda RECIBIDO y el cajero decide.
- Documentación completa de las tres APIs y el diseño en `docs/integraciones/delivery/`.
