// Tipos comunes de la integración con apps de delivery (ADR 0011). Los montos viajan como texto
// decimal ("150.00") porque en la BD son numeric(12,2): nunca float.
export type AppDelivery = "APP_UBEREATS" | "APP_DIDI" | "APP_RAPPI";
export type TipoEntrega = "APP_REPARTE" | "RESTAURANTE_REPARTE" | "RECOGE_CLIENTE";

export type ModificadorNormalizado = {
  opcion_modificador_id: string | null;   // null = no existe en el catálogo de VIM
  nombre_app: string;
  cantidad: number;
  precio_extra_mxn: string;
};

export type ItemNormalizado = {
  producto_id: string | null;             // null = no existe en el catálogo de VIM
  nombre_app: string;
  cantidad: number;
  precio_unitario_mxn: string;
  nota: string | null;
  /** Alérgenos que el cliente marcó en la app, ya en español ("cacahuate", "lácteos"…). Obligación A7 del contrato. */
  alergenos: string[];
  /** Texto libre del cliente sobre su alergia. */
  alergia_nota: string | null;
  modificadores: ModificadorNormalizado[];
};

export type PedidoNormalizado = {
  app: AppDelivery;
  id_externo: string;
  folio_corto: string | null;
  estado_app: string | null;
  tipo_entrega: TipoEntrega | null;
  programado_para: string | null;
  cliente_nombre: string | null;
  cliente_telefono: string | null;
  cliente_telefono_pin: string | null;
  direccion_texto: string | null;
  nota_cliente: string | null;
  items: ItemNormalizado[];
  items_sin_mapear: { nombre_app: string; id_app: string }[];
  subtotal_mxn: string | null;
  descuento_app_mxn: string | null;
  descuento_tienda_mxn: string | null;
  envio_mxn: string | null;
  propina_mxn: string | null;
  total_cliente_mxn: string | null;
  total_restaurante_mxn: string | null;
  efectivo_a_cobrar_mxn: string;
};
