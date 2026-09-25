# Revisión de diseño visual — septiembre 2026

**Fecha:** 24 sep 2026 · **Alcance:** las seis superficies de VIM POS · **Estado:** registro (no se edita)

Revisión del diseño visual de todo el producto con dos herramientas: **Impeccable** (crítica de
diseño con heurísticas de Nielsen, carga cognitiva y personas) y la filosofía de **Emil Kowalski**
(movimiento, retroalimentación al tocar, detalles invisibles). No se tocó código: esto es la lista
de mejoras posibles para decidir qué hacer.

| Documento | Superficie | Páginas revisadas |
|---|---|---|
| [`pos.md`](pos.md) | Caja (`apps/pos`) | 68 componentes |
| [`admin.md`](admin.md) | Panel del dueño (`apps/admin`) | 65 páginas en tres bloques |
| [`kds.md`](kds.md) | Pantalla de cocina (`packages/kds-core`, `apps/kds`) | 7 estados |
| [`factura.md`](factura.md) | Portal de autofactura (`apps/factura`) | 2 páginas, 5 estados |
| [`platform.md`](platform.md) | Panel interno de VIM (`apps/platform`) | 10 páginas |
| [`sitio.md`](sitio.md) | Sitio de marketing (`sitio-web/`) | 13 páginas |

---

## Cómo se hizo, y sus límites

- **Diez revisiones independientes en paralelo:** siete de diseño (una por superficie; el admin en
  tres bloques), una de movimiento de la caja con las reglas de Emil, y dos del detector
  automático de Impeccable más una búsqueda de valores sueltos en el código. Ninguna vio el
  resultado de las otras antes de terminar.
- **Sin navegador en vivo para las apps.** La única caja corriendo en la máquina era la de
  producción (puertos 54350/54360/54329) y un segundo backend choca con su Postgres. Las
  revisiones trabajaron con el código fuente y con las capturas del sitio tomadas el **4 sep**,
  que son anteriores al catálogo sin scroll (13 sep) y a los modales al 80 % (24 sep). Donde
  capturas y código no coinciden, manda el código.
- **El sitio sí se midió en vivo** en vimpos.com.mx a 390 y 1440 px.
- **Verificación.** Cada hallazgo trae `archivo:línea` de la lectura del código. Los marcados
  **✔** se volvieron a comprobar a mano antes de escribir este registro. El resto es lectura de
  código sin reproducir en pantalla: antes de arreglar, confirma el caso concreto.

---

## Marcador

Heurísticas de Nielsen, 0–4 cada una. Lo normal en una interfaz real es 20–32 de 40.

| Superficie | Puntaje | Veredicto en una línea |
|---|---|---|
| Caja | **24/40** | El comportamiento está hecho para el mostrador; se ve como cualquier panel administrativo |
| Admin | **21/40** | Catálogo 21 · reportes 22 · configuración 21. Texto excelente; cada página armada distinto |
| KDS | **19/40** | La más débil: pensada para leerse a 80 cm, no a los 2 m que pide `diseno/kds.md` |
| Autofactura | **24/40** | Texto de alguien que conoce el SAT; el logo del restaurante nunca aparece |
| Platform | **21/40** | Los diálogos de confirmación son muy buenos; el estado de las cajas no es confiable |
| Sitio | **23/36** | Modo persuadir (heurística 7 no aplica). Texto 8/10, visual 4/10 |

**El patrón que se repite en todas:** el texto es de lo mejor del producto —habla como el
restaurantero, nombra consecuencias, dice lo que no hace—, y lo visual es de plantilla: tarjetas
blancas, grises tenues, un azul. La mejor idea de la marca, el zigzag del ticket rasgado del
logo, no aparece en ninguna interfaz, aunque el panel del ticket de la caja es literalmente un
recibo.

---

## Riesgos operativos (pueden dejar a un restaurante sin operar)

