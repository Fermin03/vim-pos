# Cobro a pantalla completa — plan de construcción

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que todo el cobro de la caja, de «Cobrar» a «Cobro completado», sean pantallas completas al
estilo Square con el design system de VIM, con la propina preguntada después de elegir el método.

**Architecture:** La lógica de dinero no se toca (`lib/cobro.ts`, `lib/cobro-pagos.ts`,
`lib/terminal.ts`). Se saca a un módulo puro (`lib/cobro-flujo.ts`) lo que decide el orden de los
pasos —cuándo se pregunta la propina, a dónde lleva regresar, qué montos de efectivo se sugieren—
para poder probarlo. Un componente nuevo (`components/cobro/pantalla-cobro.tsx`) da el marco de
pantalla completa (cabecera, cuerpo, pie, botones, teclado) y cada vista de `modal-cobro.tsx`,
`vista-terminal.tsx` y `cobro-completado.tsx` se rearma encima de él.

**Tech Stack:** Next.js 15 / React 19, Tailwind 3 con el preset de `@vim/config` (tokens de
`packages/ui/tokens.css`), Vitest 3 (`environment: node`, solo `app/**/*.test.ts`: no hay pruebas
de componentes).

**Spec:** [`docs/superpowers/specs/2026-10-21-cobro-pantalla-completa-design.md`](../specs/2026-10-21-cobro-pantalla-completa-design.md)
y sus bocetos en `docs/superpowers/specs/2026-10-21-cobro-pantalla-completa/`. Léelos antes de
empezar: las medidas, textos y colores de cada pantalla están ahí y este plan no los repite.

## Global Constraints

- Trabajar en un **worktree nuevo desde `main`**, rama `feat/cobro-pantalla-completa`. El checkout
  principal está en otra rama con cambios ajenos: no tocarlo. Sin push ni PR hasta que Fermín lo pida.
- Antes de escribir código, cargar la skill `ponytail` (regla del workspace) y las de Emil Kowalski
  antes de CSS (`emil-design-eng`).
- Solo tokens: nada de hex escritos a mano. Los íconos con hex de `METODOS` y la sombra
  `shadow-[inset_0_0_0_1.5px_#16161A]` desaparecen.
- Dinero siempre `font-display font-bold tabular-nums`. Una sola acción `bg-accent` por pantalla.
- Objetivos táctiles ≥ 56 px; botón principal 72 px de alto; cabecera 72 px; botón de regresar
  círculo de 56 px en el extremo izquierdo, siempre el mismo.
- Sin animación entre pasos.
- Español en el dominio, archivos `kebab-case`, componentes `PascalCase`, sin `any`.
- Comprobación de tipos con `pnpm --filter @vim/pos typecheck` (nunca `next build` con el dev
  server corriendo: comparten `.next`).
- Pruebas: `pnpm --filter @vim/pos test`.

## Review Focus

1. **Regresar después de elegir propina y cambiar de método**: la propina vieja no debe quedar
   cobrada con el método nuevo → pruebas de `vistaAlRegresar` y `debePreguntarPropina` (Tarea 1) y
   el `establecerPropina(propinaInicial)` de la Tarea 3.
2. **Ticket que ya traía propina al abrir el cobro**: no se pregunta otra y el total la incluye →
   prueba `ya fijada al abrir` (Tarea 1) y verificación en la Tarea 9.
3. **Totales con centavos o justo en un billete redondo** ($616.50, $620, $1,000): los atajos
   siempre son mayores al total y sin repetir → pruebas de `montosSugeridosEfectivo` (Tarea 1).
4. **Escape a media terminal o mientras se registra un pago**: no hace nada → prueba
   `vistaAlRegresar` devuelve `null` (Tarea 1) y verificación en la Tarea 9.
5. **Lector Clip que pregunta la propina y luego se cobra en efectivo**: VIM sí la pregunta, una vez
   → prueba en `debePreguntarPropina` (Tarea 1).

---

