# 16 — IMPRESIÓN TÉRMICA Y CAJÓN DE EFECTIVO — VIM POS

> **Versión:** v1.0
> **Fecha:** Mayo 2026
> **Propietario:** Fermín — VIM Marketing
> **Documento:** estrategia de impresión térmica (ticket, comanda, reportes) y apertura de cajón. Cierra el último hueco técnico real antes de desarrollo.
> **Depende de:** mockups de impresión P-222–P-228 (referencia visual), 1C.2 §9 (comanda), 14 (áreas de cocina), 10 §setup (config de impresión P-042/P-174)
> **Stack:** PWA (Android + Chrome) en MVP → Capacitor en Fase 3 · ESC/POS · Epson ePOS-Print

---

## 📋 Tabla de contenidos

- [0. Propósito y decisión base](#0-propósito-y-decisión-base)
- [1. Lo que NO hacemos: imprimir el HTML](#1-lo-que-no-hacemos-imprimir-el-html)
- [2. El modelo lógico de print job](#2-el-modelo-lógico-de-print-job)
- [3. La abstracción `PrinterAdapter`](#3-la-abstracción-printeradapter)
- [4. Rutas de transporte (red / USB / BT / nativo)](#4-rutas-de-transporte-red--usb--bt--nativo)
- [5. Multi-impresora: caja vs cocina](#5-multi-impresora-caja-vs-cocina)
- [6. Cajón de efectivo](#6-cajón-de-efectivo)
- [7. Manejo de fallos y reimpresión](#7-manejo-de-fallos-y-reimpresión)
- [8. Configuración por sucursal/caja](#8-configuración-por-sucursalcaja)
- [9. Hardware recomendado](#9-hardware-recomendado)
- [10. Decisiones de diseño (D132–D140)](#10-decisiones-de-diseño-d132d140)
- [11. Checklist de validación](#11-checklist-de-validación)
- [Changelog](#changelog)

---

## 0. Propósito y decisión base

La impresión térmica es el punto que más descarrila pilotos de POS. Este documento la cierra con una arquitectura que: (a) no depende de una sola marca de impresora, (b) funciona en un **PWA** desde el MVP, y (c) migra a Capacitor en Fase 3 sin reescribir la lógica de negocio.

**Decisiones base ya tomadas:**

- **Tablet del POS: Android + Chrome** (habilita WebUSB/WebBluetooth además de red). **D132.**
- **Soporte multi-ruta** (red, USB, Bluetooth) detrás de una abstracción común, porque el hardware del piloto es mixto. **D133.**

---

## 1. Lo que NO hacemos: imprimir el HTML

Los mockups de impresión (P-222–P-228) son **referencia visual del layout**, no el método de impresión. **No** se manda el HTML al diálogo de impresión del navegador porque:

- El diálogo de impresión rompe la UX de mostrador (popup, márgenes, "¿qué impresora?").
- No controla el **corte de papel** ni el **cajón**.
- El renderizado HTML→térmica a 58/80mm es inconsistente entre navegadores/drivers.

En su lugar generamos **comandos ESC/POS** desde un modelo lógico (§2). El HTML solo vive para previsualización en pantalla y para el CFDI tamaño Carta (P-229), que sí es PDF. **D134.**

---

## 2. El modelo lógico de print job

Un documento a imprimir es una estructura de datos, no markup. Independiente del transporte y de la marca.

```ts
type PrintJob = {
  tipo: 'TICKET' | 'COMANDA' | 'CUENTA_PROVISIONAL' | 'REPORTE_X' | 'REPORTE_Z'
       | 'CORTE_CAJA' | 'DEVOLUCION';
  ancho: 58 | 80;                 // mm
  destino: 'CAJA' | 'COCINA';     // routing (§5)
  area_cocina_id?: string;        // si destino COCINA
  abrir_cajon?: boolean;          // pulso al cajón tras imprimir (§6)
  bloques: Bloque[];
};

type Bloque =
  | { t: 'texto'; valor: string; align?: 'izq'|'centro'|'der'; size?: 1|2|3; bold?: boolean }
  | { t: 'fila'; izq: string; der: string }          // ej. "Subtotal" .... "$209.00"
  | { t: 'separador'; estilo: 'solido'|'punteado' }
  | { t: 'qr'; valor: string }                        // QR de facturación
  | { t: 'logo' }                                      // ráster (única imagen, §0)
  | { t: 'corte' };                                    // cortar papel
```

- El POS construye el `PrintJob` desde el ticket/comanda/reporte. **Una sola fuente** genera los 7 tipos de documento.
- Mapea 1:1 con los mockups: cada `Bloque` corresponde a una línea/elemento de P-222–P-228.
- **ESC/POS por comandos** para todo el texto (nítido, rápido, soporta corte/cajón). **Ráster solo para el logo** (`{t:'logo'}`), porque ESC/POS no imprime imágenes como texto. **D135.**

---

## 3. La abstracción `PrinterAdapter`

El `PrintJob` se entrega a un adaptador que lo traduce al transporte concreto. La lógica de negocio **nunca** sabe de ESC/POS ni de transportes.

```ts
interface PrinterAdapter {
  nombre: string;
  imprimir(job: PrintJob): Promise<PrintResult>;   // genera ESC/POS y lo envía
  estado(): Promise<'LISTO'|'SIN_PAPEL'|'OFFLINE'|'ERROR'>;
  abrirCajon(): Promise<void>;
}
```

Implementaciones:

| Adapter | Transporte | Disponible | Notas |
|---|---|---|---|
| `EpsonEposAdapter` | **Red (HTTP a IP del printer)** | MVP (PWA) | Primario. Robusto, sin permisos del navegador |
| `WebUsbEscPosAdapter` | **WebUSB** | MVP (Android+Chrome) | Para impresoras USB; requiere permiso por dispositivo |
| `WebBluetoothEscPosAdapter` | **WebBluetooth** | MVP (Android+Chrome) | Impresoras BT; terciario |
| `CapacitorPrinterAdapter` | Plugin nativo | **Fase 3** | Cobertura amplia de hardware, mejor UX |

Un módulo `escpos.ts` genera el byte-stream ESC/POS desde el `PrintJob` y lo reutilizan los adapters USB/BT/Capacitor. El Epson ePOS usa su propio payload (el SDK ePOS-Print acepta una estructura cercana al `PrintJob`). **D136.**

---

## 4. Rutas de transporte (red / USB / BT / nativo)

> **D137 — Orden de preferencia: Red (ePOS) → WebUSB → WebBluetooth → Capacitor (Fase 3).**

### 4.1 Red — Epson ePOS-Print (primario MVP)
- La impresora tiene IP en la LAN del local. El PWA hace un **POST HTTP(S)** al endpoint ePOS del printer con el documento; la impresora ejecuta ESC/POS, corta y abre el cajón.
- **Ventaja decisiva:** funciona desde cualquier navegador sin WebUSB ni permisos, varias cajas pueden compartir o tener su printer, y es muy estable.
- Requiere impresora con ePOS-Print (Epson TM series) y red local (router del local).

### 4.2 WebUSB (secundario)
- Para impresoras USB conectadas a la tablet Android. Chrome pide permiso una vez por dispositivo. `escpos.ts` arma los bytes y se envían por la interfaz USB.
- Limitación: solo Chromium/Android (no iOS — por eso D132 fijó Android).

### 4.3 WebBluetooth (terciario)
- Para impresoras BT portátiles (útil en Foodtruck). Mismo `escpos.ts`. Conexión por dispositivo.

### 4.4 Capacitor (Fase 3)
- Plugin nativo de impresión: cubre impresoras sin ePOS, mejora el emparejamiento y permite impresión en segundo plano. Reusa el `PrintJob` y `escpos.ts`.

---

## 5. Multi-impresora: caja vs cocina

Un negocio tiene típicamente **≥2 impresoras**: la de **caja** (ticket, corte, CFDI) y la(s) de **cocina** (comanda). En cocinas con varias áreas (1C.2 §9, doc 14) puede haber una impresora por área.

- El `PrintJob.destino` (`CAJA`/`COCINA`) + `area_cocina_id` enruta el documento a la impresora correcta.
- La configuración por sucursal (§8) mapea: `area_cocina_id → impresora`, y `caja_id → impresora de tickets`.
- Una comanda se imprime en la(s) impresora(s) de las áreas a las que van sus items (un ticket con bebidas + comida puede generar 2 comandas en 2 impresoras). **D138.**

---

## 6. Cajón de efectivo

- El cajón se conecta **al puerto del cajón de la impresora** (RJ11/RJ12), no a la tablet.
- Se abre con un **pulso ESC/POS** (`ESC p m t1 t2`) que el adapter envía a la impresora.
- Se dispara cuando `PrintJob.abrir_cajon = true`: al confirmar **cobro en efectivo** (P-077) y en **apertura/retiro de caja** autorizados.
- Toda apertura de cajón se registra en `auditoria_eventos` (categoría `CAJA`) — incluso las "sin venta" (reporte P-196). **D139.**

---

## 7. Manejo de fallos y reimpresión

La impresión **nunca debe bloquear la venta**. El cobro se completa aunque la impresora falle.

```
imprimir(job):
  ├─ OK → listo
  ├─ SIN_PAPEL / OFFLINE / ERROR →
  │     - el cobro YA quedó registrado (no se revierte)
  │     - toast accionable: "No se imprimió el ticket — Reintentar / Cambiar impresora"
  │     - el job entra a una cola local (Dexie) de reimpresión pendiente
  └─ reintento manual o automático al volver LISTO
```

- **Cola de reimpresión local** (Dexie): los jobs fallidos se guardan y se reintentan; el cajero puede **reimprimir** desde el ticket (con PIN si es reimpresión de comanda, P-195/§ auditoría).
- La reimpresión de comanda se audita (evento `COCINA`, ya en el modelo) para detectar abuso. **D140.**

---

## 8. Configuración por sucursal/caja

La pantalla de configuración de impresión (P-042 onboarding / P-174 admin) define, por sucursal:

```
Impresoras:
  - { id, nombre, transporte: RED|USB|BT, ancho: 58|80,
      direccion: IP|usbDeviceId|btId, abre_cajon: bool }
Asignaciones:
  - caja_id        → impresora_tickets
  - area_cocina_id → impresora_comandas
Documentos:
  - qué se imprime automático (ticket al cobrar, comanda al enviar) vs bajo demanda
```

- Incluye **"imprimir página de prueba"** por impresora (valida conexión + corte + cajón) — paso del onboarding antes del go-live (P-053/P-054).

---

## 9. Hardware recomendado

> Para compra fresca. Si Knock-Out ya tiene equipo, se adapta vía el adapter correspondiente.

| Pieza | Recomendado | Por qué |
|---|---|---|
| **Impresora de caja** | **Epson TM-m30III** (80mm) | ePOS-Print (red), también USB y BT, puerto de cajón, estándar de facto en MX, ESC/POS |
| Impresora de cocina | Epson TM-m30III o TM-U220 (impacto, resiste calor/grasa) | La de impacto se lee mejor en cocina caliente |
| **Tablet POS** | Android 12+ con Chrome, 10" | Habilita red + WebUSB + WebBluetooth (D132) |
| Cajón de efectivo | Cualquiera con conector RJ11/RJ12 compatible Epson | Se abre por la impresora |
| Red | Router local estable (la impresora de red lo necesita) | ePOS va por LAN |
| Alternativa económica (Foodtruck) | Impresora térmica BT 58mm | Portátil, WebBluetooth |

---

## 10. Decisiones de diseño (D132–D140)

| # | Decisión | Justificación |
|---|---|---|
| **D132** | Tablet POS = Android + Chrome | Habilita red + WebUSB + WebBluetooth; iOS no soporta WebUSB/BT |
| **D133** | Soporte multi-ruta (red/USB/BT) tras una abstracción | Hardware del piloto mixto; no atarse a una marca |
| **D134** | Se imprime ESC/POS desde un modelo lógico, NO el HTML | Controla corte/cajón, evita el diálogo del navegador, consistente |
| **D135** | ESC/POS por comandos para texto; ráster solo para logo | Nítido, rápido; imágenes no van como texto |
| **D136** | `PrinterAdapter` + `escpos.ts` compartido; la lógica de negocio no sabe de transporte | Cambiar de impresora/transporte no toca el negocio; Capacitor reusa todo |
| **D137** | Preferencia Red(ePOS) → WebUSB → WebBluetooth → Capacitor(F3) | Red es la más robusta desde un PWA sin permisos |
| **D138** | `PrintJob.destino`+`area_cocina_id` enruta a la impresora correcta | Caja vs cocina y multi-área sin lógica ad-hoc |
| **D139** | Cajón se abre por pulso ESC/POS de la impresora; toda apertura se audita | El cajón cuelga de la impresora; trazabilidad anti-fraude |
| **D140** | Fallo de impresión no bloquea la venta; cola de reimpresión local + reimpresión auditada | El cobro es la verdad; el papel se reintenta |

---

## 11. Checklist de validación

- [ ] Tablet Android + Chrome confirmada para el POS del piloto
- [ ] `PrintJob` (modelo lógico) cubre los 7 tipos de documento (P-222–P-228)
- [ ] `escpos.ts` genera bytes correctos (texto, alineación, tamaños, corte, QR, logo ráster)
- [ ] `EpsonEposAdapter` imprime por red (ticket completo + corte)
- [ ] `WebUsbEscPosAdapter` imprime en impresora USB (Android+Chrome)
- [ ] Cajón abre por pulso ESC/POS al cobrar efectivo y se audita
- [ ] Routing caja vs cocina (y por área) imprime en la impresora correcta
- [ ] Impresora offline → la venta se completa + toast + job en cola de reimpresión
- [ ] Reimpresión de comanda exige PIN y se registra en auditoría
- [ ] "Imprimir página de prueba" por impresora en el onboarding (P-042/P-053)
- [ ] Prueba con la impresora REAL de Knock-Out antes del go-live
- [ ] (Fase 3) `CapacitorPrinterAdapter` reusa `PrintJob`/`escpos.ts`

---

## Changelog

| Versión | Fecha | Cambios |
|---|---|---|
| v1.0 | Mayo 2026 | Documento inicial. Estrategia de impresión: modelo lógico `PrintJob` + abstracción `PrinterAdapter`, ESC/POS por comandos (ráster solo logo), multi-ruta (Red ePOS primaria → WebUSB → WebBluetooth → Capacitor F3), multi-impresora caja/cocina por área, cajón por pulso ESC/POS auditado, fallo no bloquea venta + cola de reimpresión, config por sucursal/caja, y hardware recomendado (Epson TM-m30III + tablet Android). Decisiones D132–D140. |
