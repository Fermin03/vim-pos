# 15 — OPERACIÓN, SEGURIDAD Y CUMPLIMIENTO — VIM POS

> **Versión:** v1.0
> **Fecha:** Mayo 2026
> **Propietario:** Fermín — VIM Marketing
> **Documento:** políticas transversales de operación que no son un subsistema pero deben quedar definidas: respaldos y recuperación (DR), observabilidad, y protección de datos (LFPDPPP).
> **Depende de:** 07-1A (auditoría, RLS), 07-1F (service_role, secretos), 12 (plataforma), 13 (CFDI/Facturama)
> **Stack:** Supabase Pro + Cloudflare R2 (backups) · Sentry (errores) · Supabase/Vercel logs

---

## 📋 Tabla de contenidos

- [0. Propósito](#0-propósito)
- [Parte A — Respaldos y recuperación (DR)](#parte-a--respaldos-y-recuperación-dr)
- [Parte B — Observabilidad](#parte-b--observabilidad)
- [Parte C — Protección de datos (LFPDPPP)](#parte-c--protección-de-datos-lfpdppp)
- [Decisiones de diseño (D120–D130)](#decisiones-de-diseño-d120d130)
- [Checklist de validación](#checklist-de-validación)
- [Changelog](#changelog)

---

## 0. Propósito

Estas tres áreas no son subsistemas con esquema propio, pero un POS que maneja **dinero y datos fiscales** no puede ignorarlas. Este documento fija las políticas: cómo se protege la información (backups), cómo se sabe que el sistema funciona (observabilidad), y cómo se cumple la ley mexicana de datos (LFPDPPP). Son decisiones de **ahora**, con implementación **incremental**.

---

# Parte A — Respaldos y recuperación (DR)

## A.1 Estrategia (capas)

> **D120 — Defensa de respaldo en tres capas, PITR diferido a Fase 2.**

| Capa | Qué | Costo | RPO |
|---|---|---|---|
| 1 | **Respaldos diarios** automáticos de Supabase Pro (retención 7 días) | incluido | ~24 h |
| 2 | **`pg_dump` cada 6 h** a Cloudflare R2 (off-platform, retención 30 días) | ~$0–2 USD/mes | **~6 h** |
| 3 | **PITR** (recuperación a punto exacto) — **Fase 2**, cuando haya tenants pagando | ~$100 USD/mes | minutos |

El RPO objetivo en MVP es **~6 h**, y en la práctica menor gracias a las dos redes de seguridad naturales (A.3).

## A.2 El `pg_dump` programado

```sql
-- pg_cron invoca una Edge Function que hace pg_dump y sube a R2
SELECT cron.schedule(
  'backup-pgdump-6h',
  '0 */6 * * *',
  $$ SELECT net.http_post(url := 'https://<proj>.supabase.co/functions/v1/backup-runner', ...); $$
);
```

- La Edge Function `backup-runner` ejecuta el dump lógico y lo sube a un bucket R2 con nombre `vimpos-YYYYMMDD-HHMM.dump`.
- **Off-platform a propósito:** una copia fuera de Supabase protege incluso ante un problema de la cuenta de Supabase, no solo de la BD.
- Retención: 30 días (rotación automática de los más viejos).
- **Supabase Storage** (XML/PDF de CFDI, logos): se sincroniza a R2 con la misma corrida (o se confía en la copia de Facturama para CFDI, ver A.3).

## A.3 Redes de seguridad naturales (gratis)

1. **CFDI duplicado en Facturama:** los XML timbrados se re-descargan del PAC. El dato fiscal más crítico ya está fuera de la BD. **D121.**
2. **Offline-first:** cada tablet guarda en Dexie su operación reciente. Si el servidor fallara, los tickets en vuelo siguen en los dispositivos y re-sincronizan.

## A.4 Restauración (runbook resumido)

```
Incidente de pérdida de datos:
1. Evaluar alcance (¿tabla, esquema, BD completa?)
2. Fuente de restauración:
   - < 24 h y daño en Supabase  → respaldo diario de Pro
   - punto intermedio (≤6 h)     → último pg_dump de R2 (pg_restore)
   - (Fase 2) punto exacto       → PITR
3. Reconciliar el delta con: CFDI de Facturama + colas Dexie de los dispositivos
4. Verificar integridad (cierres Z, folios, totales) antes de reanudar
```

- **RTO objetivo:** reanudar operación en **< 4 h** ante un incidente mayor.
- El runbook completo (comandos exactos) vive en `GUÍA DE DESARROLLO` cuando se implemente.

## A.5 Gatillo de activación de PITR

PITR se activa cuando se cumpla **lo primero de:** (a) 3+ tenants pagando, o (b) un tenant supere ~1,000 tickets/día. A partir de ahí el RPO de 6 h ya no es aceptable para datos de terceros. **D122.**

---

# Parte B — Observabilidad

## B.1 Qué se observa (tres planos)

> **D123 — Tres planos: errores (Sentry), logs (plataforma), negocio (auditoría + métricas).**

| Plano | Herramienta | Qué |
|---|---|---|
| **Errores** | **Sentry** (free tier) | Excepciones en `pos`/`admin`/`platform` + Edge Functions, con stack trace y tenant |
| **Logs** | Supabase Logs + Vercel Logs | DB, Auth, Edge Functions, requests |
| **Negocio** | `auditoria_eventos` (1A §7) + métricas | Quién hizo qué; KPIs operativos (doc 1E) |

## B.2 Sentry

- Un proyecto Sentry por app (`pos`, `admin`, `platform`) + Edge Functions.
- Cada error se etiqueta con `tenant_id` (sin datos personales en el payload) para aislar incidentes por cliente.
- Free tier alcanza para MVP/Fase 2; se evalúa plan pagado al crecer el volumen.

## B.3 Alertas críticas

Las que **despiertan a Fermín** (canal: email/WhatsApp/Slack):

| Alerta | Origen | Por qué importa |
|---|---|---|
| **Timbrado permanente fallido** | `tickets_cfdi.error_es_permanente` (doc 13) | El cliente no puede facturar |
| **CSD por vencer (30 días)** | `tenant_cfdi_emisor.csd_vigencia_hasta` (doc 13 §7) | Un CSD vencido tumba todo el timbrado |
| **Cola CFDI atascada** | `cfdi-worker` sin drenar > N min | Facturas detenidas |
| **Conflictos de sync acumulándose** | `sync_conflictos` PENDIENTE (1C.2 §10) | Datos offline sin conciliar |
| **Pago Stripe fallido** | webhook (Fase 3+) | Tenant en riesgo de suspensión |
| **Backup falló** | `backup-runner` sin éxito | Se pierde la red de respaldo |
| **BD cerca de límite de tier** | Supabase | Riesgo de degradación/corte |

## B.4 Uptime

- Monitor externo simple (ej. UptimeRobot free) a un endpoint de health de `admin` y al PAC. **D124.**

## B.5 La auditoría ya es observabilidad de negocio

`auditoria_eventos` (1A §7) registra cada acción sensible (cancelaciones, descuentos, aperturas de cajón, accesos super-admin). No hace falta una herramienta extra para el "quién hizo qué": ya está en el esquema y se consulta desde `admin`/`platform`. **D125.**

---

# Parte C — Protección de datos (LFPDPPP)

> Ley Federal de Protección de Datos Personales en Posesión de los Particulares (México).

## C.1 Roles: quién es responsable de qué

> **D126 — Cada tenant es el RESPONSABLE de los datos de SUS clientes; VIM es el ENCARGADO (procesador).**

- **Responsable (controller):** el negocio (tenant). Es dueño de la relación con sus clientes finales y de sus datos (nombre, RFC, dirección de entrega).
- **Encargado (processor):** VIM POS. Procesa esos datos **por cuenta** del tenant, según sus instrucciones, sin usarlos para fines propios.
- Esto se refleja en el **contrato de servicio** (VIM como encargado) y limita la responsabilidad de VIM a las medidas de seguridad y al tratamiento autorizado.

## C.2 Aviso de privacidad

- **VIM** mantiene su propio aviso de privacidad (para los datos de sus tenants: dueños, usuarios). **D127.**
- **Cada tenant** necesita un aviso de privacidad para sus clientes finales. **VIM provee una plantilla** editable en el onboarding (doc 10), pero el aviso es responsabilidad del tenant.

## C.3 Retención y derechos ARCO

Derechos ARCO: **A**cceso, **R**ectificación, **C**ancelación, **O**posición.

| Tipo de dato | Retención | Cancelación (borrado) |
|---|---|---|
| **Fiscal / CFDI** | **5 años** (obligación SAT) | **Exento** — no se borra aunque lo pidan; obligación legal de conservar |
| **CRM del cliente** (nombre, contacto, direcciones) | Mientras la relación esté activa | Sí, vía anonimización (C.4) |
| **Datos del repartidor** | Relación laboral + plazos legales | Según normativa laboral |

> **D128 — La obligación fiscal (5 años) prevalece sobre el derecho de cancelación.** Un CFDI o ticket ligado a factura NO se borra; se conserva por ley.

## C.4 Cómo se "borra" sin romper la traza fiscal

El esquema usa **soft delete** (D5) y trazabilidad total. Para una solicitud ARCO de cancelación:

- Si el dato **no** está ligado a un CFDI → soft delete normal.
- Si **sí** lo está → **anonimización**: se reemplazan los campos personales (nombre, teléfono, dirección) por valores neutros, conservando el registro fiscal (monto, folio, fecha) que la ley obliga a guardar. **D129.**
- Toda solicitud ARCO y su resolución se registran en `auditoria_eventos`.

## C.5 Medidas de seguridad (ya en la arquitectura)

LFPDPPP exige "medidas de seguridad". VIM POS ya las tiene por diseño:

- **Aislamiento por tenant:** RLS en todas las tablas (D2) + defensa en profundidad (1A §1.2).
- **Cifrado en reposo:** Supabase cifra la BD y Storage por default.
- **Cifrado en tránsito:** HTTPS/TLS en todo.
- **PINs hasheados** con bcrypt (D9); **CSD nunca en claro** (D112); **service_role** solo en servidor (D82).
- **Auditoría** de accesos y acciones sensibles (1A §7), incluida la impersonación de soporte (doc 12 §9.2).

## C.6 Residencia y transferencia de datos

- Los datos viven en la región de Supabase elegida (se documenta cuál). LFPDPPP no exige residencia en México, pero la **transferencia internacional se divulga** en el aviso de privacidad. **D130.**

---

## Decisiones de diseño (D120–D130)

| # | Decisión | Justificación |
|---|---|---|
| **D120** | Backup en 3 capas (diario Pro + `pg_dump` 6 h a R2 + PITR Fase 2) | Mejor RPO casi gratis; PITR cuando el riesgo de terceros lo justifique |
| **D121** | CFDI en Facturama y datos offline en dispositivos cuentan como redundancia | Reduce el RPO efectivo sin costo |
| **D122** | PITR se activa con 3+ tenants pagando o >1,000 tickets/día | Umbral objetivo, no fecha |
| **D123** | Observabilidad en 3 planos: Sentry, logs de plataforma, auditoría/negocio | Cubre técnico y de negocio sin sobre-ingeniería |
| **D124** | Uptime con monitor externo simple (free) | Detectar caídas sin infra propia |
| **D125** | `auditoria_eventos` ES la observabilidad de negocio | Ya en el esquema; no duplicar herramientas |
| **D126** | Tenant = responsable; VIM = encargado de datos | Marco legal correcto; acota responsabilidad de VIM |
| **D127** | VIM tiene su aviso de privacidad; provee plantilla al tenant | Cada quien cumple su parte |
| **D128** | Obligación fiscal (5 años) prevalece sobre el derecho de cancelación | Conflicto resuelto a favor de la ley fiscal |
| **D129** | Borrado de dato ligado a CFDI = anonimización, no hard delete | Cumple ARCO sin romper la traza fiscal |
| **D130** | Transferencia internacional de datos se divulga en el aviso | Cumplimiento LFPDPPP de transferencia |

---

## Checklist de validación

**Backups/DR:**
- [ ] Respaldos diarios de Supabase Pro activos (retención 7 días)
- [ ] Edge Function `backup-runner` + `pg_cron` cada 6 h subiendo a R2 (retención 30 días)
- [ ] Storage (CFDI/logos) respaldado o cubierto por copia de Facturama
- [ ] Runbook de restauración probado al menos una vez (restaurar un dump en local)
- [ ] Alerta si `backup-runner` falla
- [ ] Documentado el gatillo de PITR (3+ tenants o >1,000 tickets/día)

**Observabilidad:**
- [ ] Sentry en `pos`/`admin`/`platform` + Edge Functions, etiquetado por `tenant_id`
- [ ] Alertas críticas configuradas (timbrado permanente, CSD por vencer, cola CFDI, sync, pago, backup, límites)
- [ ] Monitor de uptime externo a health de `admin` y al PAC

**LFPDPPP:**
- [ ] Aviso de privacidad de VIM publicado
- [ ] Plantilla de aviso de privacidad para tenants en el onboarding
- [ ] Contrato VIM = encargado / tenant = responsable
- [ ] Flujo ARCO: anonimización para datos ligados a CFDI; soft delete para el resto; registro en auditoría
- [ ] Retención fiscal de 5 años garantizada (no borrable)
- [ ] Transferencia internacional divulgada en el aviso

---

## Changelog

| Versión | Fecha | Cambios |
|---|---|---|
| v1.0 | Mayo 2026 | Documento inicial. Cierra el bucket operacional: (A) backups en 3 capas con `pg_dump` 6h a R2 y PITR diferido; (B) observabilidad con Sentry + alertas críticas + auditoría como observabilidad de negocio; (C) LFPDPPP con marco responsable/encargado, retención fiscal 5 años sobre ARCO, anonimización, y medidas de seguridad ya en la arquitectura. Decisiones D120–D130. |
