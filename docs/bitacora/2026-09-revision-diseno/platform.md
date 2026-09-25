# Panel interno (`apps/platform`) — revisión de diseño

**24 sep 2026** · Puntaje **21/40** · Rutas relativas a `apps/platform/app/`. No había capturas:
todo sale del código. Contexto y método en [`README.md`](README.md).

## Veredicto

Hecho para VIM en el texto y las reglas, no en lo visual. Lo específico: "visto por N de M
cajas", "las cajas en gris no están caídas", el aviso de que el CDN tarda un minuto, el bloqueo a
las 06:00 de México, exigir una versión escribiendo `BLOQUEAR` y no `TODOS`. Lo visual es un admin
blanco de barra lateral, tarjetas y tablas; se distingue del admin del cliente solo por la barra
blanca y un rótulo "Panel interno" de 10.5 px.

Lo más grave: la información está ordenada por contrato (plan, fase, folios), no por la pregunta
de la noche —"¿esta caja está viva **ahora**?"—, y la salud se mide en días aunque el latido llega
cada 10 minutos.

## Heurísticas

| # | Heurística | Nota | Por qué |
|---|---|---|---|
| 1 | Estado | 2 | "Actualizado hace N s" bien; caja verde hasta 24 h sin señal; la salud no se refresca; no dice contra qué base está; errores tras los diálogos |
| 2 | Mundo real | 3 | Prosa excelente; se cuelan `QUICK_SERVICE`, `GO_LIVE`, `ACTIVA`, `tenant.cambiar_plan`, `info/warning/danger` |
| 3 | Control | 2 | Retirar, Reactivar, "Dejar de exigirla" existen; el plan cambia al elegirlo; la baja de add-on no se deshace; el refresco borra notas |
| 4 | Consistencia | 1 | La misma baja del add-on CFDI con tres niveles de fricción según pantalla; 3 tarjetas de cifra, 5 cabeceras de tabla, ~6 recetas de botón, h1/h2 mezclados; unas pantallas se refrescan y otras no |
| 5 | Prevención | 2 | `DialogoConfirmar` muy bueno, con huecos justo en dinero y operación |
| 6 | Reconocer | 2 | Atención lleva "Abrir"; Errores, Versiones y Bitácora no enlazan a la ficha; el diálogo no dice qué campo falta |
| 7 | Eficiencia | 1 | Sin búsqueda global ni "/", sin ordenar, filas que no abren en otra pestaña, filtros fuera de la URL |
| 8 | Estética | 3 | Sobrio; la ficha es larga y Operación empieza con contrato |
| 9 | Errores | 2 | Filas rechazadas ejemplares (`components/salud-tenant.tsx:113-144`); 401 por IP como "Clave incorrecta"; `ADDON_NO_EXISTE` crudo; un refresco fallido borra la lista |
| 10 | Ayuda | 3 | Ayuda en línea muy buena, con textos viejos |

**Carga cognitiva — fallan 4 de 8, 1 parcial:** foco (4 anclas + "Entrar como este cliente" en la
cabecera de la ficha; Operación mezcla contrato con cajas, `clientes/[id]/page.tsx:117-126,
151-157`), bloques (Contrato apila ~7 bloques), agrupación (cobro, ciclo de vida, notas y permisos
juntos; "arriba, en Add-ons", `components/modulos-limites.tsx:71`), memoria (diagnosticar exige
cruzar Atención, ficha, Errores y Versiones de memoria); jerarquía parcial (el cliente en `ink-3`
de 12 px después del título, `components/atencion.tsx:85`).

## Fortalezas

1. **La fricción de lo que afecta a todos está bien diseñada:** `components/dialogo-confirmar.tsx` + `lib/confirmacion.ts` (lógica pura y probada) piden motivo ≥10 caracteres, nombre escrito, gracia con la fecha ya calculada en hora de México (`:52, 77-79`) y "entiendo"; exigir versión usa `BLOQUEAR` (`versiones/page.tsx:300-307`).
2. **Texto de estado honesto:** "por su última venta" (`components/salud-tenant.tsx:96-100`), filas rechazadas con tabla, id y motivo (`:113-144`), la nota de cajas en gris (`versiones/page.tsx:178-183`) y del CDN (`:213-217`), acuses del POS web aparte (`avisos/page.tsx:145-148`).
3. **La mejor base de movimiento del sistema:** `.btn` en `globals.css:24-36` anima propiedades concretas en 160 ms con ease-out fuerte, escala .97 al presionar y respeta movimiento reducido; el `Modal` enfoca el primer campo; el panel abre en Atención.

