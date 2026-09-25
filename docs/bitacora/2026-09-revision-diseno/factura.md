# Portal de autofactura (`apps/factura`) — revisión de diseño

**24 sep 2026** · Puntaje **24/40** · Rutas relativas a `apps/factura/app/` salvo que digan otra
cosa. Contexto y método en [`README.md`](README.md).

## Veredicto

El texto es de alguien que conoce el dolor de autofacturar en México: el código postal "de tu
constancia, no el de tu casa", "sin S.A. de C.V.", "el XML es la factura ante el SAT". El flujo
también: el folio llega en la URL del QR y la búsqueda arranca sola.

Lo visual es la plantilla de VIM: tarjeta blanca, botón azul, y el único logotipo en pantalla es
el de VIM (`[negocio]/page.tsx:300`), contra `diseno/factura.md:13-17`, que pide la marca del
restaurante. Y la letra gris pequeña traiciona la premisa de "celular en la banqueta, con sol".

## Heurísticas

| # | Heurística | Nota | Evidencia |
|---|---|---|---|
| 1 | Estado | 2 | Solo "Buscando…" y "Emitiendo…"; sin pasos; si falla el correo nadie lo dice; el paso 1 no dice de qué negocio es |
| 2 | Mundo real | 3 | Texto humano; fecha ISO cruda (`:186`); placeholder `A-0001` cuando el folio real es `KC-2026-000001`; usos con clave del SAT |
| 3 | Control | 2 | No se puede cambiar de folio; Atrás del navegador saca del portal; salir tras timbrar pierde los archivos |
| 4 | Consistencia | 3 | Tokens en general; hex casi iguales a tokens (`:96, 273`); botones artesanales en vez del `Button` de `@vim/ui` |
| 5 | Prevención | 2 | Filtra usos por régimen y los corrige (bien); RFC solo por longitud ≥12; catálogo con claves problemáticas |
| 6 | Reconocer | 3 | Casi todo con ayuda; Régimen sin ninguna |
| 7 | Eficiencia | 2 | Folio por QR (excelente); sin `autoComplete` ni "recordar mis datos" |
| 8 | Estética | 3 | Una columna, un solo CTA azul por pantalla |
| 9 | Errores | 2 | CP, nombre y uso traducidos; RFC y régimen caen en un genérico (`supabase/functions/autofacturar/index.ts:395`), el campo nunca se marca, el error queda al fondo |
| 10 | Ayuda | 2 | "La descargas del portal del SAT" sin enlace |

**Carga cognitiva — fallan 4 de 8:** bloques y agrupación (seis campos en lista plana; agrupar en
"Quién eres", "Tu constancia", "Cómo la recibes"), opciones (9 regímenes con clave; hasta 10 usos
con 612, incluidos "Gastos funerales"), memoria (Emitir se deshabilita sin decir qué falta,
`:285`).

## Fortalezas

1. **Cero tecleo para empezar:** folio en la URL, búsqueda automática (`[negocio]/page.tsx:66-70`).
2. **Régimen y uso validados juntos en dos capas:** el formulario solo muestra usos válidos y corrige al cambiar de régimen (`:86, 235-241`); el servidor ataja la combinación antes del PAC (`autofacturar/index.ts:173-176`).
3. **El error más frecuente traducido y con dónde buscar:** el CP está en «Datos de ubicación» de la constancia (`:275-279`, `index.ts:387-390`); el éxito explica XML contra PDF (`:132-135`).

## Problemas prioritarios

**[P1] En iPhone la pantalla hace zoom en cada campo** — inputs `text-[15px]` (`[negocio]/page.tsx:26`); iOS hace zoom bajo 16 px. → `text-[16px]`.

**[P1] La ayuda fiscal es ilegible con sol** — ayudas de 11.5 px en `ink-3` ~3.3:1 (`:215, 226, 254, 266`), bajada de 13 px (`:195`), UUID (`:105`): justo las líneas que `factura.md:25-29` declara imprescindibles. → 13 px en `ink-2` (~6.9:1), bajadas a 14-15 px.

**[P1] La marca del restaurante no aparece** — el servidor devuelve `logo` (`lib/portal.ts:15, 72`) y la pantalla nunca lo pinta; el paso 1 no muestra el nombre; `<title>` dice "VIM POS". → Buscar por slug devuelve nombre y logo desde el paso 1; encabezado con logo y nombre comercial; VIM discreto al pie.

**[P1] El éxito es frágil y el fallo del correo es mudo**
- El aviso de correo solo se pinta si `correoEnviado` es verdadero (`:107`); si falla (`index.ts:351-356`) el usuario espera un correo que no llega.
- Los archivos existen solo en esa respuesta (`lib/portal.ts:91-96`); al volver dice "ya no se puede facturar" (`index.ts:137-143`) aunque el XML y el PDF se archivaron en el bucket `cfdi` (`:343-346`).
- **Arreglo:** "No pudimos enviarla a x@y. Descárgala ahora."; campo "Enviármela por correo" en el éxito; "Descarga antes de cerrar"; re-descarga con folio + RFC que coincidan.

**[P1] Botón deshabilitado sin explicación y sin validación en línea** — `completo` solo mide longitudes (`:87-89`); el RFC acepta cualquier cadena de 12 mientras el servidor aplica una regex (`index.ts:59`); `campoMal` solo se usa para el CP (`:275`). → Botón activo; al enviar, validar con la misma regex compartida, `aria-invalid`, borde rojo, mensaje bajo el campo y foco al primer error; al salir del RFC: "Persona física: 13 caracteres; empresa: 12".

