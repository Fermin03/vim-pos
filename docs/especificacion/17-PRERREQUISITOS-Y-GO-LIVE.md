# 17 — PRERREQUISITOS Y GO-LIVE — VIM POS

> **Versión:** v1.0
> **Fecha:** Mayo 2026
> **Propietario:** Fermín — VIM Marketing
> **Documento:** lista accionable de cuentas, datos y hardware que hay que conseguir/decidir. No es arquitectura; es el "qué reunir" antes de codear y antes del go-live del piloto.
> **Depende de:** todo el set 00–16

---

## 0. Cómo leer este documento

Cada ítem está marcado con cuándo **bloquea**:

- 🟥 **DEV** — se necesita para empezar a programar.
- 🟦 **GO-LIVE** — se necesita para que Knock-Out opere de verdad (no para programar).
- 🟩 **FASE 2/3** — más adelante.

Así puedes conseguir los 🟦/🟩 en paralelo mientras avanzamos el desarrollo con los 🟥.

---

## 1. Cuentas y servicios (las crea Fermín)

| Servicio | Para qué | Bloquea | Notas |
|---|---|---|---|
| **GitHub** (repo privado) | Código del monorepo | 🟥 DEV | Repo `vim-pos` |
| **Supabase** (proyecto) | BD, Auth, Storage, Realtime, Edge Functions | 🟥 DEV | **Decidir región** (afecta LFPDPPP §C.6; elegir la más cercana a MX, ej. `us-east`). Plan **Pro** (~$25 USD) para backups diarios |
| **Vercel** | Hosting de `admin` (y previews) | 🟥 DEV (pronto) | Conectar al repo |
| **Cloudflare R2** | Backups `pg_dump` (doc 15 §A) | 🟦 GO-LIVE | Bucket + API token; barato |
| **Sentry** | Error tracking (doc 15 §B) | 🟦 GO-LIVE | Free tier alcanza |
| **Facturama** (API **Multiemisor**) | Timbrado CFDI (doc 13) | 🟦 GO-LIVE | Módulo API $1,650/año + bolsa de folios $0.50 c/u. Solo si Knock-Out facturará desde día 1 |
| **Stripe** | Cobro de suscripciones a tenants | 🟩 FASE 3 | El cobro a clientes comerciales; Knock-Out es INTERNO |
| **WhatsApp Business API** | Recordatorios Reservaciones Pro (G10) | 🟩 FASE 2 | Solo si se activa el add-on |

---

## 2. Datos del piloto (se reúnen de Knock-Out)

| Dato | Para qué | Bloquea | Notas |
|---|---|---|---|
| **Menú real**: productos, precios, categorías, modificadores | Catálogo (onboarding Fase 4, doc 10) | 🟦 GO-LIVE | El más laborioso de juntar. Plantilla CSV ya existe (P-034/035) |
| **Áreas de cocina** | Routing de comandas (doc 14/16) | 🟦 GO-LIVE | Knock-Out: probablemente "Cocina (una sola)" |
| **Usuarios + roles + PINs** | Acceso operativo (doc 09) | 🟦 GO-LIVE | Dueño, cajeros, cocina |
| **Datos del negocio**: nombre, logo, dirección, horario | Identidad (P-016/162) | 🟦 GO-LIVE | Nombre canónico: "Knock-Out Burger", sucursal "León Centro" |
| **Datos fiscales**: RFC, régimen, CP fiscal, razón social | CFDI (doc 10 Fase 1) | 🟦 GO-LIVE (si factura) | — |
| **CSD del SAT**: `.cer` + `.key` + contraseña | Timbrar a su RFC (doc 13 §7) | 🟦 GO-LIVE (si factura) | Se registra en Facturama Multiemisor; nunca se guarda en claro |
| **Día contable / hora de cierre** | Turnos (D7) | 🟦 GO-LIVE | Default 03:00–04:00 |

---

## 3. Hardware (Knock-Out / compra)

| Pieza | Recomendado | Bloquea | Notas |
|---|---|---|---|
| **Tablet POS** | Android 12+ con Chrome, 10" | 🟥 DEV (1 para el esqueleto) / 🟦 GO-LIVE (las de operación) | Android habilita red+USB+BT (doc 16 D132) |
| **Impresora de caja** | Epson TM-m30III (80mm, ePOS/red) | 🟦 GO-LIVE | Probar **temprano** con el esqueleto andante |
| **Impresora de cocina** | Epson TM-m30III o TM-U220 (impacto) | 🟦 GO-LIVE | La de impacto aguanta mejor el calor/grasa |
| **Cajón de efectivo** | Compatible RJ11/RJ12 Epson | 🟦 GO-LIVE | Se abre por la impresora |
| **Red local** | Router estable | 🟦 GO-LIVE | La impresora de red lo necesita |

> **Recomendación fuerte:** consigue **1 tablet Android + 1 impresora Epson** cuanto antes para validar impresión en el **esqueleto andante** (doc siguiente / fase c). La impresión es el riesgo #1; probarla temprano lo neutraliza.

---

## 4. Legal / negocio

| Ítem | Bloquea | Notas |
|---|---|---|
| **Aviso de privacidad de VIM** | 🟦 GO-LIVE | Doc 15 §C.2 |
| **Plantilla de aviso de privacidad** para el tenant | 🟦 GO-LIVE | VIM la provee; el aviso es del tenant |
| **Contrato VIM = encargado / tenant = responsable** | 🟦 GO-LIVE | Doc 15 §C.1 (G11). Para Knock-Out interno, mínimo |
| **Decisión de región de datos** | 🟥 DEV | Se fija al crear Supabase |

---

## 5. Lo mínimo para EMPEZAR A CODEAR (🟥)

Solo esto bloquea el arranque de desarrollo:

1. **Repo GitHub** `vim-pos`.
2. **Proyecto Supabase** (Pro, región decidida).
3. **Vercel** conectado (puede esperar a la primera pantalla de `admin`).
4. **1 tablet Android** (para el esqueleto andante; ideal con 1 impresora Epson para validar impresión pronto).

Todo lo demás (Facturama, CSD, menú, R2, Sentry, resto de hardware, legal) es **🟦 GO-LIVE** y se reúne en paralelo, sin frenar el desarrollo.

---

## 6. Secuencia sugerida

```
Hoy:        crear GitHub + Supabase (región) + conseguir 1 tablet Android
En paralelo: pedir impresora Epson, juntar menú de Knock-Out, tramitar CSD
Semana 1:   esqueleto andante (auth + 1 venta + RLS) en la tablet  ← valida arquitectura
Cuando llegue la impresora: validar impresión real con el esqueleto
Antes de go-live: cargar menú/usuarios/fiscales, conectar Facturama, R2+Sentry, legal
```

---

## Changelog

| Versión | Fecha | Cambios |
|---|---|---|
| v1.0 | Mayo 2026 | Runbook inicial de prerrequisitos: cuentas/servicios, datos del piloto, hardware, legal. Marcado 🟥 DEV / 🟦 GO-LIVE / 🟩 FASE. Define el mínimo para empezar a codear y la secuencia sugerida. |
