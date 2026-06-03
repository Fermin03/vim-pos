# F5.3 — Impresión: núcleo + vista previa del ticket de venta · Diseño

> **Fase:** F5.3 (POS operativo Quick Service). **Fecha:** 2026-06-03.
> **Fuente de verdad:** doc 16 (`16-IMPRESION-TERMICA.md`) + mockups P-222 (ticket de venta) y P-077 (confirmación de cobro).

## 1. Objetivo y alcance

Construir el **núcleo de impresión independiente del hardware** y la **vista previa** del ticket de venta, dado que la impresora Epson del piloto aún no llega. Entregar valor visible hoy (el cajero ve el ticket al cobrar) y dejar la arquitectura lista para enchufar la impresora real sin tocar la lógica de negocio.

**En alcance:**
- Modelo lógico `PrintJob` (subconjunto TICKET de doc 16).
- Builder `construirTicketJob(datos) → PrintJob` (función pura) + lectura `leerTicketParaImpresion`.
- Generador `escpos.ts` (`PrintJob → Uint8Array`), con QR y corte; **probado con golden-bytes** (sin hardware).
- Abstracción `PrinterAdapter` + factory.
- `PreviewAdapter` (activo hoy): renderiza el recibo 80mm en pantalla (P-222).
- `EpsonEposAdapter` (red): **codificado tras la interfaz, marcado `@sin-verificar`, NO activo** (listo para hardware).
- Confirmación P-077 enriquecida (estado de impresión + "Ver/Imprimir ticket") y overlay del recibo P-222.

**Fuera de alcance (diferido, a propósito):**
- Comanda de cocina (P-223) y enrutamiento por área (doc 14) → F5.3b.
- Cajón de efectivo (cuelga de la impresora; necesita hardware).
- Cola de reimpresión en Dexie (solo importa con impresora real que falle).
- Logo ráster en ESC/POS (doc 16 D135: "única imagen"); el preview sí pinta la marca.
- Portal de autofactura / CFDI real (F8). El ticket incluye el QR fiscal, pero el portal no existe aún.
- Adapters WebUSB / WebBluetooth / Capacitor (doc 16, fases posteriores).
- "Enviar ticket por correo" (botón "Enviar" de P-222).

## 2. Arquitectura

**Una sola fuente `PrintJob` alimenta los dos consumidores** (DRY, fiel a doc 16 — el preview en pantalla y el papel nunca divergen):

```
ticket (BD)
   │  leerTicketParaImpresion(token, ticketId)
   ▼
DatosTicketImpresion ──► construirTicketJob(datos) ──► PrintJob
                                                          │
                          ┌───────────────────────────────┴───────────────────┐
                          ▼                                                     ▼
            recibo-preview.tsx (P-222)                              escpos.ts: jobAEscpos(job) → Uint8Array
            (PreviewAdapter — ACTIVO hoy)                            (EpsonEposAdapter — codificado, @sin-verificar)
```

La lógica de negocio (cobro) solo conoce `PrinterAdapter`; nunca sabe de ESC/POS ni de transporte (doc 16 D136).

## 3. Estructura de archivos

| Archivo | Responsabilidad | ¿Nuevo? |
|---|---|---|
| `apps/pos/app/lib/print/tipos.ts` | Tipos `PrintJob` + `Bloque` (subconjunto TICKET). | nuevo |
| `apps/pos/app/lib/print/ticket.ts` | `leerTicketParaImpresion(token, ticketId)` + `construirTicketJob(datos)` (pura). | nuevo |
| `apps/pos/app/lib/print/escpos.ts` | `jobAEscpos(job) → Uint8Array` (texto, alineación, tamaño, negrita, filas izq–der, separadores, QR, corte). | nuevo |
| `apps/pos/app/lib/print/adapter.ts` | Interfaz `PrinterAdapter` + factory `obtenerImpresora()`. | nuevo |
| `apps/pos/app/lib/print/preview-adapter.ts` | `PreviewAdapter` (activo). | nuevo |
| `apps/pos/app/lib/print/epson-epos-adapter.ts` | `EpsonEposAdapter` (red ePOS), `@sin-verificar`, no activo. | nuevo |
| `apps/pos/app/components/recibo-preview.tsx` | Recibo 80mm (P-222) pintado desde el `PrintJob` + overlay. | nuevo |
| `apps/pos/app/components/home-pos.tsx` | Enriquecer la confirmación post-cobro → P-077; montar `ReciboPreview`. | modificar |
| `apps/pos/app/lib/print/__tests__/escpos.test.ts` | Golden-bytes de `jobAEscpos`. | nuevo |
| `apps/pos/app/lib/print/__tests__/ticket.test.ts` | Golden-job de `construirTicketJob`. | nuevo |
| `apps/pos/vitest.config.ts` + `package.json` (devDep `vitest`) | Runner de los tests puros, acotado a `apps/pos`. | nuevo |

