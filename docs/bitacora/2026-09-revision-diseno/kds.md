# KDS — revisión de diseño

**24 sep 2026** · Puntaje **19/40** · La interfaz vive en `packages/kds-core/src/pantalla-kds.tsx`;
`apps/kds/app/page.tsx` solo decide qué pantalla mostrar y `desktop/kds-ui` es la copia compilada (no versionada).
Contexto y método en [`README.md`](README.md).

## Veredicto

Una KDS competente del molde de Toast o Square: tema oscuro, orden de llegada, cronómetro por
tarjeta, nota en banda ámbar y un LISTO grande. Tiene detalles propios: los combos se numeran
como en el papel (`comandas.ts:87-110`) y el arranque distingue "no llegué a la caja" de "la caja
dijo que no".

Pero está diseñada para leerse a 80 cm —lo dice su propio comentario (`pantalla-kds.tsx:299`)—
y no a los 1.5-2 m que pide `diseno/kds.md:8`, y usa recursos de tablero genérico: un color por
modo de servicio y seis bloques verdes que gritan más que los relojes.

## Heurísticas

| # | Heurística | Nota | Evidencia |
|---|---|---|---|
| 1 | Estado | 2 | Cronómetro por tarjeta, pero sin conexión la pantalla sigue igual y solo aparece una línea roja de 13 px (`:248`); el conteo mide 11.5 px (`:179`) |
| 2 | Mundo real | 2 | `APP_RAPPI` y `MESA` en crudo (visible en la captura del sitio); "Pick-up" donde el admin dice "Drive-thru" |
| 3 | Control | 1 | LISTO cierra de un toque sin deshacer; "Salir" desvincula el dispositivo |
| 4 | Consistencia | 2 | Todo el color en hex fijo; superficie `#242429` vs token `#26262B`; logo dibujado a mano; color por modo contra `kds.md:28-32`; texto < 16 px |
| 5 | Prevención | 1 | Ni LISTO ni Salir confirman; LISTO con filtro cierra el ticket entero |
| 6 | Reconocer | 3 | Todo a la vista, sin menús; la estación no se guarda |
| 7 | Eficiencia | 2 | Filtro, sonido y contraste existen pero no persisten; sin bump bar ni teclado; umbrales 8 y 15 min fijos (`:14-15`) |
| 8 | Estética | 2 | Tipografía grande y limpia; el LISTO verde es lo más ruidoso de cada tarjeta y el "1" de 30 px se repite en cada renglón |
| 9 | Errores | 2 | "Reconectando" es bueno; en operación sale el `e.message` de PostgREST (`:101, 141`) |
| 10 | Ayuda | 2 | Vincular dice de dónde sacar credenciales; aceptable para una KDS |

**Carga cognitiva — fallan 4 de 8:** foco único (seis bloques verdes iguales; lo urgente solo por
un borde de 5 px), jerarquía (el reloj de 20 px, `:287`, es más chico que el folio de 24, `:282`, y
el producto de 22), agrupación (cada hijo de combo repite "↳ Combo #1 · …", `:306-308`), memoria
(al cerrar una comanda la cuadrícula se recorre; la estación se pierde al recargar).

## Fortalezas

1. **El tiempo es número, no solo color:** `m:ss` con `tabular-nums` en el color del estado (`:287-289`); la más vieja arriba a la izquierda (`comandas.ts:150`).
2. **La nota de la orden** en banda ámbar de 17 px en negritas (`:293-297`): lo peligroso ("sin cebolla, alérgico") es lo segundo más visible.
3. **Resiliencia:** timeout en todas las llamadas, "reconectando" reintenta solo (`apps/kds/app/page.tsx:30-39, 92-97`), polling + SSE, vincular distingue red de credenciales (`vincular-dispositivo.tsx:25-34`), LISTO de h-14 a todo el ancho con `active:scale-[0.97]`.

## Problemas prioritarios

**[P1] LISTO es irreversible y la comanda desaparece**
- Un toque encadena EN_COCINA → LISTO → ENTREGADO (`comandas.ts:174-179`); la tarjeta sale sin deshacer ni lista de recientes (`pantalla-kds.tsx:134-149`). Un codazo borra un pedido y revertir exige autorización.
- **Arreglo:** ocultar en optimista con "Deshacer" grande 5 s + cajón "Recientes" con las últimas 10. Alternativa: dos pasos (un toque marca LISTO y atenúa; el segundo entrega).

