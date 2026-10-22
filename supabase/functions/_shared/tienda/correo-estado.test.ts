import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { correoDeEstado, type Deps, FRASES_DE_LA_PAGINA, leerSeguimiento, mandarCorreosDeEstado, type Pendiente, type Resultado, type Seguimiento, TIPOS, topePorHora } from "./correo-estado.ts";

const ENLACE = "https://online.vimpos.com.mx/knockout/pedido/AAAAAAAAAAAAAAAAAAAAAA";
const seg = (x: Partial<Seguimiento> = {}): Seguimiento => ({ folio_corto: "T12345", modo: "RECOGER", estado: "EN_PREPARACION", motivo: null, pago_estado: null, ...x });
const correo = (tipo: typeof TIPOS[number], s: Partial<Seguimiento> = {}, enlace: string | null = ENLACE, negocio = "Knock-Out Burger") =>
  correoDeEstado({ tipo, negocio, enlace, seg: seg(s) });
/** El texto visible, sin etiquetas. */
const texto = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

// ── Qué correo corresponde a cada estado ─────────────────────────────────────────────────────────
test("en preparación: asunto con folio y negocio, las palabras de la página y el botón", () => {
  const c = correo("EN_PREPARACION")!;
  assert.equal(c.subject, "Tu pedido T12345 esta en preparacion - Knock-Out Burger");
  assert.match(texto(c.html), /Knock-Out Burger Pedido T12345 En preparación El restaurante ya está preparando tu pedido\. Ver mi pedido/);
  assert.ok(c.html.includes(`href="${ENLACE}"`));
});
test("listo: para recoger en RECOGER, en camino en DOMICILIO, y ninguno dice lo del otro", () => {
  const r = correo("LISTO", { estado: "LISTO_PARA_RECOGER" })!;
  assert.equal(r.subject, "Tu pedido T12345 esta listo para recoger - Knock-Out Burger");
  assert.match(texto(r.html), /Listo para recoger Ya puedes pasar por tu pedido\./);
  assert.doesNotMatch(r.html, /camino/i);
  const d = correo("LISTO", { modo: "DOMICILIO", estado: "EN_CAMINO" })!;
  assert.equal(d.subject, "Tu pedido T12345 va en camino - Knock-Out Burger");
  assert.match(texto(d.html), /En camino Tu pedido va hacia ti\./);
  assert.doesNotMatch(d.html, /recoger/i);
});
test("cancelado al recibir: el motivo con las palabras de la página, sin hablar de devoluciones", () => {
  const casos: [string | null, RegExp][] = [
    ["SIN_RESPUESTA", /El restaurante no confirmó tu pedido a tiempo\. No se te cobró nada\./],
    ["AGOTADO", /Se agotó algo de tu pedido\./],
    ["CERRADO", /El restaurante ya cerró\./],
    ["SATURADO", /El restaurante tiene demasiados pedidos en este momento\./],
    ["OTRO", /El restaurante no pudo tomar tu pedido\./],
    [null, /El restaurante no pudo tomar tu pedido\./],
  ];
  for (const [motivo, dice] of casos) {
    const c = correo("CANCELADO", { estado: "CANCELADO", motivo })!;
    assert.equal(c.subject, "Tu pedido T12345 se cancelo - Knock-Out Burger");
    assert.match(texto(c.html), dice);
    assert.doesNotMatch(c.html, /devolv|banco/i);
  }
});
test("cancelado ya pagado en línea: dice que el pago se devuelve completo y NUNCA «no se te cobró»", () => {
  for (const pago_estado of ["DEVOLUCION_EN_PROCESO", "PAGADO"]) {
    const t = texto(correo("CANCELADO", { estado: "CANCELADO", motivo: "SIN_RESPUESTA", pago_estado })!.html);
    assert.match(t, /El restaurante no confirmó tu pedido a tiempo\. Estamos devolviendo tu pago completo\. Cuándo lo ves reflejado depende de tu banco\./);
    assert.doesNotMatch(t, /No se te cobró/);
  }
  const ya = texto(correo("CANCELADO", { estado: "CANCELADO", motivo: "AGOTADO", pago_estado: "DEVUELTO" })!.html);
  assert.match(ya, /Se agotó algo de tu pedido\. Te devolvimos tu pago completo\. Cuándo lo ves reflejado/);
});
test("pago devuelto: «Te devolvimos tu pago», y el del pago que llegó tarde lo explica", () => {
  const c = correo("DEVUELTO", { estado: "CANCELADO", motivo: "AGOTADO", pago_estado: "DEVUELTO" })!;
  assert.equal(c.subject, "Te devolvimos tu pago del pedido T12345 - Knock-Out Burger");
  assert.match(texto(c.html), /Te devolvimos tu pago Te devolvimos tu pago completo\. Cuándo lo ves reflejado depende de tu banco\./);
  assert.doesNotMatch(c.html, /se había cerrado/);
  for (const motivo of ["SIN_PAGO", "SIN_VERIFICAR"]) {
    assert.match(texto(correo("DEVUELTO", { estado: "CANCELADO", motivo, pago_estado: "DEVUELTO" })!.html),
      /Tu pago se confirmó cuando tu pedido ya se había cerrado, así que no se envió al restaurante\. Te devolvimos tu pago completo\./);
  }
});

