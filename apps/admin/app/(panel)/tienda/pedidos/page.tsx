"use client";
import { TiendaCobro } from "../../../components/tienda-cobro";
import { TiendaPedidos } from "../../../components/tienda-pedidos";
import { TiendaMarco } from "../marco";

/** Pestaña Pedidos y pagos: cómo entran los pedidos y la cuenta de Mercado Pago que cobra en línea. */
export default function TiendaPedidosPage() {
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
