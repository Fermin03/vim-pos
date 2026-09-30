import { test } from "node:test";
import assert from "node:assert/strict";
import { cajaIdDeEmail, correoDispositivo, esDominioViejo } from "./dispositivo.ts";

const ID = "99999999-0000-0000-0000-0000000000cc";

test("las cuentas nuevas llevan el dominio de VIM", () => {
  assert.equal(correoDispositivo(ID), `caja-${ID}@dispositivos.vimpos.com.mx`);
  assert.equal(correoDispositivo(ID.toUpperCase()), `caja-${ID}@dispositivos.vimpos.com.mx`);
});

test("se reconocen los dos dominios mientras se migran las cuentas", () => {
  assert.equal(cajaIdDeEmail(`caja-${ID}@dispositivos.vimpos.com.mx`), ID);
  assert.equal(cajaIdDeEmail(`caja-${ID}@dispositivos.vimpos.mx`), ID);
  assert.equal(cajaIdDeEmail(`CAJA-${ID.toUpperCase()}@Dispositivos.VimPos.MX`), ID);
});

test("nada fuera de esos dos dominios pasa por dispositivo", () => {
  assert.equal(cajaIdDeEmail(`caja-${ID}@dispositivos.vimpos.com.mx.evil.com`), null);
  assert.equal(cajaIdDeEmail(`caja-${ID}@otro.vimpos.com.mx`), null);
  assert.equal(cajaIdDeEmail(`caja-${ID}@dispositivos.vimposXmx`), null);
  assert.equal(cajaIdDeEmail("dueno@knockout.dev"), null);
  assert.equal(cajaIdDeEmail(null), null);
});

test("esDominioViejo distingue lo que falta migrar", () => {
  assert.equal(esDominioViejo(`caja-${ID}@dispositivos.vimpos.mx`), true);
  assert.equal(esDominioViejo(`caja-${ID}@dispositivos.vimpos.com.mx`), false);
  assert.equal(esDominioViejo("alguien@dispositivos.vimpos.mx"), false);
});
