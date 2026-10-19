# Giros de belleza — diseño

**Fecha:** 18 oct 2026 · **Estado:** borrador para Fermín · **Grupo:** 2 de 3 antes de producción
(retail ✔ → **belleza** → servicios). Fermín cambió el orden el 18 oct: belleza va antes que servicios.

Bocetos aprobados por Fermín («los dejaría como están»): `docs/superpowers/bocetos-belleza/`
(`1-calendario.png`, `2-cobrar.png`, `3-cita.png`). Referencia visual: Square Appointments, con el
design system de VIM POS (`packages/ui/tokens.css`, `docs/diseno/`).

## 1. Para qué

VIM POS deja de ser solo para restaurantes y tiendas: entra a salones, spas, peluquerías, barberías y
estudios de tatuajes. Lo que más le complica hoy a un dueño de estos negocios, en palabras de Fermín,
es **«la administración, atención y recepción de citas»**. El centro del producto es la **agenda**; el
cobro, las comisiones y el inventario van alrededor.

**Éxito:** un salón con 3–4 colaboradores recibe citas en línea y por teléfono, no empalma a nadie,
cobra en la caja con el anticipo descontado y al final de la semana sabe cuánto le toca a cada quien.

## 2. Giros

| Código (propuesta) | Nombre visible |
|---|---|
| `SALON` | Salón de belleza |
| `SPA` | Spa |
| `PELUQUERIA` | Peluquería |
| `BARBERIA` | Barbería |
| `TATUAJES` | Tatuajes y piercings |

Los cinco usan la misma caja de belleza. Se agregan al enum `vertical_tipo` con `ADD VALUE` (va en un
instalador antes de usarse, como 0188/0205) y se liberan al final con su propia migración (molde: 0203,
0215). Un `es_giro_belleza()` / `esGiroBelleza` a la par de `es_giro_tienda`.

## 3. Lo que decidió Fermín

**Citas y reservación**
- La clienta llega **con o sin cita**. Al reservar puede **elegir colaborador o «quien esté libre»**.
- Se reserva **de las dos formas**: la clienta sola en línea, o el salón la anota en la caja.
- **Tolerancia** que define el dueño; pasada, la cita se marca «No llegó» y el lugar se libera para
  alguien **en espera** (los que llegaron sin cita).
- **Espacios** (sillas, cabinas, salas, mesas de uñas): la agenda no deja empalmar ni al colaborador
  ni al espacio. Se dan de alta como las mesas, sin plano.
- La clienta **puede cancelar o cambiar su cita sola** desde el enlace del correo **dentro del límite
  que pone el dueño**; fuera de él, solo el salón.

**Avisos**
- Confirmación y recordatorio **por correo, automáticos**.
- WhatsApp **con botón** («Recordar por WhatsApp» abre WhatsApp con el mensaje escrito, como las
  cotizaciones). El WhatsApp automático (API de Meta, cobra por mensaje) queda **para después**.

**Cobro**
- Cuándo se cobra **lo define el dueño**: al final, anticipo al apartar, o todo por adelantado. El pago
  en línea usa el **Mercado Pago de la tienda en línea**.
- Si la clienta cancela a tiempo, o cancela el salón, **el anticipo se devuelve** (completo).
- **Productos** (shampoo, ceras…) se venden en la misma caja: dentro de la cuenta de una clienta o
  en una venta suelta. **Con inventario** (las existencias de las tiendas, ADR 0037).

**Servicios y precios**
- Precio y duración **los decide el dueño**: base por servicio y, si quiere, propios por colaborador.
  Al cobrar se puede ajustar.

**Colaboradores**
- Se les paga **mezcla: sueldo + comisión**, y **VIM POS lleva la cuenta**.
- Comisión **solo por servicios**, o también por productos **si el dueño lo activa**.
- Pueden trabajar **las dos formas**: todo desde la recepción, o cada uno con su vista en el celular.
- **Colaborador y dueño ven las comisiones** (cada colaborador solo las suyas).

