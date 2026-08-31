# Commits cuyo mensaje no describe todo lo que traen

Este archivo existe para una cosa: que quien lea `git log` o corra `git blame` y encuentre
código que no encaja con el mensaje del commit, sepa qué pasó sin tener que reconstruirlo.

No es una bitácora de cambios. Solo se anota lo que quedó **mal etiquetado**, y por qué no se
corrigió reescribiendo la historia.

---

## 27 de agosto de 2026 — los lotes del push quedaron dentro de dos commits sobre cortes

**Qué pasa si no lees esto:** buscas en `git log` cuándo se implementó el envío por lotes del
`sync-push` y no aparece. `git blame desktop/src/sync-push.mjs` te manda a un commit que habla de
cortes de caja. Ninguna de las dos cosas es cierta.

### Los dos commits

| Commit | Dice que hace | Lo que trae de verdad |
|---|---|---|
| `2383b29` | «sync: el corte de caja y el reporte Z ya suben a la nube» | **35 líneas** del envío por lotes · **4 líneas** de los cortes · `scripts/capturar-plantilla.mjs` (169 líneas) · `scripts/carga-nube.mjs` (562) |
| `7cbff81` | «escritorio: el rescate de cortes va automático al actualizar» | `src/verify-push-lotes.mjs` completo · los cambios a `verify-push.mjs` y `verify-cierre-turno.mjs` |

Por volumen, el primero es en su mayor parte trabajo de los lotes, no de los cortes.

### El trabajo que quedó sin su propio commit

Envío por lotes en `sync-push.mjs`, que arregla un fallo permanente y silencioso: el push armaba
todo lo pendiente en UNA petición. Con la caja al corriente son dos o tres ventas y no se nota; con
un mes sin internet son miles y decenas de MB — la Edge Function rechaza el cuerpo, el device no
marca nada como subido, y al ciclo siguiente rearma el mismo paquete gigante y vuelve a fallar.
Para siempre.

Lo que trae:

1. Lotes de 100 ventas, cada uno con los turnos que sus tickets referencian (sin eso la llave
   foránea los rechaza del otro lado).
2. **Cada lote se marca en cuanto la nube lo confirma.** Es el cambio que importa: si el lote 7
   falla, los seis primeros ya están arriba y el siguiente ciclo retoma ahí. Antes un fallo tiraba
   el trabajo completo.
3. Corte por tamaño además de por conteo: un lote de más de 2 MB se parte aunque traiga pocas
   ventas, y un 413 de la nube también parte en vez de reintentar lo mismo — ese error no se
   arregla repitiendo.

Con sus pruebas: `verify-push-lotes.mjs` (7 casos, sin Postgres, con una nube falsa que puede
portarse mal a voluntad) y la extensión de `verify-push.mjs` contra la base real.

De paso se arregló `verify:cierre-turno`, que **ya estaba roto de antes**: su esquema de
laboratorio no creaba `delivery_asignaciones`, que se sumó al snapshot después de escribirse esa
prueba.

### Cómo ocurrió

Ese trabajo estaba **sin commitear** en el árbol. Al preparar el arreglo de los cortes se usó
`git add -A desktop` en vez de nombrar los archivos, dos veces, y arrastró todo lo que había
alrededor — incluidos los cambios de `sync-push.mjs`, que es un archivo que las dos tareas tocaban.

Se avisó en el momento («se me colaron archivos que no son míos»), pero se trató como ruido menor:
se miraron como scripts sueltos y no se comprobó si había cambios pendientes en los archivos que se
estaban editando.

### Por qué no se reescribió la historia

Los commits ya estaban en `main`, y de esos SHA salió la **versión 0.4.50 del escritorio**, ya
publicada en el feed de actualizaciones y que las cajas van a descargar. Reescribir historia
publicada de la que cuelga un release entregado es más riesgo que el problema que arregla: el
código está entero y correcto, lo único equivocado son las etiquetas.

### Nota de release

La 0.4.50 se publicó **incluyendo el arreglo de lotes sin que fuera una decisión consciente** —
quien la publicó no sabía que ese trabajo estaba en el árbol. El resultado es bueno (la caja del
piloto necesitaba las dos cosas), pero la decisión de release se tomó sin la información completa.

---

## Cómo evitar que se repita

Al commitear, nombrar los archivos en vez de `git add -A <carpeta>`:

```bash
git status --short          # mirar SIEMPRE antes
git add ruta/exacta.ts ...  # nombrar lo propio
```

Y si `git status` muestra cambios en un archivo que estás editando pero que no recuerdas haber
tocado, revisarlo antes de commitear: puede ser trabajo de otra sesión que todavía no tiene su
commit.
