# Estado de la revisión de diseño — 30 sep 2026

Seguimiento del registro del 24 sep ([`README.md`](README.md)), que no se edita. Cada punto se
comprobó contra `main` (de8eb7a) con su `archivo:línea`; el PR es el que lo arregló.

**En una línea:** los 4 riesgos operativos y los 10 errores de funcionamiento están arreglados.
De los arreglos compartidos quedan dos abiertos (colores suaves a tokens y `StatusChip`) y cuatro
a medias. De las preguntas abiertas, solo el corte ciego sigue sin decidirse.

## Riesgos operativos — los cuatro cerrados

| # | Qué | Cómo quedó | PR |
|---|---|---|---|
| 1 | Desvincular la caja de un toque | Pide PIN de administrador o dueño (`ModalDesvincular`) | #34 |
| 2 | "Generar credenciales" de una caja en uso | Confirma distinto para caja nueva o en uso; botón siempre visible; la clave nueva no se cierra con Esc | #39 |
| 3 | LISTO del KDS cerraba el ticket entero; "Salir" sin preguntar | Cada estación cierra lo suyo y el ticket se cierra con la última; deshacer 5 s; salir confirma | #35 |
| 4 | Platform marcaba `ok` hasta 24 h sin señal; dar de baja un add-on en un clic | En línea < 20 min, después "sin señal hace X"; la baja pide motivo y dice la consecuencia | #40, #51 |

El 4 conserva una excepción: una caja anterior a 0.4.60 no late, y para ella sigue la regla de
24 h (`apps/platform/app/lib/senal-caja.ts:69`).

## Errores de funcionamiento — los diez cerrados

| Qué | PR |
|---|---|
| Régimen fiscal arrancaba en 612 | #39, #46 |
| Promociones corrían la vigencia 6 h en cada edición | #39 |
| "Guardar cambios" en producto descartaba los modificadores | #39 |
| Subir el sello pisaba el resto del formulario de facturación | #46 |
| El refresco de platform pisaba notas y límites | #51 |
| Fecha fin de los avisos 6 h antes | #51 |
| Aviso de comanda nueva del KDS con temporizador sin limpiar | #43 |
| Catálogo del portal de autofactura (P01, S01, 625, D01) | #44 |
| El menú del sitio no marcaba la página actual | #52 |
| Reportes cortados en silencio a 200 filas | #48 |

## Arreglos que mejoran todo a la vez

| Arreglo | Estado | Dónde / qué falta |
|---|---|---|
| `hoverOnlyWhenSupported` | Hecho (#36) | `packages/config/tailwind-preset.js:25` |
| `Button` responde al presionarlo | Hecho (#36) | `packages/ui/src/components/button.tsx:16-17` |
| Tokens de movimiento | Hecho (#36) | `packages/ui/tokens.css:94-96` |
| Movimiento reducido para pop y shake | Hecho (#36) | `packages/ui/tokens.css:102-104` |
| Contraste de `ink-3` | Hecho (#36) | Ahora #6E6E74 |
| Inputs a 16 px | Hecho (#36, #52) | Factura y sitio |
| Sombra naranja retirada | Hecho | 0 restos en código |
| Confirmación de peligro compartida | Hecho (#64) | `DialogoPeligro` en `@vim/ui`: `useConfirmar` y 14 diálogos del admin, 6 de la caja y el `DialogoConfirmar` del panel dibujan con él. Salida "Volver", `AvisoAutorizacion` y `MotivoChips` compartidos en la caja |
| Mapa de etiquetas compartido | Hecho (#63) | `@vim/db/metodos-pago` (métodos de pago y apps) |
| Formato de fechas compartido | Hecho (#63) | `diaCorto()` en `@vim/fecha` |
| Escala tipográfica | Hecho (#64) | 12 pasos (`text-11`…`text-40`) en el preset; 1,620 clases migradas; `pnpm tipografia` en CI. Fuera: los recibos (imitan el papel) |
| Colores suaves a tokens | Hecho (#63, #64) | Fondos a `*-soft` (#63); bordes de aviso a `*-line` (#64) |
| `StatusChip` | Hecho (#63) | Admin, platform y caja |

## Preguntas que quedaron abiertas

| # | Pregunta | Respuesta |
|---|---|---|
| 1 | Identidad visual del catálogo de la caja | Productos con el color de su categoría y letra más grande (#41, 0.4.89) |
| 2 | "Efectivo exacto" en un toque | Hecho (#41) |
| 3 | ¿Corte ciego? | **Sin decidir.** "Esperado" sigue a la vista mientras se declara (`apps/pos/app/components/pantalla-cierre.tsx:350,364`) |
| 4 | "En vivo" que no se actualizaba | El dashboard se refresca con la pestaña visible y no dice "en vivo" en días pasados (#45); platform dice "actualizado hace X" |
| 5 | Atención de platform en "Ahora" y "Esta semana" | Franja "Ahora" con el latido de cada caja (#51) |
| 6 | La oferta del piloto en el sitio | En /precios, bajo los planes (#53) |
