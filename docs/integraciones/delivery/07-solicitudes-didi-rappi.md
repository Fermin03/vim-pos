# Trámites con DiDi Food y Rappi — pasos y textos listos

Uber ya está: cuenta, contrato, sandbox y producción (ver `uber-eats/contrato/README.md`). DiDi y
Rappi no tienen autoservicio: hay que pedir acceso y esperar semanas. Conviene arrancar los dos en
paralelo. Todo lo de aquí lo manda **Fermín** con su correo de VIM; los textos van listos para
copiar. Datos que se repiten: VIM POS, Fermín Villalobos Martínez (persona física con actividad
empresarial, RFC VIMF0308282D7), León / San Francisco del Rincón, Guanajuato, correo
`integraciones@vimpos.com.mx`, sitio `https://vimpos.com.mx`, piloto Knock-Out Burger (León).

Regla de oro en los dos: **nunca prometer que VIM POS sustituye la tablet de la app ni llamarnos
"socios"**. Somos un POS integrador que recibe los pedidos en la caja.

---

## A. DiDi Food

Proceso (`02-didi-food-resumen.md §1`): contacto → NDA (DocuSign, firma el representante legal) →
registro en el portal → *Qualification* (perfil de empresa con RFC; pueden pedir *Technology
Integration Agreement* con RFC, identificación oficial y, si hubiera sociedad, acta y poder) →
correo a `globalsupportapi@didiglobal.com` → app de prueba `MX_T_VIMPOS`, tienda y consumidor de
prueba, kickoff y grupo de WhatsApp.

### A1. Registro y Qualification (portal)

1. Entrar a <https://developer.didi-food.com/en-US/openapi> → *Sign up* con `integraciones@vimpos.com.mx`.
2. *Qualifications Management* → completar el perfil de empresa. Campos previsibles y qué poner:

| Campo | Valor |
|---|---|
| Company name | VIM POS (Fermín Villalobos Martínez) |
| Country / City | Mexico · León, Guanajuato |
| Company type | POS / ERP integrator (SaaS) |
| Tax ID | RFC VIMF0308282D7 (persona física con actividad empresarial; no hay DUNS) |
| Website | https://vimpos.com.mx |
| Contact | Fermín Villalobos Martínez · integraciones@vimpos.com.mx · +52 476 127 3020 |
| Business description | ver texto A2 |
| Number of merchants / stores | 1 restaurante piloto activo (Knock-Out Burger, León); onboarding de más clientes en curso |
| Integration scope | Order webhooks, order accept/reject/complete, store status, menu sync, payment reconciliation report |

Tener a la mano en PDF: constancia de situación fiscal, identificación oficial, comprobante de
domicilio. Si piden acta constitutiva o poder notarial: explicar que es persona física (no aplica).

### A2. Business description (para el formulario, en inglés)

```text
VIM POS is a point-of-sale system for restaurants in Mexico (quick service, cafés, full-service and dark kitchens). The POS runs on the restaurant's register computer with a cloud backend (Supabase) and a web dashboard. We are building a delivery-platform integration so that DiDi Food orders are injected directly into the register and the kitchen display, with acceptance, rejection, ready-for-pickup and store pause handled from the POS, plus menu synchronization and payment reconciliation. Our Uber Eats integration is already built and in sandbox validation. Pilot merchant: Knock-Out Burger (León, Guanajuato). Contact: Fermín Villalobos Martínez, integraciones@vimpos.com.mx.
```

### A3. Correo a `globalsupportapi@didiglobal.com` (enviar justo después del perfil)

```text
Subject: POS integration request — VIM POS (Mexico) — Qualification submitted

Hello DiDi Food Open Platform team,

I am Fermín Villalobos, founder of VIM POS, a point-of-sale system for restaurants in Mexico (https://vimpos.com.mx). We have just submitted our company profile (Qualification) on the Developer Portal under integraciones@vimpos.com.mx.

We are requesting access to the DiDi Food OpenAPI as a POS integrator for Mexico. Scope of the integration:
- Order injection via webhooks (orderNew / orderCancel / orderFinish) into the restaurant's register and kitchen display, with explicit accept / reject / ready-for-pickup from the POS.
- Store status (open / pause) and preparation time from the POS.
- Menu synchronization from our catalog (our product IDs as SKUs).
- Payment reconciliation report ingestion.
We already have an Uber Eats Marketplace integration built and in sandbox validation, so the order flow, webhook handling and reconciliation are in place; DiDi Food is our second platform.

What we need from you:
1. NDA / Technology Integration Agreement for signature (I am the legal representative; VIM POS is a sole proprietorship, RFC VIMF0308282D7).
2. Approval of the Qualification so we can create the test app (planned name: MX_T_VIMPOS), a test store and a test consumer account.
3. A kickoff with an integration specialist and, if available, the WhatsApp support group for integrators in Mexico.

Pilot merchant: Knock-Out Burger, León, Guanajuato (already on DiDi Food). Our webhook endpoints are hosted on Supabase Edge Functions (HTTPS, static URLs); we will provide them at kickoff.

Thank you,
Fermín Villalobos Martínez
VIM POS · integraciones@vimpos.com.mx · +52 476 127 3020 · https://vimpos.com.mx
```

