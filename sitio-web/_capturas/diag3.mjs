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
const btns = async (n=18) => JSON.stringify((await p.getByRole("button").allInnerTexts()).map(t=>t.replace(/\s+/g," ").trim()).filter(Boolean).slice(-n));

await p.getByRole("button", { name: /cerrar turno/i }).first().click();
await p.waitForTimeout(1500);
console.log("A) confirmacion:", await btns(6));
await p.getByRole("button", { name: /sí, cerrar turno|si, cerrar turno/i }).first().click();
await p.waitForTimeout(3500);
console.log("B) declaracion:", (await p.innerText("body")).replace(/\s+/g," ").slice(0,300));
console.log("   botones:", await btns(12));
const ins = p.locator("input");
const n = await ins.count();
for (let i=0;i<n;i++){
  const el = ins.nth(i);
  console.log(`   input[${i}] placeholder=${JSON.stringify(await el.getAttribute("placeholder"))} aria=${JSON.stringify(await el.getAttribute("aria-label"))} value=${JSON.stringify(await el.inputValue())}`);
}
const gen = p.getByRole("button", { name: /generar corte/i });
await ins.first().click();
await p.keyboard.type("3260", { delay: 60 });
await p.keyboard.press("Tab");
await p.waitForTimeout(1500);
console.log("   valor tras teclear:", JSON.stringify(await ins.first().inputValue()));
console.log("   habilitado:", await gen.isEnabled());
if (!(await gen.isEnabled())) {
  console.log("   texto de la pantalla:", (await p.innerText("body")).replace(/\s+/g," ").slice(-500));
}
await b.close();
