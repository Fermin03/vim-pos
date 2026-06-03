# F5.3 — Impresión: núcleo + vista previa del ticket · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir el núcleo de impresión independiente del hardware (`PrintJob` → `escpos.ts`) y la vista previa del ticket de venta (P-222) que se muestra al cobrar (P-077), dejando el `EpsonEposAdapter` listo (sin verificar) para cuando llegue la impresora.

**Architecture:** Una sola fuente `PrintJob` (modelo lógico de doc 16) alimenta dos consumidores: el `PreviewAdapter` (renderiza el recibo 80mm en pantalla, activo hoy) y `escpos.ts`/`EpsonEposAdapter` (bytes ESC/POS para hardware, codificado pero no activo). El builder y el generador de bytes son funciones puras con tests golden (vitest); la ruta visible se verifica E2E en navegador.

**Tech Stack:** Next 15 + React 19 + TS, `@vim/ui`, Supabase JS (lectura bajo RLS), `vitest` (nuevo, golden tests), `qrcode.react` (QR del preview).

**Spec:** `docs/superpowers/specs/2026-06-03-f5-3-impresion-ticket-design.md`

**Rama:** trabajar en `f5.3-impresion-ticket` (crear al iniciar: `git checkout -b f5.3-impresion-ticket`). Merge a `main` con `--no-ff` al cerrar.

**Convención de verificación del repo:** funciones puras (builder, escpos) → vitest golden; ruta crítica → E2E navegador (Preview MCP); RLS → `supabase test db` (sin cambios de esquema en F5.3, se corre para confirmar PASS). El stack local debe estar arriba (Docker + `supabase start`) para el E2E.

---

## FILE STRUCTURE

Todo en `apps/pos/app/lib/print/` salvo el componente y la integración:

- `lib/print/tipos.ts` — `PrintJob`, `Bloque`, `PrintResult`, `DatosTicketImpresion` (+ sub-tipos). Sin lógica.
- `lib/print/ticket-builder.ts` — `construirTicketJob(datos) → PrintJob` (PURA) + helper `pesos()`.
- `lib/print/ticket-datos.ts` — `leerTicketParaImpresion(token, ticketId, ctx) → DatosTicketImpresion` (Supabase, RLS).
- `lib/print/escpos.ts` — `jobAEscpos(job) → Uint8Array` (PURA).
- `lib/print/adapter.ts` — interfaz `PrinterAdapter` + factory `obtenerImpresora()`.
- `lib/print/preview-adapter.ts` — `PreviewAdapter` (activo).
- `lib/print/epson-epos-adapter.ts` — `EpsonEposAdapter` (red ePOS), `@sin-verificar`, no activo.
- `components/recibo-preview.tsx` — recibo 80mm (P-222) desde el `PrintJob`.
- `components/home-pos.tsx` — confirmación P-077 enriquecida + montaje del preview (MODIFICAR).
- `lib/print/__tests__/ticket-builder.test.ts`, `lib/print/__tests__/escpos.test.ts` — golden.
- `vitest.config.ts` + `package.json` (devDep `vitest`, dep `qrcode.react`) — runner + QR.

> **Nota de decomposición:** el spec listaba un solo `ticket.ts`; se separa en `ticket-builder.ts` (puro, testeable en node) y `ticket-datos.ts` (IO Supabase) para que el golden test del builder no arrastre el cliente de Supabase. El resto sigue el spec.

---

## Task 1: Setup vitest + tipos del PrintJob

**Files:**
- Modify: `apps/pos/package.json`
- Create: `apps/pos/vitest.config.ts`
- Modify: `apps/pos/tsconfig.json` (excluir tests del build de Next)
- Create: `apps/pos/app/lib/print/tipos.ts`

- [ ] **Step 0: Crear la rama**

```bash
cd "<repo>/vim-pos"
git checkout main && git pull --ff-only 2>/dev/null; git checkout -b f5.3-impresion-ticket
```

- [ ] **Step 1: Añadir `vitest` y `qrcode.react` a `apps/pos/package.json`**

En `dependencies` añadir `"qrcode.react": "^4.0.0"`. En `devDependencies` añadir `"vitest": "^2.1.0"`. En `scripts` añadir `"test": "vitest run"`. Luego:

```bash
pnpm install
```

- [ ] **Step 2: Crear `apps/pos/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["app/**/*.test.ts"],
  },
});
```

- [ ] **Step 3: Excluir los tests del build de Next**

En `apps/pos/tsconfig.json`, en el array `"exclude"` añadir `"app/**/*.test.ts"` (junto a `node_modules`). Esto evita que `next build` tipule/empaquete los tests.

- [ ] **Step 4: Crear `apps/pos/app/lib/print/tipos.ts`**

```ts
// Modelo lógico de impresión (doc 16 §2), subconjunto TICKET. Independiente del transporte.

export type Bloque =
  | { t: "texto"; valor: string; align?: "izq" | "centro" | "der"; size?: 1 | 2 | 3; bold?: boolean }
  | { t: "fila"; izq: string; der: string }
  | { t: "separador"; estilo: "solido" | "punteado" }
  | { t: "qr"; valor: string }
  | { t: "corte" };

export type PrintJob = {
  tipo: "TICKET";
  ancho: 58 | 80;
  destino: "CAJA";
  abrir_cajon?: boolean;
  bloques: Bloque[];
};

export type PrintResult = { ok: true } | { ok: false; motivo: "SIN_PAPEL" | "OFFLINE" | "ERROR" };

// ── Datos planos para construir el ticket (sin dependencia de Supabase) ──
export type LineaImpresion = {
  cantidad: number;
  nombre: string;
  totalMxn: number;
  modificadores: string[];
};

export type PagoImpresion = {
  metodo: string; // etiqueta legible: 'Efectivo', 'Tarjeta de débito', …
  montoMxn: number;
  recibidoMxn: number | null; // solo efectivo
  cambioMxn: number;
};

export type DatosTicketImpresion = {
  negocio: { nombre: string; razonSocial: string | null; rfc: string | null };
  sucursal: { nombre: string; direccion: string | null; telefono: string | null };
  meta: { folio: string; fechaIso: string; cajero: string; caja: string; modoServicio: string };
  lineas: LineaImpresion[];
  totales: { subtotal: number; descuentos: number; iva: number; total: number; propina: number };
  pagos: PagoImpresion[];
  qrUrl: string;
  ancho: 58 | 80;
};
```

