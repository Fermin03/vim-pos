import { test } from "node:test";
import assert from "node:assert/strict";
import { clienteMpConfig, idExterno, pedirTokens, tokensDeRespuesta, urlAutorizacion } from "./mercado-pago-conexion.ts";

test("los tokens de la respuesta: completos o nada", () => {
  const t = tokensDeRespuesta({ access_token: "a", refresh_token: "r", user_id: 123, expires_in: 60, live_mode: false }, 0);
  assert.deepEqual(t, { access_token: "a", refresh_token: "r", user_id: "123", vence_at: "1970-01-01T00:01:00.000Z", de_prueba: true });
  assert.equal(tokensDeRespuesta({ access_token: "a", user_id: 1, expires_in: 60 }), null); // sin refresh no se puede renovar
  assert.equal(tokensDeRespuesta(null), null);
});

test("la URL de autorización y los ids externos", () => {
  const u = new URL(urlAutorizacion({ clientId: "7", redirectUri: "https://admin.vimpos.com.mx/integraciones/mercado-pago/callback", state: "abc" }));
  assert.equal(u.origin + u.pathname, "https://auth.mercadopago.com/authorization");
  assert.equal(u.searchParams.get("redirect_uri"), "https://admin.vimpos.com.mx/integraciones/mercado-pago/callback");
  assert.equal(u.searchParams.get("state"), "abc");
  assert.equal(idExterno("5CAFA205-f306-4941-adf4-e8af87df079f"), "5cafa205f3064941adf4e8af87df079f");
});

test("el canje manda todo en el cuerpo y nada en la query", async () => {
  let visto: { url: string; cuerpo: Record<string, unknown> } | null = null;
  const falso = ((url: string, init: RequestInit) => {
    visto = { url, cuerpo: JSON.parse(String(init.body)) };
    return Promise.resolve(new Response(JSON.stringify({ access_token: "a", refresh_token: "r", user_id: 9, expires_in: 100 }), { status: 200 }));
  }) as unknown as typeof fetch;
  const r = await pedirTokens({ clientId: "id", clientSecret: "sec", code: "c", redirectUri: "https://x/cb" }, falso);
  assert.equal(visto!.url, "https://api.mercadopago.com/oauth/token");
  assert.deepEqual(visto!.cuerpo, { client_id: "id", client_secret: "sec", grant_type: "authorization_code", code: "c", redirect_uri: "https://x/cb" });
  assert.equal(r.tokens?.user_id, "9");
});

test("una sucursal que ya existe en Mercado Pago no se crea dos veces", async () => {
  const llamadas: string[] = [];
  const falso = ((url: string, init: RequestInit) => {
    llamadas.push(`${init.method} ${url}`);
    return Promise.resolve(new Response(JSON.stringify({ results: [{ id: 555 }] }), { status: 200 }));
  }) as unknown as typeof fetch;
  const id = await clienteMpConfig("tok", falso).sucursal("9", "5cafa205-f306-4941-adf4-e8af87df079f",
    { nombre: "Centro", calle: "Madero", numero: "1", ciudad: "León", estado: "Guanajuato", latitud: 21.1, longitud: -101.6 });
  assert.equal(id, "555");
  assert.deepEqual(llamadas, ["GET https://api.mercadopago.com/users/9/stores/search?external_id=5cafa205f3064941adf4e8af87df079f"]);
});
