# El agente de WhatsApp aprende de cada conversación — diseño

Fecha: 28 oct 2026 · Estado: listo para aprobación de Fermín
Construye sobre: `docs/superpowers/specs/2026-10-27-agente-whatsapp-design.md` (agente en producción,
fase 1) y su evaluación (`npm run agente:evaluar`).

## Estado de partida (verificado 28 oct)

- En producción: migración 0286, funciones `whatsapp-webhook` y `whatsapp-avisos`, cron `wa-avisos`,
  número real conectado por Kapso (coexistencia). La bandeja de /platform va en el PR #220.
- **Los ecos funcionan**: lo que Fermín escribe desde el iPhone llega por Kapso como
  `smb_message_echoes` y queda en `wa_mensajes` con autor `FERMIN` (probado el 28 oct a las 10:24).
- No hay número de pruebas: las pruebas de punta a punta se hacen con el número real, escribiendo desde
  un teléfono que no sea el de Fermín, como en la fase 1.

## Por qué

El agente sabe lo que dice el sitio. Lo que no sabe se lo pasa a Fermín, que contesta desde su iPhone.
Esa respuesta queda guardada (`wa_mensajes`, autor `FERMIN`) y hoy se desperdicia: la siguiente vez que
alguien pregunta lo mismo, el agente vuelve a pasarla. Fermín quiere que **cada conversación deje al
agente mejor**, en dos frentes:

1. **Dudas técnicas**: que aprenda a contestar lo que Fermín ya contestó una vez.
2. **Ánimo y confianza**: que maneje mejor a la gente molesta, desconfiada o con prisa, a partir de cómo
   habla Fermín y de qué conversaciones salieron bien o mal.

El modelo no se re-entrena: «aprender» = un ciclo que propone lecciones, Fermín las aprueba y las
aprobadas entran a las instrucciones del agente.

## Metas

- Cada noche, proponer hasta **5 lecciones** sacadas de las conversaciones del día.
- Fermín las **aprueba, corrige o descarta por WhatsApp**, desde su celular, en minutos.
- Lo aprobado lo usa el agente **de inmediato, sin redesplegar**.
- Lo aprendido no se rompe con cambios futuros (entra a la evaluación).

## No-metas

- Re-entrenar o ajustar el modelo.
- Aprender sin aprobación de Fermín.
- Cambiar por esta vía las **anti-metas del agente** (no nombrar a Fermín, no revelar información
  interna, no hablar mal de la competencia, no inventar). Esas solo se cambian en código.
  *Lo comercial sí se puede enseñar* (ver «Lecciones comerciales»).

## Anti-metas (falla aunque «funcione»)

- **Que un cliente le enseñe algo al agente.** Ningún texto de cliente se convierte en regla: las
  lecciones salen de lo que escribió Fermín o de un análisis del revisor, y todas pasan por Fermín.
- **Que se filtren datos de un cliente** a otros: una lección nunca lleva nombres, teléfonos, nombres de
  negocio, direcciones ni montos de un cliente concreto.
- **Que una respuesta muy particular de Fermín** («a ti te lo dejo en $500») se vuelva regla general
  **sin que él lo decida**: el revisor la propone generalizada solo si parece aplicar a todos, y Fermín
  ve exactamente lo que el agente diría antes de aprobar.
- **Que le llegue a Fermín una avalancha**: máximo 5 por día, y lo no revisado caduca.
- **Que el agente se vuelva lento o caro**: lo aprendido tiene un tope de tamaño.

## Decisiones de Fermín

| Tema | Decisión |
|---|---|
| Qué aprender | Dudas técnicas que contestó Fermín; manejo de ánimo y confianza |
| Aprobación | **Cada lección se aprueba antes** de usarse con otros clientes |
| Dónde aprueba | **Respondiendo un WhatsApp** en su número personal |
| Flujo | Aviso diario → responde «VER» → una lección por mensaje → contesta cada una deslizando el mensaje con **SÍ**, **NO** o su corrección |
| Lo comercial | **Sí se puede enseñar por WhatsApp** (precios, descuentos, promociones): lo que Fermín apruebe manda (opción B, 28 oct) |

Decisiones de Claude que Fermín aceptó («Está bien», 28 oct): el aviso sale a las **9:00**; máximo **5
lecciones por día**; lo no revisado **caduca a los 3 días**; su número personal se sigue ignorando para
conversar y solo se le hace caso al contestar lecciones; en /platform queda la lista de lo aprendido para
consultarla o quitar algo.