### Task 1: Reglas del flujo, puras y probadas

**Files:**
- Create: `apps/pos/app/lib/cobro-flujo.ts`
- Test: `apps/pos/app/lib/__tests__/cobro-flujo.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type VistaCobro =
    | "selector" | "mas" | "propina" | "efectivo" | "otro" | "dividido" | "atajo" | "terminal";
  export type DestinoMetodo = MetodoPago | "dividido" | "terminal" | "atajo"; // MetodoPago de lib/cobro
  export function montosSugeridosEfectivo(total: number): number[];
  export function debePreguntarPropina(p: {
    capturar: boolean;          // sug.capturar
    propinaFijada: boolean;     // el ticket la traía al abrir, o ya se contestó en este cobro
    destino: DestinoMetodo;
    propinaEnLector: boolean;   // terminal.propina_en_lector
  }): boolean;
  export function vistaAlRegresar(
    vista: VistaCobro,
    p: { ocupado: boolean; preguntoPropinaAqui: boolean }, // se contestó la pantalla de propina en ESTE cobro
  ): VistaCobro | "cerrar" | null;
  ```

- [ ] **Step 1: Escribe las pruebas que fallan**

```ts
describe("montosSugeridosEfectivo", () => {
  it("616 → 620, 650, 700, 1000", () => expect(montosSugeridosEfectivo(616)).toEqual([620, 650, 700, 1000]));
  it("siempre mayores al total: 620 → 630, 650, 700, 1000", () =>
    expect(montosSugeridosEfectivo(620)).toEqual([630, 650, 700, 1000]));
  it("con centavos: 616.5 → 620, 650, 700, 1000", () =>
    expect(montosSugeridosEfectivo(616.5)).toEqual([620, 650, 700, 1000]));
  it("sin repetidos y máximo cuatro: 560 → 570, 600, 1000", () =>
    expect(montosSugeridosEfectivo(560)).toEqual([570, 600, 1000]));
  it("1000 → 1010, 1050, 1100, 1500", () => expect(montosSugeridosEfectivo(1000)).toEqual([1010, 1050, 1100, 1500]));
});

describe("debePreguntarPropina", () => {
  const base = { capturar: true, propinaFijada: false, destino: "EFECTIVO" as const, propinaEnLector: false };
  it("efectivo con propina activa → sí", () => expect(debePreguntarPropina(base)).toBe(true));
  it("sucursal sin propina → no", () => expect(debePreguntarPropina({ ...base, capturar: false })).toBe(false));
  it("ya fijada al abrir o ya contestada → no", () => expect(debePreguntarPropina({ ...base, propinaFijada: true })).toBe(false));
  it("terminal con lector que pregunta → no", () =>
    expect(debePreguntarPropina({ ...base, destino: "terminal", propinaEnLector: true })).toBe(false));
  it("terminal con lector que NO pregunta → sí", () =>
    expect(debePreguntarPropina({ ...base, destino: "terminal" })).toBe(true));
  it("lector que pregunta pero se cobra en efectivo → sí", () =>
    expect(debePreguntarPropina({ ...base, propinaEnLector: true })).toBe(true));
  it("dividido y atajo también la preguntan", () => {
    expect(debePreguntarPropina({ ...base, destino: "dividido" })).toBe(true);
    expect(debePreguntarPropina({ ...base, destino: "atajo" })).toBe(true);
  });
});

describe("vistaAlRegresar", () => {
  const libre = { ocupado: false, preguntoPropinaAqui: true };
  it("ocupado no hace nada", () => expect(vistaAlRegresar("efectivo", { ...libre, ocupado: true })).toBeNull());
  it("terminal y atajo no hacen nada", () => {
    expect(vistaAlRegresar("terminal", libre)).toBeNull();
    expect(vistaAlRegresar("atajo", libre)).toBeNull();
  });
  it("método con propina preguntada → propina", () => {
    for (const v of ["efectivo", "otro", "dividido"] as const) expect(vistaAlRegresar(v, libre)).toBe("propina");
  });
  it("método sin propina preguntada → selector", () =>
    expect(vistaAlRegresar("efectivo", { ...libre, preguntoPropinaAqui: false })).toBe("selector"));
  it("propina y más → selector", () => {
    expect(vistaAlRegresar("propina", libre)).toBe("selector");
    expect(vistaAlRegresar("mas", libre)).toBe("selector");
  });
  it("selector → cerrar", () => expect(vistaAlRegresar("selector", libre)).toBe("cerrar"));
});
```

