"use client";
import { useModulos } from "../../../components/admin-shell";
import { TiendaCobro } from "../../../components/tienda-cobro";
import { TiendaPedidos } from "../../../components/tienda-pedidos";
import { seccionEnLinea } from "../../../lib/tienda-plan";
import { TiendaMarco } from "../marco";

/**
 * Pestaña Pedidos y pagos: cómo entran los pedidos y la cuenta de Mercado Pago que cobra en línea.
 * Con agenda y sin vender en línea se llama Pagos: sin cómo entran los pedidos, solo el pago en línea
 * (cobra los anticipos de las reservas) y su cuenta.
 */
export default function TiendaPedidosPage() {
  const { conPedidos } = seccionEnLinea(useModulos());
  return (
    <TiendaMarco>
      {({ t, ocupado, soloLectura }) => t.leido && (
        <>
          <TiendaPedidos
            valores={t.form}
            hayDireccion={t.leido.config !== null}
            hayCuentaActiva={t.hayCuentaActiva}
            guardando={t.ocupado === "pedidos"}
            ocupado={ocupado}
            soloLectura={soloLectura}
            mensaje={t.mensajeDe("pedidos")}
            onCambio={t.cambiar}
            onGuardar={t.guardarPedidos}
            soloEnLinea={!conPedidos}
          />
          <TiendaCobro
            cuentas={t.leido.cuentas}
            sucursales={t.leido.sucursales}
            pagos={t.leido.pagos}
            cajasSinActualizar={t.leido.config?.pagoEnLinea ? t.leido.cajasSinActualizar : []}
            dePrueba={t.leido.dePrueba === true}
            ocupado={ocupado}
            soloLectura={soloLectura}
            mensaje={t.mensajeDe("cobro")}
            onConectar={t.conectarMercadoPago}
            onDesconectar={t.pedirDesconectar}
            onElegir={t.elegirCuenta}
          />
        </>
      )}
    </TiendaMarco>
  );
}
