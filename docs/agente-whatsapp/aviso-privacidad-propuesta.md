# Aviso de privacidad — propuesta para el agente de WhatsApp

Redactó: James (27 oct 2026). **Pendiente de aprobación de Fermín**; no se ha tocado
`sitio-web/aviso-privacidad.html`. Al aprobarse, los cambios van en el HTML (el `.md` se genera con
`npm run sitio:generar`); listas nuevas con `ul.lista-legal`, subtítulos en `<p><strong>…</strong></p>`.

## Decisiones de Fermín antes de pegar

1. «Una persona de VIM» o «Fermín» (el aviso hoy no publica el nombre en texto).
2. El seguimiento comercial queda ligado a «lo que nos preguntaste». Escribir a prospectos que no pidieron nada sería otra finalidad (abogado).
3. Se quitó «ni datos financieros» de lo que no pedimos, porque habrá cobro. Revisión legal recomendada (transferencia a Anthropic fuera de México, cobro, IA).
4. «Pedir hablar con una persona en cualquier momento» vs. horario de atención (9:00–18:00).
5. Google Calendar, Mercado Pago y el código por correo van en presente aunque llegan en fases 2–3; si alguno no sale, se quita.
6. El propio aviso dice que si cambia para qué se usan los datos, se avisa por el mismo medio: decidir si se avisa a quienes ya escribieron por WhatsApp.
7. Fuera del aviso: `sitio-web/contacto.html` («contesta una persona») y la ficha de Mike (`AGENTES/MIKE/CONOCIMIENTO/vim-pos.md`) quedan desactualizados.

Datos técnicos confirmados: las conversaciones viajan cifradas (HTTPS/TLS entre Meta, Supabase y Anthropic) y las tablas `wa_*` solo las lee el servidor (RLS sin políticas), así que vale la versión principal de «Seguridad».

## 1. Encabezado

**Actual:** Última actualización: 1 de octubre de 2026.
**Nuevo:** Última actualización: 27 de octubre de 2026.

## 2. Qué datos recabamos (se reemplaza el cuerpo)

Solo los que tú nos das.

**Si llenas el formulario de demostración:**
- Tu nombre.
- Tu número de WhatsApp.
- El nombre de tu negocio, cuántas cajas y cuántas sucursales tiene.
- Opcionalmente, el giro y qué sistema usas hoy.

**Si nos escribes por WhatsApp** (+52 56 6508 3346), primero te contesta un asistente automático con inteligencia artificial. Cuando hace falta, entra una persona de VIM. Y si tú prefieres hablar con una persona, pídelo en el chat en cualquier momento. De esa conversación guardamos:
- Tu número y tu nombre de perfil de WhatsApp.
- El texto de los mensajes.
- Lo que nos cuentes de tu negocio: el nombre, el giro, la ciudad, cuántas cajas y cuántas sucursales tiene.

No pedimos datos sensibles, ni tu RFC, ni nada de tus clientes. Por WhatsApp no te pedimos los datos de tu tarjeta: si eres cliente, tu mensualidad la pagas en Mercado Pago. Si nos escribes por correo, lo que nos cuentes ahí lo usamos para lo mismo.

## 3. Para qué los usamos (se reemplaza el cuerpo)

Para atender lo que nos pides. En concreto:
- Contestar tus dudas sobre VIM POS.
- Agendar y dar la demostración, o la cita que nos pidas.
- Prepararla con tu caso: cuántas cajas tienes decide qué te enseñamos.
- Darte seguimiento sobre lo que nos preguntaste, y dejar de hacerlo en cuanto nos digas que paremos.
- Que una persona de VIM retome la conversación cuando haga falta, con lo que ya nos contaste.
- Si ya eres cliente, cobrarte la mensualidad y confirmar que eres tú con un código que te mandamos por correo.

**No te vamos a meter a una lista de correos** ni a mandarte publicidad que no pediste, y lo que platicas con nosotros por WhatsApp no lo usamos para mandar publicidad masiva. Si algún día queremos mandarte publicidad, te lo preguntaremos antes.

## 4. Con quién los compartimos (se reemplazan el primer párrafo y la lista)

El párrafo de la autoridad competente y el de las apps de reparto no cambian.

**No vendemos ni rentamos tus datos.** Los únicos terceros que los tocan son los proveedores que hacen funcionar el sitio, nuestro correo y la atención por WhatsApp, y solo para eso.

Para el sitio y el correo:
- El proveedor que aloja el sitio web.
- El proveedor donde se guarda la solicitud, con servidores fuera de México.
- El servicio con el que nos llega el aviso de que escribiste.

Para la atención por WhatsApp:
- Meta, dueña de WhatsApp: por ahí viajan los mensajes.
- Anthropic, una empresa de Estados Unidos que da el servicio del asistente de inteligencia artificial. Recibe el texto de la conversación solo para generar la respuesta y lo procesa fuera de México.
- Google, para anotar en Google Calendar las citas que agendas con nosotros.
- Mercado Pago, para cobrar la mensualidad si eres cliente.
- El servicio de correo con el que te mandamos el código para confirmar que eres tú, si eres cliente.

## 5. Cuánto tiempo los guardamos (solo la primera frase)

**Actual:** Hasta **24 meses** desde que nos escribiste, salvo que te vuelvas cliente
**Nuevo:** Hasta **24 meses** desde que nos escribiste, por el formulario o por WhatsApp, salvo que te vuelvas cliente

## 6. Seguridad (se reemplaza el párrafo)

Tu solicitud y tus conversaciones de WhatsApp viajan cifradas y se guardan con el acceso cerrado. Solo las abrimos nosotros; el asistente de inteligencia artificial lee el texto únicamente para contestarte. Ningún sistema es infalible, pero no guardamos de ti nada que no sea necesario, que es la única protección que de verdad no falla. Ayúdanos con eso: no nos mandes por WhatsApp contraseñas ni datos de tarjetas.
