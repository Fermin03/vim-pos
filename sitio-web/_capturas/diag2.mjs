import { chromium } from "playwright";
const b = await chromium.launch();
const p = await (await b.newContext({ locale: "es-MX" })).newPage();

await p.goto("http://localhost:3000", { waitUntil: "networkidle" });
const id = p.getByLabel(/identificador del dispositivo/i);
if (await id.isVisible().catch(()=>false)) {
  await id.fill("caja-9c3a71e0-0000-4000-8000-000000000003@dispositivos.vimpos.mx");
  await p.getByLabel(/clave del dispositivo/i).fill("demo-dispositivo");
  await p.getByRole("button", { name: /vincular dispositivo/i }).click();
  await p.waitForTimeout(3000);
}
const ana = p.getByText("Ana Ruiz").first();
if (await ana.isVisible().catch(()=>false)) {
  await ana.click();
  for (const d of "1234") { await p.getByRole("button", { name: d, exact: true }).click(); await p.waitForTimeout(150); }
  await p.waitForTimeout(3000);
}
const btns = async (n=16) => JSON.stringify((await p.getByRole("button").allInnerTexts()).map(t=>t.replace(/\s+/g," ").trim()).filter(Boolean).slice(-n));

await p.getByText(/para llevar/i).first().click(); await p.waitForTimeout(1500);
await p.getByText("Crazy Clásica").first().click(); await p.waitForTimeout(1200);
await p.getByRole("button", { name: /agregar al ticket/i }).first().click(); await p.waitForTimeout(900);
await p.getByRole("button", { name: /^Cobrar/i }).first().click(); await p.waitForTimeout(1500);
await p.getByRole("button", { name: /sin propina/i }).first().click(); await p.waitForTimeout(500);
await p.getByRole("button", { name: /^Confirmar/i }).first().click(); await p.waitForTimeout(1500);
await p.getByRole("button", { name: /^Efectivo/i }).first().click(); await p.waitForTimeout(1200);
await p.getByRole("button", { name: /pago exacto/i }).first().click(); await p.waitForTimeout(700);
console.log("A) antes de cobrar:", await btns(6));
// Acotado al dialogo: fuera hay OTRO boton "Cobrar $129.00" -el del panel del
// ticket- y `.first()` agarraba ese, que el modal tapa.
await p.getByRole("dialog").getByRole("button", { name: /^Cobrar/i }).first().click();
await p.waitForTimeout(5000);
console.log("B) VENTA COBRADA:", (await p.innerText("body")).replace(/\s+/g," ").slice(0,300));
console.log("   botones:", await btns(14));
await p.getByRole("button", { name: /ver \/ imprimir/i }).first().click();
await p.waitForTimeout(2500);
console.log("C) VISTA PREVIA:", (await p.innerText("body")).replace(/\s+/g," ").slice(-400));
console.log("   botones:", await btns(10));
await b.close();