### A4. Cuando aprueben

- Crear app `MX_T_VIMPOS`, tienda de prueba, pedir consumidor de prueba (formulario del portal;
  empieza con "000", vigencia 2 meses).
- Pedir en el kickoff: lista de IPs de webhooks (si la hay), confirmación de montos en centavos e
  IDs de 64 bits (json-bigint), ventana de aceptación de 5 min, y si la tienda de prueba acepta
  pago en efectivo para poder cancelar pedidos de prueba.
- Anotar todo en `02-didi-food-resumen.md` y abrir el spec F2.

---

## B. Rappi

No hay formulario público (`01-rappi-resumen.md §1`): el acceso lo abre un **TAM** (Technical
Account Manager) del equipo de integraciones, que crea la `Integration` y el `clientId`. Dos
puertas, usar las dos a la vez:

1. **El ejecutivo de cuenta de Knock-Out Burger en Rappi.** Es la vía más rápida: el restaurante
   pide que su POS se integre y Rappi lo canaliza. Fermín le pide al dueño de Knock-Out que mande
   el texto B1 a su ejecutivo (o que lo presente por WhatsApp).
2. **Portal de Aliados / dev-portal.** En <https://dev-portal.rappi.com/es/> y en el Portal de
   Aliados (soporte → integraciones) mandar el texto B2 pidiendo contacto con el equipo de
   integraciones de México.

### B1. Mensaje del restaurante a su ejecutivo de Rappi (lo manda Knock-Out)

```text
Hola <nombre>, buen día. Somos Knock-Out Burger (León, Gto.). Estamos cambiando a un sistema de punto de venta que se integra con Rappi para que los pedidos entren directo a la caja y a la cocina, en vez de capturarlos a mano desde la tablet. El proveedor es VIM POS (vimpos.com.mx), aquí de León, y ya tiene la integración con Uber Eats.

¿Nos puedes poner en contacto con el equipo de integraciones / el TAM que atiende integradores de POS en México? El contacto técnico de VIM POS es Fermín Villalobos, integraciones@vimpos.com.mx, +52 476 127 3020. Lo que necesitan de Rappi es que les creen la integración y las credenciales del ambiente de pruebas.

Gracias.
```

### B2. Solicitud de VIM al equipo de integraciones de Rappi (Portal de Aliados / dev-portal / correo del TAM)

```text
Asunto: Solicitud de integración POS — VIM POS (México)

Hola equipo de integraciones de Rappi,

Soy Fermín Villalobos, fundador de VIM POS, un sistema de punto de venta para restaurantes en México (https://vimpos.com.mx). Queremos integrarnos a Rappi como POS integrador para que los pedidos de la app entren directo a la caja y a la pantalla de cocina de nuestros clientes, con aceptación y rechazo explícitos desde el POS, PING de tienda contestado con el estado real de la caja, sincronización de menú (nuestros IDs como SKU) y conciliación con la API financiera.

Ya tenemos construida y en validación la integración con Uber Eats (Order, Store e Integration Configuration APIs), así que el flujo de pedidos, webhooks y conciliación está resuelto; Rappi sería nuestra siguiente plataforma. Nuestro restaurante piloto es Knock-Out Burger, en León, Guanajuato, que ya opera en Rappi.

Lo que necesitamos de ustedes:
1. Que nos asignen un TAM / contacto de integraciones para México.
2. Creación de la Integration y del clientId, con credenciales del ambiente de pruebas (client_id y client_secret).
3. Registro de nuestra redirect_uri para el self-onboarding de tiendas: https://admin.vimpos.com.mx/configuracion/integraciones/rappi/callback
4. Lista de IPs desde las que llegan los webhooks (si la manejan) y confirmación de si los montos en México vienen en pesos o en centavos.
5. Acceso a una tienda de prueba para validar el flujo completo antes de vincular la del piloto.

Datos: VIM POS · Fermín Villalobos Martínez (persona física con actividad empresarial, RFC VIMF0308282D7) · León / San Francisco del Rincón, Guanajuato · integraciones@vimpos.com.mx · +52 476 127 3020.

Quedo atento. Gracias.
Fermín Villalobos
```

### B3. Cuando contesten

- Guardar las credenciales de pruebas en el gestor de contraseñas (nunca en el repo) y como
  secrets de Supabase (`RAPPI_CLIENT_ID`, `RAPPI_CLIENT_SECRET`, entorno).
- Confirmar los estándares que exigen: ≥ 98 % de éxito en llamadas, token una vez por semana,
  45 s entre polls si se hace polling, rechazar solo cuando de verdad no se puede preparar.
- Abrir el spec F3.

---

## C. Qué anotar cuando haya respuesta

En `06-preguntas-abiertas-y-siguientes-pasos.md`, sección de cada app: fecha del contacto, quién
respondió, qué pidieron, y los IDs que asignen (app DiDi, Integration/clientId de Rappi). Los
correos de ida y vuelta se guardan en `docs/integraciones/delivery/<app>/correspondencia/`.