**Tatuajes**
- En línea se reserva una cita de **cotización/valoración**; **las sesiones las agenda el dueño a
  mano** (una o varias).

**Sitio de reservas**
- Un sitio que **el dueño personaliza**, como la tienda en línea de restaurantes (referencia: la página
  de Square con logo, dirección, mapa, servicios por categoría y «Reservar»).
- **Dirección `online.vimpos.com.mx/<negocio>`**, y **todo** se muda ahí: la tienda en línea de
  restaurantes también. `pedidos.vimpos.com.mx` redirige a la nueva para no romper enlaces.

**Planes**
- **Los mismos tres planes** (Esencial · Negocio · Cadena), sin plan por giro (ADR 0002).
- **Igual que la tienda en línea**: en Esencial el sitio de reservas **se cobra aparte**; en los demás
  va **incluido**. La agenda, las comisiones y la caja van en todos los planes.

## 4. Cómo se ve (bocetos)

**Barra de la caja:** Calendario · Cobrar · Clientes · Transacciones · Más.

1. **Calendario** (`1-calendario.png`): días de la semana arriba, una columna por colaborador, línea
   de la hora actual, citas con color del colaborador y su estado (Por llegar · Atendiendo · Cobrada ·
   No llegó). Arriba: «N en espera», «Colaboradores · Espacios» (filtro/vista) y «+ Nueva cita».
2. **Cobrar** (`2-cobrar.png`): a la izquierda, pestañas *Citas de hoy · Servicios · Productos*; la
   lista de citas va en grupos *Termina pronto · En espera (sin cita) · Cobradas hoy*. A la derecha, la
   venta: la clienta arriba (visitas, última visita, puntos), renglones con colaborador y espacio,
   anticipo descontado y «Cobrar $…». Es la caja de tienda (50/50, «⋯» con nota, descuentos, cliente).
3. **Ficha de cita** (`3-cita.png`, modal al 80 %): estado con tolerancia, clienta (teléfono, correo,
   faltas), fecha y horario, cómo reservó y anticipo, servicios con colaborador/espacio/duración, nota.
   Acciones: *Llegó · empezar*, *Recordar por WhatsApp*, *Mover de horario*, *No llegó · liberar
   lugar*, *Cancelar cita*.

**Clientes:** ficha con visitas, servicios anteriores y con quién, notas (alergias, preferencias),
faltas y puntos de lealtad; desde ahí se agenda.

**Vista del colaborador (celular):** entra con su usuario al POS en el navegador; ve **solo su agenda**
(hoy y próximos días), marca *Llegó/empecé* y *Terminé* (al terminar, la cita sube a «Termina pronto» en
Cobrar de la recepción) y ve sus comisiones del día y de la semana. **No cobra.**

**Admin del dueño:** servicios (precio/duración base y por colaborador), colaboradores (horario por
día, comida, días libres/vacaciones, sueldo y comisión), espacios, reglas (tolerancia, límite para
cancelar, cuándo se cobra/anticipo, comisión por productos sí/no, periodo de comisiones semanal o
quincenal), y el sitio de reservas.

**Reportes:** ventas por colaborador y por servicio, comisiones por periodo (sueldo + comisiones = lo
que le toca), citas atendidas / canceladas / faltas, ocupación de la agenda.

## 5. Lo que ya existe y cómo se usa

- **`reservaciones` (0010) NO se reutiliza** para citas: está atada a mesas y comensales, sin
  colaborador, servicio ni espacio, y sin candado contra empalmes. Las citas son tablas nuevas. *(Mi
  decisión; el constructor puede reconsiderarlo si encuentra una razón fuerte.)*
- **Caja de tienda** (feat/retail-*): la pantalla Cobrar de belleza parte de ella (50/50, «⋯», barra
  inferior, sección «Más»). Productos con existencias y escáner, igual.