- [ ] **Step 2: Corre las pruebas y confirma que fallan**

Run: `pnpm --filter @vim/pos test -- cobro-flujo`
Expected: FAIL, no encuentra `../cobro-flujo`.

- [ ] **Step 3: Implementa `lib/cobro-flujo.ts`**

`montosSugeridosEfectivo`: para cada paso de `[10, 50, 100, 500, 1000]`, el siguiente múltiplo
**estrictamente mayor** (`Math.floor(total / paso) * paso + paso`); quitar repetidos, ordenar y
tomar 4. Las otras dos funciones son tablas de reglas directas de las pruebas; `vistaAlRegresar`
devuelve `"propina"` desde un método solo si `preguntoPropinaAqui` (si la propina se saltó o ya venía en el ticket, va al
selector).

- [ ] **Step 4: Corre las pruebas y confirma que pasan**

Run: `pnpm --filter @vim/pos test -- cobro-flujo`
Expected: PASS (todas).

- [ ] **Step 5: Commit**

```bash
git add apps/pos/app/lib/cobro-flujo.ts apps/pos/app/lib/__tests__/cobro-flujo.test.ts
git commit -m "feat(pos): reglas del flujo de cobro (propina tras el método, regresar, atajos de efectivo)"
```

### Task 2: Marco de pantalla completa

**Files:**
- Create: `apps/pos/app/components/cobro/pantalla-cobro.tsx`
- Modify: `apps/pos/app/components/modal-cobro.tsx:154-222` (el `Numpad` y `aMonto`/`aBuffer` se mudan aquí y se exportan)

**Interfaces:**
- Produces:
  ```tsx
  export function PantallaCobro(p: {
    regresar: { icono: "cerrar" | "atras"; onClick: () => void } | null; // null = sin botón (terminal cobrando)
    contexto: React.ReactNode;        // centro de la cabecera, ink-3
    derecha?: React.ReactNode;        // p. ej. el enlace «Dividir pago»
    children: React.ReactNode;        // cuerpo, flex-1
    pie?: React.ReactNode;            // zona de botones, px-8 pb-6
  }): JSX.Element;                    // capa fixed inset-0 z-50 bg-surface, role="dialog" aria-modal
  export function BotonPrincipal(p: React.ButtonHTMLAttributes<HTMLButtonElement>): JSX.Element; // h-[72px] bg-accent
  export function BotonSecundario(p: React.ButtonHTMLAttributes<HTMLButtonElement>): JSX.Element; // h-[72px] borde line-strong
  export function FilaOpcion(p: { titulo: string; sub?: React.ReactNode; aviso?: boolean; onClick: () => void }): JSX.Element; // fila 72 px con chevron
  export function Numpad(/* mismas props que hoy */): JSX.Element;
  export const aMonto: (buf: string) => number;
  export const aBuffer: (v: number) => string;
  ```

- [ ] **Step 1: Crea `pantalla-cobro.tsx`** con lo de arriba. El `Numpad` conserva su lógica (centavos,
  tope de 8 dígitos, teclado físico, `compact`/`grande`) y agrega el tamaño del boceto: teclas de
  76 px con `bg-hover`. `modal-cobro.tsx` importa de aquí y borra sus copias.
- [ ] **Step 2: Comprueba tipos y pruebas**

Run: `pnpm --filter @vim/pos typecheck && pnpm --filter @vim/pos test`
Expected: sin errores; todas las pruebas pasan.