- [ ] **Step 5: Verificar que tipa (sin tests aún)**

Run: `pnpm --filter @vim/pos build 2>&1 | grep -E "Compiled|error TS"`
Expected: `Compiled successfully`.

- [ ] **Step 6: Commit**

```bash
git add apps/pos/package.json apps/pos/pnpm-lock.yaml apps/pos/vitest.config.ts apps/pos/tsconfig.json apps/pos/app/lib/print/tipos.ts
git commit -m "chore(pos): setup vitest + qrcode.react + tipos PrintJob (F5.3)"
```

---

## Task 2: `construirTicketJob` (función pura, TDD golden-job)

**Files:**
- Create: `apps/pos/app/lib/print/ticket-builder.ts`
- Create: `apps/pos/app/lib/print/__tests__/ticket-builder.test.ts`

- [ ] **Step 1: Escribir el test golden (falla primero)**

`apps/pos/app/lib/print/__tests__/ticket-builder.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { construirTicketJob } from "../ticket-builder";
import type { DatosTicketImpresion } from "../tipos";

const DATOS: DatosTicketImpresion = {
  negocio: { nombre: "Knock-Out Burger", razonSocial: "Knock-Out SA de CV", rfc: "KOB210101AAA" },
  sucursal: { nombre: "León Centro", direccion: "Av. Insurgentes 234, Centro, León, Gto. CP 37000", telefono: "477 712 5500" },
  meta: { folio: "KC-2026-000001", fechaIso: "2026-06-03T00:14:00.000Z", cajero: "María G.", caja: "Caja 01", modoServicio: "Para llevar" },
  lineas: [
    { cantidad: 1, nombre: "Hamburguesa Clásica", totalMxn: 120, modificadores: ["Tres cuartos", "Extra queso"] },
  ],
  totales: { subtotal: 103.45, descuentos: 12, iva: 16.55, total: 108, propina: 18 },
  pagos: [{ metodo: "Efectivo", montoMxn: 126, recibidoMxn: 200, cambioMxn: 74 }],
  qrUrl: "https://factura.vimpos.mx/knockout?folio=KC-2026-000001",
  ancho: 80,
};

describe("construirTicketJob", () => {
  it("arma el PrintJob TICKET con encabezado, líneas, totales, pago y QR", () => {
    const job = construirTicketJob(DATOS);
    expect(job.tipo).toBe("TICKET");
    expect(job.ancho).toBe(80);
    expect(job.destino).toBe("CAJA");
    expect(job.abrir_cajon).toBe(false);

    // Encabezado
    expect(job.bloques[0]).toEqual({ t: "texto", valor: "Knock-Out Burger", align: "centro", size: 2, bold: true });
    // La línea aparece como fila nombre/precio
    expect(job.bloques).toContainEqual({ t: "fila", izq: "1x Hamburguesa Clásica", der: "$120.00" });
    // Modificadores como texto chico
    expect(job.bloques).toContainEqual({ t: "texto", valor: "  Tres cuartos", size: 1 });
    expect(job.bloques).toContainEqual({ t: "texto", valor: "  Extra queso", size: 1 });
    // Totales
    expect(job.bloques).toContainEqual({ t: "fila", izq: "Subtotal", der: "$103.45" });
    expect(job.bloques).toContainEqual({ t: "fila", izq: "Descuento", der: "-$12.00" });
    expect(job.bloques).toContainEqual({ t: "fila", izq: "IVA (16%)", der: "$16.55" });
    expect(job.bloques).toContainEqual({ t: "fila", izq: "TOTAL", der: "$108.00" });
    // Pago
    expect(job.bloques).toContainEqual({ t: "fila", izq: "Efectivo", der: "$126.00" });
    expect(job.bloques).toContainEqual({ t: "fila", izq: "Recibido", der: "$200.00" });
    expect(job.bloques).toContainEqual({ t: "fila", izq: "Cambio", der: "$74.00" });
    expect(job.bloques).toContainEqual({ t: "fila", izq: "Propina", der: "$18.00" });
    // QR + corte
    expect(job.bloques).toContainEqual({ t: "qr", valor: "https://factura.vimpos.mx/knockout?folio=KC-2026-000001" });
    expect(job.bloques[job.bloques.length - 1]).toEqual({ t: "corte" });
  });

  it("omite la línea de descuento cuando es 0", () => {
    const sinDesc = { ...DATOS, totales: { ...DATOS.totales, descuentos: 0 } };
    const job = construirTicketJob(sinDesc);
    expect(job.bloques.find((b) => b.t === "fila" && b.izq === "Descuento")).toBeUndefined();
  });

  it("omite Propina cuando es 0", () => {
    const sinProp = { ...DATOS, totales: { ...DATOS.totales, propina: 0 } };
    const job = construirTicketJob(sinProp);
    expect(job.bloques.find((b) => b.t === "fila" && b.izq === "Propina")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Correr el test → debe fallar**

Run: `pnpm --filter @vim/pos exec vitest run app/lib/print/__tests__/ticket-builder.test.ts`
Expected: FAIL — `construirTicketJob` no existe (Cannot find module '../ticket-builder').

- [ ] **Step 3: Implementar `ticket-builder.ts`**

```ts
import type { Bloque, DatosTicketImpresion, PrintJob } from "./tipos";

/** Formatea pesos sin depender de módulos cliente (testeable en node). */
export function pesos(n: number): string {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);
}

