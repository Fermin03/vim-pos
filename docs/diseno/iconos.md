# Iconos

El juego de iconos propio de VIM POS: cuáles son, dónde se usa cada uno y cómo se dibujan.
Aplica a las seis apps (POS, Admin, KDS, Tienda, Factura, Platform).

**Estado (13/10/2026): los 70 aprobados por Fermín y en el código.** Viven en
[`packages/ui/src/components/icono.tsx`](../../packages/ui/src/components/icono.tsx); ese archivo
es la fuente de los dibujos y este documento, la de las reglas y de dónde va cada uno.

## En el código

```tsx
import { Icono, IconoCategoria } from "@vim/ui/styles";

<Icono nombre="palomita" className="h-5 w-5" />
<IconoCategoria icono={categoria.icono} className="h-4 w-4" />
```

- El tamaño y el color los pone quien lo usa; el icono hereda `currentColor`.
- **Por debajo de 16 px** se pasa `strokeWidth={2.5}`: a 12–14 px el trazo de 1.75 se pierde.
- Un icono nuevo se dibuja con las reglas de abajo, se agrega a `icono.tsx` y se anota aquí. No se
  vuelve a escribir un `<svg>` suelto en un componente.
- Quedan fuera a propósito: el logo (`<LogoVim />`) y los logos de Google y Microsoft del acceso.

## Reglas de dibujo

- **Lienzo:** 24×24, con el dibujo dentro de un área de 20×20 (2 de margen por lado).
- **Estilo:** solo trazo, sin relleno, puntas y uniones redondeadas ("A · Redondo" de la piloto).
  Única excepción: Tema (70) lleva la mitad rellena; con rayas parecía otro símbolo.
- **Grosor:** 1.75 en todos. A 2 el recibo y la hamburguesa se empastan a 16 px.
- **Color:** `currentColor`; el icono nunca trae color propio.

## Piezas que se reutilizan

- **Giro:** la flecha recta (10) y el chevron (11) se dibujan una vez y se giran: `flecha-arriba`,
  `flecha-derecha`, `flecha-abajo`, `tendencia-alza`, `tendencia-baja`, `chevron-abajo` y
  `chevron-izquierda`. "Subir archivo"
  (`subir`) usa las piezas de Descargar (12) con la flecha hacia arriba; la bandeja se queda abajo, así que
  no es un giro del mismo dibujo.
- **Tachado:** la misma diagonal encima de la base da los iconos 20, 21, 31 y 69.
- **Insignia:** la persona (24) recorrida a la izquierda, con + o palomita en la esquina, da 26 y 27.
- **Categorías (62–67):** el nombre (`star`, `burger`, `fries`, `cup`, `cake`, `tag`) se guarda en
  la base de datos por categoría. Los nombres no cambian aunque cambie el dibujo, y cada uno debe
  caber en un solo `path` sin relleno.

## Lista (70)

### Acciones básicas

| # | Icono | Nombre | Dónde se usa |
|---|---|---|---|
| 1 | Más | `mas` | agregar, nueva cuenta, cantidad en tienda |
| 2 | Menos | `menos` | cantidad en tienda, quitar propina |
| 3 | Cerrar | `cerrar` | modales, avisos, menús |
| 4 | Palomita | `palomita` | éxito, pasos cumplidos, selección, reactivar usuario |
| 5 | Editar | `editar` | tablas del admin, nota de la orden, costo de envío |
| 6 | Eliminar | `eliminar` | tablas del admin, quitar pago, quitar del carrito |
| 7 | Buscar | `buscar` | admin |
| 8 | Menú | `menu` | abrir menú en POS, Admin y Platform |
| 9 | Retroceso | `retroceso` | teclado de PIN y de cobro |

### Flechas

| # | Icono | Nombre | Dónde se usa |
|---|---|---|---|
| 10 | Flecha recta | `flecha-izquierda` | volver, "ver más", subir/bajar orden, retiro, depósito, tendencia (a 45°) |
| 11 | Chevron | `chevron-derecha` | atrás, desplegar, página anterior y siguiente |
| 12 | Descargar | `descargar` | instalador, exportar reporte; volteado: subir archivo |
| 13 | Dos flechas opuestas | `transferencia` | transferencia, conciliación apps |
| 14 | Flecha de regreso | `devolver` | devoluciones |
| 15 | Flecha circular | `actualizar` | actualizar, reintentar, reabrir cuenta |
| 16 | Flecha circular con descarga | `buscar-actualizacion` | buscar actualizaciones |
| 17 | Flechas en S | `actualizar-menu` | actualizar menú |

### Estados

| # | Icono | Nombre | Dónde se usa |
|---|---|---|---|
| 18 | Alerta | `alerta` | advertencias, pedido con alergia |
| 19 | Información | `info` | avisos |
| 20 | Círculo tachado | `prohibido` | desactivar usuario |
| 21 | Wifi tachado | `sin-conexion` | sin conexión |
| 22 | Arco de carga | `cargando` | cargando |
| 23 | Reloj | `reloj` | hora, pedidos en espera, sesión expirada |