// ── Cuándo NO hay correo ─────────────────────────────────────────────────────────────────────────
test("un pedido en línea que nunca se pagó no avisa de su cancelación", () => {
  for (const pago_estado of ["SIN_PAGO", "POR_CONFIRMAR"]) {
    for (const motivo of ["SIN_PAGO", "SIN_VERIFICAR", "SIN_RESPUESTA", null]) {
      assert.equal(correo("CANCELADO", { estado: "CANCELADO", motivo, pago_estado }), null, `${pago_estado}/${motivo}`);
    }
  }
  // El pago que llegó tarde y se está devolviendo tampoco es «tu pedido se canceló».
  assert.equal(correo("CANCELADO", { estado: "CANCELADO", motivo: "SIN_PAGO", pago_estado: "DEVOLUCION_EN_PROCESO" }), null);
});
test("el correo de un estado que el pedido ya dejó atrás no sale", () => {
  const publicos = ["POR_PAGAR", "EN_PROCESO", "EN_PREPARACION", "LISTO_PARA_RECOGER", "EN_CAMINO", "ENTREGADO", "CANCELADO"];
  const vale: Record<string, string[]> = { EN_PREPARACION: ["EN_PREPARACION"], LISTO: ["LISTO_PARA_RECOGER", "EN_CAMINO"], CANCELADO: ["CANCELADO"] };
  for (const tipo of ["EN_PREPARACION", "LISTO", "CANCELADO"] as const) {
    for (const estado of publicos) {
      assert.equal(correo(tipo, { estado }) !== null, vale[tipo]!.includes(estado), `${tipo} con el pedido en ${estado}`);
    }
  }
});
test("«te devolvimos tu pago» solo con la devolución hecha", () => {
  for (const pago_estado of [null, "PAGADO", "DEVOLUCION_EN_PROCESO", "SIN_PAGO", "POR_CONFIRMAR"]) {
    assert.equal(correo("DEVUELTO", { estado: "CANCELADO", pago_estado }), null, String(pago_estado));
  }
});
test("no existe el correo de «Entregado»", () => {
  assert.deepEqual([...TIPOS], ["EN_PREPARACION", "LISTO", "CANCELADO", "DEVUELTO"]);
  for (const tipo of TIPOS) assert.equal(correo(tipo, { estado: "ENTREGADO", pago_estado: "PAGADO" }), null);
});

