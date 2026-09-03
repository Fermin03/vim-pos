# Integraciones con terceros

Una carpeta por proveedor externo. El proceso es el mismo en todas: primero se captura su
documentación completa (con fecha y URL de origen en cada archivo), luego se escriben los resúmenes
que hacen falta para trabajar sin volver al portal, y solo después se construye.

| Carpeta | Proveedor | Estado |
|---|---|---|
| [`delivery/`](delivery/) | Uber Eats (integrado, esperando tiendas de prueba), DiDi Food (solicitud enviada), Rappi (esperando un cliente) | En producción desde el 2 sep 2026 |
| [`facturama/`](facturama/) | Facturama, PAC de CFDI 4.0 (API Multiemisor) | Código completo y probado en sandbox; activación espera el contrato |

Los contratos firmados y sus obligaciones viven dentro de cada carpeta (`delivery/uber-eats/contrato/`).
Lo verificado a golpe de API contra el sandbox de cada proveedor vive en las skills
(`.claude/skills/`), no aquí: aquí está lo que el proveedor documenta y el mapa a nuestro código.