## Problemas prioritarios

**[P0] Las acciones de contrato no tienen fricción** (contra `diseno/platform.md:26-30`)
- "Dar de baja" un add-on actúa de un clic (`components/ficha-contrato.tsx:127-133`); en Delivery pausa las tiendas de Uber (`api/tenants/[id]/route.ts:286-293`). La misma baja del CFDI sí confirma en `/cfdi` (`components/cfdi.tsx:349-384`).
- El plan se cambia en el `onChange` del select (`ficha-contrato.tsx:47`): una flecha del teclado con el foco ahí cambia lo que paga el cliente, auditado sin motivo (`route.ts:364`).
- También de un clic: Pausar, Activar cobro, Marcar abandonado, "Según plan", Acreditar, Ajustar folios. Pausar junto a Cancelar suscripción (`:79-84`); Abandonado junto a GO_LIVE (`:97-105`).
- **Arreglo:** baja de add-on con `DialogoConfirmar peligroso` y consecuencias ("se pausan N tiendas en Uber", "dejará de facturar"); plan con botón "Cambiar plan…" y diálogo con precio y módulos antes/después; ajuste de folios con motivo obligatorio.

**[P0] El estado miente justo cuando importa** ✔
- Caja `ok` hasta 24 h sin señal (`lib/senal-caja.ts:43-54`) con latido cada 10 min (ADR 0014 §1).
- Atención solo detecta caída tras ≥1 día, mira el sync y no el latido, y agrupa por cliente (`api/alertas/route.ts:133`); con eso afirma "Ninguna caja caída" (`components/atencion.tsx:72`).
- `SaludTenant` carga una vez (`components/salud-tenant.tsx:34-42`) mientras el pie dice "Actualizado ahora" (`clientes/[id]/page.tsx:172`).
- **Arreglo:** semáforo por minutos de latido (<20 ok, 20-60 warning, >60 caída); "hace 7 min" como dato principal; salud y avisos dentro del `useRefresco` de la ficha; alerta por caja "Sin latido > 30 min"; un vacío que diga qué revisó.

**[P1] Sin vista de parque; diagnóstico en cuatro pantallas**
- Clientes solo trae columnas comerciales (`clientes/page.tsx:88-95`); Versiones trae el latido como fecha absoluta, sin semáforo ni enlace (`versiones/page.tsx:157, 170`); Errores y Bitácora sin filtro ni enlace por cliente (`components/errores.tsx:80-83`).
- **Arreglo:** columna "Cajas" en Clientes (peor estado, "hace X min", versión) ordenable por gravedad; el cliente como `<Link>` en todas las tablas; `?cliente=` en Errores; "Errores recientes" dentro de Operación.

**[P1] Los errores no se ven o se llevan el contexto**
- `DialogoConfirmar` no pinta errores: van a la página, detrás del velo (`clientes/[id]/page.tsx:136`, `avisos/page.tsx:115`, `versiones/page.tsx:118`), y la promesa rechazada queda sin atrapar (`components/dialogo-confirmar.tsx:117`).
- Un refresco fallido reemplaza la lista (`components/atencion.tsx:34`, `errores.tsx:49`, `cfdi.tsx:84`, `bitacora.tsx:32`).
- Un 401 por la allowlist de IP (`lib/server.ts:101-104`) se muestra como "Clave incorrecta" (`lib/sesion.tsx:72`).
- **Arreglo:** prop `error` en el diálogo con `role="alert"`; conservar datos viejos con "No se pudo actualizar · datos de hace N min"; 403 `IP_NO_PERMITIDA` → "Esta red no está permitida (tu IP: …)".

**[P1] El refresco automático borra lo que estás escribiendo** — cada 60 s los efectos reponen el valor del servidor en las notas (`components/ficha-contrato.tsx:25-27`) y los límites (`components/modulos-limites.tsx:36`). → No pisar un campo sucio (o pausar el refresco con foco) + indicador "sin guardar".

