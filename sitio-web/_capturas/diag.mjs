import { chromium } from "playwright";
const b = await chromium.launch();
const p = await (await b.newContext({ locale: "es-MX" })).newPage();
p.on("console", m => { if (m.type()==="error") console.log("   [err]", m.text().slice(0,110)); });

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

// Catálogo -> producto -> agregar
await p.getByText(/para llevar/i).first().click(); await p.waitForTimeout(1500);
await p.getByText("Crazy Clásica").first().click(); await p.waitForTimeout(1200);
await p.getByRole("button", { name: /agregar al ticket/i }).first().click(); await p.waitForTimeout(1200);

const cob = p.locator('button', { hasText: /Cobrar/i });
console.log("A) boton Cobrar:", await cob.count(), JSON.stringify(await cob.allInnerTexts()));
console.log("   habilitado:", await cob.first().isEnabled().catch(()=>'?'));
await cob.first().click();
await p.waitForTimeout(3500);
const txt = (await p.innerText("body")).replace(/\s+/g," ");
console.log("B) tras Cobrar:", txt.slice(0,320));
const btns = (await p.getByRole("button").allInnerTexts()).map(t=>t.replace(/\s+/g," ").trim()).filter(Boolean);
console.log("C) botones ahora:", JSON.stringify(btns.slice(-16)));

await p.getByRole("button", { name: /sin propina/i }).first().click();
await p.waitForTimeout(600);
await p.getByRole("button", { name: /^Confirmar/i }).first().click();
await p.waitForTimeout(2000);
console.log("D) tras Sin propina:", (await p.innerText("body")).replace(/\s+/g," ").slice(0,300));
console.log("   botones:", JSON.stringify((await p.getByRole("button").allInnerTexts()).map(t=>t.replace(/\s+/g," ").trim()).filter(Boolean).slice(-14)));
// Completar la venta: efectivo -> exacto -> cobrar. Deja un ticket recien
// cobrado, que es lo que hace falta para la vista previa del ticket.
await p.getByRole("button", { name: /^Efectivo/i }).first().click();
await p.waitForTimeout(1500);
console.log("E) tras Efectivo:", JSON.stringify((await p.getByRole("button").allInnerTexts()).map(t=>t.replace(/\s+/g," ").trim()).filter(Boolean).slice(-14)));
console.log("   texto:", (await p.innerText("body")).replace(/\s+/g," ").slice(-260));
await b.close();
