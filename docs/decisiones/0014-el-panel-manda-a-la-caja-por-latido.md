# 0014 — El panel manda a la caja por latido, no por Realtime ni por el pull

**Fecha:** 2026-09-04 · **Estado:** vigente

## Qué decía el plan

- **Doc 12 §9:** `apps/platform` administra tenants con `service_role` y audita en
  `super_admin_accesos`. El estado del tenant (`TRIAL`, `ACTIVO`, `SUSPENDIDO`, `CANCELADO`)
  "determina si puede operar". No dice cómo se entera el software del cliente.
- **Migración 0002 §3.7:** `tenant_feature_flags` y `planes.features_incluidos` para módulos por
  cliente; "la app lee esto al iniciar". Ninguna app lo leyó nunca.
- **ADR 0004:** el offline lo da el escritorio; la caja habla con la nube por push (cada 10
  minutos) y pull (cada hora) sobre una lista explícita de tablas.
- **Migración 0073:** la caja deja señal de vida solo cuando sube ventas; el latido honesto
  "sería el pull, pero no sabe qué caja pregunta".

## Qué hacemos ahora

1. **Un solo canal de bajada de decisiones: el latido.** En cada ciclo de sync, antes del push y
   aunque no haya nada que subir, la caja llama `caja-latido` con su versión y recibe un JSON de
   **directivas** ya resuelto en la nube: acceso (estado, bloqueo y gracia), módulos efectivos,
   límites, avisos vigentes y versión mínima/recomendada.
2. **La caja obedece, no interpreta.** No lee `tenants.estado` ni calcula gracia. Guarda el JSON
   en un archivo y el POS lo lee por el servidor local, igual que el estado del sync.
3. **El POS web y el admin reciben lo mismo** por la RPC `mi_acceso()`, bajo RLS.
4. **Toda suspensión lleva gracia.** El panel escribe `tenants.bloqueo_desde`; hasta esa fecha
   la caja avisa, a partir de ella bloquea. Cancelar puede bloquear de inmediato, con
   confirmación escrita.
5. **Sin latido no hay bloqueo.** Una caja sin red sigue con su última directiva. La venta nunca
   se detiene por falta de conexión.
6. **Los módulos tienen dos capas:** lo que VIM permite (`planes.features_incluidos` +
   `tenant_feature_flags`) y lo que el dueño enciende (`configuracion_tenant.modulo_*`). La
   directiva lleva el AND de las dos.
7. **Las versiones se publican desde el panel**, que escribe `versiones_caja` y sube el mismo
   `latest.json` de siempre al bucket. El actualizador de la caja no cambia.

## Por qué

- **Realtime** obligaría a la caja a sostener un websocket, se complica sin internet y resuelve en
  segundos algo que por diseño lleva días de gracia.
- **Montarlo en el pull** daría una hora de latencia y el pull no identifica a la caja, así que
  no serviría para reportar versión ni para el latido honesto que 0073 dejó pendiente.
- Un canal por necesidad (uno para bloqueo, otro para avisos, otro para versiones) serían tres
  formas de fallar y tres cosas que probar en cada versión del escritorio.
- Resolver las directivas en la nube y no en la caja evita que dos versiones distintas del
  escritorio interpreten distinto la misma suspensión.

## Consecuencias

- Hay hasta diez minutos entre decidir en el panel y que la caja obedezca. Aceptado.
- Cajas anteriores a 0.4.58 no laten ni bloquean; el panel las enseña como "versión anterior" y
  la entrega de versiones sirve para empujarlas a actualizar.
- `cajas.ultimo_latido` pasa a ser la primera señal del semáforo del panel; `ultima_conexion`,
  el sync y la última venta quedan como respaldo para cajas viejas.
- El desbloqueo también tarda hasta diez minutos: reactivar a un cliente no es instantáneo, y
  soporte debe decirlo así por teléfono.
- La clave compartida del panel sigue siendo el control de acceso (A8 pendiente). Lo que se
  puede hacer desde el panel crece, así que Cloudflare Access delante del panel sube de
  prioridad.

Diseño completo: `docs/superpowers/specs/2026-09-04-platform-centro-de-control-design.md`.