**[P1] Los valores por defecto son los más riesgosos**
- En Avisos, "Para" arranca en "Todos los clientes" y vuelve ahí tras cada envío (`avisos/page.tsx:35, 80, 181`).
- Publicar no muestra versión, URL ni diferencia contra la vigente (`versiones/page.tsx:279-293`).
- `TODOS` se escribe en 6 acciones, varias sin peligro (`:300`): la palabra ya no frena.
- **Arreglo:** destinatario vacío obligatorio; "0.4.82 → 0.4.83", host de la URL, sha y notas en el diálogo, con aviso si la versión es igual o menor; `TODOS` solo para publicar y avisos importantes a todos.

**[P2] No sirve en el teléfono ni dice en qué base está** — barra de 220 px fija y `px-8` (`components/shell.tsx:9-12`, `barra-lateral.tsx:40`): a 375 px quedan ~90 px útiles; sin marca de entorno aunque en localhost lee una base de desarrollo. → Cajón bajo `lg` (como `apps/admin/app/components/admin-shell.tsx:228`) + insignia "PRODUCCIÓN / LOCAL".

**[P2] Deriva de tokens y azul para datos** — 27 hex; `#FBECEA` ×12 en vez de `danger-soft`; tres fondos de warning; azul de marca en TRIAL (`lib/formato.ts:34`), severidad "alta" (`components/atencion.tsx:8`) y etiqueta "pos" (`errores.tsx:20`); "caja" en rojo como categoría (`:18-23`); 3 tarjetas de cifra; 16 tamaños de letra; `StatusChip` y `Button` de `@vim/ui` sin usar; `fmtMxn` y `fechaCorta` duplicados (`components/cfdi.tsx:43-53`).

## Personas

- **Alex (experto):** sin búsqueda global; la de Clientes sin autofocus (`clientes/page.tsx:56`); filas con `router.push` sobre `<tr>` y "Abrir" como botón (`:104`, `atencion.tsx:93`): no se abren tres clientes en pestañas; motivo + `TODOS` para "Marcar mínima" en cada uso.
- **Sam (accesibilidad):** filas solo con mouse; sin `aria-current` (`barra-lateral.tsx:52`), `aria-pressed` (`atencion.tsx:53`, `clientes/page.tsx:72`) ni `aria-expanded` (`errores.tsx:70`, `cfdi.tsx:257`); Atención, Errores, Bitácora y CFDI sin h1; `ink-3` 3.3:1 en cabeceras y ayudas de 11-12 px; chips warning 4.3:1 y success 4.45:1.
- **Fermín a las 11 pm:** desde casa o el teléfono le sale "Clave incorrecta" con la clave buena; Atención dice "Todo en orden"; en la ficha lo primero es Plan, Folios y Fase; la caja dice "Conectada" con última señal hace 3 h; pide reiniciar y la tabla nunca se actualiza; sus notas se borran solas; "Cancelar" junto a "Cancelar cliente" (`dialogo-confirmar.tsx:111-124`); el "Dar de baja" de Delivery a un clic.

## Movimiento (Emil Kowalski)

| Antes | Después | Por qué |
|---|---|---|
| `transition-colors duration-150` en la navegación (`components/barra-lateral.tsx:56`) | Sin transición | Decenas de veces al día; el propio comentario de `globals.css:23` dice que no anima |
| Filtros con `transition` y sin `.btn` (`components/atencion.tsx:58`) | `.btn`, color instantáneo o 100 ms | `transition` anima sombra, transform y filtro sin necesidad; sin presión |
| Botones con `transition` y sin `.btn` (`components/cfdi.tsx:99, 260, 306, 334, 364, 380`) | Añadir `.btn` | La única pantalla sin la presión de .97 |
| Hover de fila de error y de clientes a 150 ms (`errores.tsx:73`, `clientes/page.tsx:104`) | Instantáneo o 100 ms | Escanear con el cursor no deja estela |
| Sin `hoverOnlyWhenSupported` (`tailwind.config.ts:4-7`) | Activarlo | En teléfono el hover se queda pegado |
| `animate-vim-pop` sin versión reducida (`packages/ui/src/components/modal.tsx:125`) | `motion-reduce:animate-vim-fade` | Solo `.btn` respeta movimiento reducido |
| Curva `vim-pop` 200 ms `cubic-bezier(.22,1,.36,1)`, salida instantánea | **Mantener** | Buena curva; salida más rápida que entrada es correcto |
| "Aplicando…" / "Entrando…" cambian el ancho del botón (`dialogo-confirmar.tsx:124`, `lib/sesion.tsx:101`) | `min-w` fijo + spinner pequeño | El botón brinca bajo el cursor |
| Una alerta crítica nueva llega sin señal (`components/atencion.tsx:79-102`) | Resaltado único `danger-soft`→transparente ~600 ms + conteo en `document.title` | Evento raro con propósito; la pestaña suele estar de fondo |