**[P1] Catálogo fiscal con huecos** — **verificar con la skill `facturama-cfdi` antes de tocar.** Según la lectura, se ofrece `P01 · Por definir` (sustituido por `S01 Sin efectos fiscales` en CFDI 4.0, que no aparece) (`lib/portal.ts:121-133`, `index.ts:47-57`); falta el régimen 625 (plataformas: choferes y repartidores); con 605 el uso se autoelige como `validos[0]` = "D01 · Honorarios médicos" (`:240`). → S01 y 625, sin P01, S01 por defecto para 605, G03 primero con "Gastos en general: lo normal para consumo en restaurante".

**[P2] `/` dice "Todavía no está listo"** aunque el portal está en producción desde el 3 sep (`page.tsx:19-26`). → "Escanea el QR de tu ticket, o escribe el código del negocio".

**[P2] El botón de continuar no queda al alcance del pulgar** — "Emitir" bajo el pliegue a 375 px, contra `factura.md:21-23`; sin indicador de pasos ni "¿No es tu ticket?". → Barra inferior fija con `env(safe-area-inset-bottom)` y "Paso 2 de 3".

## Personas

- **Casey (celular, distraída):** zoom en cada campo; gris de 11.5 px con sol; "Emitir" tarda varios segundos con solo "Emitiendo…"; cierra tras descargar y el correo nunca salió; Atrás la saca del portal.
- **Jordan (primera vez):** no sabe de qué negocio es el portal; el placeholder no se parece a su folio; "Régimen fiscal" sin pista; el botón gris no dice qué falta; en el éxito se destaca el PDF y el texto dice que el que vale es el XML.
- **Riley (datos raros):** régimen 625 imposible; con 605 le autoeligen "Honorarios médicos"; P01 lo rechazan; RFC genérico o no inscrito → "El SAT rechazó los datos" sin campo marcado; un régimen que no coincide con el SAT no lo detecta `campoDelRechazo` (`index.ts:371-376`).

## Movimiento (Emil Kowalski)

| Antes | Después | Por qué |
|---|---|---|
| `transition hover:bg-accent-hover` (`[negocio]/page.tsx:118, 126, 170, 286`) | `transition-colors duration-150`; hover solo con `(hover:hover)` | En el celular el hover queda pegado y el botón parece deshabilitado |
| Sin `:active` en Continuar, Emitir y Descargar | `active:scale-[0.97]` + `transition-transform duration-150` | El toque de "Emitir", que tarda segundos, tiene que sentirse |
| `{cargando ? "Emitiendo…" : …}` (`:288`) | Spinner de 16 px en el botón y, a los 3 s, "Conectando con el SAT, puede tardar unos segundos. No cierres esta pantalla." | Espera real (PAC + descarga + correo); sin señal, el usuario se va |
| Cambio de paso en seco (`:92, 142, 180`) | `animate-vim-pop` del preset; con movimiento reducido, solo fundido | Pasa tres veces en la vida del usuario: orienta |
| Palomita de éxito estática (`:96-100`) | Una vez: `scale(0.9)→1` + opacidad 250 ms, nunca `scale(0)` | Confirma un momento de ansiedad |
| `focus:shadow-[0_0_0_3px_rgb(var(--accent-soft))]` (`:26`) | `focus-visible:shadow-[0_0_0_3px_rgb(var(--accent)/0.35)]` + transición de 150 ms | `#EAF3FB` sobre blanco ~1.1:1: el foco no se ve |
| El error aparece al fondo sin mover el foco (`:272-281`) | Sin animación: `scrollIntoView({block:"center"})` y foco al primer campo con error | Es orientación, no movimiento |
| Inputs de 15 px (`:26`) | 16 px | El zoom de iOS es el "movimiento" más molesto de la página |

## Páginas y estados

| Página o estado | Nota | Problema principal |
|---|---|---|
| `/` (espera) | **mal** | Dice "no está listo" y el portal ya funciona |
| Buscar folio | regular | No dice de qué negocio es; placeholder distinto al folio real |
| Datos fiscales | regular | Zoom en iOS, ayudas ilegibles, botón mudo, huecos de catálogo |
| Errores | regular | CP bien traducido; RFC y régimen genéricos, campo sin marcar |
| Timbrada | regular | No avisa si el correo falló; archivos irrecuperables |

## Observaciones menores

1. `#EAF3EE` (`:96`) ≈ `success-soft`; `#F0C7C2`/`#FBECEA` (`:273`) ≈ `danger-soft`.
2. Botones artesanales en vez de `Button` de `@vim/ui` (`nucleo.md:204-206`).
3. Faltan `autoComplete="email"`, `inputMode` y `enterKeyHint="next"`; `autoComplete="off"` en el RFC.
4. `autoFocus` en el folio abre el teclado en Android mientras la búsqueda ya corre sola (`:161`).
5. Fecha ISO cruda (`:186`): "24 sep 2026".
6. UUID de 11.5 px sin botón de copiar (`:105`).
7. `URL.revokeObjectURL` justo después de `a.click()` (`lib/portal.ts:105-106`): en Safari puede abortar la descarga; revocar en un `setTimeout`.
8. "La descargas del portal del SAT" (`:196`) sin enlace.
9. NO_DISPONIBLE sin pista, ni siquiera "¿ya la facturaste? revisa tu correo" (`index.ts:142`).
10. La página de espera tiene al logo de VIM de 56 px como protagonista (`page.tsx:17`).

## Preguntas

1. Si el PAC no guarda los archivos y el ticket ya no se puede refacturar, ¿qué hace el cliente que perdió el PDF? ¿Por qué no "reenviar a mi correo" con folio y RFC?
2. Un cliente frecuente factura cada semana. ¿Guardar sus datos en el teléfono, con permiso, no haría la segunda visita de un toque?
3. ¿El portal debe sentirse de Knock-Out o de VIM? Hoy el único logotipo es el nuestro.
