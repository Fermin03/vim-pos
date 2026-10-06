# Reglas de actualizaciones

Qué número lleva una versión, qué día sale, cómo se escribe su nota y en qué orden se publica.
Acordado con Fermín el 5 oct 2026. El *cómo* se empaqueta y se sube sigue en
[`../../desktop/RUNBOOK.md`](../../desktop/RUNBOOK.md); aquí está el *cuándo* y el *qué se dice*.

> **Por qué existe:** hasta la 0.4.110 todo subió como tercer número, y el 2 oct 2026 salieron seis
> versiones en cinco horas (0.4.105 a 0.4.110). Una caja en servicio no debería recibir seis
> avisos de actualización en una tarde, y un número que siempre sube igual no dice nada.

## 1. Qué número sube

El número es **solo del instalador** (`desktop/package.json`). Admin, panel y sitio se despliegan
al mezclar y no llevan versión.

| Número | Cuándo sube | Ejemplos |
|---|---|---|
| **0.0.x** corrección | Se arregla o pule algo que ya existía. El cliente no aprende nada nuevo. | El ticket pedía PIN en la primera impresión; el «Sin internet» falso |
| **0.x.0** función | El cliente puede hacer algo que antes no podía, o algo existente cambia de forma de usarse. | Pantalla del cliente, menú por sucursal, impresoras USB |
| **x.0.0** hito | El cliente tiene que hacer algo para seguir operando (reinstalar, reconfigurar, migrar), o es un hito comercial que decide Fermín. | **1.0.0 = lanzamiento** |

- **Manda el cambio más grande del paquete.** Una función y tres arreglos dan 0.x.0.
- Al subir un número, los de su derecha vuelven a 0: tras la 0.4.110, la siguiente función es la
  **0.5.0**. La caja compara número por número (`esMasNueva` en `desktop/src/updater.mjs`), así que
  0.5.0 le gana a 0.4.110.
- **La 1.0.0 está reservada para el lanzamiento.** Nadie la usa antes, aunque toque un hito técnico.
  Su fecha la fija Fermín cuando cierre los errores que está puliendo; hasta entonces se sigue en 0.x.
- Un número publicado no se reutiliza ni se salta para atrás. Si una versión sale mal, se corrige
  con una más alta: la caja no baja de versión.
- Cada versión publicada se etiqueta en este repo (`git tag v0.5.0` sobre el commit del que salió
  el instalador). Las etiquetas se quedaron en `v0.4.101`; sin ellas no se sabe qué código lleva
  una caja.

## 2. Qué día sale

**Martes, antes de las 10:00.** Un solo instalador por semana, con todo lo que esté listo.

| Día | Qué pasa |
|---|---|
| **Viernes** | Corte. Lo que no esté mezclado en `main` espera a la semana siguiente. |
| **Lunes** | Se empaqueta, se instala en VIM Pruebas y se le pasa a Fermín la lista de lo que incluye. Sin su visto bueno no se publica. |
| **Martes** | Se publica antes de las 10:00. |

**De jueves por la tarde a domingo no se publica nada**, salvo urgencia: es cuando más venden los
restaurantes y cuando menos margen hay para corregir.

Si el martes no hay nada que valga un instalador, no se publica. No se saca una versión por
cumplir el calendario.

### Qué es una urgencia

Solo esto:

- no se puede vender, cobrar, imprimir, facturar o abrir turno;
- se pierde o se descuadra dinero o datos;
- hay una falla de seguridad.

Una urgencia sale el mismo día como **0.0.x**, lleva únicamente ese arreglo y pasa la misma lista
"Antes de empaquetar" del RUNBOOK, sin atajos. Después se deja una nota en `docs/bitacora/` con qué
pasó y qué lo evita la próxima vez.

Todo lo demás —incluido un error molesto pero con el que se puede operar— espera al martes.

### Web: admin, panel y sitio