## Páginas

| Página | Nota | Problema principal |
|---|---|---|
| `/` | bien | Redirigir a Atención es lo correcto |
| `/atencion` | regular | Mide en días y por sync, no por latido; "Ninguna caja caída" puede mentir; un refresco fallido borra la lista |
| `/clientes` | regular | Lista comercial sin cajas ni versión; filas sin teclado ni pestaña nueva |
| `/clientes/nuevo` | bien | Código antes que Nombre (`:80-87`); tras crear redirige a la lista en 1.5 s, no a la ficha (`:67`) |
| `/clientes/[id]` | **mal** | Baja de add-on y plan sin fricción; notas borradas; salud sin refresco y verde hasta 24 h |
| `/avisos` | regular | Destinatario "Todos" por defecto; fecha fin 6 h antes (`:76`); errores tras el diálogo |
| `/versiones` | regular | Publicar sin mostrar la versión; `TODOS` para todo; parque sin semáforo ni enlace |
| `/cfdi` | regular | Sin refresco; texto del PAC viejo (`components/cfdi.tsx:420-427`); estilos propios |
| `/errores` | regular | Sin filtro ni enlace por cliente; rojo para todo lo repetido (`:86-89`) |
| `/bitacora` | regular | Solo hora relativa (`:77`), códigos crudos, sin refresco |
| Shell, barra y sesión | regular | No se adapta; no dice la base; 401 por IP como "Clave incorrecta"; sin `aria-current` |

## Observaciones menores

1. Textos desactualizados: "(entrega 2)" en `components/zona-peligrosa.tsx:46` y `modulos-limites.tsx:144`; `PerfilPac` dice que Multiemisor no está activado (el CFDI está en producción desde el 3 sep).
2. Códigos crudos: `QUICK_SERVICE` (`clientes/page.tsx:107`, `clientes/[id]/page.tsx:114`) aunque existe `VERTICALES` en `lib/formato.ts:23`; `ACTIVA` y "Marcar GO_LIVE" (`ficha-contrato.tsx:65, 104`); nivel del aviso en inglés (`components/avisos-cliente.tsx:57`); `tenant.cambiar_plan` (`bitacora.tsx:51, 78`).
3. Fechas ISO en `ficha-contrato.tsx:70, 124`.
4. "Cancelar" (cerrar) junto a "Cancelar cliente"/"Cancelar suscripción": renombrar el primero a "Volver".
5. El botón deshabilitado no dice qué falta aunque `evaluarConfirmacion` devuelve `faltantes` (`dialogo-confirmar.tsx:44-50`).
6. JetBrains Mono no se carga (`layout.tsx:19`) y `font-mono` se usa en códigos.
7. Ajuste manual de folios con motivo fijo "Ajuste desde plataforma" (`components/ficha-facturacion.tsx:57`, `cfdi.tsx:329`); "5-3" da NaN sin aviso.
8. La cabecera fija de la ficha depende del padding del shell con `-mx-8 -mt-7` (`clientes/[id]/page.tsx:108`).
9. Foco de inputs con sombra al 6 % (`lib/formato.ts:49`), casi invisible.

## Preguntas

1. Atención mezcla problemas de minutos con problemas de días. ¿Se parte en "Ahora" y "Esta semana"?
2. Si casi todo pide `TODOS`, ¿qué protege `TODOS`? Una tabla en `platform.md` que gradúe la fricción por alcance (1 caja, 1 cliente, todos) y reversibilidad.
3. ¿Las llamadas de las 11 pm se atienden en la laptop o con el teléfono? Si es el teléfono, ¿vale una vista móvil de solo lectura por caja detrás de Cloudflare Access (ya prioridad en ADR 0014)?