## Cómo funciona

### 1. El revisor (cada noche)

- pg_cron a las **2:00** (`America/Mexico_City`) llama a una Edge Function nueva (p. ej.
  `whatsapp-aprender`) con `x-vim-interno`, como `whatsapp-avisos`.
- Lee las conversaciones con actividad en las últimas 24 h: mensajes (CLIENTE / AGENTE / FERMIN), estado,
  pases a Fermín (`wa_avisos_fermin.motivo/resumen`) y `wa_preguntas`.
- Le pasa a **Claude Sonnet** esas conversaciones, el conocimiento actual y las lecciones ya aprobadas, y
  le pide **hasta 5 propuestas** en JSON, priorizando:
  1. **Duda técnica** (`DUDA`): un cliente preguntó algo, el agente no supo o pasó, y **Fermín contestó**.
     Propuesta = pregunta generalizada + respuesta generalizada a partir de lo que dijo Fermín.
  2. **Tono** (`TONO`): una conversación donde el cliente estaba molesto/desconfiado/con prisa. Propuesta
     = una pauta corta («Ante X, haz Y») con un ejemplo «así sí» tomado preferentemente de cómo habló
     Fermín. Señales: Fermín tuvo que entrar, el cliente se calmó o se fue, dejó o no sus datos.
  3. **Pregunta sin respuesta** (`PREGUNTA`): algo que el agente anotó (`wa_preguntas`) y nadie contestó.
     Propuesta = la pregunta, para que Fermín escriba la respuesta.
- El revisor **generaliza y quita datos personales**; descarta casos de un solo cliente; no propone nada
  que toque reglas de fondo (ver No-metas); no repite lecciones ya aprobadas o pendientes.
- Cada propuesta se guarda con: tipo, texto propuesto (lo que el agente aprendería), evidencia (fragmento
  anonimizado de la conversación, para que Fermín entienda de dónde salió) y la conversación de origen.

### 2. El aviso a Fermín (9:00)

- Si hay lecciones pendientes, a las 9:00 sale a `WA_NUMERO_FERMIN` la **plantilla que ya existe,
  `aviso_fermin`** (aprobada, un parámetro libre), con el parámetro *«3 lecciones nuevas del asistente;
  responde VER para verlas»*. Así no hay que esperar otra aprobación de Meta. *(Decisión de Claude.)*
  Si más adelante se quiere un texto propio, se crea una plantilla `lecciones_fermin` y se cambia el
  nombre en el código.
- No se repite el aviso si ya hay lecciones enviadas sin contestar.

### 3. La revisión por WhatsApp

- El webhook ya recibe los mensajes del número personal de Fermín (hoy los registra y no contesta).
  Ahora, **si vienen de `WA_NUMERO_FERMIN`**:
  - **«VER»** (sin importar mayúsculas/acentos) con lecciones pendientes → se le manda **una lección por
    mensaje** (texto libre; la ventana de 24 h está abierta porque él escribió), con este formato:
    > *Lección 1 de 3 · Duda técnica*
    > Un cliente preguntó: «…» · Tú contestaste: «…»
    > El agente aprendería: «…»
    > Responde *SÍ*, *NO* o escribe la corrección.
    Se guarda el `wamid` de cada mensaje enviado para saber a qué lección responde.
  - **Primer paso del plan: verificar con un mensaje real** que Kapso reenvía `context.id` en una
    respuesta deslizada y que coincide con el `wamid` que devolvió el envío. Si no, el respaldo
    *(decisión de Claude)* es numerar: cada lección lleva su número y Fermín contesta «SÍ 2», «NO 3» o
    «2: <corrección>»; los mensajes cambian a ese formato.
  - **Respuesta deslizada** a una lección (WhatsApp manda `context.id` = wamid del mensaje citado):
    **SÍ** → aprobada tal cual; **NO** → descartada; **cualquier otro texto** → aprobada con el texto de
    Fermín como versión final (para `PREGUNTA`, su texto es la respuesta).
  - **Respuesta sin deslizar**: si solo hay una lección esperando respuesta, se aplica a esa; si hay
    varias, se le contesta pidiéndole que deslice el mensaje de la lección.
  - Cuando ya no quedan lecciones esperando respuesta → confirmación: *«Listo: 2 aprendidas, 1
    descartada.»*
  - Cualquier otro mensaje de su número se sigue registrando sin contestar (comportamiento actual).
- Lo no contestado en **3 días** queda caducado.

