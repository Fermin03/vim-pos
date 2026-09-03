# Datos personales e incidentes — integración con apps de delivery

Qué hacemos con los datos que llegan de Uber Eats (y después DiDi y Rappi), quién los toca, cuánto
duran, y qué hacer cuando algo sale mal. Cumple las obligaciones C4–C12 y D5 del contrato con Uber
(`docs/integraciones/delivery/uber-eats/contrato/README.md`); es el documento que respalda el
certificado anual de cumplimiento (C13) si Uber lo pide. Dueño: Fermín. Revisar cada trimestre.

## 1. Qué datos llegan y dónde viven

| Dato | De dónde | Dónde se guarda | Quién lo ve |
|---|---|---|---|
| Nombre corto del cliente (nombre e inicial), teléfono y PIN de contacto, dirección de entrega | `orders.notification` → `GET /v1/delivery/order` | `delivery_pedidos` (RLS por tenant) y `payload_raw` | Caja y admin del restaurante; VIM solo por soporte |
| Ítems, instrucciones especiales, alergias | igual | `delivery_pedidos.items` y la nota de cocina del ticket | Caja, KDS, comanda impresa |
| Nombre y teléfono del repartidor | webhooks de entrega | `delivery_pedidos.repartidor_*` | Caja |
| Cuerpo crudo de cada webhook | Uber | `delivery_eventos.payload` | Solo VIM (service_role) |
| Token OAuth del dueño (activación) | Uber | `delivery_autorizaciones` (deny‑all, solo service_role) | Nadie: se borra al activar o vence en 30 días |
| Token de aplicación de VIM | Uber | `delivery_credenciales_app` (deny‑all) | Nadie |

Uber es el **Responsable** (controller) y VIM el **Encargado** (processor). Los datos se usan
**solo** para preparar el pedido y mostrarle al restaurante sus ventas (contrato 3.2.2). Nunca se
cruzan con la lista de clientes del restaurante ni con marketing.

## 2. Retención (DPA 1.5)

- **30 días** después de cerrarse el pedido, `delivery_anonimizar_pedidos_viejos()` (migración
  0095, cron diario `delivery-retencion` a las 22:10 hora del centro) deja el nombre como
  "Cliente de app" y borra teléfono, PIN, dirección, datos del repartidor y `payload_raw`; también
  vacía `delivery_eventos.payload` de esa antigüedad. Importes, ítems y fechas se conservan para
  conciliación y reportes.
- Al desconectar la tienda o cancelar el servicio no cambia el plazo: lo que ya está anonimizado
  sigue así y lo reciente se anonimiza al cumplir 30 días.
- Si Uber pide borrar o devolver datos antes (contrato 6.2 / DPA 1.5): ejecutar la función con
  `p_dias = 0` para el tenant afectado desde el SQL editor y confirmar por escrito.
- Los tickets (`tickets.nombre_cliente`, notas de cocina) llevan solo el nombre corto y la alergia:
  son parte del registro de venta del restaurante y quedan bajo sus obligaciones fiscales.

## 3. Subencargados (DPA 1.4)

| Proveedor | Para qué | Dónde | Contrato de datos |
|---|---|---|---|
| Supabase (sobre AWS) | Base de datos, Edge Functions, Storage | Región del proyecto `pbiaxzvmssjsxdwqrumb` (ver dashboard → Settings) | DPA de Supabase (supabase.com/legal/dpa) |
| Vercel | Servir POS web, admin y sitio | Edge global; build en EE. UU. | DPA de Vercel (vercel.com/legal/dpa) |
| GitHub | Código e instaladores del escritorio (no datos de clientes) | EE. UU. | Términos de GitHub |

No hay otros. Cualquier proveedor nuevo que toque datos de pedidos se agrega aquí **antes** de
conectarlo, con su DPA.

## 4. Quién tiene acceso a producción (DPA 2.2)

| Persona | Acceso | Revisión |
|---|---|---|
| Fermín Villalobos (dueño) | Dashboard de Supabase (service_role, secrets), Vercel, GitHub, cuenta de desarrollador de Uber | Trimestral: quitar lo que no se use |
| Claude Code (asistente, sesión local de Fermín) | CLI de Supabase con el token de Fermín; nunca credenciales de Uber en claro | Cada sesión termina sin token persistente |

Los restaurantes solo ven su tenant (RLS). El POS y el admin nunca usan `service_role`.