| # | Qué | Dónde | |
|---|---|---|---|
| 1 | "Desvincular este dispositivo" en la pantalla de PIN: un toque, sin confirmación ni PIN. Re-vincular pide el correo y la contraseña del dispositivo | `apps/pos/app/components/selector-empleados.tsx:116-123` → `apps/pos/app/page.tsx:90-95` | ✔ |
| 2 | "Generar credenciales" invalida al instante la clave de una caja en uso; el botón solo aparece con hover, no confirma, y la clave nueva se pierde si se cierra el modal con Esc | `apps/admin/app/(panel)/configuracion/cajas/page.tsx:18-28, 129-132, 174` | ✔ |
| 3 | En el KDS, LISTO cierra el **ticket completo** aunque la pantalla esté filtrada por estación: las bebidas de barra desaparecen sin estar hechas. Tampoco hay deshacer, y "Salir" desvincula la pantalla sin preguntar | `packages/kds-core/src/comandas.ts:174-179`, `apps/kds/app/page.tsx:99-103` | ✔ |
| 4 | Platform marca una caja como `ok` hasta 24 h sin señal, aunque el latido llega cada 10 min; Atención dice "Ninguna caja caída" mientras el cliente llama con la caja muerta. Dar de baja un add-on es un clic (en Delivery pausa las tiendas de Uber) | `apps/platform/app/lib/senal-caja.ts:43-54`, `apps/platform/app/components/ficha-contrato.tsx:127-133` | ✔ |

## Errores de funcionamiento encontrados de paso

No son de diseño, pero salieron al revisar y conviene no perderlos.

| Qué | Dónde | |
|---|---|---|
| El régimen fiscal arranca en `"612"`; con un RFC de persona moral la lista muestra 601/603 pero se guarda 612 | `apps/admin/app/(panel)/configuracion/fiscal/page.tsx:28, 46, 97-99` | ✔ |
| Editar una promoción mete la hora UTC en un `datetime-local` y la vuelve a guardar con `toISOString`: la vigencia se corre 6 h en cada edición | `apps/admin/app/(panel)/promociones/page.tsx:177`, `apps/admin/app/lib/promociones.ts:89-90` | código ✔, falta reproducir |
| En `productos/[id]`, "Guardar cambios" navega fuera y descarta los modificadores marcados abajo | `apps/admin/app/components/producto-form.tsx:100`, `producto-modificadores.tsx:91` | |
| En CFDI, subir o quitar el sello llama `recargar()` y pisa lo editado en el resto del formulario | `apps/admin/app/(panel)/configuracion/cfdi/page.tsx:56-62, 115, 133` | |
| El refresco de 60 s de platform pisa las notas internas y los límites mientras se escriben | `apps/platform/app/components/ficha-contrato.tsx:25-27`, `modulos-limites.tsx:36` | |
| `new Date("YYYY-MM-DD")` en avisos deja la fecha fin 6 h antes | `apps/platform/app/avisos/page.tsx:76` | |
| El KDS reinicia el aviso de comanda nueva con un `setTimeout` sin limpiar: dos pedidos seguidos se pisan | `packages/kds-core/src/pantalla-kds.tsx:93` | |
| Catálogo del portal: ofrece `P01`, faltan `S01` y el régimen 625, y con 605 autoelige D01 "Honorarios médicos". **Verificar con la skill `facturama-cfdi`** | `apps/factura/app/lib/portal.ts:121-133`, `apps/factura/app/[negocio]/page.tsx:240` | |
| El menú del sitio nunca marca la página actual: compara `"/funciones"` con `"funciones"` | `sitio-web/assets/js/vim.js:499-503` | |
| Reportes cortan en silencio a 200 filas | `apps/admin/app/(panel)/reportes/ventas-producto/page.tsx:50`, `apps/admin/app/lib/reportes.ts:272` | |

---

## Arreglos que mejoran todo a la vez

Pocas líneas en lo compartido, efecto en las cinco apps.