/** Construye el PrintJob TICKET (P-222) desde datos planos. Función PURA. */
export function construirTicketJob(d: DatosTicketImpresion): PrintJob {
  const b: Bloque[] = [];

  // 1. Encabezado del negocio
  b.push({ t: "texto", valor: d.negocio.nombre, align: "centro", size: 2, bold: true });
  if (d.sucursal.direccion) b.push({ t: "texto", valor: d.sucursal.direccion, align: "centro", size: 1 });
  if (d.sucursal.telefono) b.push({ t: "texto", valor: `Tel. ${d.sucursal.telefono}`, align: "centro", size: 1 });
  if (d.negocio.rfc) b.push({ t: "texto", valor: `RFC ${d.negocio.rfc}`, align: "centro", size: 1 });

  b.push({ t: "separador", estilo: "punteado" });

  // 2. Meta
  b.push({ t: "fila", izq: "Fecha", der: formatoFecha(d.meta.fechaIso) });
  b.push({ t: "fila", izq: "Ticket", der: d.meta.folio });
  b.push({ t: "fila", izq: "Cajero", der: d.meta.cajero });
  b.push({ t: "fila", izq: "Caja", der: d.meta.caja });
  b.push({ t: "fila", izq: "Servicio", der: d.meta.modoServicio });

  b.push({ t: "separador", estilo: "punteado" });

  // 3. Líneas
  for (const l of d.lineas) {
    b.push({ t: "fila", izq: `${l.cantidad}x ${l.nombre}`, der: pesos(l.totalMxn) });
    for (const m of l.modificadores) b.push({ t: "texto", valor: `  ${m}`, size: 1 });
  }

  b.push({ t: "separador", estilo: "punteado" });

  // 4. Totales
  b.push({ t: "fila", izq: "Subtotal", der: pesos(d.totales.subtotal) });
  if (d.totales.descuentos > 0) b.push({ t: "fila", izq: "Descuento", der: `-${pesos(d.totales.descuentos)}` });
  b.push({ t: "fila", izq: "IVA (16%)", der: pesos(d.totales.iva) });
  b.push({ t: "fila", izq: "TOTAL", der: pesos(d.totales.total) });

  b.push({ t: "separador", estilo: "punteado" });

  // 5. Pago(s)
  for (const p of d.pagos) {
    b.push({ t: "fila", izq: p.metodo, der: pesos(p.montoMxn) });
    if (p.recibidoMxn != null) {
      b.push({ t: "fila", izq: "Recibido", der: pesos(p.recibidoMxn) });
      b.push({ t: "fila", izq: "Cambio", der: pesos(p.cambioMxn) });
    }
  }
  if (d.totales.propina > 0) b.push({ t: "fila", izq: "Propina", der: pesos(d.totales.propina) });

  b.push({ t: "separador", estilo: "solido" });

  // 6. Pie fiscal
  b.push({ t: "texto", valor: "¡Gracias por su compra!", align: "centro" });
  b.push({ t: "texto", valor: "¿Necesitas factura? Escanea el código:", align: "centro", size: 1 });
  b.push({ t: "qr", valor: d.qrUrl });
  b.push({ t: "texto", valor: d.qrUrl.replace(/^https?:\/\//, ""), align: "centro", size: 1 });

  b.push({ t: "corte" });

  return { tipo: "TICKET", ancho: d.ancho, destino: "CAJA", abrir_cajon: false, bloques: b };
}

function formatoFecha(iso: string): string {
  const f = new Date(iso);
  const dd = String(f.getDate()).padStart(2, "0");
  const mm = String(f.getMonth() + 1).padStart(2, "0");
  const yyyy = f.getFullYear();
  const hh = String(f.getHours()).padStart(2, "0");
  const mi = String(f.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
}
```

- [ ] **Step 4: Correr el test → debe pasar**

Run: `pnpm --filter @vim/pos exec vitest run app/lib/print/__tests__/ticket-builder.test.ts`
Expected: PASS (3 tests). Si falla por la fila de descuento usando `−` vs `-`: el builder usa `-` (guion ASCII) a propósito; el test lo refleja.

- [ ] **Step 5: Commit**

```bash
git add apps/pos/app/lib/print/ticket-builder.ts apps/pos/app/lib/print/__tests__/ticket-builder.test.ts
git commit -m "feat(pos): construirTicketJob (P-222 -> PrintJob) + golden test"
```

---

## Task 3: `escpos.ts` (función pura, TDD golden-bytes)

**Files:**
- Create: `apps/pos/app/lib/print/escpos.ts`
- Create: `apps/pos/app/lib/print/__tests__/escpos.test.ts`

- [ ] **Step 1: Escribir el test (falla primero)**

`apps/pos/app/lib/print/__tests__/escpos.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { jobAEscpos } from "../escpos";
import type { PrintJob } from "../tipos";

/** Decodifica los bytes a string latin1 para inspeccionar secuencias de control. */
const txt = (bytes: Uint8Array) => String.fromCharCode(...bytes);

const JOB: PrintJob = {
  tipo: "TICKET", ancho: 80, destino: "CAJA", abrir_cajon: false,
  bloques: [
    { t: "texto", valor: "Knock-Out Burger", align: "centro", size: 2, bold: true },
    { t: "fila", izq: "Subtotal", der: "$103.45" },
    { t: "separador", estilo: "punteado" },
    { t: "qr", valor: "https://x.mx?f=1" },
    { t: "corte" },
  ],
};

describe("jobAEscpos", () => {
  it("inicializa con ESC @", () => {
    const out = jobAEscpos(JOB);
    expect(out[0]).toBe(0x1b);
    expect(out[1]).toBe(0x40);
  });

  it("centra y agranda el encabezado (ESC a 1, GS ! 0x11, ESC E 1)", () => {
    const s = txt(jobAEscpos(JOB));
    expect(s).toContain("\x1b\x61\x01"); // align centro
    expect(s).toContain("\x1d\x21\x11"); // size 2 (doble alto+ancho)
    expect(s).toContain("\x1b\x45\x01"); // bold on
    expect(s).toContain("Knock-Out Burger");
  });

  it("la fila queda justificada a 48 columnas", () => {
    const s = txt(jobAEscpos(JOB));
    const linea = s.split("\n").find((l) => l.startsWith("Subtotal"));
    expect(linea).toBeDefined();
    expect(linea!.length).toBe(48);
    expect(linea!.endsWith("$103.45")).toBe(true);
  });

  it("emite el QR (GS ( k) y termina con corte (GS V)", () => {
    const s = txt(jobAEscpos(JOB));
    expect(s).toContain("\x1d\x28\x6b"); // GS ( k  (QR)
    const out = jobAEscpos(JOB);
    expect(out[out.length - 4]).toBe(0x1d); // GS
    expect(out[out.length - 3]).toBe(0x56); // V
  });

  it("translitera acentos a ASCII", () => {
    const j: PrintJob = { ...JOB, bloques: [{ t: "texto", valor: "Cocción ñ á" }] };
    const s = txt(jobAEscpos(j));
    expect(s).toContain("Coccion n a");
  });
});
```

- [ ] **Step 2: Correr el test → debe fallar**

Run: `pnpm --filter @vim/pos exec vitest run app/lib/print/__tests__/escpos.test.ts`
Expected: FAIL — `jobAEscpos` no existe.

- [ ] **Step 3: Implementar `escpos.ts`**

```ts
import type { Bloque, PrintJob } from "./tipos";

const ESC = 0x1b, GS = 0x1d, LF = 0x0a;

function cols(ancho: 58 | 80): number {
  return ancho === 80 ? 48 : 32; // Font A
}

/** Quita acentos y normaliza signos a ASCII imprimible (code page pendiente de hardware). */
function ascii(s: string): string {
  return s
    .normalize("NFD").replace(/[̀-ͯ]/g, "") // acentos
    .replace(/[−–—]/g, "-") // − – —  → -
    .replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
    .replace(/[^\x20-\x7e]/g, "?"); // cualquier otro no-ASCII
}

function bytesDe(s: string): number[] {
  return Array.from(ascii(s), (c) => c.charCodeAt(0) & 0xff);
}

function fila(izq: string, der: string, ancho: 58 | 80): number[] {
  const n = cols(ancho);
  let l = ascii(izq), r = ascii(der);
  if (l.length + r.length + 1 > n) l = l.slice(0, Math.max(0, n - r.length - 1));
  const gap = Math.max(1, n - l.length - r.length);
  return bytesDe(l + " ".repeat(gap) + r);
}

function qr(valor: string): number[] {
  const data = ascii(valor);
  const out: number[] = [];
  // GS ( k — model 2
  out.push(GS, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00);
  // tamaño del módulo = 6
  out.push(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, 0x06);
  // nivel de corrección = M
  out.push(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x31);
  // almacenar datos
  const len = data.length + 3;
  out.push(GS, 0x28, 0x6b, len & 0xff, (len >> 8) & 0xff, 0x31, 0x50, 0x30, ...bytesDe(valor));
  // imprimir
  out.push(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30);
  return out;
}

function bloqueABytes(bl: Bloque, ancho: 58 | 80): number[] {
  switch (bl.t) {
    case "texto": {
      const out: number[] = [];
      out.push(ESC, 0x61, bl.align === "centro" ? 1 : bl.align === "der" ? 2 : 0);
      const sz = bl.size === 3 ? 0x22 : bl.size === 2 ? 0x11 : 0x00;
      out.push(GS, 0x21, sz);
      out.push(ESC, 0x45, bl.bold ? 1 : 0);
      out.push(...bytesDe(bl.valor), LF);
      // reset a normal/izquierda
      out.push(GS, 0x21, 0x00, ESC, 0x45, 0x00, ESC, 0x61, 0x00);
      return out;
    }
    case "fila":
      return [...fila(bl.izq, bl.der, ancho), LF];
    case "separador":
      return [...bytesDe((bl.estilo === "solido" ? "=" : "-").repeat(cols(ancho))), LF];
    case "qr": {
      const out: number[] = [ESC, 0x61, 1]; // centro
      out.push(...qr(bl.valor), LF);
      out.push(ESC, 0x61, 0);
      return out;
    }
    case "corte":
      return [LF, LF, LF, GS, 0x56, 66, 0]; // alimenta y corta (parcial)
  }
}

/** Traduce un PrintJob a bytes ESC/POS. Función PURA (no envía nada). */
export function jobAEscpos(job: PrintJob): Uint8Array {
  const out: number[] = [ESC, 0x40]; // init
  for (const bl of job.bloques) out.push(...bloqueABytes(bl, job.ancho));
  return Uint8Array.from(out);
}
```

- [ ] **Step 4: Correr el test → debe pasar**

Run: `pnpm --filter @vim/pos exec vitest run app/lib/print/__tests__/escpos.test.ts`
Expected: PASS (5 tests).

> Si la prueba de "corte" falla por los `LF` finales: el corte emite `LF LF LF GS V 66 0`, así que los últimos 4 bytes son `GS(0x1d) V(0x56) 66 0`. El test valida `out[len-4]==0x1d` y `out[len-3]==0x56`.

- [ ] **Step 5: Commit**

```bash
git add apps/pos/app/lib/print/escpos.ts apps/pos/app/lib/print/__tests__/escpos.test.ts
git commit -m "feat(pos): escpos.ts (PrintJob -> bytes ESC/POS) + golden test"
```

---

## Task 4: `PrinterAdapter` + `PreviewAdapter` + factory

**Files:**
- Create: `apps/pos/app/lib/print/adapter.ts`
- Create: `apps/pos/app/lib/print/preview-adapter.ts`

- [ ] **Step 1: Crear `adapter.ts`**

```ts
import type { PrintJob, PrintResult } from "./tipos";
import { PreviewAdapter } from "./preview-adapter";

export interface PrinterAdapter {
  nombre: string;
  imprimir(job: PrintJob): Promise<PrintResult>;
  estado(): Promise<"LISTO" | "SIN_PAPEL" | "OFFLINE" | "ERROR">;
  abrirCajon(): Promise<void>;
}

/**
 * Devuelve la impresora activa. Sin config de impresora de red (caso actual, P-174 diferido)
 * → PreviewAdapter (muestra el recibo en pantalla). `onMostrar` lo provee la UI.
 */
export function obtenerImpresora(opts: { onMostrar: (job: PrintJob) => void }): PrinterAdapter {
  return new PreviewAdapter(opts.onMostrar);
}
```

- [ ] **Step 2: Crear `preview-adapter.ts`**

```ts
import type { PrinterAdapter } from "./adapter";
import type { PrintJob, PrintResult } from "./tipos";

/**
 * Adapter activo en F5.3 (sin hardware): "imprimir" = mostrar el recibo en pantalla.
 * Cuando exista la impresora de red, se reemplaza por EpsonEposAdapter sin tocar la UI.
 */
export class PreviewAdapter implements PrinterAdapter {
  nombre = "Vista previa";
  constructor(private onMostrar: (job: PrintJob) => void) {}

  async imprimir(job: PrintJob): Promise<PrintResult> {
    this.onMostrar(job);
    return { ok: true };
  }
  async estado() {
    return "LISTO" as const;
  }
  async abrirCajon() {
    /* cajón diferido (cuelga de la impresora física) */
  }
}
```

- [ ] **Step 3: Verificar typecheck**

Run: `pnpm --filter @vim/pos build 2>&1 | grep -E "Compiled|error TS"`
Expected: `Compiled successfully`.

- [ ] **Step 4: Commit**

```bash
git add apps/pos/app/lib/print/adapter.ts apps/pos/app/lib/print/preview-adapter.ts
git commit -m "feat(pos): PrinterAdapter + PreviewAdapter (activo) + factory"
```

---

## Task 5: `EpsonEposAdapter` (scaffold, `@sin-verificar`)

**Files:**
- Create: `apps/pos/app/lib/print/epson-epos-adapter.ts`

- [ ] **Step 1: Crear `epson-epos-adapter.ts`**

```ts
import type { PrinterAdapter } from "./adapter";
import type { Bloque, PrintJob, PrintResult } from "./tipos";

/**
 * @sin-verificar — NO se usa en F5.3 (no hay impresora). Listo para enchufar cuando
 * llegue la Epson de red (ePOS-Print). Hace POST del XML ePOS al endpoint del printer.
 * Doc 16 §4.1. Verificar con hardware real antes del go-live (checklist doc 16 §11).
 */
export class EpsonEposAdapter implements PrinterAdapter {
  nombre = "Epson ePOS (red)";
  constructor(private ip: string, private ancho: 58 | 80 = 80) {}

  async imprimir(job: PrintJob): Promise<PrintResult> {
    const xml = jobAEposXml(job);
    try {
      const res = await fetch(`http://${this.ip}/cgi-bin/epos/service.cgi?devid=local_printer&timeout=10000`, {
        method: "POST",
        headers: { "Content-Type": "text/xml; charset=utf-8", "SOAPAction": '""' },
        body: xml,
      });
      if (!res.ok) return { ok: false, motivo: "ERROR" };
      const body = await res.text();
      if (/success="true"/.test(body)) return { ok: true };
      if (/PaperEnd|cover/i.test(body)) return { ok: false, motivo: "SIN_PAPEL" };
      return { ok: false, motivo: "ERROR" };
    } catch {
      return { ok: false, motivo: "OFFLINE" };
    }
  }

  async estado() {
    try {
      const res = await fetch(`http://${this.ip}/cgi-bin/epos/service.cgi?devid=local_printer`, { method: "GET" });
      return res.ok ? ("LISTO" as const) : ("ERROR" as const);
    } catch {
      return "OFFLINE" as const;
    }
  }

  async abrirCajon() {
    // ESC p 0 25 250 dentro del sobre ePOS (<pulse>)
    const xml = sobreEpos(`<pulse drawer="drawer1" time="pulse_100" />`);
    await fetch(`http://${this.ip}/cgi-bin/epos/service.cgi?devid=local_printer`, {
      method: "POST",
      headers: { "Content-Type": "text/xml; charset=utf-8", "SOAPAction": '""' },
      body: xml,
    }).catch(() => {});
  }
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function bloqueAEposXml(bl: Bloque): string {
  switch (bl.t) {
    case "texto": {
      const al = bl.align ?? "izq";
      const align = al === "centro" ? "center" : al === "der" ? "right" : "left";
      const w = bl.size === 3 ? 3 : bl.size === 2 ? 2 : 1;
      return `<text align="${align}" width="${w}" height="${w}" em="${bl.bold ? "true" : "false"}">${esc(bl.valor)}&#10;</text>`;
    }
    case "fila": {
      const n = 48;
      const gap = Math.max(1, n - bl.izq.length - bl.der.length);
      return `<text align="left">${esc(bl.izq + " ".repeat(gap) + bl.der)}&#10;</text>`;
    }
    case "separador":
      return `<text align="left">${(bl.estilo === "solido" ? "=" : "-").repeat(48)}&#10;</text>`;
    case "qr":
      return `<symbol type="qrcode_model_2" level="level_m" width="6">${esc(bl.valor)}</symbol>`;
    case "corte":
      return `<feed line="3" /><cut type="feed" />`;
  }
}

function sobreEpos(inner: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">
<s:Body><epos-print xmlns="http://www.epson-pos.com/schemas/2011/03/epos-print">${inner}</epos-print></s:Body>
</s:Envelope>`;
}

export function jobAEposXml(job: PrintJob): string {
  return sobreEpos(job.bloques.map(bloqueAEposXml).join(""));
}
```

- [ ] **Step 2: Verificar typecheck**

Run: `pnpm --filter @vim/pos build 2>&1 | grep -E "Compiled|error TS"`
Expected: `Compiled successfully`.

- [ ] **Step 3: Commit**

```bash
git add apps/pos/app/lib/print/epson-epos-adapter.ts
git commit -m "feat(pos): EpsonEposAdapter scaffold (red ePOS, @sin-verificar)"
```

---

## Task 6: `recibo-preview.tsx` (recibo 80mm P-222 desde el PrintJob)

**Files:**
- Create: `apps/pos/app/components/recibo-preview.tsx`

**Patrón a espejar:** estructura de overlay de `modal-cobro.tsx` (fixed inset-0, bg-ink/40). Estética de papel de P-222 (mono, papel, dentado).

- [ ] **Step 1: Implementar el componente**

```tsx
"use client";
import { QRCodeSVG } from "qrcode.react";
import type { Bloque, PrintJob } from "../lib/print/tipos";

function BloqueView({ bl }: { bl: Bloque }) {
  switch (bl.t) {
    case "texto": {
      const align = bl.align === "centro" ? "text-center" : bl.align === "der" ? "text-right" : "text-left";
      const size = bl.size === 3 ? "text-[18px]" : bl.size === 2 ? "text-[15px]" : "text-[10px]";
      return <div className={`${align} ${bl.bold ? "font-bold" : ""} ${size} leading-snug whitespace-pre-wrap`}>{bl.valor}</div>;
    }
    case "fila":
      return (
        <div className="flex justify-between gap-2 text-[11px]">
          <span className="whitespace-pre-wrap">{bl.izq}</span>
          <span className="whitespace-nowrap font-semibold">{bl.der}</span>
        </div>
      );
    case "separador":
      return <div className={`my-2 border-t ${bl.estilo === "solido" ? "border-[#888]" : "border-dashed border-[#B0B0B0]"}`} />;
    case "qr":
      return (
        <div className="my-2 flex justify-center">
          <QRCodeSVG value={bl.valor} size={92} level="M" />
        </div>
      );
    case "corte":
      return <div className="mt-3 text-center text-[9px] tracking-[0.3em] text-[#999]">— — — — — — — —</div>;
  }
}

export function ReciboPreview({
  job,
  onImprimir,
  onCerrar,
}: {
  job: PrintJob;
  onImprimir: () => void;
  onCerrar: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-ink/40 p-6" role="dialog" aria-modal="true">
      <div className="w-full max-w-[360px]">
        {/* Barra */}
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[13px] font-semibold text-white">Ticket · 80mm</span>
          <div className="flex gap-2">
            <button type="button" onClick={onImprimir} className="rounded bg-white px-3 py-1.5 text-[13px] font-semibold text-ink hover:bg-hover">Imprimir</button>
            <button type="button" onClick={onCerrar} className="rounded border border-white/40 px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-white/10">Cerrar</button>
          </div>
        </div>
        {/* Papel */}
        <div className="mx-auto w-[302px] bg-white px-5 py-6 font-mono text-[#1a1a1a] shadow-[0_4px_24px_rgba(0,0,0,.25)]">
          {job.bloques.map((bl, i) => (
            <BloqueView key={i} bl={bl} />
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verificar typecheck**

Run: `pnpm --filter @vim/pos build 2>&1 | grep -E "Compiled|error TS"`
Expected: `Compiled successfully`.

- [ ] **Step 3: Commit**

```bash
git add apps/pos/app/components/recibo-preview.tsx
git commit -m "feat(pos): recibo-preview (P-222) desde el PrintJob, con QR"
```

---

## Task 7: `leerTicketParaImpresion` (lectura Supabase bajo RLS)

**Files:**
- Create: `apps/pos/app/lib/print/ticket-datos.ts`

**Patrón a espejar:** `leerTotales` de `lib/cobro.ts` (employeeClient + select + map a tipo plano).

- [ ] **Step 1: Implementar `ticket-datos.ts`**

```ts
"use client";
import { employeeClient } from "../supabase";
import type { DatosTicketImpresion, LineaImpresion, PagoImpresion } from "./tipos";

const METODO_LABEL: Record<string, string> = {
  EFECTIVO: "Efectivo",
  TARJETA_CREDITO: "Tarjeta de crédito",
  TARJETA_DEBITO: "Tarjeta de débito",
  TRANSFERENCIA: "Transferencia",
  APP_RAPPI: "Rappi", APP_UBEREATS: "Uber Eats", APP_DIDI: "DiDi", APP_IFOOD: "iFood", APP_OTRO: "App externa",
};
const MODO_LABEL: Record<string, string> = {
  COMER_AQUI: "Comer aquí", PARA_LLEVAR: "Para llevar", DRIVE_THRU: "Drive-thru",
};

type Ctx = { token: string; cajeroNombre: string; cajaNombre: string };

/** Lee el ticket persistido y arma los datos planos para impresión (bajo RLS del empleado). */
export async function leerTicketParaImpresion(ticketId: string, ctx: Ctx): Promise<DatosTicketImpresion> {
  const sb = employeeClient(ctx.token);

  const { data: t, error: e1 } = await sb
    .from("tickets")
    .select("folio_completo, modo_servicio, subtotal_mxn, descuentos_manuales_mxn, iva_mxn, total_mxn, propina_mxn, fecha_pago, created_at, sucursal_id, tenant_id")
    .eq("id", ticketId)
    .single();
  if (e1 || !t) throw new Error(e1?.message ?? "Ticket no encontrado");
  const tk = t as Record<string, string | number | null>;

  const { data: items, error: e2 } = await sb
    .from("ticket_items")
    .select("id, producto_nombre_snapshot, cantidad, total_item_mxn, ticket_item_modificadores(opcion_nombre_snapshot)")
    .eq("ticket_id", ticketId)
    .eq("cancelado", false)
    .order("created_at", { ascending: true });
  if (e2) throw new Error(e2.message);
  const lineas: LineaImpresion[] = (items ?? []).map((it) => {
    const r = it as { producto_nombre_snapshot: string; cantidad: number; total_item_mxn: string | number; ticket_item_modificadores: { opcion_nombre_snapshot: string }[] | null };
    return {
      cantidad: Number(r.cantidad),
      nombre: r.producto_nombre_snapshot,
      totalMxn: Number(r.total_item_mxn),
      modificadores: (r.ticket_item_modificadores ?? []).map((m) => m.opcion_nombre_snapshot),
    };
  });

  const { data: pagos, error: e3 } = await sb
    .from("pagos")
    .select("metodo_pago, monto_mxn, monto_recibido_mxn, cambio_mxn")
    .eq("ticket_id", ticketId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (e3) throw new Error(e3.message);
  const pagosImp: PagoImpresion[] = (pagos ?? []).map((p) => {
    const r = p as { metodo_pago: string; monto_mxn: string | number; monto_recibido_mxn: string | number | null; cambio_mxn: string | number };
    return {
      metodo: METODO_LABEL[r.metodo_pago] ?? r.metodo_pago,
      montoMxn: Number(r.monto_mxn),
      recibidoMxn: r.monto_recibido_mxn == null ? null : Number(r.monto_recibido_mxn),
      cambioMxn: Number(r.cambio_mxn),
    };
  });

  const { data: suc } = await sb
    .from("sucursales")
    .select("nombre, direccion_calle, direccion_numero, direccion_colonia, ciudad, estado_geo, codigo_postal, telefono")
    .eq("id", tk.sucursal_id as string)
    .single();
  const s = (suc ?? {}) as Record<string, string | null>;
  const direccion = [
    [s.direccion_calle, s.direccion_numero].filter(Boolean).join(" "),
    s.direccion_colonia, [s.ciudad, s.estado_geo].filter(Boolean).join(", "),
    s.codigo_postal ? `CP ${s.codigo_postal}` : null,
  ].filter(Boolean).join(", ") || null;

  const { data: ten } = await sb
    .from("tenants")
    .select("codigo, nombre_comercial, razon_social, rfc")
    .eq("id", tk.tenant_id as string)
    .single();
  const tn = (ten ?? {}) as Record<string, string | null>;

  return {
    negocio: { nombre: tn.nombre_comercial ?? "Negocio", razonSocial: tn.razon_social ?? null, rfc: tn.rfc ?? null },
    sucursal: { nombre: (s.nombre as string) ?? ctx.cajaNombre, direccion, telefono: s.telefono ?? null },
    meta: {
      folio: (tk.folio_completo as string) ?? "—",
      fechaIso: (tk.fecha_pago as string) ?? (tk.created_at as string) ?? new Date().toISOString(),
      cajero: ctx.cajeroNombre,
      caja: ctx.cajaNombre,
      modoServicio: MODO_LABEL[tk.modo_servicio as string] ?? (tk.modo_servicio as string) ?? "",
    },
    lineas,
    totales: {
      subtotal: Number(tk.subtotal_mxn), descuentos: Number(tk.descuentos_manuales_mxn),
      iva: Number(tk.iva_mxn), total: Number(tk.total_mxn), propina: Number(tk.propina_mxn),
    },
    pagos: pagosImp,
    qrUrl: `https://factura.vimpos.mx/${tn.codigo ?? "negocio"}?folio=${tk.folio_completo ?? ""}`,
    ancho: 80,
  };
}
```

> Nota: `new Date().toISOString()` no está prohibido en el código de la app (solo en scripts de Workflow). Aquí es un fallback raro (ticket sin fechas), aceptable.

- [ ] **Step 2: Verificar typecheck**

Run: `pnpm --filter @vim/pos build 2>&1 | grep -E "Compiled|error TS"`
Expected: `Compiled successfully`. Si PostgREST se queja del embed `ticket_item_modificadores`, usar el nombre exacto de la relación (ya se usa en F5.2; debería resolver por FK directa ticket_item→modificadores).

- [ ] **Step 3: Commit**

```bash
git add apps/pos/app/lib/print/ticket-datos.ts
git commit -m "feat(pos): leerTicketParaImpresion (lee ticket+items+pagos+sucursal+tenant bajo RLS)"
```

---

## Task 8: Integrar en `home-pos` (confirmación P-077 + montaje del recibo)

**Files:**
- Modify: `apps/pos/app/components/home-pos.tsx`

- [ ] **Step 1: Imports + estado**

Añadir imports al inicio (junto a los otros de `./`):

```ts
import { obtenerImpresora } from "../lib/print/adapter";
import { leerTicketParaImpresion } from "../lib/print/ticket-datos";
import { construirTicketJob } from "../lib/print/ticket-builder";
import { ReciboPreview } from "./recibo-preview";
import type { PrintJob } from "../lib/print/tipos";
```

Dentro de `HomePos`, junto a los otros `useState`, añadir el job del recibo y un flag para mostrarlo:

```ts
const [reciboJob, setReciboJob] = useState<PrintJob | null>(null);
const [mostrarRecibo, setMostrarRecibo] = useState(false);
const [estadoTicket, setEstadoTicket] = useState<"idle" | "lista" | "error">("idle");
```

- [ ] **Step 2: Construir e "imprimir" el ticket tras el pago**

Reemplazar el handler `onPagado` del `<ModalCobro>` (hoy: `setTotalesCobro(null); setTicketBd(null); dispatch({tipo:"limpiar"}); setConfirmacion({folio,cambio});`) por una versión que además arma el job y lo pasa al adapter. Sustituir el bloque del `ModalCobro` por:

```tsx
{totalesCobro && (
  <ModalCobro
    token={token}
    sucursalId={caja.sucursal_id}
    totalesIniciales={totalesCobro}
    onPagado={async (folio, cambio) => {
      const ticketId = totalesCobro.ticketId;
      setTotalesCobro(null);
      setTicketBd(null);
      dispatch({ tipo: "limpiar" });
      setConfirmacion({ folio, cambio });
      // Armar el ticket y dejarlo "listo" (no abrir el overlay: no estorbar el flujo QS).
      try {
        const datos = await leerTicketParaImpresion(ticketId, {
          token, cajeroNombre: empleado.nombre, cajaNombre: caja.nombre,
        });
        setReciboJob(construirTicketJob(datos));
        setEstadoTicket("lista");
      } catch {
        setEstadoTicket("error");
      }
    }}
    onCerrar={() => setTotalesCobro(null)}
  />
)}
```

> Decisión: en modo Preview (sin impresora) no se "auto-imprime"; solo se prepara el job y la fila queda "lista" en P-077. El cajero abre el recibo con "Ver/Imprimir". Cuando exista `EpsonEposAdapter`, aquí se añadirá `await obtenerImpresora(cfg).imprimir(job)` para imprimir en papel automáticamente al cobrar (doc 16 §8).

- [ ] **Step 3: Enriquecer la confirmación a P-077**

Reemplazar el bloque actual de `confirmacion` (el modal simple "Venta cobrada") por la versión P-077 con tarjeta de pago, panel de impresión (1 fila) y acciones:

```tsx
{confirmacion && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" role="dialog" aria-modal="true">
    <div className="w-full max-w-md rounded-xl bg-surface p-6 text-center shadow-xl">
      <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-success/10 text-success">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="h-8 w-8"><path d="M20 6 9 17l-5-5" /></svg>
      </div>
      <div className="font-display text-[22px] font-semibold">Cobro completado</div>
      {confirmacion.folio && <div className="mt-1 text-[13px] text-ink-3">Ticket {confirmacion.folio}</div>}
      {confirmacion.cambio > 0 && (
        <div className="mt-3 rounded-lg border border-line">
          <div className="flex items-center justify-between px-4 py-3 text-success">
            <span className="text-[14px] font-semibold">Cambio a entregar</span>
            <span className="font-display text-[20px] font-bold tabular-nums">{fmtMxn(confirmacion.cambio)}</span>
          </div>
        </div>
      )}
      {/* Panel de impresión (1 fila: ticket del cliente) */}
      <div className="mt-4 flex items-center gap-3 rounded-lg border border-line px-4 py-3 text-left">
        <span className={["flex h-8 w-8 items-center justify-center rounded", estadoTicket === "lista" ? "bg-success/10 text-success" : estadoTicket === "error" ? "bg-danger/10 text-danger" : "bg-hover text-ink-3"].join(" ")}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4"><polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" /></svg>
        </span>
        <div className="flex-1">
          <div className="text-[14px] font-semibold">Ticket del cliente</div>
          <div className="text-[12px] text-ink-3">{estadoTicket === "lista" ? "Vista previa lista · 80mm" : estadoTicket === "error" ? "No se pudo armar" : "Preparando…"}</div>
        </div>
        {reciboJob && (
          <button type="button" onClick={() => setMostrarRecibo(true)} className="rounded border border-line-strong px-3 py-1.5 text-[13px] font-semibold text-ink-2 hover:border-ink hover:text-ink">
            Ver / Imprimir
          </button>
        )}
      </div>
      <Button className="mt-4 w-full" onClick={() => { setConfirmacion(null); setReciboJob(null); setMostrarRecibo(false); setEstadoTicket("idle"); }}>Nuevo ticket</Button>
    </div>
  </div>
)}
{mostrarRecibo && reciboJob && (
  <ReciboPreview
    job={reciboJob}
    onImprimir={() => obtenerImpresora({ onMostrar: () => {} }).imprimir(reciboJob)}
    onCerrar={() => setMostrarRecibo(false)}
  />
)}
```

- [ ] **Step 4: Verificar typecheck**

Run: `pnpm --filter @vim/pos build 2>&1 | grep -E "Compiled|error TS"`
Expected: `Compiled successfully`.

- [ ] **Step 5: Commit**

```bash
git add apps/pos/app/components/home-pos.tsx
git commit -m "feat(pos): confirmacion P-077 enriquecida + recibo del ticket al cobrar"
```

---

## Task 9: E2E navegador + cierre

- [ ] **Step 1: Correr todos los tests puros**

Run: `pnpm --filter @vim/pos exec vitest run`
Expected: PASS (ticket-builder 3 + escpos 5).

- [ ] **Step 2: Levantar entorno y E2E**

Con Docker arriba: `supabase start` (si no está), y el dev server del POS (puerto 3000). Recorrido (Preview MCP):
1. Login María (1234) → turno → agregar Hamburguesa Clásica → Cobrar → propina 15% → efectivo $200 → PAGADO.
2. En la confirmación P-077: aparece "Cobro completado", cambio, y la fila "Ticket del cliente · Vista previa lista".
3. Clic "Ver / Imprimir" → el recibo 80mm (P-222) muestra: "Knock-Out Burger", dirección, Fecha/Ticket/Cajero/Caja/Servicio, "1x Hamburguesa Clásica $120.00" con modificadores, Subtotal/Descuento/IVA/TOTAL $108.00, Efectivo/Recibido/Cambio, Propina $18.00, QR escaneable y el corte.
4. Cerrar → "Nuevo ticket" limpia.

- [ ] **Step 3: RLS sanity + commit del E2E**

Run: `supabase test db 2>&1 | grep Result` → `PASS` (sin cambios de esquema).

```bash
git add -A && git commit --allow-empty -m "test(pos): E2E F5.3 — preview del ticket verificado tras el cobro"
```

- [ ] **Step 4: Merge a main + tablero**

```bash
git checkout main && git merge --no-ff f5.3-impresion-ticket -m "merge: F5.3 — impresion nucleo + vista previa del ticket (P-222/P-077)"
git push origin main
git branch -d f5.3-impresion-ticket
```

Actualizar `MEMORY.md` (F5.3 ✅: PrintJob + escpos + PreviewAdapter activo + Epson scaffold sin verificar; vitest como primer runner unit; diferidos: comanda/cajón/cola Dexie/CFDI) y la línea F5 del `18-PLAYBOOK`.

---

## Self-review (cobertura del spec)

- §1 alcance (núcleo + preview, ticket-only) → Tasks 1–8. ✅
- §2 una sola fuente PrintJob → Task 2 (builder) alimenta Task 6 (preview) y Task 3 (escpos). ✅
- §3 estructura de archivos → todas las tasks (ticket.ts dividido en builder/datos, documentado). ✅
- §4 modelo PrintJob/Bloque → Task 1. ✅
- §5 leer + construir (mapeo P-222) → Tasks 2 (build) y 7 (read). ✅
- §6 escpos (texto/fila/sep/qr/corte, translit ASCII) → Task 3. ✅
- §7 adapters (Preview activo, Epson scaffold) → Tasks 4, 5. ✅
- §8 UI P-077 + overlay P-222 → Tasks 6, 8. ✅
- §9 errores (no bloquea venta; leer falla → estado error) → Task 8. ✅
- §10 verificación (E2E preview + vitest golden) → Tasks 2, 3, 9. ✅
- §11 supuestos (vitest dep, qrcode.react, 80mm) → Task 1. ✅
- Diferidos (comanda/cajón/cola Dexie/logo ráster/CFDI/WebUSB-BT) → sin tasks (correcto). ✅