## 4. Modelo de datos (`PrintJob`)

Subconjunto TICKET de doc 16 §2 (sin `logo` ni `area_cocina_id`):

```ts
export type PrintJob = {
  tipo: "TICKET";
  ancho: 58 | 80;            // 80 para Knock-Out
  destino: "CAJA";
  abrir_cajon?: boolean;     // F5.3: siempre false (cajón diferido)
  bloques: Bloque[];
};

export type Bloque =
  | { t: "texto"; valor: string; align?: "izq" | "centro" | "der"; size?: 1 | 2 | 3; bold?: boolean }
  | { t: "fila"; izq: string; der: string }            // "Subtotal" .... "$209.00"
  | { t: "separador"; estilo: "solido" | "punteado" }
  | { t: "qr"; valor: string }                          // URL fiscal + folio
  | { t: "corte" };
```

## 5. Lectura y construcción del job

### 5.1 `leerTicketParaImpresion(token, ticketId)`
CRUD client-side bajo RLS (decisión del repo: "RLS = frontera"). Lee:
- `tickets`: `folio_completo, modo_servicio, subtotal_mxn, descuentos_manuales_mxn, iva_mxn, total_mxn, propina_mxn, fecha_pago, created_at`.
- `ticket_items` (no cancelados): `producto_nombre_snapshot, cantidad, total_item_mxn` + `ticket_item_modificadores(opcion_nombre_snapshot)`.
- `pagos`: `metodo_pago, monto_mxn, monto_recibido_mxn, cambio_mxn` (uno o varios si fue pago dividido).
- `sucursales`: `nombre, direccion_calle, direccion_numero, direccion_colonia, ciudad, estado_geo, codigo_postal, telefono`.
- `tenants`: `nombre_comercial, razon_social, rfc`.

`cajeroNombre` y `cajaNombre` se pasan desde el cliente (`empleado.nombre`, `caja.nombre`) — ya disponibles en `home-pos`, evita lecturas extra.

Devuelve un `DatosTicketImpresion` (objeto plano tipado) que NO depende de Supabase, para que `construirTicketJob` sea pura y testeable.

### 5.2 `construirTicketJob(datos) → PrintJob` (función pura)
Mapea P-222 1:1 a bloques (en orden):
1. `texto` marca/nombre comercial (centro, size 2, bold) — la "V" se representa en el preview; en escpos va el nombre en texto (logo ráster diferido).
2. `texto` dirección + teléfono de la sucursal (centro, size 1).
3. `separador` punteado.
4. `fila` Fecha · `fila` Ticket (folio) · `fila` Cajero · `fila` Caja · `fila` Modo de servicio.
5. `separador` punteado.
6. Por cada ítem: `texto` `"{cantidad}× {nombre}"` con su precio como `fila` (nombre izq, precio der); cada modificador como `texto` size 1 indentado.
7. `separador` punteado.
8. `fila` Subtotal · (si `descuentos>0`) `fila` Descuento `−$x` · `fila` IVA (16%) · `fila` **TOTAL** (size 2/bold).
9. `separador` punteado.
10. Por cada pago: `fila` Forma de pago · (si efectivo) `fila` Recibido · `fila` Cambio. (si `propina>0`) `fila` Propina.
11. `separador` sólido.
12. `texto` "¡Gracias por su compra!" (centro) + `texto` leyenda fiscal (centro, size 1).
13. `qr` con la URL fiscal + folio. **Default:** `https://factura.vimpos.mx/{tenant.codigo}?folio={folio_completo}` (dominio placeholder; el portal de autofactura es F8). Constante en `lib/print/ticket.ts`, fácil de cambiar cuando exista el portal.
14. `texto` URL fiscal legible (centro, size 1).
15. `corte`.