- **Empleados:** `usuarios_perfil` + `usuarios_acceso` + roles (0004). Un colaborador es un empleado
  con agenda; el rol/subtipo exacto lo decide el plan.
- **Tienda en línea** (`apps/tienda`, ADR 0032): el sitio de reservas vive en esa app (mismo
  dominio, mismo patrón de slug, Mercado Pago, correos por estado, complemento de pago). Sus clientas
  no viven en Auth (como los comensales de la tienda); el sitio de reservas **no pide cuenta** —
  nombre, celular y correo, y el enlace del correo para cancelar o cambiar. *(Mi propuesta.)*
- **Devolución de Mercado Pago:** hoy solo existe la devolución **completa** (`pago-mp.ts`), que es
  justo lo que pide la regla del anticipo.
- **Lealtad** (0156): los servicios suman puntos como cualquier venta.
- **Clientes** (`clientes`): ya tiene teléfono, correo y `notas_internas`.

## 6. Reglas que el constructor no debe romper

- **Nada de empalmes:** ni el mismo colaborador ni el mismo espacio en dos citas que se cruzan. La
  regla vive en la base (candado), no solo en la pantalla, porque reservan dos canales a la vez.
- **La reserva en línea solo ofrece horarios libres** según horario del colaborador, días libres,
  citas existentes y espacio que el servicio necesita.
- **Restaurantes y tiendas no cambian.**
- **Todo en local** hasta que retail, belleza y servicios estén al 100 %: sin push, PR, merge,
  `db push`, despliegues ni instalador.
- La caja instalada (escritorio, sync por snapshot) también agenda y cobra citas: las tablas nuevas
  viajan por el sync como las demás.

## 7. Fuera de alcance (por ahora)

- WhatsApp automático (API de Meta).
- Pagar la nómina: VIM POS calcula lo que le toca a cada quien, no deposita.
- Devoluciones parciales del anticipo.
- Consentimientos firmados y proyectos de varias sesiones con precio global (tatuajes): las sesiones
  se agendan a mano; si piden precio por escrito, se usan las cotizaciones de retail. *(Propuesta mía.)*
- Báscula, terminal y cualquier hardware.
- Sitio de VIM y PDF de prospectos: al final de los tres grupos.

## 8. Mis decisiones (Fermín puede corregirlas)

- **Si la clienta cancela fuera de tiempo o no llega, el salón se queda con el anticipo.**
- **Sin tope de colaboradores por plan** (Fermín: «dejémoslo como te dije»).
- Códigos de giro de la tabla del §2.
- Sitio de reservas sin cuenta de clienta.
- Citas en tablas nuevas, no en `reservaciones`.
- Un mismo servicio pide **un tipo de espacio** (o ninguno); el sistema asigna uno libre de ese tipo.
- Colores del calendario: uno por colaborador, de una paleta fija que respete contraste.

## 9. Entregas propuestas

1. **Agenda:** giros nuevos, servicios, colaboradores con horario, espacios, citas sin empalmes,
   calendario, lista de espera, tolerancia y «No llegó», ficha de cita, Clientes, recordatorio por
   WhatsApp con botón. Barra de belleza.
2. **Cobro y comisiones:** Cobrar desde la cita (servicios + productos), anticipo descontado, comisiones
   (servicios y opcional productos), periodo y cálculo sueldo + comisión; reportes de ventas por
   colaborador y servicio.
3. **Reservas en línea:** dominio `online.vimpos.com.mx` (y la mudanza de la tienda con redirección),
   sitio personalizable, reservar sin cuenta, anticipo con Mercado Pago y devolución, correos de
   confirmación y recordatorio, cancelar/cambiar dentro del límite; complemento en Esencial.
4. **Colaborador en el celular y cierre:** vista del colaborador, reportes restantes (citas, faltas,
   ocupación), registro de los giros en alta/registro/platform/prospectos y migración de liberación.

Cada entrega lleva su propio plan.
