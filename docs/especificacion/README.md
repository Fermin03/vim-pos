# Estado de esta especificación

**Sigue siendo válida en la mayor parte.** El modelo de datos, los flujos por vertical, la matriz
de permisos, CFDI, impresión y realtime describen el producto que existe.

Lo que envejeció está registrado, uno por uno, en [`../decisiones/`](../decisiones/). **Manda el ADR.**

## Lo superado hasta hoy (30/08/2026)

| Aquí dice | Realidad | Dónde |
|---|---|---|
| Precios por vertical (QS 999, FS 1,299) | Tres paquetes por tamaño: Esencial · Negocio · Cadena | `decisiones/0002` |
| Acento naranja `#E8502E` | Azul `#0078C9` desde el 23/08/2026 | `decisiones/0003` |
| Offline con cola Dexie en el navegador | Postgres en el escritorio + sync por snapshot | `decisiones/0004` |
| Comedor entra por el mapa de mesas | Entra por lista de cuentas; el mapa es consulta | `decisiones/0005` |
| — | Movimientos de caja: dos, no cuatro | `decisiones/0007` |

## Los mockups ya no están aquí

Las 231 pantallas se archivaron el 30/08/2026 en `respaldos/mockups-2026-08-hasta-aqui-mandaron/`.
Dejaron de ser fuente de verdad: el producto se movió y ellas no. Ver `decisiones/0001`.

El diseño lo manda ahora [`../diseno/`](../diseno/) — el núcleo de marca y un documento por app.

## En git desde el 31 de agosto de 2026

Vivió fuera del repositorio desde el principio: 33 mil líneas sin historial ni forma de saber qué
cambió cuándo. Ahora cada cambio queda registrado como cualquier otro. Las carpetas se
normalizaron a kebab-case (`arquitectura/`, `flujos/`, `guia-de-desarrollo/`); los nombres de
archivo se conservan porque los documentos se citan entre sí por nombre.