Reglas de dinero: todo viene en `numeric(12,2)` desde la BD; el builder solo formatea (es. `fmtMxn`), nunca recalcula. Si `razon_social`/`rfc` son NULL (tenant TRIAL), se omiten esas líneas sin romper.

## 6. `escpos.ts` — `jobAEscpos(job): Uint8Array`

Traduce cada `Bloque` a comandos ESC/POS (doc 16 D134/D135), ancho 80mm = 48 columnas (Font A):
- `texto`: `ESC a` (align), `GS !` (size 1/2/3 → multiplicador), `ESC E` (bold), payload + `LF`.
- `fila`: izquierda + relleno de espacios + derecha justado a 48 cols; trunca si excede.
- `separador`: línea de `-` (punteado) o `=`/sólido a 48 cols.
- `qr`: `GS ( k` (model, size, error level, store data, print).
- `corte`: `GS V` (corte parcial).
- Inicializa con `ESC @`. Acentos: code page (`ESC t`) o translit ASCII si el page no cubre — **decisión:** translit a ASCII en F5.3 (sin impresora real para validar code pages); se revisita con hardware.

> **Divergencia conocida e intencional (no rompe el "una sola fuente"):** el `PrintJob` es la única fuente; el **preview** (HTML/React) muestra los acentos completos, mientras `escpos.ts` translitera a ASCII *solo en la capa de bytes*, porque no hay impresora para validar el code page. Es un gap deliberado de la capa de salida, a cerrar cuando llegue el hardware (elegir code page Epson y quitar el translit). Ambas salidas parten del mismo job.

Sin acceso a hardware: **no se envía**, solo se generan bytes. Se validan con golden-bytes (§9).

## 7. Adapters

```ts
export interface PrinterAdapter {
  nombre: string;
  imprimir(job: PrintJob): Promise<PrintResult>;
  estado(): Promise<"LISTO" | "SIN_PAPEL" | "OFFLINE" | "ERROR">;
  abrirCajon(): Promise<void>;
}
export type PrintResult = { ok: true } | { ok: false; motivo: "SIN_PAPEL" | "OFFLINE" | "ERROR" };
```

- **`PreviewAdapter` (activo):** `imprimir(job)` resuelve `{ok:true}` y notifica a la UI para mostrar el recibo (vía callback/estado en `home-pos`). `estado()` → `LISTO`. `abrirCajon()` → no-op (cajón diferido).
- **`EpsonEposAdapter` (scaffold, `@sin-verificar`):** `imprimir` arma el payload ePOS (o usa `jobAEscpos` como raw) y hace `POST` a `http://{ip}/cgi-bin/epos/service.cgi?devid=local_printer`. NO se instancia en F5.3.
- **`obtenerImpresora(config?)`:** factory. Sin impresora configurada (caso actual) → `PreviewAdapter`. Con config de red (futuro) → `EpsonEposAdapter`. La config por sucursal (P-174) es F4-diferido; hoy no hay fila → siempre Preview.

## 8. UI / flujo

### 8.1 Confirmación post-cobro (P-077, enriquecer la actual en `home-pos`)
Hoy es un modal simple ("Venta cobrada · Folio · Cambio"). Se enriquece a P-077:
- Check ✓ "Cobro completado" + ref (`folio · modo de servicio`).
- Tarjeta de pago: **Pagado** (grande), Efectivo recibido, Cambio a entregar, (si aplica) Propina.
- **Panel de impresión** con UNA fila: "Ticket del cliente · 80mm" cuyo estado refleja el adapter: hoy `PreviewAdapter` → "Vista previa lista"; con Epson → "Imprimiendo → Impreso" (mismo código). Filas de Comanda y Factura **ocultas** (fuera de alcance / F8).
- Acción **"Ver / Imprimir ticket"** → abre el overlay `ReciboPreview`.
- "Nuevo ticket" (limpia y vuelve a home).

