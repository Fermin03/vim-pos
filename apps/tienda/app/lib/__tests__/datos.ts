// Respuestas de la función `tienda` con la forma EXACTA del anexo de hechos (§1.6–§1.10) más los
// campos de la 0165. Se devuelven como `unknown` recién hecho: así pasan por los lectores igual que
// lo que llega de la red, y cada prueba puede romper su copia sin estorbar a las demás.

/** Un UUID legible: u(7) → 00000000-0000-4000-8000-000000000007. */
export const u = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

export const ID = {
  sucursal: u(1), zona: u(2),
  hamburguesa: u(10), termino: u(11), medio: u(12), bienCocido: u(13),
  extras: u(14), queso: u(15), tocino: u(16), aguacate: u(17),
  refresco: u(20),
  combo: u(30), slotPapas: u(31), slotBebida: u(32), papasGajo: u(33), papasFrancesas: u(34),
  salsas: u(35), ranch: u(36),
} as const;

const opcion = (id: string, nombre: string, extra = "0.00", o: Record<string, unknown> = {}) =>
  ({ id, nombre, precio_extra_mxn: extra, precio_extra_final_mxn: extra, agotada: false, es_default: false, ...o });

export function menuCrudo(): unknown {
  return {
    categorias: [
      { id: u(100), nombre: "Hamburguesas", productos: [
        { id: ID.hamburguesa, nombre: "Hamburguesa", descripcion: "Con todo", imagen_url: null,
          precio_mxn: "120.00", precio_final_mxn: "139.20", agotado: false, es_combo: false,
          grupos: [
            { id: ID.termino, nombre: "Término", tipo_seleccion: "UNICA_OBLIGATORIA", minimo: 1, maximo: 1,
              opciones: [opcion(ID.medio, "Medio"), opcion(ID.bienCocido, "Bien cocido")] },
            { id: ID.extras, nombre: "Extras", tipo_seleccion: "MULTIPLE", minimo: 0, maximo: 3,
              opciones: [
                { ...opcion(ID.queso, "Extra queso", "15.00"), precio_extra_final_mxn: "17.40" },
                opcion(ID.tocino, "Tocino", "20.00"),
                opcion(ID.aguacate, "Aguacate", "10.00", { agotada: true }),
              ] },
          ],
          slots: [] },
        { id: ID.refresco, nombre: "Refresco", descripcion: null, imagen_url: null,
          precio_mxn: "30.00", precio_final_mxn: "30.00", agotado: false, es_combo: false, grupos: [], slots: [] },
      ] },
      { id: u(101), nombre: "Combos", productos: [
        { id: ID.combo, nombre: "Combo clásico", descripcion: null, imagen_url: null,
          precio_mxn: "150.00", precio_final_mxn: "150.00", agotado: false, es_combo: true, grupos: [],
          slots: [
            { id: ID.slotPapas, nombre: "Papas", minimo: 1, maximo: 1, opciones: [
              { producto_id: ID.papasGajo, nombre: "Papas gajo", precio_extra_mxn: "0.00", precio_extra_final_mxn: "0.00",
                agotado: false, es_default: true,
                grupos: [{ id: ID.salsas, nombre: "Salsas", tipo_seleccion: "MULTIPLE", minimo: 0, maximo: null,
                           opciones: [opcion(ID.ranch, "Ranch", "5.00")] }] },
              { producto_id: ID.papasFrancesas, nombre: "Papas a la francesa", precio_extra_mxn: "10.00",
                precio_extra_final_mxn: "10.00", agotado: false, es_default: false, grupos: [] },
            ] },
            { id: ID.slotBebida, nombre: "Bebida", minimo: 0, maximo: 2, opciones: [
              { producto_id: ID.refresco, nombre: "Refresco", precio_extra_mxn: "0.00", precio_extra_final_mxn: "0.00",
                agotado: false, es_default: false, grupos: [] },
              { producto_id: ID.papasGajo, nombre: "Papas gajo", precio_extra_mxn: "25.00", precio_extra_final_mxn: "25.00",
                agotado: false, es_default: false, grupos: [] },
            ] },
          ] },
      ] },
    ],
  };
}

export function negocioCrudo(): unknown {
  return {
    slug: "knockout", nombre: "Knock-Out Burger", logo_ruta: `${u(900)}/${u(901)}.png`, color: "#0078C9",
    descripcion: "Hamburguesas al carbón", pago_efectivo: true, pago_tarjeta: false,
    sucursales: [
      { id: ID.sucursal, nombre: "Centro", telefono: "477 123 4567", direccion: "Madero 12, Centro, León",
        recoger: true, domicilio: true,
        horario: { "1": ["13:00", "22:00"], "7": ["13:00", "02:00"] },
        estado: { recoger: null, domicilio: "FUERA_DE_HORARIO" },
        zonas: [{ id: ID.zona, nombre: "Centro", costo_mxn: "35.00" }] },
    ],
  };
}

export function cotizacionCruda(): unknown {
  return {
    renglones: [{ nombre: "Hamburguesa", cantidad: 2, detalle: "Medio, Extra queso", total_mxn: "270.00" }],
    subtotal_mxn: "270.00", envio_mxn: "35.00", envio_total_mxn: "35.00", total_mxn: "305.00",
  };
}

export const CODIGO = "abcDEF123_-abcDEF123_-";

export function pedidoCrudo(): unknown {
  return { codigo: CODIGO, folio_corto: "TAB12C", total_mxn: "305.00", vence_aceptacion: "2026-10-09T19:05:00+00:00" };
}

export function seguimientoCrudo(): unknown {
  return {
    folio_corto: "TAB12C", modo: "DOMICILIO", estado: "EN_CAMINO", motivo: null,
    renglones: [{ nombre: "Hamburguesa", cantidad: 2, detalle: null }],
    subtotal_mxn: "270.00", envio_total_mxn: "35.00", total_mxn: "305.00", pago: "EFECTIVO",
    recibido_at: "2026-10-09T19:00:00+00:00", sucursal: { nombre: "Centro", telefono: null },
  };
}
