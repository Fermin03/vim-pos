# Integraciones con terceros

Una carpeta por proveedor externo. El proceso es el mismo en todas: primero se captura su
documentación completa (con fecha y URL de origen en cada archivo), luego se escriben los resúmenes
que hacen falta para trabajar sin volver al portal, y solo después se construye.

| Carpeta | Proveedor | Estado |
|---|---|---|
| [`delivery/`](delivery/) | Uber Eats (integrado, esperando tiendas de prueba), DiDi Food (solicitud enviada), Rappi (esperando un cliente) | En producción desde el 2 sep 2026 |
| [`facturama/`](facturama/) | Facturama, PAC de CFDI 4.0 (API Multiemisor) | Código completo y probado en sandbox; activación espera el contrato |
| [`mercado-pago-point/`](mercado-pago-point/) | Mercado Pago Point, terminal de tarjetas integrada a la caja (Orders API) | Documentación capturada y diseño propuesto el 8 oct 2026; sin código, sin cuenta de desarrollador |
| [`clip-pinpad/`](clip-pinpad/) | Clip PinPad, segunda terminal de tarjetas integrada (API de PinPad) | Documentación capturada y diseño propuesto el 8 oct 2026; sin código, sin credenciales ni lector. Segundo en construirse, después de Mercado Pago |

Los contratos firmados y sus obligaciones viven dentro de cada carpeta (`delivery/uber-eats/contrato/`).
Lo verificado a golpe de API contra el sandbox de cada proveedor vive en las skills
(`.claude/skills/`), no aquí: aquí está lo que el proveedor documenta y el mapa a nuestro código.