- **Arreglos:** salen cualquier día, al mezclar.
- **Funciones visibles para el cliente:** se mezclan para que salgan el martes, junto con el
  instalador, y se anuncian una sola vez.

## 3. Orden de salida

Siempre este, y cada paso espera a que el anterior esté comprobado:

1. **Migración** a producción, a mano y antes de mezclar.
2. **Funciones** (Edge Functions).
3. **Web** (admin, panel, sitio).
4. **Instalador**, y al final `latest.json`.

Al revés, una caja nueva le habla a una nube que todavía no la entiende.

## 4. Cómo se escribe la nota

La nota es el texto de `npm run release-manifest -- "…"` y del release en
`Fermin03/vim-pos-descargas`. Es lo que lee el cliente en la caja. Los commits y los PR son el
registro técnico y siguen sus propias convenciones; estas reglas no les aplican.

1. **Se escribe para quien cobra en la caja.** Dice qué puede hacer ahora y dónde está, con la
   ruta del menú tal como aparece en pantalla.
2. **Un arreglo se describe por lo que el cliente veía, no por la causa.** Fuera las palabras
   internas: watchdog, sync, migración, RPC, hub, números de PR, nombres de archivo.
3. **No se mencionan otras versiones.** «Incluye el arreglo de la 0.4.107» no le dice nada a nadie.
4. **Sin relleno.** Nada de «mejorado», «optimizado», «más pulido», «más robusto», «mejoras y
   correcciones varias», emojis ni signos de admiración. Si no se puede decir qué cambió, no va.
5. **De tú, en presente, frases completas.** Sin gerundios de anuncio («Mejorando…») ni
   infinitivos de lista de tareas («Agregar…»).
6. **Formato fijo, en un solo párrafo** (la caja lo muestra como texto corrido). Hasta tres frases
   por sección, solo las secciones que apliquen, en este orden:
   `Nuevo: … Mejoras: … Correcciones: …`
7. **Sin nombres ni números de clientes.**

### Plantilla

```
Nuevo: <qué puedes hacer ahora>. Lo encuentras en <Menú → Opción>.
Mejoras: <qué cambió en algo que ya usabas>.
Correcciones: <qué pasaba> ya no pasa.
```

### Ejemplos con notas que ya se publicaron

| Como salió | Como debe salir |
|---|---|
| «Pantalla del cliente más pulida: sin parpadeos en reposo, cada anuncio conserva su tiempo al cambiar la lista y una imagen rechazada no se vuelve a descargar en cada sincronización.» | «Correcciones: los anuncios de la pantalla del cliente ya no parpadean y cada uno respeta el tiempo que le pusiste.» |
| «Anuncios en la pantalla del cliente: […] Incluye el arreglo del watchdog de la 0.4.107.» | «Nuevo: las imágenes que subas en Configuración → Pantalla del cliente salen en el segundo monitor cuando no se está cobrando, cada una con su tiempo.» |
| «Impresoras instaladas en Windows (USB) y modificadores dentro del combo.» | «Nuevo: puedes imprimir en una impresora USB instalada en Windows; se elige en Menú → Configurar impresoras y pantallas. Los productos de un combo ya aceptan modificadores.» |

Una nota bien hecha, tal cual se publicó (0.4.104): «Corrige el botón del ticket en las cuentas:
la primera impresión ya no pide PIN de supervisor.»

## 5. Aviso al cliente

| Versión | Cómo se entera |
|---|---|
| 0.0.x | La nota en la caja. |
| 0.x.0 | La nota en la caja y un mensaje por WhatsApp o correo. |
| x.0.0 | Lo anterior, con aviso previo y fecha. |

## Pendiente de decidir

- **Canal piloto:** que una caja reciba la versión antes que el resto. Hoy hay un solo
  `latest.json` para todas; haría falta desarrollo.
- **Versión mínima soportada:** cuánto puede atrasarse una caja antes de obligarla a actualizar.
- **Página de novedades** en el sitio.