| Arreglo | Dónde | Qué resuelve |
|---|---|---|
| `future: { hoverOnlyWhenSupported: true }` | `packages/config/tailwind-preset.js` | En táctil el hover se queda pegado tras tocar: el último mosaico o fila tocada parece seleccionada. ~190 casos solo en la caja ✔ (ninguna config lo tiene) |
| `active:scale-[.97]` y transición de `transform` | `packages/ui/src/components/button.tsx:12-21` | Ningún botón responde al presionarlo, incluido Cobrar |
| Tokens de movimiento (`--ease-out: cubic-bezier(.23,1,.32,1)`, `--ease-in-out`) | `packages/ui/tokens.css`, preset | Las curvas hoy están escritas a mano en el preset; misma lógica que el color (ADR 0008) |
| Versión de movimiento reducido para `vim-pop` y `vim-shake` | preset, `packages/ui/src/components/modal.tsx` | Solo platform (`.btn`) y el sitio respetan `prefers-reduced-motion` |
| Texto funcional en `ink-2`, `ink-3` solo decorativo | todas las apps | `ink-3` (#8E8E94) da 3.3:1 sobre blanco y se usa en encabezados de tabla, ayudas, ejes y botones |
| Un `ConfirmarPeligro` compartido con `variant="danger"` y la consecuencia escrita | `packages/ui` o cada app | En la caja `variant="danger"` tiene 0 usos ✔; en admin hay 5 patrones de confirmación (`confirm()`, `prompt()`, diálogos artesanales, `Modal`, nada) |
| Colores suaves a tokens | ~350 hex fijos en total | `#FBECEA` ×28 (vs `danger-soft`), `#EAF3EE` ×28 (vs `success-soft`), `#FCF3E6` ×15 y `#F6EEDD` ×13 (vs `warning-soft`), `accent-[#16161A]` ×20 (= `ink`) |
| Usar `StatusChip` de `@vim/ui` | admin, platform | 0 usos; cada pantalla dibuja su chip |
| Un mapa de etiquetas compartido | `apps/admin/app/lib/modo-servicio.ts` → paquete | Códigos crudos en pantalla: `APP_RAPPI`, `QUICK_SERVICE`, `GO_LIVE`, `FOLIO_MONTO`, `tenant.cambiar_plan`, zonas IANA |
| Un `fmtDia` compartido | todas | Fechas ISO crudas en compras, z-histórico, apps, no-shows, eventos, facturación, conciliación, fichas de platform |
| Inputs a 16 px | factura, sitio | iOS hace zoom en cada campo |
| Quitar la sombra naranja retirada `rgba(232,80,46,.3)` | `apps/pos/app/components/sidebar-ticket.tsx:460, 483`, `modal-modificadores.tsx:449` | ✔ Quedó del color de marca anterior, debajo de Cobrar |
| Una escala tipográfica | todas | Tamaños en px distintos: caja 35, admin 22, platform 16. Los más comunes 13, 12.5, 11.5 px |

---

## Detector automático

El detector de Impeccable (0.1.5) encontró casi nada en las apps —2 hallazgos en la caja, 0 en
admin, KDS, factura y platform— porque en `.tsx` solo corre su modo de patrones. La búsqueda
de valores sueltos sí midió la deriva:

| | Caja | Admin | Platform | KDS | Factura |
|---|---|---|---|---|---|
| Hex fijos | 150 | 172 | 27 | 9 | 2 |
| `text-[..px]` | 749 | 715 | 208 | 0 | 30 |
| `transition-all` | 15 | 1 | 0 | 0 | 0 |
| Texto < 14 px en elementos interactivos | 91 | 111 | 38 | 0 | 0 |
| Botones solo-ícono sin `aria-label` | 3 | 2 | 0 | 0 | 0 |

En el sitio reportó 111 hallazgos; la mayoría son falsos positivos (no lee `clamp()`, estilo
`.hueco` sin usar). Los verdaderos están en [`sitio.md`](sitio.md).

---

## Preguntas que quedaron abiertas

1. La caja dice que la cajera "no lee: reconoce". ¿Por qué el catálogo, lo más tocado del
   sistema, es lo único sin identidad visual?
2. Si la mayoría de las ventas son en efectivo, ¿por qué cada venta pregunta "¿Cómo paga?"?
   "Cobrar $229 · Efectivo exacto" convertiría 5 toques en 2.
3. ¿El conteo del corte debe ser ciego? Hoy "Esperado" aparece junto a "Declarado".
4. En el dashboard y en platform, "En vivo" no se actualiza. ¿Lo hacemos verdad (el KDS ya usa
   Realtime) o quitamos la promesa?
5. Atención de platform mezcla problemas de minutos (latido, sync) con problemas de días (trial,
   folios). ¿Se parte en "Ahora" y "Esta semana"?
6. La oferta del piloto (mes 1 gratis + $499) no aparece en ninguna página del sitio. ¿Cada
   campaña debería aterrizar en una página con ese precio en el H1?
