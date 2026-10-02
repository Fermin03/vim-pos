import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { imprimirEnColaWindows, interpretarSalida, nombreValido, resumirImpresoras } from "./impresora-windows.mjs";

/** Proceso de mentira: guarda lo que le escriben y contesta lo que se le diga. */
function hijoFalso(salida, codigo = 0) {
  const llamadas = [];
  const lanzar = (cmd, args, opts) => {
    const hijo = new EventEmitter();
    hijo.stdout = new EventEmitter();
    hijo.kill = () => {};
    const entrada = { cmd, args, opts, stdin: "" };
    llamadas.push(entrada);
    hijo.stdin = Object.assign(new EventEmitter(), {
      end: (d) => {
        entrada.stdin = d;
        setImmediate(() => { hijo.stdout.emit("data", salida); hijo.emit("close", codigo); });
      },
    });
    return hijo;
  };
  return { lanzar, llamadas };
}

test("interpretarSalida: OK es éxito", () => {
  assert.deepEqual(interpretarSalida("OK\r\n", 0), { ok: true });
});

test("interpretarSalida: la impresora ya no existe en Windows → OFFLINE con un mensaje que se entiende", () => {
  const r = interpretarSalida("ABRIR 1801", 0);
  assert.equal(r.ok, false);
  assert.equal(r.motivo, "OFFLINE");
  assert.match(r.error, /ya no está instalada/);
});

test("interpretarSalida: la cola rechaza el trabajo → ERROR con el código", () => {
  const r = interpretarSalida("ENVIAR 5", 0);
  assert.deepEqual({ ok: r.ok, motivo: r.motivo }, { ok: false, motivo: "ERROR" });
  assert.match(r.error, /código 5/);
});

test("interpretarSalida: salida vacía o rara nunca es éxito", () => {
  assert.equal(interpretarSalida("", 1).ok, false);
  assert.equal(interpretarSalida("OK de mentira", 0).ok, false);
});

test("nombreValido rechaza vacíos, saltos de línea y nombres larguísimos", () => {
  assert.equal(nombreValido("POS-80C"), true);
  assert.equal(nombreValido(""), false);
  assert.equal(nombreValido("   "), false);
  assert.equal(nombreValido("a\nb"), false);
  assert.equal(nombreValido("x".repeat(261)), false);
  assert.equal(nombreValido(undefined), false);
});

test("imprimir: el nombre va por entorno y los bytes por stdin — nada se interpola en el script", async () => {
  const { lanzar, llamadas } = hijoFalso("OK");
  const maligno = `POS"; Remove-Item C:\\ -Recurse; "`;
  const r = await imprimirEnColaWindows({ nombre: maligno, datosB64: "G0A=" }, { lanzar, plataforma: "win32" });
  assert.deepEqual(r, { ok: true });
  assert.equal(llamadas.length, 1);
  const { args, opts, stdin } = llamadas[0];
  assert.equal(opts.env.VIM_IMPRESORA, maligno);
  assert.equal(opts.env.VIM_SOLO_ABRIR, "0");
  assert.equal(stdin, "G0A=");
  const script = Buffer.from(args[args.indexOf("-EncodedCommand") + 1], "base64").toString("utf16le");
  assert.equal(script.includes("Remove-Item"), false);
  assert.match(script, /pDataType = "RAW"/);
});

test("imprimir: soloConectar pide solo abrir la impresora", async () => {
  const { lanzar, llamadas } = hijoFalso("OK");
  await imprimirEnColaWindows({ nombre: "POS-80C", soloConectar: true }, { lanzar, plataforma: "win32" });
  assert.equal(llamadas[0].opts.env.VIM_SOLO_ABRIR, "1");
});

test("imprimir: sin nombre o con datos que no son base64 no se lanza nada", async () => {
  const { lanzar, llamadas } = hijoFalso("OK");
  assert.equal((await imprimirEnColaWindows({ nombre: "" }, { lanzar, plataforma: "win32" })).ok, false);
  assert.equal((await imprimirEnColaWindows({ nombre: "POS", datosB64: "no es base64 !!" }, { lanzar, plataforma: "win32" })).ok, false);
  assert.equal(llamadas.length, 0);
});

test("imprimir: fuera de Windows contesta que no está disponible", async () => {
  const { lanzar, llamadas } = hijoFalso("OK");
  const r = await imprimirEnColaWindows({ nombre: "POS-80C" }, { lanzar, plataforma: "linux" });
  assert.equal(r.ok, false);
  assert.equal(llamadas.length, 0);
});

test("imprimir: si PowerShell no arranca, es un fallo — no un éxito silencioso", async () => {
  const lanzar = () => { throw new Error("ENOENT"); };
  const r = await imprimirEnColaWindows({ nombre: "POS-80C" }, { lanzar, plataforma: "win32" });
  assert.deepEqual({ ok: r.ok, motivo: r.motivo }, { ok: false, motivo: "ERROR" });
});

test("resumirImpresoras: nombre + predeterminada, ordenadas, sin entradas rotas", () => {
  const r = resumirImpresoras([
    { name: "POS-80C", isDefault: false },
    { name: "Cocina", isDefault: true },
    { name: "" },
    null,
  ]);
  assert.deepEqual(r, [{ nombre: "Cocina", predeterminada: true }, { nombre: "POS-80C", predeterminada: false }]);
  assert.deepEqual(resumirImpresoras(undefined), []);
});

// La prueba de verdad contra winspool: en Windows, mandar bytes a una impresora que no existe debe
// volver con el 1801 que la UI traduce. Comprueba que el script compila y que el P/Invoke está bien.
test("integración (solo Windows): una impresora inexistente vuelve OFFLINE", { skip: process.platform !== "win32" }, async () => {
  const r = await imprimirEnColaWindows({ nombre: "VIM-impresora-que-no-existe", datosB64: "G0A=" });
  assert.equal(r.ok, false);
  assert.equal(r.motivo, "OFFLINE");
  assert.match(r.error, /ya no está instalada/);
});
