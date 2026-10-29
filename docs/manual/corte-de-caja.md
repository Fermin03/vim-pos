# Corte de caja

Cómo cerrar el día: contar el dinero, hacer el corte y cerrar el turno. Cada sección se entiende
sola.

## Cómo hacer el arqueo y el corte

**Quién:** cajero · **Dónde:** Caja → «Cerrar turno» · **Plan:** todos · **Giros:** todos
**Lo piden así:** corte, corte Z, cerrar caja, arqueo, contar el dinero, cierre del día, cuadrar caja

1. Cobra o cancela todas las cuentas abiertas y los pedidos en espera.
2. Toca **«Cerrar turno»**. En restaurantes está en la pantalla de inicio y en **«Menú»**. En comida
   rápida, tiendas y belleza, en **«Más»**.
3. La caja pregunta «¿Cerrar el turno actual?». Toca **«Sí, cerrar turno»**. Todavía no se cierra
   nada: solo entras al conteo.
4. Se abre **«Arqueo / Cierre de turno»**. Hay un renglón por cada forma de pago del turno.
5. En **«Efectivo»**, cuenta todo lo que hay en el cajón, **fondo incluido**, y escribe el total.
6. En tarjeta y las demás formas, escribe lo que dice el cierre de tu terminal o tus comprobantes.
7. Toca **«Generar corte»**.
8. Revisa el resultado en **«Corte generado»** ([Cómo leer el sobrante o faltante](#cómo-leer-el-sobrante-o-faltante)).
9. Toca **«Cerrar turno»**.

**Qué pasa después:** se imprime el corte (el reporte Z) y el turno queda cerrado. Para vender otra
vez hay que abrir un turno nuevo. El dueño puede ver el corte en el panel.
**Si algo falla:**
- No te deja generar el corte → hay cuentas abiertas ([Cómo cerrar el turno con cuentas abiertas](#cómo-cerrar-el-turno-con-cuentas-abiertas)).
- No imprime el corte → revisa la impresora. El corte ya quedó guardado y se puede consultar en el
  panel ([Cómo ver los cortes anteriores](#cómo-ver-los-cortes-anteriores)).
**Relacionado:** [Cómo funciona el corte ciego](#cómo-funciona-el-corte-ciego) ·
[Cómo abrir el turno](vender-en-la-caja.md#cómo-abrir-el-turno)

## Cómo funciona el corte ciego

**Quién:** cajero y dueño · **Dónde:** Caja → «Arqueo / Cierre de turno» · **Plan:** todos · **Giros:** todos
**Lo piden así:** corte ciego, no me dice cuánto debe haber, cuánto tengo que tener, no veo el esperado

En VIM POS el arqueo es ciego. Mientras cuentas, la caja **no te dice cuánto debería haber**.
Lo dice el aviso: «Cuenta el efectivo y escríbelo. Lo que debería haber aparece al generar el
corte.»

Así cuentas el dinero que de verdad hay, sin acomodar el número para que cuadre. Lo que debía haber
y la diferencia salen hasta que tocas **«Generar corte»**.

En el **«Resumen del turno»** sí ves cuántos tickets se pagaron y se cancelaron, y el **«Fondo de
apertura»**.

**Qué pasa después:** si hay diferencia, el dueño recibe un aviso de «Cierre con diferencia».
**Si algo falla:** si te equivocaste al contar, puedes volver a contar, pero un supervisor tiene que
escribir su PIN ([Cómo leer el sobrante o faltante](#cómo-leer-el-sobrante-o-faltante)).
**Relacionado:** [Cómo hacer el arqueo y el corte](#cómo-hacer-el-arqueo-y-el-corte)

## Cómo leer el sobrante o faltante

**Quién:** cajero, supervisor y dueño · **Dónde:** Caja → «Corte generado» · **Plan:** todos · **Giros:** todos
**Lo piden así:** sobrante, faltante, diferencia, no cuadra, me falta dinero, me sobra dinero

Después de **«Generar corte»** sale **«Corte generado»**. Cada forma de pago muestra tres cifras:

- **esp** (esperado): lo que debía haber según las ventas, el fondo y los retiros o depósitos.
- **dec** (declarado): lo que tú contaste.
- **La diferencia:** en verde si es $0.00, con **+** si sobra y con **−** si falta.

Abajo está la **«Diferencia total»**. En el corte impreso sale como «SOBRANTE(+) O FALTANTE(-):».

Las ventas a crédito y lo pagado con saldo a favor salen aparte con «(no se cuenta)», porque no
entró dinero.

**Si hay diferencia:**

1. Toca **«Volver a contar»**.
2. Un supervisor escribe su PIN.
3. Cuenta otra vez, escribe las cifras y toca **«Generar corte»**.

Si la diferencia es real, toca **«Cerrar turno»**: queda registrada con el nombre de quien cerró.

**Si algo falla:** revisa primero si hubo retiros o depósitos que no se registraron, propinas cobradas
con tarjeta que se le pagaron al personal con efectivo del cajón o cobros con tarjeta que se marcaron como efectivo.
**Relacionado:** [Qué hacer si el corte no cuadra](problemas-comunes.md#qué-hacer-si-el-corte-no-cuadra)

## Cómo cerrar el turno con cuentas abiertas

**Quién:** cajero · **Dónde:** Caja → «Arqueo / Cierre de turno» · **Plan:** todos · **Giros:** todos
**Lo piden así:** no me deja cerrar, cuentas abiertas, mesas abiertas, no puedo hacer el corte

La caja no cierra el turno mientras haya cuentas sin cobrar. Verás un aviso como «2 cuentas abiertas
sin cobrar. Cóbralas o cancélalas antes de cerrar el turno.», con la lista de esas cuentas.

1. Toca **«Ir a la cuenta»** en una de ellas.
2. Cóbrala, o cancélala si ya no va ([Cómo cancelar productos o una cuenta](vender-en-la-caja.md#cómo-cancelar-productos-o-una-cuenta)).
3. Repite con las demás, incluidos los pedidos en espera.
4. Regresa a **«Cerrar turno»** y haz el corte.

**Qué pasa después:** sin cuentas abiertas, ya puedes generar el corte.
**Si algo falla:** si una cuenta no aparece en ninguna lista pero el aviso sigue, escribe a soporte.
**Relacionado:** [Cómo hacer el arqueo y el corte](#cómo-hacer-el-arqueo-y-el-corte)

## Cómo ver los cortes anteriores

**Quién:** dueño o administrador · **Dónde:** Panel → Informes → Cómo va la operación → «Cortes de turno» · **Plan:** todos · **Giros:** todos
**Lo piden así:** cortes pasados, corte de ayer, historial de cortes, reporte Z, quién cerró la caja

Los cortes anteriores no se ven en la caja, sino en el panel.

1. Entra al panel.
2. Abre **Informes** y elige **Cómo va la operación**.
3. Toca **«Cortes de turno»**.

Ahí está cada cierre de caja: lo vendido, el efectivo que debía haber contra el que se contó, y quién
cerró.

Para ver cómo va el turno de hoy sin cerrarlo, usa el corte X en la caja
([Cómo ver las ventas del turno](vender-en-la-caja.md#cómo-ver-las-ventas-del-turno)).

**Si algo falla:** si un corte reciente no aparece, revisa que la caja tenga internet. Los cortes
llegan solos al panel cuando regresa el internet.
**Relacionado:** [Cómo leer los informes](informes.md#cómo-leer-los-informes)