## 5. Medidas técnicas (DPA 2.1–2.3)

- RLS en todas las tablas con `tenant_id` (probado por `supabase/tests/0002_rls_cobertura`).
- Webhooks firmados (HMAC‑SHA256, comparación en tiempo constante); secretos solo en Supabase.
- Dependencias vigiladas con `pnpm audit` / Dependabot; auditoría cyber‑neo de agosto 2026 con los
  hallazgos altos cerrados (`docs/bitacora/`).
- Equipos de VIM: Windows actualizado, antivirus activo, disco cifrado, gestor de contraseñas y
  segundo factor en Supabase, Vercel, GitHub y Uber.

## 6. Incidente de seguridad — qué hacer (DPA 2.4: avisar a Uber en 24 horas)

Cuenta como incidente: acceso no autorizado real **o sospechado** a datos de pedidos, fuga de un
secret (client secret, signing key, service_role), pérdida o alteración de datos, o un dispositivo
de VIM comprometido que tuviera acceso a producción.

1. **Contener (primera hora).** Rotar el secret afectado en Supabase (Edge Functions → Secrets) y,
   si es de Uber, regenerar el client secret y la signing key en developer.uber.com y volver a
   ponerlos. Si la fuga es del `service_role`, rotarlo en Supabase → Settings → API y actualizar
   quien lo use. Bloquear el acceso comprometido.
2. **Entender (mismas horas).** Qué datos, de qué restaurantes, en qué ventana. Fuentes:
   `delivery_eventos`, logs de Edge Functions en el dashboard, historial de Vercel y GitHub.
3. **Avisar a Uber dentro de las 24 horas** desde que se detecta, aunque no se sepa todo aún:
   formulario <http://t.uber.com/integration-support> (categoría *Outage/Incident*) con copia al
   contacto que Uber haya asignado. Plantilla:

   > Asunto: Security incident notification — VIM POS (client_id wx152HzVuqgaoXH6V4GXskfZrAUwKxMq)
   > Detectado el: <fecha y hora, zona horaria>. Qué pasó: <una o dos líneas>. Datos de Uber
   > afectados: <tipo de datos, número aproximado de pedidos y tiendas>. Estado: <contenido /
   > en investigación>. Medidas tomadas: <rotación de secrets, bloqueo, etc.>. Próxima
   > actualización: <fecha>. Contacto: Fermín Villalobos, integraciones@vimpos.com.mx, +52 476 127 3020.

4. **Avisar a los restaurantes afectados** por WhatsApp y correo el mismo día, en cristiano: qué
   pasó, qué datos, qué hicimos, qué tienen que hacer ellos (normalmente nada).
5. **Registrar** el incidente en `docs/bitacora/` (fecha, causa, alcance, medidas, aprendizajes) y
   cerrar con las correcciones aplicadas.

Una brecha de nuestros propios términos o aviso de privacidad que afecte a usuarios de Uber se
avisa igual (TOU III.A).

## 7. Solicitudes de titulares y de autoridades (DPA 1.6 y 1.7)

- Si un **comensal** (cliente final de la app) nos escribe para ejercer derechos sobre sus datos:
  **no se le responde de fondo**. Se le confirma recepción y se **reenvía a Uber el mismo día**
  por el formulario de soporte, con copia de lo recibido. Uber es el responsable; nosotros
  cooperamos con lo que pida (localizar, borrar, entregar).
- Si un **restaurante** pide borrar los datos de sus pedidos de apps: ejecutar la anonimización
  con `p_dias = 0` para su tenant y confirmarle por escrito.
- Si una **autoridad** pide datos de pedidos de apps: informar a Uber **antes** de responder,
  salvo que la orden lo prohíba, y responder solo lo que la orden exija.

## 8. Calendario de cumplimiento

| Cuándo | Qué |
|---|---|
| Cada trimestre | Revisar accesos (§4), subencargados (§3), que el cron `delivery-retencion` esté activo (`select jobname, active from cron.job`) y releer los TOU de Uber por si cambiaron |
| Cuando Uber lo pida (máx. 1 vez al año) | Certificado de cumplimiento firmado por Fermín con este documento como respaldo |
| Al conectar cada restaurante | Verificar que aceptó la autorización en el asistente (`delivery_conexiones.config.terminos_aceptados_*`) y que tiene contrato vigente con la app |
