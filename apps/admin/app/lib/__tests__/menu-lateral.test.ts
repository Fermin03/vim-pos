// @vitest-environment jsdom
//
// El menú lateral en el navegador: lo que la lógica pura (menu-admin.test.ts) no ve.
import { describe, expect, it, vi } from "vitest";
import * as React from "react";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...resto }: { href: string; children: React.ReactNode }) => createElement("a", { href, ...resto }, children),
}));

import { MenuLateral } from "../../components/menu-lateral";
import { MENU, filtrarMenu, type ContextoMenu } from "../menu-admin";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as { React?: typeof React }).React = React;
// jsdom no implementa scrollIntoView (el menú lo usa para enseñar la opción activa).
Element.prototype.scrollIntoView = () => {};

const CTX: ContextoMenu = { jerarquia: 5, ocultas: new Set(), tiendaContratada: true, gruposInformes: null };

async function montar(props: Parameters<typeof MenuLateral>[0]) {
  const contenedor = document.createElement("div");
  document.body.appendChild(contenedor);
  const raiz = createRoot(contenedor);
  await act(async () => raiz.render(createElement(MenuLateral, props)));
  return { contenedor, raiz };
}
const boton = (c: HTMLElement, texto: string) => [...c.querySelectorAll("button")].find((b) => b.textContent?.trim().startsWith(texto))!;

describe("MenuLateral", () => {
  it("un menú recalculado (lectura que llega tarde) no pliega lo que el usuario abrió", async () => {
    const props = { menu: filtrarMenu(MENU, CTX), pathname: "/dashboard", marcaPlan: () => false };
    const { contenedor, raiz } = await montar(props);
    await act(async () => boton(contenedor, "Menú").click());
    expect(boton(contenedor, "Menú").getAttribute("aria-expanded")).toBe("true");

    await act(async () => raiz.render(createElement(MenuLateral, { ...props, menu: filtrarMenu(MENU, { ...CTX, gruposInformes: new Set(["que-se-vende"]) }) })));
    expect(boton(contenedor, "Menú").getAttribute("aria-expanded")).toBe("true");
  });

  it("tocar una opción avisa que se navegó, aunque sea un ancla de la misma página", async () => {
    const alNavegar = vi.fn();
    const { contenedor } = await montar({ menu: filtrarMenu(MENU, CTX), pathname: "/reportes", marcaPlan: () => false, alNavegar });
    const ancla = contenedor.querySelector<HTMLAnchorElement>('a[href="/reportes#que-se-vende"]')!;
    ancla.addEventListener("click", (e) => e.preventDefault());
    await act(async () => ancla.click());
    expect(alNavegar).toHaveBeenCalledTimes(1);
  });
});