- [ ] **Step 3: Commit** — `git commit -m "feat(pos): marco de pantalla completa para el cobro"`

### Task 3: Orden nuevo del flujo en `ModalCobro`

**Files:**
- Modify: `apps/pos/app/components/modal-cobro.tsx` (`ModalCobro`, l.1036–1509)

**Interfaces:**
- Consumes: Tarea 1 (`VistaCobro`, `debePreguntarPropina`, `vistaAlRegresar`), Tarea 2 (`PantallaCobro`).
- Produces: `ModalCobro` acepta además `contexto?: string` (la mesa o el nombre de la cuenta; si no
  llega, solo «Ticket #folio»).

- [ ] **Step 1: Arranque.** `vista` inicia en `"selector"` (o `"atajo"`). Se borran `ESPERA_LECTOR_MS`,
  el tope de 4 s, `propinaAlElegir`, el recuerdo `"2"` y el «Cargando…» de la propina.
  `propina` arranca en `totalesIniciales.propina ?? 0`; `propinaInicial` (ref) guarda ese valor y,
  si es > 0, `propinaPreguntada` arranca en `true`.
- [ ] **Step 2: Elegir método.** `elegirMetodo(destino)` llama a `debePreguntarPropina` (con
  `propinaFijada = propinaPreguntada`); si es sí, guarda `trasPropina = destino` y va a `"propina"`;
  si no, `irAMetodo`. El atajo «Efectivo exacto» entra por el mismo camino con destino `"atajo"`.
  Al tocar Tarjeta sin saber aún `terminalSabida`, mostrar «Revisando la terminal…» y esperar.
- [ ] **Step 3: Regresar.** Un solo `regresar()` que usa `vistaAlRegresar(vista, { ocupado:
  procesando || esperaDividido != null, preguntoPropinaAqui })` (estado nuevo: `true` al confirmar `VistaPropina`, `false` al volver al selector): `null` → nada; `"cerrar"` →
  `onCerrar`; al pasar de `"propina"` a `"selector"`, si la propina actual difiere de
  `propinaInicial`, `await establecerPropina(token, ticketId, propinaInicial)`, `setPropina(propinaInicial)`
  y `setPropinaPreguntada(propinaInicial > 0)`. Escape (`capaVisible`) y el botón de la cabecera
  llaman a la misma función.
- [ ] **Step 4: Contenedor.** El `div` del modal con anchos por vista se reemplaza: cada vista se pinta
  dentro de su `PantallaCobro`. Mientras `procesando` en efectivo, otro o atajo se muestra la
  pantalla **Registrando pago** del spec (con «Cambio $X / de $Y» si hay cambio). Lo de `"atajo"`
  usa esa misma pantalla.
- [ ] **Step 5: Comprueba tipos y pruebas** — `pnpm --filter @vim/pos typecheck && pnpm --filter @vim/pos test`. Expected: verde.
- [ ] **Step 6: Commit** — `git commit -m "feat(pos): la propina se pregunta después del método y regresar la deshace"`

### Task 4: «¿Cómo paga?», «Más» y Propina

**Files:**
- Modify: `apps/pos/app/components/modal-cobro.tsx` (`VistaSelector` l.226–368, `VistaPropina` l.889–1034, `METODOS` l.91–140)

**Interfaces:**
- Consumes: Tarea 2 (`PantallaCobro`, `FilaOpcion`, `BotonSecundario`, `Numpad`), Tarea 3 (`regresar`, `elegirMetodo`, vista `"mas"`).

- [ ] **Step 1: `VistaSelector`** según el spec §1: total a 96 px, filas Efectivo / Tarjeta (subtítulo
  de estado; en `warning` si no está lista) / Transferencia / Más (solo con terminal); sin terminal
  Débito y Crédito en lugar de Tarjeta y sin Más. «Dividir pago» en `derecha`. `METODOS` pierde
  `icoFn`, `icoBg` e `icoColor`, y se borran los íconos que dejen de usarse.
- [ ] **Step 2: Vista `"mas"`**: «Otra forma de pago», filas «Débito · a mano» y «Crédito · a mano»
  con «La cobraste en otra terminal». Tarjeta con la terminal no lista → `revisarTerminal()`; si
  sigue sin estar lista, `setVista("mas")`.
- [ ] **Step 3: `VistaPropina`** según el spec §2: tarjetas de 128 px por porcentaje que confirman al
  tocar; «Otro monto» cambia el cuerpo al `Numpad` con «Continuar» como `BotonPrincipal`; «Sin
  propina» confirma 0. Respeta `sug.libre` y `sug.sin`. Contexto: «{Método} · Ticket #…».
- [ ] **Step 4: Comprueba tipos** — `pnpm --filter @vim/pos typecheck`. Expected: verde.
- [ ] **Step 5: Commit** — `git commit -m "feat(pos): selector, más y propina a pantalla completa"`

### Task 5: Efectivo

**Files:**
- Modify: `apps/pos/app/components/modal-cobro.tsx` (`VistaEfectivo` l.370–505)

**Interfaces:**
- Consumes: `montosSugeridosEfectivo` (Tarea 1), marco y `Numpad` (Tarea 2).

- [ ] **Step 1: Rearma `VistaEfectivo`** según el spec §3: dos zonas (cifras | teclado de 360 px),
  Recibido a 80 px, Cambio en `success` o Falta en `warning`, chips «Exacto» +
  `montosSugeridosEfectivo(totales.pendiente)` que **fijan** el recibido (`setBuffer(aBuffer(m))`), y
  el `BotonPrincipal` con su texto dinámico, deshabilitado mientras falte. Contexto: «Total con
  propina $X» si `propina > 0`, si no «Total $X».
- [ ] **Step 2: Comprueba tipos** — `pnpm --filter @vim/pos typecheck`. Expected: verde.
- [ ] **Step 3: Commit** — `git commit -m "feat(pos): efectivo a pantalla completa con montos sugeridos"`

### Task 6: Transferencia y tarjeta a mano sin teclado

**Files:**
- Modify: `apps/pos/app/components/modal-cobro.tsx` (`VistaOtro` l.507–593)

- [ ] **Step 1: Rearma `VistaOtro`** según el spec: monto pendiente a 88 px, una línea de ayuda
  (transferencia: «Revisa que la transferencia ya llegó antes de registrarla»; débito/crédito:
  «Registra el pago que cobraste en otra terminal») y `BotonPrincipal` «Registrar {método} por $X»
  que llama `onAplicar(totales.pendiente)`. Se borran el teclado y «Monto exacto».
- [ ] **Step 2: Comprueba tipos** — `pnpm --filter @vim/pos typecheck`. Expected: verde.
- [ ] **Step 3: Commit** — `git commit -m "feat(pos): transferencia y tarjeta a mano se registran por el total"`

### Task 7: Pago dividido en una sola pantalla

**Files:**
- Modify: `apps/pos/app/components/modal-cobro.tsx` (`VistaDividida` l.707–887; borrar `ModalAgregarPago` l.595–705; el overlay `esperaDividido` l.1488–1506)

**Interfaces:**
- Consumes: marco y `Numpad` (Tarea 2); `aplicarPagosDivididos` y `cobrarParteEnTerminal` existentes sin cambio de firma.

- [ ] **Step 1: Rearma `VistaDividida`** según el spec §D: izquierda falta por cobrar (72 px), barra
  `success`, «Pagado $X de $Y» y lista de pagos con `✕` de 44 px; derecha selector de método
  (Efectivo / Tarjeta / Transferencia con terminal, con «Débito · a mano» y «Crédito · a mano» tras
  un «Más»; sin terminal Efectivo / Débito / Crédito / Transferencia), monto con «Todo lo que falta»
  (valor inicial = lo que falta) y `Numpad`. Pie: «Agregar $X con {método}» azul mientras falte;
  cuando no falta nada, solo «Completar cobro» azul.
- [ ] **Step 2:** `esperaDividido` deja de ser una ventana encima: se pinta la `VistaTerminal`
  (Tarea 8) a pantalla completa en lugar de la vista dividida mientras exista.
- [ ] **Step 3: Comprueba tipos y pruebas** — `pnpm --filter @vim/pos typecheck && pnpm --filter @vim/pos test`. Expected: verde (`cobro-pagos.test.ts` sin cambios).
- [ ] **Step 4: Commit** — `git commit -m "feat(pos): pago dividido en una pantalla, sin ventana para agregar"`

### Task 8: Terminal

**Files:**
- Modify: `apps/pos/app/components/vista-terminal.tsx`

**Interfaces:**
- Consumes: marco (Tarea 2). Misma firma de `VistaTerminal`; se agrega `contexto?: string`.

- [ ] **Step 1:** `VistaTerminal` se pinta con `PantallaCobro` según el spec §Tarjeta: cobrando y
  enviando con `regresar={null}` y solo «Cancelar cobro»; no pasó / no se pudo confirmar con `←`,
  mensaje en `danger` y sus dos botones (uno azul). Las fases, los ids por intento y
  `ModalAutorizacionPin` no cambian.
- [ ] **Step 2: Comprueba tipos y pruebas** — `pnpm --filter @vim/pos typecheck && pnpm --filter @vim/pos test`. Expected: verde (`terminal.test.ts` sin cambios).
- [ ] **Step 3: Commit** — `git commit -m "feat(pos): cobro con terminal a pantalla completa"`

### Task 9: Cobro completado, `home-pos`, documentación y prueba en la caja

**Files:**
- Modify: `apps/pos/app/components/cobro-completado.tsx`
- Modify: `apps/pos/app/components/home-pos.tsx` (~l.1873: pasar `contexto` a `ModalCobro`)
- Modify: `docs/diseno/pos.md` (sección nueva «Cobro a pantalla completa»)

- [ ] **Step 1: `CobroCompletado`** a pantalla completa según el spec §5: sin palomita y sin botón
  arriba a la derecha; «Recibió $X» (`total + cambio`) y «$X de cambio» a 88 px en `success`, o
  «Total $X · sin cambio»; «Imprimir copia» + «Nueva venta»; cuenta regresiva igual que hoy.
  La firma no cambia.
- [ ] **Step 2: `home-pos.tsx`** pasa `contexto` con el nombre de la mesa o cuenta que ya muestra el
  ticket lateral.
- [ ] **Step 3: `docs/diseno/pos.md`**: sección con las reglas de «Reglas que aplican a todas las
  pantallas» del spec y el flujo.
- [ ] **Step 4: Prueba en la caja.** Levantar el worktree con la receta de «Verificar una rama con
  capturas» (Supabase local + semilla Crazy Burgers + funciones locales + dev server del POS) y
  recorrer, a 1024×768: efectivo con cambio y con atajos; efectivo exacto desde el ticket; regresar
  efectivo → propina → selector y cobrar con transferencia (la propina debe quedar la nueva);
  transferencia; débito a mano por «Más»; dividido efectivo + transferencia; sucursal con propina
  apagada; ticket con propina previa; Escape en cada paso (en «Registrando» no hace nada). Captura
  de cada pantalla. Si no hay terminal física, la parte de terminal queda **sin verificar** y se dice.
- [ ] **Step 5: Comprueba todo** — `pnpm --filter @vim/pos typecheck && pnpm --filter @vim/pos test`. Expected: verde.
- [ ] **Step 6: Commit** — `git commit -m "feat(pos): cobro completado a pantalla completa y reglas en el diseño"`

## Después del plan

No publicar. Entregar a Fermín la lista de lo que incluye (versión 0.x.0, martes, según
`docs/operacion/actualizaciones.md`) y esperar su OK antes de push, PR o instalador.