// ── Forma del correo ─────────────────────────────────────────────────────────────────────────────
const TODOS: [typeof TIPOS[number], Partial<Seguimiento>][] = [
  ["EN_PREPARACION", {}], ["LISTO", { estado: "LISTO_PARA_RECOGER" }], ["LISTO", { modo: "DOMICILIO", estado: "EN_CAMINO" }],
  ["CANCELADO", { estado: "CANCELADO", motivo: "SIN_RESPUESTA" }], ["CANCELADO", { estado: "CANCELADO", pago_estado: "DEVOLUCION_EN_PROCESO" }],
  ["DEVUELTO", { estado: "CANCELADO", pago_estado: "DEVUELTO" }],
];
test("ninguno promete tiempos, y el asunto va en ASCII y sin saltos de línea", () => {
  for (const [tipo, s] of TODOS) {
    const c = correo(tipo, s, ENLACE, "Tacos Él Güero\r\nBcc: a@b.c")!;
    assert.doesNotMatch(c.html, /minutos|tiempo estimado|\bmin\b|hora|pronto|en breve/i);
    assert.doesNotMatch(c.subject, /[^\x20-\x7E]/);
    assert.match(c.subject, /T12345/);
  }
  assert.doesNotMatch(correo("EN_PREPARACION", {}, ENLACE, "日本")!.subject, /[\s-]$/);
});
test("negocio, folio y enlace se escapan, y el href no se puede romper", () => {
  const c = correoDeEstado({ tipo: "EN_PREPARACION", negocio: "<script>x</script>", enlace: "https://x.mx/a\"onclick=\"y'<z>", seg: seg({ folio_corto: "A\"<i>" }) })!;
  assert.doesNotMatch(c.html, /<script>|<i>|<z>/);
  assert.doesNotMatch(c.html, /href="[^"]*"[^>]*onclick/);
});
test("sin enlace el correo sale igual, sin botón y con el folio", () => {
  for (const [tipo, s] of TODOS) {
    const c = correo(tipo, s, null)!;
    assert.doesNotMatch(c.html, /<a |Ver mi pedido/);
    assert.match(c.html, /T12345/);
  }
});
test("las frases que vienen de la página siguen estando en textos.ts", () => {
  const pagina = readFileSync(new URL("../../../../apps/tienda/app/lib/textos.ts", import.meta.url), "utf8");
  for (const frase of FRASES_DE_LA_PAGINA) assert.ok(pagina.includes(frase), `textos.ts ya no dice: ${frase}`);
});

// ── leerSeguimiento y el tope ────────────────────────────────────────────────────────────────────
test("leerSeguimiento: el pago solo cuenta en el pedido en línea; lo que no es un seguimiento, null", () => {
  const base = { folio_corto: "T1", modo: "RECOGER", estado: "CANCELADO", motivo: "AGOTADO", pago: "EFECTIVO" };
  assert.deepEqual(leerSeguimiento(base), { folio_corto: "T1", modo: "RECOGER", estado: "CANCELADO", motivo: "AGOTADO", pago_estado: null });
  assert.equal(leerSeguimiento({ ...base, pago_estado: "DEVUELTO" })!.pago_estado, null);
  assert.equal(leerSeguimiento({ ...base, pago: "EN_LINEA", pago_estado: "DEVUELTO" })!.pago_estado, "DEVUELTO");
  for (const x of [null, undefined, "x", 3, {}, { ...base, modo: "UBER" }, { ...base, folio_corto: null }]) assert.equal(leerSeguimiento(x), null);
});
test("el tope por hora: 30 si no se configura o es basura; 0 apaga", () => {
  for (const v of [undefined, "", "  ", "abc", "-1", "1.5", "1001", "NaN"]) assert.equal(topePorHora(v), 30, String(v));
  assert.equal(topePorHora("0"), 0);
  assert.equal(topePorHora(" 12 "), 12);
  assert.equal(topePorHora("1000"), 1000);
});

// ── Vaciar la cola ───────────────────────────────────────────────────────────────────────────────
const HUELLA = "a".repeat(64);
const pendiente = (x: Partial<Pendiente> = {}): Pendiente => ({
  id: 1, tipo: "EN_PREPARACION", tenant_id: "t", slug: "knockout", negocio: "Knock-Out Burger",
  email: "ana@example.com", seguimiento_hash: HUELLA, cifrado: "cifrado", ...x,
});
const SEG_RPC = { folio_corto: "T12345", modo: "RECOGER", estado: "EN_PREPARACION", motivo: null, pago: "EFECTIVO" };
function banco(cola: Pendiente[], x: Partial<Deps> = {}) {
  const enviados: { to: string; subject: string; html: string }[] = [];
  const resultados: [number, Resultado][] = [];
  const muertos: number[] = [];
  const tomas: [number, number][] = [];
  const deps: Deps = {
    tomar: (max, tope) => { tomas.push([max, tope]); return Promise.resolve(cola); },
    seguimiento: () => Promise.resolve(SEG_RPC),
    descifrar: () => Promise.resolve("AAAAAAAAAAAAAAAAAAAAAA"),
    enviar: (c) => { enviados.push(c); return Promise.resolve({ enviado: true }); },
    resultado: (id, r) => { resultados.push([id, r]); return Promise.resolve(r === "ENVIADO" ? "ENVIADO" : "PENDIENTE"); },
    alMorir: (id) => { muertos.push(id); },
    base: "https://online.vimpos.com.mx", topeHora: 30, ...x,
  };
  return { deps, enviados, resultados, muertos, tomas };
}