**[P1] Con filtro de estación, LISTO cierra el ticket de todas las estaciones** ✔
- El filtro solo esconde renglones (`:159-165`); `cerrarComanda` opera por `ticketId`. Si la plancha marca LISTO, las bebidas de barra desaparecen sin estar hechas.
- **Arreglo:** estado de cocina por renglón o por área. Mientras no exista, desactivar LISTO con filtro activo o avisar "Cierra la orden completa".

**[P1] "Salir" desvincula el dispositivo sin preguntar**
- "Salir" (`:208-216`) → `desvincular` → `olvidarCreds()` (`apps/kds/app/page.tsx:99-103`); igual "Cambiar de caja" (`:126-132`). 36 px pegado a "Contraste"; re-vincular obliga a teclear en la tele un `caja-<uuid>@dispositivos…`.
- **Arreglo:** "Desvincular pantalla" dentro de ajustes, con confirmación o PIN de gerente.

**[P1] Etiquetas crudas y color por modo que choca con el color del tiempo**
- `MODO_LABEL` cubre 4 de 12 modos (`estado.ts:6-15`); el respaldo `bg-[#9A6B12]` (`pantalla-kds.tsx:283`) es el ámbar de "atención": una orden de Rappi luce como una comanda tardada. Los colores por modo (`:38-43`) contradicen `kds.md:28-32`.
- **Arreglo:** subir `apps/admin/app/lib/modo-servicio.ts` (ya exhaustivo) a un paquete; insignia neutra con contorno e ícono por modo; unificar "Pick-up"/"Drive-thru".

**[P1] Sin conexión, la pantalla parece una cocina tranquila**
- Si el polling falla, las tarjetas viejas siguen con el reloj corriendo; el aviso es una línea de 13 px (`:100-102, 248-250`).
- **Arreglo:** `ultimaLecturaOk`; tras dos fallos (>10 s), banda de 24 px en `kds-danger` "SIN CONEXIÓN CON LA CAJA · última actualización hace 0:45" y tarjetas al 60 %; punto de estado permanente en el encabezado.

**[P1] Lo más probable es que el sonido no suene, y si suena es muy bajo**
- Un `new AudioContext()` por pitido sin gesto del usuario (`:19-36`): en Chrome nace suspendido (en Electron sí suena). Seno de 880 Hz, 180 ms, ganancia 0.08: no compite con una campana. El ícono dice "encendido".
- **Arreglo:** un solo contexto activado con el primer toque; "Toca para activar el sonido" si está suspendido; dos tonos ×3 con ganancia ~0.4; sonido, contraste y estación en `localStorage` (hoy `useState`, `:74-76`).

**[P2] Legibilidad a 2 m y semáforo solo por color**
- Bajo los 16 px de `kds.md:36`: conteo 11.5 (`:179`), chips 12.5 (`:228`), botones 13, toast 14 (`:243`), combo 15 (`:307`). El verde `#2E7D52` del reloj sobre `#242429` ~3.1:1. El estado solo por un borde de 5 px y un pulso casi invisible.
- **Arreglo:** reloj de 32 px en una franja de cabecera que se rellena: ámbar con texto negro desde 8 min, rojo con texto blanco y la palabra "TARDE" desde 15; verde aclarado a ~4.5:1.

**[P2] Lo que no cabe no se ve**
- `overflow-y-auto` en el cuerpo (`:253`) y tarjetas `max-h-[85vh]` con scroll interno (`:272, 300`), sin indicador, en una pantalla sin mouse.
- **Arreglo:** pastilla fija "+3 comandas más ↓" y degradado "+2 renglones más"; si el pico supera la pantalla, riel horizontal o paginado automático.

## Personas

- **Chuy (en la plancha, mira de reojo):** reloj más chico que el folio; seis verdes iguales esconden cuál está tarde; "Sin tocino" en el mismo gris de 16 px que "Queso extra" aunque `naturaleza_snapshot` existe y `comandas.ts:74` no lo pide; nota del renglón en cursiva (`:313`); las tarjetas brincan al cerrar una.
- **Sam (daltónico):** verde, ámbar y rojo en un borde de 5 px, sin forma ni palabra de respaldo.
- **Riley (viernes 9 pm):** 14 comandas y la mitad bajo el pliegue; una orden de 12 renglones cortada; dos pedidos en <3.5 s y el segundo aviso se pierde (`:93`); Uber como `APP_UBEREATS` en ámbar.
- **El dueño que configura:** la estación se pierde en cada reconexión; si el área activa se queda sin comandas la barra de filtros desaparece (`hayAreas`, `:158, 221`) pero el filtro sigue aplicado y no hay cómo quitarlo.

## Movimiento (Emil Kowalski)

