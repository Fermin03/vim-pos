// Modelo lógico de impresión (doc 16 §2), subconjunto TICKET. Independiente del transporte.

export type Bloque =
  /** Imagen ya rasterizada a 1 bit (logo). Se pre-calcula con `rasterizarImagen` porque decodificar
   *  una imagen es asíncrono y `jobAEscpos` es una función pura y síncrona. `datos` va empaquetado
   *  como pide ESC/POS: un bit por punto, MSB primero, filas de `ancho/8` bytes, 1 = negro. */
  | { t: "raster"; ancho: number; alto: number; datos: Uint8Array; align?: "izq" | "centro" | "der" }
  | { t: "texto"; valor: string; align?: "izq" | "centro" | "der"; size?: 1 | 2 | 3; bold?: boolean; invertido?: boolean }
  | { t: "fila"; izq: string; der: string; bold?: boolean }
  | { t: "separador"; estilo: "solido" | "punteado" }
  | { t: "qr"; valor: string }
  | { t: "corte" };

export type PrintJob = {
  tipo: "TICKET";
  ancho: 58 | 80;
  /** A qué estación va: CAJA (ticket, corte, devolución) o COCINA (comanda). */
  destino: "CAJA" | "COCINA";
  abrir_cajon?: boolean;
  bloques: Bloque[];
};

export type PrintResult = { ok: true } | { ok: false; motivo: "SIN_PAPEL" | "OFFLINE" | "ERROR" };

// ── Datos planos para construir el ticket (sin dependencia de Supabase) ──
export type LineaImpresion = {
  /** id del ticket_item; permite imprimir solo ciertos renglones (comanda de agregado). */
  id: string;
  cantidad: number;
  nombre: string;
  totalMxn: number;
  modificadores: string[];
  notaCocina: string | null;
};

export type PagoImpresion = {
  metodo: string; // etiqueta legible: 'Efectivo', 'Tarjeta de débito', …
  montoMxn: number;
  recibidoMxn: number | null; // solo efectivo
  cambioMxn: number;
};

/** Lo que el repartidor necesita para llegar y para que le abran la puerta. */
export type DatosEntrega = {
  cliente: string | null;
  telefono: string | null;
  direccion: string | null;
  referencias: string | null;
  notasRepartidor: string | null;
};

export type DatosTicketImpresion = {
  negocio: { nombre: string; razonSocial: string | null; rfc: string | null; logoUrl: string | null };
  sucursal: { nombre: string; direccion: string | null; telefono: string | null };
  meta: {
    folio: string; fechaIso: string; cajero: string; caja: string;
    /** Etiqueta para el papel ("Comedor", "Pick-up"). */
    modoServicio: string;
    /** El enum crudo (`COMER_AQUI`, `MESA`, `PARA_LLEVAR`, …). Va aparte de la etiqueta porque
     *  quien decide QUÉ imprimir necesita comparar contra un valor estable, no contra un texto
     *  que existe para leerse y que cambiaría con cualquier retoque de redacción. */
    modo: string;
    nombreCliente?: string | null;
  };
  /** Datos del cliente para el repartidor. Solo se llena en DOMICILIO; null en el resto. */
  entrega: DatosEntrega | null;
  lineas: LineaImpresion[];
  totales: { subtotal: number; descuentos: number; iva: number; total: number; propina: number };
  pagos: PagoImpresion[];
  /** Portal de autofacturación. null = el negocio lo tiene apagado y el ticket no lo imprime. */
  qrUrl: string | null;
  ancho: 58 | 80;
};
