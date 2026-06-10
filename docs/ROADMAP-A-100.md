# Roadmap a "100% vendible" — VIM POS

Meta: dejar el SaaS listo para vender a cualquier vertical, con el panel interno de VIM para
operar el negocio (tenants, folios, cobros, soporte). El piloto **Quick Service ya está listo**;
esto cubre lo que falta para comercializar.

Estado: ⬜ pendiente · 🟡 en curso · ✅ hecho

## A. Panel interno de VIM (`apps/platform`) — doc 12 §6
El plano de control de VIM. Corre con `service_role` fuera de RLS, gated por `PLATFORM_PROVISION_KEY`.

- ✅ **A1 — Shell + Empresas:** nav del panel + lista/buscar tenants + detalle (drawer) + suspender/reactivar/cancelar + notas internas + cambiar plan. Auditado en `super_admin_accesos`.
- ✅ **A2 — Métricas globales:** tenants por estado/vertical, MRR, folios vendidos 30d. (Falta: churn histórico.)
- ✅ **A3 — Folios CFDI:** regalar/ajustar folios (`AJUSTE_MANUAL`) desde el drawer del tenant, auditado.
- ⏸️ **A4 — Feature flags:** DIFERIDO — ningún consumidor en el runtime lee `tenant_feature_flags` aún; el toggle sería un control sin efecto. Construir cuando el app consuma flags.
- ✅ **A5 — Onboarding:** ver fase + marcar ABANDONADO/GO_LIVE/reactivar (upsert, auditado). (Falta: reenviar invitación por email.)
- ✅ **A6 — Suscripciones:** activar cobro (TRIAL→ACTIVO + suscripción ACTIVA, alimenta MRR) · pausar · reanudar · cancelar. (Stripe = Fase 3.)
- ✅ **A7 — Soporte / Impersonación auditada:** botón "Impersonar" en el drawer → genera un magic-link al admin del dueño (auth.admin.generateLink), auditado en super_admin_accesos. (Necesita tenant provisionado con dueño + redirectTo permitido en Supabase.)
- ⏸️ **A8 — Login real de super-admin:** DIFERIDO (post-verticales, roadmap) — la clave compartida sirve para 1 operador VIM; sustituir por cuentas individuales cuando crezca el equipo.

## B. Verticales — completar la pieza insignia de cada una
- ⬜ **B1 — Full Service · App de mesero** (P-120..127): toma de orden handheld, enviar a cocina, asignar mesa/mesero. (El núcleo de mesas ya existe.)
- ⬜ **B2 — Dark Kitchen · Conciliación de apps** (P-204..211): cuadrar depósitos de Rappi/Uber/DiDi vs ventas; matching de pedidos. (Marcas + delivery ya existen.)
- ⬜ **B3 — Foodtruck · Eventos** (modo EVENTO_PRIVADO): gestión de evento por turno/ubicación.
- ⬜ **B4 — Café/Bar · Cuentas prolongadas + alertas** (tabs largos con avisos de tiempo). (Happy hour ya existe vía promociones.)
- ⬜ **B5 — Enterprise · Multi-sucursal consolidado:** dashboards corporativos, reportes consolidados.

## C. Cierre de huecos de UI del piloto (de la revisión pre-deploy)
- ✅ **C1 — Recuperar/activar credenciales:** invitación por correo (SMTP Hostinger) + página /establecer-acceso + cambiar contraseña en Configuración→Seguridad. Validado E2E en prod.
- ⬜ **C2 — Cambio de PIN del cajero** (P-007).
- ✅ **C3 — Config de impresión + Epson activable:** `obtenerImpresora()` ya no está hardcodeada a Preview — lee config por-dispositivo (localStorage); modal en el POS para elegir Preview o Epson de red (IP + ancho) con prueba de conexión. Falta validar con hardware real.
- ✅ **C4 — Recibo de devolución (P-228):** comprobante de reembolso tras devolver (ReciboDevolucion + construirDevolucionJob para Epson); overlay con Imprimir/Cerrar. Golden test.
- ⬜ **C5 — Pantallas de error/mantenimiento** (P-216..219) + conflictos de sync (P-215).

## D. Infra de go-live (manual / externo — fuera de código)
Supabase cloud Pro + deploy + secretos + DNS/TLS + PAC/CSD (si factura) + Epson + tablets +
Sentry + backups. Ver `docs/RUNBOOK-GOLIVE.md` y la revisión pre-deploy.

---
**Orden sugerido:** A (panel, lo que pediste primero) → C3 (Epson, riesgo #1) → B1/B2 (verticales de mayor
valor comercial) → resto de A → B3/B4/B5 → C → Enterprise.