### Personas

| # | Icono | Nombre | Dónde se usa |
|---|---|---|---|
| 24 | Persona | `persona` | clientes, usuarios, cambiar rol |
| 25 | Dos personas | `personas` | cambiar cajero, pantalla de bloqueo |
| 26 | Persona con + | `persona-mas` | asignar cliente |
| 27 | Persona con palomita | `persona-ok` | cliente asignado |

### Seguridad y sesión

| # | Icono | Nombre | Dónde se usa |
|---|---|---|---|
| 28 | Candado | `candado` | abrir turno, bloquear, sin acceso, autorizar con PIN, resetear PIN |
| 29 | Llave | `llave` | cambiar mi PIN |
| 30 | Ojo | `ojo` | ver contraseña |
| 31 | Ojo tachado | `ojo-tachado` | ocultar contraseña |
| 32 | Salir | `salir` | salir de la caja, cerrar sesión |

### Dinero y caja

| # | Icono | Nombre | Dónde se usa |
|---|---|---|---|
| 33 | Billete | `billete` | efectivo, retiro / depósito |
| 34 | Tarjeta | `tarjeta` | débito, crédito, cambiar forma de pago |
| 35 | Pago dividido | `pago-dividido` | pago dividido |
| 36 | Signo de pesos | `pesos` | ventas |
| 37 | Moneda | `moneda` | propinas |
| 38 | Recibo | `recibo` | tickets, corte X, ticket vacío, consultar cuentas, facturación |
| 39 | Cajón de dinero | `cajon` | abrir cajón, caja del día |
| 40 | Casilla palomeada | `casilla` | cerrar turno |

### Servicio y operación

| # | Icono | Nombre | Dónde se usa |
|---|---|---|---|
| 41 | Mesa | `mesa` | comedor |
| 42 | Vaso con tapa | `para-llevar` | para llevar (debe distinguirse del 65) |
| 43 | Bolsa | `bolsa` | pick-up, tienda en línea |
| 44 | Moto de reparto | `moto` | domicilio |
| 45 | Celular | `celular` | pedidos en línea |
| 46 | Pin de mapa | `pin` | dirección en el ticket |
| 47 | Avión de papel | `enviar` | enviar a cocina |
| 48 | Megáfono | `megafono` | cocina, cocina sin comandas |
| 49 | Calendario | `calendario` | reservaciones, rango de fechas |
| 50 | Cuadrícula de mesas | `plano` | plano de mesas |
| 51 | Impresora | `impresora` | configurar impresoras, reimprimir |

### Secciones del admin y varios

| # | Icono | Nombre | Dónde se usa |
|---|---|---|---|
| 52 | Cuatro cuadros | `panel` | panel |
| 53 | Catálogo (nuevo) | `catalogo` | catálogo |
| 54 | Caja de cartón | `caja` | inventario |
| 55 | Engrane | `engrane` | configuración, ajustes de cocina |
| 56 | Gráfica de línea | `grafica` | reportes, monitor de ventas, ticket promedio |
| 57 | Edificio | `edificio` | negocio |
| 58 | Casa | `casa` | sucursal |
| 59 | Globo de chat | `chat` | soporte, ayuda por WhatsApp |
| 60 | Sobre | `sobre` | recuperar contraseña |
| 61 | Llave inglesa | `llave-inglesa` | mantenimiento |

### Categorías del menú

| # | Icono | Nombre | Nombre guardado | También se usa en |
|---|---|---|---|---|
| 62 | Estrella | `estrella` | `star` | lealtad, combos |
| 63 | Hamburguesa | `hamburguesa` | `burger` | |
| 64 | Papas | `papas` | `fries` | |
| 65 | Vaso | `vaso` | `cup` | |
| 66 | Pastel | `pastel` | `cake` | |
| 67 | Etiqueta | `etiqueta` | `tag` | promociones |

### Cocina

| # | Icono | Nombre | Dónde se usa |
|---|---|---|---|
| 68 | Bocina encendida | `bocina` | sonido de la cocina |
| 69 | Bocina apagada | `bocina-apagada` | sonido apagado |
| 70 | Tema claro/oscuro | `tema` | cambiar tema |

## Decisiones tomadas

- Débito y crédito comparten la tarjeta (34); el texto los distingue.
- Recibo y "documento con renglones" son uno (38). Cajón y caja registradora son uno (39).
- Las tres de actualización (15, 16, 17) se quedan separadas.
- Edificio (57) y casa (58) se quedan separados.
- Signo de pesos (36) y moneda (37) se quedan separados: Ventas y Propinas salen juntas en el panel.
- Los caracteres `✎ × ✓ ✗ ⚠` de la interfaz pasan a usar el icono real. **Pendiente:** hoy siguen
  como texto; el reemplazo va en un cambio aparte. `↳` y `✶` se quedan como
  texto porque van al papel de la impresora.
- Los logos de Google y Microsoft del acceso son marcas ajenas y no entran aquí.