### 4. El agente usa lo aprendido

- Las lecciones aprobadas viven en la base (tabla nueva) y el agente las lee en cada turno: se agregan a
  sus instrucciones como un bloque «LO QUE HAS APRENDIDO» (dudas con su respuesta; pautas de tono con su
  ejemplo), separado de las reglas.
- **Precedencia** (el bloque lo dice explícitamente): las anti-metas del agente mandan siempre; después,
  **lo aprendido manda sobre el conocimiento del sitio** (es lo más reciente y lo aprobó Fermín, incluido
  lo comercial).
- Tope de tamaño del bloque (p. ej. 12 000 caracteres); si se pasa, se priorizan las más recientes y
  Fermín ve en /platform cuáles quedaron fuera.
- Sin redespliegue: aprobar = disponible en el siguiente mensaje.

### Lecciones comerciales (decisión de Fermín: opción B)

- Una lección (propuesta o corrección de Fermín) que toque **precios, descuentos, promociones, planes o
  condiciones** se marca como **comercial**. Se aprueba igual, por WhatsApp, y manda sobre el sitio.
- *(Decisión de Claude, para que un error de dedo no llegue a todos sin que Fermín lo note.)* Al aprobar
  una comercial, la confirmación lo dice claro: *«Listo. Ojo: desde ahora a todos los que pregunten les
  digo: "<texto>". Para quitarlo, responde QUITAR a este mensaje o entra a /platform.»* Responder
  **QUITAR** a esa confirmación la retira al momento.
- En /platform las comerciales se distinguen con una etiqueta.

### 5. /platform: «Aprendido»

- En la sección WhatsApp, una lista de lecciones (pendientes, aprobadas, descartadas, caducadas) con su
  texto, evidencia y fecha, y un botón **Quitar** para retirar una aprobada (deja de usarse al momento).
- Es consulta y retiro; la aprobación diaria es por WhatsApp.

### 6. La evaluación protege lo aprendido

- *(Decisiones de Claude.)* El revisor propone, junto con cada lección, su escenario de prueba (para
  `DUDA`/`PREGUNTA`: la pregunta del cliente y el criterio «responde según la lección»; para `TONO`: 2–3
  turnos con ese ánimo y el criterio de la pauta). Si Fermín corrige, el criterio se rehace con su
  versión al aprobar.
- La evaluación carga las lecciones aprobadas (bloque «LO QUE HAS APRENDIDO» para el agente y para el
  juez) y sus escenarios. Solo **informa**: una lección que falla no se desactiva sola; aparece en el
  reporte para revisarla. Cómo llegan de producción al evaluador local se deja al builder (sin datos
  personales).
- Al regenerar el conocimiento del sitio no se tocan las lecciones; si una queda repetida u obsoleta,
  Fermín la quita en /platform.

## Seguridad y privacidad

- Lecciones sin datos personales (lo exige el revisor y se revisa con una regla fija antes de guardar:
  sin teléfonos, correos ni montos con nombre).
- El webhook solo trata como «revisión de lecciones» los mensajes cuyo remitente coincide con
  `WA_NUMERO_FERMIN` (últimos 10 dígitos), igual que hoy para ignorarlo.
- Tablas nuevas con RLS sin políticas (solo service_role), como las `wa_*` actuales.
- La función del revisor es interna (`x-vim-interno`, `verify_jwt = false`), como `whatsapp-avisos`.

## Costos

- Revisor nocturno con Sonnet: centavos de dólar por noche con el volumen actual.
- Bloque de lo aprendido en cada turno: tokens adicionales pequeños (tope de 12 000 caracteres); puede ir
  en caché.
- Mensajes de revisión a Fermín: dentro de su ventana de 24 h (servicio) + 1 plantilla al día.

## Lo que hace Fermín (fuera del código)

1. Crear y enviar a aprobación la plantilla `lecciones_fermin` en Kapso (Utility, es_MX, un parámetro).
2. Revisar las lecciones cada mañana que lleguen.

## Lo que se deja al builder

Nombres de tablas/funciones y esquema exacto; el prompt del revisor y su formato JSON; cómo se marca
«enviada/esperando respuesta»; el texto exacto de los mensajes a Fermín (James revisa el tono); cómo se
priorizan las 5 del día; cómo se ensambla el bloque aprendido en `cerebro.ts` (caché incluida); cómo
llegan las lecciones a la evaluación; la pantalla «Aprendido» siguiendo `docs/diseno/platform.md`.
