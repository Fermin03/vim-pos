// Edge Function: timbrar-cfdi (F8) — timbra un CFDI borrador contra el PAC.
// Flujo: el admin crea el borrador (RPC cfdi_crear_borrador desde el cliente) y luego llama
// aquí con { cfdi_id }. La función:
//   1) valida el JWT del llamante (debe ser DUEÑO/ADMIN del tenant),
//   2) carga el borrador (RLS del llamante),
//   3) llama al PAC (mock en dev / Facturapi @sin-verificar en prod),
//   4) marca TIMBRADO o ERROR con service_role (0135: `tickets_cfdi` ya no es escribible por
//      los usuarios y las `cfdi_marcar_*` solo las ejecuta service_role; quién lo pidió queda en
//      `usuario_id` del payload del movimiento).
//
// El emisor (Issuer.Rfc) es SIEMPRE `tenant_cfdi_emisor.rfc_verificado`, que solo escribe
// `cargar-csd` tras cargar el sello con éxito. Facturama Multiemisor es una cuenta compartida y
// elige el sello por ese RFC: tomarlo de algo que el cliente escribe permitía timbrar con el sello
// de otro cliente de VIM (auditoría 30/09/2026, C1-1).
//
// Local: supabase functions serve timbrar-cfdi --env-file supabase/functions/.env
import { clienteAdmin, clienteDe, servir } from "../_shared/http.ts";
import { bearerDe } from "../_shared/identidad.ts";
import { timbrar, obtenerFacturama } from "../_shared/pac/index.ts";
import { armarConceptos, ConceptosIncoherentes, filaALinea, type LineaTicket } from "../_shared/pac/conceptos.ts";
import { archivarCfdi, subidorSupabase } from "../_shared/pac/archivo.ts";
import { resolverEmisorVerificado } from "../_shared/pac/emisor.ts";
import { COLUMNAS_NEGOCIO, negocioPuedeTimbrar, NEGOCIO_DADO_DE_BAJA } from "../_shared/pac/negocio.ts";

const ROLES_FACTURA = ["DUENO", "ADMIN"];