test("manda al correo del pedido, con el enlace del código descifrado, y lo reporta enviado", async () => {
  const b = banco([pendiente()]);
  const cuenta = await mandarCorreosDeEstado(b.deps);
  assert.deepEqual(cuenta, { ENVIADO: 1, OBSOLETO: 0, SIN_CORREO: 0, FALLO: 0 });
  assert.deepEqual(b.tomas, [[10, 30]]);
  assert.equal(b.enviados.length, 1);
  assert.equal(b.enviados[0]!.to, "ana@example.com");
  assert.ok(b.enviados[0]!.html.includes('href="https://online.vimpos.com.mx/knockout/pedido/AAAAAAAAAAAAAAAAAAAAAA"'));
  assert.deepEqual(b.resultados, [[1, "ENVIADO"]]);
});
test("sin código (pedido anterior, enlace borrado o sin VIM_TIENDA_URL) sale sin botón", async () => {
  for (const x of [{ descifrar: () => Promise.resolve(null) }, { base: "" }] as Partial<Deps>[]) {
    const b = banco([pendiente()], x);
    await mandarCorreosDeEstado(b.deps);
    assert.equal(b.enviados.length, 1);
    assert.doesNotMatch(b.enviados[0]!.html, /<a /);
  }
  const b = banco([pendiente({ slug: null })]);
  await mandarCorreosDeEstado(b.deps);
  assert.doesNotMatch(b.enviados[0]!.html, /<a /);
});
test("sin correo, sin huella, sin pedido o con el estado ya pasado: no se manda nada y se descarta", async () => {
  const casos: [Partial<Pendiente>, Partial<Deps>, Resultado][] = [
    [{ email: null }, {}, "SIN_CORREO"],
    [{ seguimiento_hash: null }, {}, "OBSOLETO"],
    [{ tipo: "ENTREGADO" }, {}, "OBSOLETO"],
    [{}, { seguimiento: () => Promise.resolve(null) }, "OBSOLETO"],
    [{}, { seguimiento: () => Promise.resolve({ ...SEG_RPC, estado: "ENTREGADO" }) }, "OBSOLETO"],
    [{ tipo: "CANCELADO" }, { seguimiento: () => Promise.resolve({ ...SEG_RPC, estado: "CANCELADO", motivo: "SIN_PAGO", pago: "EN_LINEA", pago_estado: "SIN_PAGO" }) }, "OBSOLETO"],
  ];
  for (const [p, d, esperado] of casos) {
    const b = banco([pendiente(p)], d);
    await mandarCorreosDeEstado(b.deps);
    assert.equal(b.enviados.length, 0);
    assert.deepEqual(b.resultados, [[1, esperado]]);
  }
});
test("un envío que falla o revienta se reporta FALLO y no detiene a los demás", async () => {
  let n = 0;
  const b = banco([pendiente({ id: 1 }), pendiente({ id: 2 }), pendiente({ id: 3 }), pendiente({ id: 4 })], {
    enviar: () => { n++; if (n === 1) return Promise.resolve({ enviado: false }); if (n === 2) return Promise.reject(new Error("SMTP")); return Promise.resolve({ enviado: true }); },
    seguimiento: (_t, _h) => n === 3 ? Promise.reject(new Error("bd")) : Promise.resolve(SEG_RPC),
  });
  const cuenta = await mandarCorreosDeEstado(b.deps);
  assert.deepEqual(b.resultados, [[1, "FALLO"], [2, "FALLO"], [3, "ENVIADO"], [4, "FALLO"]]);
  assert.equal(cuenta.FALLO, 3);
});
test("el que se rinde (MUERTO) se avisa con su id; y si no se puede anotar el resultado, sigue", async () => {
  const b = banco([pendiente({ id: 7 }), pendiente({ id: 8 })], {
    enviar: () => Promise.resolve({ enviado: false }),
    resultado: (id) => id === 7 ? Promise.resolve("MUERTO") : Promise.reject(new Error("bd")),
  });
  await mandarCorreosDeEstado(b.deps);
  assert.deepEqual(b.muertos, [7]);
});
test("un pedido de Uber nunca llega aquí, pero si llegara no tiene seguimiento de tienda: no se manda", async () => {
  // tienda_seguimiento exige canal TIENDA y devuelve null para cualquier otro.
  const b = banco([pendiente()], { seguimiento: () => Promise.resolve(null) });
  await mandarCorreosDeEstado(b.deps);
  assert.equal(b.enviados.length, 0);
});