| Antes | Después | Por qué |
|---|---|---|
| `kdsPulse 1.1s ease-in-out infinite` sobre `border-left-color` `#E04040→#FF6B6B` (`:276, 338`) | Cabecera roja estática; un `::after` de opacidad 0→1→0, 3 × 600 ms `cubic-bezier(.23,1,.32,1)`, solo al cruzar 15 min | Anima color (repinta), no se percibe a 2 m, y un pulso infinito en N tarjetas es ruido. La atención se pide una vez |
| La tarjeta nueva aparece en seco al final (`:265-270`) | `@starting-style { opacity:0; transform:translateY(8px) }` 220 ms + anillo blanco de 2 px que se apaga en ~8 s + chip "NUEVA" | Aquí sí hay propósito: "acaba de llegar" para quien mira de reojo |
| La tarjeta cerrada desaparece y la cuadrícula salta (`:139`) | Salida `opacity:0; scale(.97)` 150 ms y luego sacarla | Salida más rápida que la entrada, sin salto inexplicable |
| Aviso 🔔 de 14 px que se monta en seco y se pisa (`:242-246`) | `translateY(-8px)` + opacidad 200/150 ms; limpiar el timer anterior; `role="status"`; 20 px sin emoji | Los avisos se borran entre sí |
| `transition … hover:bg-[#267045] active:scale-[0.97]` (`:326`) | `transition-[transform,background-color] duration-150`; hover solo con `(hover:hover)` | El `:active` está bien; `transition` genérico mueve 11 propiedades |
| `hover:text-white` en Sonido, Contraste, Salir, Reintentar (`:188, 202, 211`; `apps/kds/app/page.tsx:122, 129, 147`) | `hoverOnlyWhenSupported` en el preset | En tele táctil el hover se queda pegado |
| `{enProceso ? "…" : "LISTO"}` (`:328`) | Quitar en optimista con Deshacer, o texto al 60 % con spinner de 16 px | Un "…" no se lee a 2 m y parece roto |
| Sin `prefers-reduced-motion` en todo el KDS | Sin pulso ni desplazamiento; solo cambio de color | El estado sigue legible por texto y relleno |
| `animate-spin` lineal de 1 s en "reconectando" (`apps/kds/app/page.tsx:116`) | Mantener | Movimiento constante: lineal es correcto |
| `transition` en los chips de área (`:228`) | `transition-colors duration-150` | Solo lo que cambia |

## Estados y páginas

| Estado | Nota | Problema principal |
|---|---|---|
| `boot` (`apps/kds/app/page.tsx:106`) | regular | Texto de 14 px, ilegible a 2 m (transitorio) |
| `reconectando` (`:113`) | regular | Reintenta solo; "Cambiar de caja" desvincula sin confirmar |
| `vincular` (`vincular-dispositivo.tsx`) | regular | Obliga a teclear un correo con UUID en la tele |
| `sin-caja` (`:140`) | **mal** | Una línea roja sin decir cómo se arregla |
| Cocina: cuadrícula | regular | LISTO irreversible y por ticket; etiquetas crudas |
| Cocina: vacío | bien | Claro; texto de apoyo `#6E6E74` sobre `#1A1A1E` ~3.4:1 |
| Cocina: sin conexión | **mal** | No se ve a distancia |

## Observaciones menores

1. Logo "V" dibujado a mano (`pantalla-kds.tsx:174-176`, `vincular-dispositivo.tsx:43-45`) contra `nucleo.md:70-73`, que pide `<LogoVim/>`.
2. El objeto `tema` va en hex fijo (`:152-154`); `kds.md:23-26` está desactualizado (dice `bg-white` y ya es oscura).
3. "Cocina · Caja 01" confunde caja con estación.
4. La cantidad "1" de 30 px en cada renglón es ruido: chip invertido solo cuando es mayor que 1.
5. Mesa sin número, para llevar sin nombre, app sin código de pedido.
6. Sonido solo con `title`: faltan `aria-label` y `aria-pressed`; Contraste sin `aria-pressed`.
7. "Reintentar ahora" usa el verde de éxito como color de acción (`apps/kds/app/page.tsx:122`).
8. Vincular con código corto o QR sería más realista que teclear en una tele.

## Preguntas

1. Si LISTO manda directo a ENTREGADO, ¿quién avisa al mesero o a la caja que la orden está lista para recoger?
2. Si el color solo es tiempo, ¿qué necesita ver Chuy de una orden de Rappi que no necesite de una de comedor? (Que hay un repartidor esperando.)
3. ¿Cuántas comandas simultáneas tiene Knock-Out en el pico del viernes? Si son más de 12, la cuadrícula `auto-fill` ya no cabe en la tele.