servir(async (req, json) => {
  const token = bearerDe(req);
  if (!token) return json({ error: "NO_AUTH" }, 401);

  // Cliente con el JWT del llamante: respeta RLS y auth.uid() resuelve al admin.
  const sb = clienteDe(token);

  const { data: u, error: uErr } = await sb.auth.getUser(token);
  if (uErr || !u?.user) return json({ error: "AUTH_INVALIDA" }, 401);
  // Escrituras de lo que respondió el PAC: con service_role (ver cabecera). Solo se usa DESPUÉS de
  // comprobar con el cliente del usuario que el CFDI es de su tenant y que es DUEÑO/ADMIN ahí.
  const admin = clienteAdmin();

  let body: { cfdi_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "BAD_JSON" }, 400);
  }
  const cfdiId = body.cfdi_id;
  if (!cfdiId) return json({ error: "FALTA_CFDI_ID" }, 400);

  // Cargar el borrador (RLS del llamante restringe al tenant).
  const { data: cfdi, error: cErr } = await sb
    .from("tickets_cfdi")
    .select(
      "id, tenant_id, ticket_id, tipo_comprobante, estado_sat, emisor_rfc, emisor_razon_social, emisor_regimen_fiscal, emisor_lugar_expedicion, receptor_rfc, receptor_razon_social, receptor_uso_cfdi, receptor_codigo_postal, receptor_regimen_fiscal, receptor_email, metodo_pago_sat, forma_pago_sat, subtotal_mxn, descuento_mxn, iva_mxn, total_mxn, " +
        // El folio del ticket es OBLIGATORIO para Facturama y es lo que amarra el CFDI con la
        // venta. El logo en PNG alimenta el PDF: el SVG lo rechaza el PAC.
        // `tickets!tickets_cfdi_ticket_id_fkey`: desde 0082 existe `cfdi_global_tickets`, que
        // referencia a las dos tablas, así que PostgREST ve dos caminos y falla con PGRST201 si
        // no se le dice por cuál ir.
        "ticket:tickets!tickets_cfdi_ticket_id_fkey(folio_completo), tenant:tenants(logo_png_url)",
    )
    .eq("id", cfdiId)
    .maybeSingle();
  if (cErr) return json({ error: "RLS_ERROR", detalle: cErr.message }, 500);
  if (!cfdi) return json({ error: "CFDI_NO_EXISTE" }, 404);

  // SEC CN-026 — el rol se comprueba EN EL TENANT DEL CFDI, no en cualquiera del llamante.
  // Antes bastaba con ser DUEÑO/ADMIN en algún tenant: quien fuera dueño de A y cajero de B podía
  // timbrar facturas de B (el RLS le deja leer el borrador porque tiene acceso a B, y el chequeo
  // de rol se satisfacía con su rol en A). Se comprueba primero el CFDI y luego el rol en SU tenant.
  const { data: acc } = await sb
    .from("usuarios_acceso")
    .select("rol:roles(codigo)")
    .eq("usuario_id", u.user.id)
    .eq("tenant_id", (cfdi as unknown as { tenant_id: string }).tenant_id)
    .eq("activo", true);
  const roles = ((acc ?? []) as unknown as { rol: { codigo: string } | null }[])
    .map((a) => a.rol?.codigo)
    .filter(Boolean) as string[];
  if (!roles.some((r) => ROLES_FACTURA.includes(r))) {
    return json({ error: "SIN_PERMISO", detalle: "Solo DUEÑO/ADMIN pueden facturar" }, 403);
  }
  const tenantDelCfdi = (cfdi as unknown as { tenant_id: string }).tenant_id;
  // Sin el add-on CFDI no se timbra (C1-5): mismo criterio que el portal de autofactura.
  // Con service_role: `tenant_addon_activo` no es ejecutable por usuarios desde la 0132 (era un
  // oráculo). El tenant ya se validó arriba contra el rol del llamante.
  const { data: addonActivo } = await admin.rpc("tenant_addon_activo", { p_tenant_id: tenantDelCfdi, p_codigo: "CFDI" });
  if (addonActivo !== true) {
    return json({ error: "SIN_ADDON_CFDI", detalle: "La facturación no está contratada para este negocio. Contacta a VIM." }, 403);
  }
  // Negocio dado de baja y con la baja ya en vigor: no se timbra (0144, ADR 0023). En sus días de
  // gracia sigue facturando, igual que su caja sigue vendiendo. Ver `_shared/pac/negocio.ts`.
  const estadoDelNegocio = () => admin.from("tenants").select(COLUMNAS_NEGOCIO).eq("id", tenantDelCfdi).maybeSingle();
  if (!await negocioPuedeTimbrar(estadoDelNegocio)) return json(NEGOCIO_DADO_DE_BAJA, 403);

  // Servicio suspendido: no se timbra (ADR 0014, entrega 2).
  //
  // El bloqueo de la caja lo aplica el cliente con sus directivas, y eso basta para la operación
  // diaria. Timbrar es distinto: cada folio sale de la cuenta que VIM le paga al PAC, así que un
  // negocio bloqueado que llame a esta función directamente nos costaría dinero. Aquí sí hay un
  // control del lado del servidor, y `mi_acceso()` lo resuelve con el JWT del propio llamante.
  const { data: accesoRaw } = await sb.rpc("mi_acceso");
  const bloqueado = (accesoRaw as { acceso?: { bloqueado?: boolean; mensaje?: string | null } } | null)?.acceso;
  if (bloqueado?.bloqueado === true) {
    return json(
      { error: "SERVICIO_SUSPENDIDO", detalle: bloqueado.mensaje ?? "El servicio está suspendido. Contacta a VIM." },
      403,
    );
  }

  // Facturación pausada por el negocio (Configuración → Facturación): no se timbra nada nuevo.
  // Solo "INACTIVO" bloquea; "PRUEBA" y "ACTIVO" timbran igual que siempre, para no cortarle la
  // facturación a nadie que ya la usa con el modo viejo en "Pruebas".
  const { data: emisorEstado } = await sb
    .from("tenant_cfdi_emisor")
    .select("estado, rfc, rfc_verificado")
    .eq("tenant_id", tenantDelCfdi)
    .maybeSingle();
  const emisorFila = emisorEstado as { estado?: string; rfc?: string | null; rfc_verificado?: string | null } | null;
  if (emisorFila?.estado === "INACTIVO") {
    return json({ error: "FACTURACION_PAUSADA", detalle: "La facturación está pausada. Reanúdala en Configuración → Facturación." }, 409);
  }
  // El RFC del borrador y el de la configuración tienen que ser el del sello cargado.
  const emisorRfc = resolverEmisorVerificado(emisorFila?.rfc_verificado, [
    emisorFila?.rfc,
    (cfdi as unknown as { emisor_rfc?: string | null }).emisor_rfc,
  ]);
  if (!emisorRfc.ok) return json({ ok: false, error: emisorRfc.error, mensaje: emisorRfc.mensaje }, 409);

  // El select lleva embebidos con alias que el inferidor de supabase-js no sabe tipar
  // (GenericStringError): se nombra la forma una vez, en vez de castear en cada uso.
  const c = cfdi as unknown as Record<string, unknown> & { estado_sat: string };
  if (c.estado_sat === "TIMBRADO") return json({ error: "YA_TIMBRADO" }, 409);
  if (c.estado_sat !== "BORRADOR" && c.estado_sat !== "ERROR_TIMBRADO") {
    return json({ error: "ESTADO_NO_TIMBRABLE", estado: c.estado_sat }, 409);
  }

  const num = (v: unknown) => Number(v ?? 0);

  // Llamar al PAC con redundancia (Fase 4): principal → respaldo solo ante fallo de transporte.
  // El folio del ticket. Si por lo que sea no viniera, se cae a los últimos 8 del id del CFDI:
  // Facturama exige el campo, y quedarse sin timbrar por un folio ausente sería peor que timbrar
  // con uno derivado. Queda rastreable de todos modos por `pac_referencia`.
  const folioDelTicket = String(
    (c.ticket as { folio_completo?: string } | null)?.folio_completo ?? String(c.id).slice(-8),
  );
  const logoDelNegocio = (c.tenant as { logo_png_url?: string } | null)?.logo_png_url ?? null;

  // ---------------------------------------------------------------------------------------------
  // Los renglones del ticket, que son los conceptos del CFDI (fase 2).
  //
  // Se leen aquí y no en el adaptador porque el desglose fiscal es el mismo para cualquier PAC, y
  // porque el adaptador no debe saber de RLS ni de la forma de nuestras tablas.
  //
  // `cancelado = false`: un renglón cancelado antes del cobro no se pagó, así que no se factura.
  // ---------------------------------------------------------------------------------------------
  const ticketId = (cfdi as { ticket_id?: string }).ticket_id;
  if (!ticketId) return json({ error: "CFDI_SIN_TICKET" }, 409);

  // Lealtad (0158, ADR 0030): una cuenta con un premio de producto no se factura individual.
  //
  // El candado de la base (`trg_tickets_cfdi_sin_premio`) solo actúa al CREAR el borrador. Un
  // borrador viejo —de una cuenta que después se reabrió y recibió un premio, o uno que se quedó
  // en ERROR_TIMBRADO— llegaría hasta el PAC con un renglón en cero. Por eso se vuelve a preguntar
  // aquí, antes de leer los renglones y de gastar un folio. Las notas de crédito (EGRESO) pasan.
  //
  // Con service_role, como las demás lecturas privilegiadas: el tenant ya se validó arriba. Si la
  // consulta falla NO se timbra a ciegas (ver abajo). Solo se sigue de largo si la función todavía no
  // existe (la 0158 sin aplicar): ahí no hay candado. Ojo: los premios existen desde la 0156, así que
  // en esa ventana una cuenta con premio no tiene quien la frene; por eso la 0158 va antes de encender
  // premios.
  if (String(c.tipo_comprobante) === "INGRESO") {
    const { data: llevaPremio, error: pErr } = await admin.rpc("ticket_lleva_premio", { p_ticket_id: ticketId });
    // Si la lectura falla, NO se timbra a ciegas: timbrar una cuenta con premio deja un concepto en
    // cero ante el SAT, y eso no se deshace con un clic. La única excepción es que la función todavía
    // no exista (la 0158 sin aplicar): ahí no hay candado ni premios que facturar mal, y bloquear
    // tumbaría toda la facturación individual durante el despliegue.
    if (pErr) {
      const noExiste = pErr.code === "PGRST202" || pErr.code === "42883";
      console.warn(`[lealtad] no se pudo revisar el premio del ticket ${ticketId}: ${pErr.message}`);
      if (!noExiste) {
        return json({ error: "NO_SE_PUDO_REVISAR_PREMIO", detalle: "No se pudo comprobar la cuenta antes de facturar. Inténtalo de nuevo en un momento." }, 503);
      }
    }
    if (llevaPremio === true) {
      return json({ error: "CON_PREMIO", detalle: "Esta venta incluye un premio de lealtad y no se factura de forma individual." }, 409);
    }
  }

  const { data: filas, error: iErr } = await sb
    .from("ticket_items")
    .select(
      "id, parent_item_id, combo_rol, cargo_tipo, " +
        "producto_nombre_snapshot, cantidad, clave_sat_snapshot, unidad_sat_snapshot, " +
        "tasa_iva_snapshot, iva_incluido_en_precio_snapshot, subtotal_bruto_mxn, " +
        "monto_modificadores_mxn, descuento_item_mxn, promocion_item_mxn, iva_item_mxn, total_item_mxn",
    )
    .eq("ticket_id", ticketId)
    .eq("cancelado", false)
    .order("orden_visualizacion", { ascending: true });
  if (iErr) return json({ error: "ITEMS_ERROR", detalle: iErr.message }, 500);

  const lineas: LineaTicket[] = ((filas ?? []) as unknown as Record<string, unknown>[]).map(filaALinea);

  // ---------------------------------------------------------------------------------------------
  // Compuerta de folios.
  //
  // Se COMPRUEBA antes de timbrar y se CONSUME después. El orden no es casual: la inmensa mayoría
  // de los fallos son rechazos de validación —un CP que no cuadra con el RFC, un nombre que no es
  // el del padrón— y esos son frecuentísimos en el portal de autofactura. Cobrar un folio por cada
  // intento fallido de un comensal que se equivocó de código postal sería indefendible.
  //
  // El precio de este orden es una carrera estrecha: dos timbrados simultáneos con un solo folio
  // pasan los dos la comprobación. El segundo consumo falla contra el CHECK de la columna y queda
  // registrado; se prefiere eso a cobrar de más.
  // ---------------------------------------------------------------------------------------------
  const { data: saldoRaw } = await sb
    .from("tenant_folios_saldo")
    .select("folios_base_mensuales, folios_base_consumidos, saldo_paquetes")
    .eq("tenant_id", tenantDelCfdi)
    .maybeSingle();
  const saldo = saldoRaw as { folios_base_mensuales: number; folios_base_consumidos: number; saldo_paquetes: number } | null;
  const foliosDisponibles = saldo
    ? Math.max(saldo.folios_base_mensuales - saldo.folios_base_consumidos, 0) + saldo.saldo_paquetes
    : 0;
  if (foliosDisponibles <= 0) {
    return json({
      ok: false,
      error: "SIN_FOLIOS",
      mensaje: "No quedan folios para timbrar. Contacta a VIM para acreditar un paquete.",
    }, 402);
  }

  let armado;
  try {
    armado = armarConceptos(lineas, num(c.total_mxn));
  } catch (e) {
    // Datos incoherentes: no se reintenta ni se timbra "de todos modos". Se registra el error en
    // el CFDI para que quede rastro y alguien lo revise, porque el ticket ya se cobró.
    if (e instanceof ConceptosIncoherentes) {
      await admin.rpc("cfdi_marcar_error", {
        p_cfdi_id: cfdiId,
        p_codigo_error: "CONCEPTOS_INCOHERENTES",
        p_mensaje_error: e.message,
        p_request_payload: { renglones: lineas.length, total_ticket: num(c.total_mxn), usuario_id: u.user.id },
        p_response_payload: {},
      });
      return json({ ok: false, estado: "ERROR_TIMBRADO", error: "CONCEPTOS_INCOHERENTES", mensaje: e.message }, 422);
    }
    throw e;
  }

  // Otra vez, justo antes de salir al PAC: armar los conceptos tomó varias lecturas, y entre la
  // primera comprobación y esta el negocio pudo darse de baja. Después de aquí ya no hay vuelta.
  if (!await negocioPuedeTimbrar(estadoDelNegocio)) return json(NEGOCIO_DADO_DE_BAJA, 403);

  const res = await timbrar({
    cfdiId: String(c.id),
    tipoComprobante: String(c.tipo_comprobante),
    emisor: {
      rfc: emisorRfc.rfc,
      razonSocial: String(c.emisor_razon_social),
      regimenFiscal: String(c.emisor_regimen_fiscal),
      lugarExpedicion: String(c.emisor_lugar_expedicion),
    },
    receptor: {
      rfc: String(c.receptor_rfc ?? ""),
      razonSocial: String(c.receptor_razon_social ?? ""),
      usoCfdi: String(c.receptor_uso_cfdi ?? ""),
      codigoPostal: String(c.receptor_codigo_postal ?? ""),
      regimenFiscal: String(c.receptor_regimen_fiscal ?? ""),
      email: (c.receptor_email as string) ?? null,
    },
    metodoPagoSat: String(c.metodo_pago_sat),
    formaPagoSat: String(c.forma_pago_sat),
    folio: folioDelTicket,
    logoUrl: logoDelNegocio,
    conceptos: armado.conceptos,
    // Los totales salen del desglose, no de `tickets_cfdi`. El encabezado del ticket suma el
    // descuento de renglón DOS veces (ya venía restado del subtotal) y no baja el IVA cuando el
    // descuento es del ticket completo: con esos números el CFDI no cumple
    // `Total = Subtotal − Descuento + Impuestos` y el PAC lo rechaza.
    subtotal: armado.subtotal,
    descuento: armado.descuento,
    iva: armado.iva,
    total: armado.total,
  });

  if (!res.ok) {
    await admin.rpc("cfdi_marcar_error", {
      p_cfdi_id: cfdiId,
      p_codigo_error: res.codigoError,
      p_mensaje_error: res.mensajeError,
      p_request_payload: { pac: res.pacUsado, usuario_id: u.user.id },
      p_response_payload: res.responsePayload,
    });
    return json({ ok: false, estado: "ERROR_TIMBRADO", error: res.codigoError, mensaje: res.mensajeError }, 502);
  }

  // Rutas en el bucket privado `cfdi` (0098). Los archivos se suben más abajo, ya con el
  // comprobante marcado como timbrado: el registro manda y el archivo se repone si hace falta.
  const xmlPath = `cfdi/${cfdiId}.xml`;
  const pdfPath = `cfdi/${cfdiId}.pdf`;

  const { error: tErr } = await admin.rpc("cfdi_marcar_timbrado", {
    p_cfdi_id: cfdiId,
    p_uuid_fiscal: res.uuidFiscal,
    p_serie: res.serie,
    p_folio_fiscal: res.folioFiscal,
    p_fecha_timbrado: res.fechaTimbrado,
    p_fecha_emision: res.fechaEmision,
    p_xml_storage_path: xmlPath,
    p_pdf_storage_path: pdfPath,
    p_pac_referencia: res.pacReferencia,
    p_pac_costo_centavos: res.costoCentavos,
    p_request_payload: { pac: res.pacUsado, usuario_id: u.user.id },
    p_response_payload: res.responsePayload,
  });
  if (tErr) return json({ error: "MARCAR_TIMBRADO_ERROR", detalle: tErr.message }, 500);

  const pac = obtenerFacturama();

  // Archivo: el PAC no es nuestro archivo. XML y PDF se bajan ahora y se guardan en el bucket
  // privado `cfdi` con service_role (el bucket no tiene políticas para usuarios). Si algo falla,
  // el CFDI sigue timbrado y `descargar-cfdi` los repone del PAC cuando alguien los pida.
  if (pac && res.pacReferencia) {
    const [xml, pdf] = await Promise.all([pac.descargar(res.pacReferencia, "xml"), pac.descargar(res.pacReferencia, "pdf")]);
    const archivo = await archivarCfdi(cfdiId, { xml, pdf }, subidorSupabase(admin));
    if (archivo.errores.length) console.error(`[cfdi] ${cfdiId} archivo incompleto: ${archivo.errores.join("; ")}`);
  }

  // Si el receptor dejó correo, Facturama le manda la factura con sus adjuntos. Un fallo aquí no
  // toca el timbrado: el comprobante existe y se puede reenviar.
  const correoReceptor = (c.receptor_email as string | null) ?? null;
  if (correoReceptor && pac) {
    const envio = await pac.enviarPorCorreo(res.pacReferencia, correoReceptor);
    if (!envio.ok) console.error(`[cfdi] ${cfdiId} timbrado pero sin enviar a ${correoReceptor}: ${envio.mensaje}`);
  }

  // Dejar constancia del PAC que REALMENTE timbró.
  //
  // El mock no está en el enum de la base (es una herramienta de desarrollo, no un PAC), así que
  // cae en OTRO en vez de reventar el update.
  const PAC_EN_BD = ["FACTURAPI", "SOLUCIONFACTIBLE", "FINKOK", "EDICOM", "PRODIGIA", "FACTURAMA"];
  const pacReal = PAC_EN_BD.includes(res.pacUsado) ? res.pacUsado : "OTRO";
  await admin.from("tickets_cfdi").update({ pac_proveedor: pacReal }).eq("id", cfdiId).eq("tenant_id", tenantDelCfdi);

  // El CFDI ya existe ante el SAT. Si el descuento falla, NO se deshace el timbrado ni se devuelve
  // error: el comprobante es real y tiene que quedar registrado. Se avisa en la respuesta para que
  // el descuadre se vea en vez de perderse.
  let folioConsumido = true;
  const { data: consumo, error: cErr2 } = await admin.rpc("consumir_folio_cfdi", {
    p_tenant_id: tenantDelCfdi,
    p_cfdi_id: cfdiId,
    p_es_global: false,
  });
  if (cErr2 || (consumo as { ok?: boolean } | null)?.ok === false) {
    folioConsumido = false;
    console.error(
      `[folios] CFDI ${cfdiId} timbrado pero el folio NO se descontó: ${cErr2?.message ?? JSON.stringify(consumo)}`,
    );
  }

  return json({
    folio_consumido: folioConsumido,
    ok: true,
    estado: "TIMBRADO",
    uuid_fiscal: res.uuidFiscal,
    serie: res.serie,
    folio_fiscal: res.folioFiscal,
    pac: res.pacUsado,
  });
});
