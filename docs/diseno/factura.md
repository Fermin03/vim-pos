# Diseño — Portal de autofactura (`apps/factura`)

> Hereda todo de [`nucleo.md`](nucleo.md), con una excepción de marca importante (abajo).

## Quién y dónde

El **cliente final** del restaurante. Acaba de comer, tiene el ticket en la mano, está en la
banqueta o en el coche, con el teléfono. No tiene cuenta, no la va a crear, y no va a volver.
Puede que sea la única vez en su vida que abre esta pantalla.

Es la única app de VIM POS que ve alguien que no trabaja en el restaurante.

## La marca que se ve es la del restaurante, no la nuestra

El cliente está facturando su comida en *Knock-Out Burger*, no en VIM POS. El logotipo y el
nombre del negocio mandan; nosotros vamos discretos al pie. Poner nuestra marca arriba confunde
sobre quién emite la factura, que es justo el dato que no puede quedar ambiguo.

## Mobile-first de verdad

No "responsive porque encoge": diseñado para una mano, en la calle, con datos móviles y con sol
en la pantalla. Una columna, campos grandes, y el botón de continuar siempre alcanzable con el
pulgar.

## Cero jerga fiscal sin traducir

"Uso del CFDI", "régimen fiscal", "constancia de situación fiscal" son palabras del SAT, no del
comensal. Cada campo lleva una línea que diga qué es y, cuando existe, de dónde sacarlo. Un
select con doce claves sin explicación es una salida en falso.

## Los errores son la pantalla más importante

Un RFC que no cuadra, un ticket ya facturado, un plazo vencido. Cada uno dice **qué pasó, por qué
y qué puede hacer** — incluido "habla al restaurante" cuando no hay salida desde aquí. Un error
genérico aquí significa una llamada al restaurante y un cliente enojado.

## Confianza

Se pide un RFC: es un dato fiscal. La pantalla tiene que verse seria — sin animaciones de
marketing, sin promesas, con el nombre del negocio a la vista y el estado del proceso claro en
todo momento.

## Lo que NO se hereda

- Los objetivos táctiles de caja no aplican tal cual: es un teléfono personal, no una pantalla
  compartida. 44px sigue siendo el mínimo, pero la densidad es la de una web móvil normal.
- Nada del tema oscuro del KDS.