> Auto-impresión (doc 16 §8): al cobrar se llama `impresora.imprimir(job)` automáticamente. Con `PreviewAdapter` esto marca la fila "lista" pero **no** abre el overlay solo (no estorbar el flujo rápido de QS). El cajero abre el preview si lo necesita.

### 8.2 Recibo P-222 (`recibo-preview.tsx`)
Overlay con el recibo 80mm pintado desde `PrintJob.bloques` (cada bloque → su render), fiel a P-222 (papel dentado, mono, QR SVG). Botones "Imprimir" (`impresora.imprimir(job)`) y "Cerrar". El QR se pinta desde `{t:'qr'}` (librería de QR ligera o SVG generado).

## 9. Manejo de errores

- **La impresión nunca bloquea la venta** (doc 16 D140): el cobro ya quedó PAGADO; armar/mostrar el ticket es posterior y si falla, un toast no revierte nada.
- `leerTicketParaImpresion` falla → la confirmación se muestra igual (con Pagado/Cambio que ya tenemos) y el panel de ticket muestra "No se pudo armar el ticket — Reintentar".
- Con `PreviewAdapter` no hay fallo de impresión real. Con Epson (futuro): `PrintResult.ok=false` → toast accionable + (futuro) cola de reimpresión.

## 10. Verificación

- **Ruta visible → E2E en navegador (Preview MCP):** cobro → P-077 → "Ver ticket" → el recibo P-222 muestra: encabezado (negocio+sucursal), líneas con modificadores, totales con descuento, pago+recibido+cambio, propina (si hay) y QR. (Requiere el stack local arriba.)
- **`escpos.ts` + `construirTicketJob` → golden tests (vitest, acotado a `apps/pos`):**
  - `construirTicketJob`: un `DatosTicketImpresion` representativo (1 ítem con 2 mods, descuento, propina, efectivo con cambio) → `PrintJob` esperado (estructura de bloques).
  - `jobAEscpos`: ese `PrintJob` → `Uint8Array` esperado (golden), validando init, alineación, size, fila justada a 48, QR y corte.
- **RLS:** sin tablas nuevas ni RPC nuevos → no cambia la suite; se corre `supabase test db` igual para confirmar PASS.

## 11. Dependencias y supuestos

- `tenants.nombre_comercial` siempre presente; `razon_social`/`rfc` pueden ser NULL en TRIAL → se omiten.
- `sucursales` trae dirección y teléfono (campos NULL → se omiten líneas vacías).
- Ancho fijo **80mm** (Knock-Out, Epson TM-m30III recomendada en doc 16 §9). 58mm soportado en el tipo, no ejercitado.
- Se añade `vitest` como devDependency de `apps/pos` (primer runner de unit tests del repo; acotado a funciones puras de impresión).
- El stack local debe estar arriba para el E2E (Docker + `supabase start`).

## 12. Checklist de cierre (de doc 16 §11, lo aplicable a F5.3)

- [ ] `PrintJob` cubre el ticket de venta (P-222) bloque a bloque.
- [ ] `escpos.ts` genera bytes correctos (texto, alineación, tamaños, fila justada, QR, corte) — golden-bytes.
- [ ] `PreviewAdapter` muestra el recibo fiel a P-222 desde el `PrintJob`.
- [ ] `EpsonEposAdapter` codificado tras la interfaz (sin verificar; marcado).
- [ ] La impresión/preview no bloquea la venta (cobro ya PAGADO).
- [ ] E2E navegador: cobro → P-077 → recibo correcto.
- [ ] (Hardware, futuro) impresión real + corte + cajón + page-test (P-053).
