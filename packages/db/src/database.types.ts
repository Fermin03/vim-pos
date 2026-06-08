export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      addons: {
        Row: {
          activo: boolean
          codigo: string
          created_at: string
          descripcion: string | null
          features_activadas: Json
          id: string
          nombre: string
          orden_visualizacion: number
          precio_mensual_mxn: number
          updated_at: string
          visible_publico: boolean
        }
        Insert: {
          activo?: boolean
          codigo: string
          created_at?: string
          descripcion?: string | null
          features_activadas?: Json
          id?: string
          nombre: string
          orden_visualizacion?: number
          precio_mensual_mxn: number
          updated_at?: string
          visible_publico?: boolean
        }
        Update: {
          activo?: boolean
          codigo?: string
          created_at?: string
          descripcion?: string | null
          features_activadas?: Json
          id?: string
          nombre?: string
          orden_visualizacion?: number
          precio_mensual_mxn?: number
          updated_at?: string
          visible_publico?: boolean
        }
        Relationships: []
      }
      alertas_inventario: {
        Row: {
          activa: boolean
          atendida_por: string | null
          created_at: string
          fecha_atendida: string | null
          fecha_disparo: string
          id: string
          insumo_id: string
          notas_atencion: string | null
          notificado_email: boolean
          notificado_push: boolean
          productos_afectados_ids: string[]
          severidad: Database["public"]["Enums"]["alerta_severidad"]
          stock_al_alertar: number
          sucursal_id: string
          tenant_id: string
          umbral_disparador: number
        }
        Insert: {
          activa?: boolean
          atendida_por?: string | null
          created_at?: string
          fecha_atendida?: string | null
          fecha_disparo?: string
          id?: string
          insumo_id: string
          notas_atencion?: string | null
          notificado_email?: boolean
          notificado_push?: boolean
          productos_afectados_ids?: string[]
          severidad: Database["public"]["Enums"]["alerta_severidad"]
          stock_al_alertar: number
          sucursal_id: string
          tenant_id: string
          umbral_disparador: number
        }
        Update: {
          activa?: boolean
          atendida_por?: string | null
          created_at?: string
          fecha_atendida?: string | null
          fecha_disparo?: string
          id?: string
          insumo_id?: string
          notas_atencion?: string | null
          notificado_email?: boolean
          notificado_push?: boolean
          productos_afectados_ids?: string[]
          severidad?: Database["public"]["Enums"]["alerta_severidad"]
          stock_al_alertar?: number
          sucursal_id?: string
          tenant_id?: string
          umbral_disparador?: number
        }
        Relationships: [
          {
            foreignKeyName: "alertas_inventario_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "insumos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alertas_inventario_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alertas_inventario_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      apps_liquidacion_items: {
        Row: {
          created_at: string
          created_by: string | null
          fecha_orden_app: string | null
          folio_externo_app: string
          id: string
          liquidacion_id: string
          match_at: string | null
          match_metodo: string | null
          match_por_id: string | null
          monto_comision_mxn: number
          monto_diferencia_mxn: number | null
          monto_neto_mxn: number
          monto_propina_mxn: number
          monto_venta_mxn: number
          notas_match: string | null
          tenant_id: string
          ticket_id_match: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          fecha_orden_app?: string | null
          folio_externo_app: string
          id?: string
          liquidacion_id: string
          match_at?: string | null
          match_metodo?: string | null
          match_por_id?: string | null
          monto_comision_mxn?: number
          monto_diferencia_mxn?: number | null
          monto_neto_mxn: number
          monto_propina_mxn?: number
          monto_venta_mxn: number
          notas_match?: string | null
          tenant_id: string
          ticket_id_match?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          fecha_orden_app?: string | null
          folio_externo_app?: string
          id?: string
          liquidacion_id?: string
          match_at?: string | null
          match_metodo?: string | null
          match_por_id?: string | null
          monto_comision_mxn?: number
          monto_diferencia_mxn?: number | null
          monto_neto_mxn?: number
          monto_propina_mxn?: number
          monto_venta_mxn?: number
          notas_match?: string | null
          tenant_id?: string
          ticket_id_match?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "apps_liquidacion_items_liquidacion_id_fkey"
            columns: ["liquidacion_id"]
            isOneToOne: false
            referencedRelation: "apps_liquidaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "apps_liquidacion_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "apps_liquidacion_items_ticket_id_match_fkey"
            columns: ["ticket_id_match"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "apps_liquidacion_items_ticket_id_match_fkey"
            columns: ["ticket_id_match"]
            isOneToOne: false
            referencedRelation: "vw_cumplimiento_tiempos_cocina"
            referencedColumns: ["ticket_id"]
          },
          {
            foreignKeyName: "apps_liquidacion_items_ticket_id_match_fkey"
            columns: ["ticket_id_match"]
            isOneToOne: false
            referencedRelation: "vw_ventas_apps_externas"
            referencedColumns: ["ticket_id"]
          },
        ]
      }
      apps_liquidaciones: {
        Row: {
          app_externa: Database["public"]["Enums"]["modo_servicio"]
          archivo_storage_path: string | null
          conciliado_at: string | null
          conciliado_por_id: string | null
          created_at: string
          created_by: string | null
          diferencia_mxn: number | null
          estado: string
          folio_liquidacion_app: string
          id: string
          ingesta_at: string
          ingesta_metodo: string
          ingesta_por_id: string | null
          nota: string | null
          periodo_fin: string
          periodo_inicio: string
          porcentaje_match: number | null
          sucursal_id: string | null
          tenant_id: string
          total_ajustes_mxn: number
          total_comisiones_mxn: number
          total_iva_comisiones_mxn: number
          total_liquidado_mxn: number
          total_pos_mxn: number | null
          total_propinas_mxn: number
          total_ventas_brutas_mxn: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          app_externa: Database["public"]["Enums"]["modo_servicio"]
          archivo_storage_path?: string | null
          conciliado_at?: string | null
          conciliado_por_id?: string | null
          created_at?: string
          created_by?: string | null
          diferencia_mxn?: number | null
          estado?: string
          folio_liquidacion_app: string
          id?: string
          ingesta_at?: string
          ingesta_metodo?: string
          ingesta_por_id?: string | null
          nota?: string | null
          periodo_fin: string
          periodo_inicio: string
          porcentaje_match?: number | null
          sucursal_id?: string | null
          tenant_id: string
          total_ajustes_mxn?: number
          total_comisiones_mxn?: number
          total_iva_comisiones_mxn?: number
          total_liquidado_mxn: number
          total_pos_mxn?: number | null
          total_propinas_mxn?: number
          total_ventas_brutas_mxn: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          app_externa?: Database["public"]["Enums"]["modo_servicio"]
          archivo_storage_path?: string | null
          conciliado_at?: string | null
          conciliado_por_id?: string | null
          created_at?: string
          created_by?: string | null
          diferencia_mxn?: number | null
          estado?: string
          folio_liquidacion_app?: string
          id?: string
          ingesta_at?: string
          ingesta_metodo?: string
          ingesta_por_id?: string | null
          nota?: string | null
          periodo_fin?: string
          periodo_inicio?: string
          porcentaje_match?: number | null
          sucursal_id?: string | null
          tenant_id?: string
          total_ajustes_mxn?: number
          total_comisiones_mxn?: number
          total_iva_comisiones_mxn?: number
          total_liquidado_mxn?: number
          total_pos_mxn?: number | null
          total_propinas_mxn?: number
          total_ventas_brutas_mxn?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "apps_liquidaciones_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "apps_liquidaciones_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      areas_cocina: {
        Row: {
          activa: boolean
          codigo_interno: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          descripcion: string | null
          formato_comanda: Json
          id: string
          impresora_config: Json | null
          nombre: string
          sucursal_id: string
          tenant_id: string
          tipo: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          activa?: boolean
          codigo_interno?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          descripcion?: string | null
          formato_comanda?: Json
          id?: string
          impresora_config?: Json | null
          nombre: string
          sucursal_id: string
          tenant_id: string
          tipo?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          activa?: boolean
          codigo_interno?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          descripcion?: string | null
          formato_comanda?: Json
          id?: string
          impresora_config?: Json | null
          nombre?: string
          sucursal_id?: string
          tenant_id?: string
          tipo?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "areas_cocina_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "areas_cocina_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      auditoria_eventos: {
        Row: {
          caja_id: string | null
          categoria: Database["public"]["Enums"]["evento_categoria"]
          dia_contable: string | null
          entidad_id: string | null
          entidad_tipo: string | null
          evento_codigo: string
          fecha: string
          id: string
          ip_address: unknown
          payload: Json
          sucursal_id: string | null
          tenant_id: string
          turno_id: string | null
          user_agent: string | null
          usuario_autorizo_id: string | null
          usuario_id: string | null
        }
        Insert: {
          caja_id?: string | null
          categoria: Database["public"]["Enums"]["evento_categoria"]
          dia_contable?: string | null
          entidad_id?: string | null
          entidad_tipo?: string | null
          evento_codigo: string
          fecha?: string
          id?: string
          ip_address?: unknown
          payload?: Json
          sucursal_id?: string | null
          tenant_id: string
          turno_id?: string | null
          user_agent?: string | null
          usuario_autorizo_id?: string | null
          usuario_id?: string | null
        }
        Update: {
          caja_id?: string | null
          categoria?: Database["public"]["Enums"]["evento_categoria"]
          dia_contable?: string | null
          entidad_id?: string | null
          entidad_tipo?: string | null
          evento_codigo?: string
          fecha?: string
          id?: string
          ip_address?: unknown
          payload?: Json
          sucursal_id?: string | null
          tenant_id?: string
          turno_id?: string | null
          user_agent?: string | null
          usuario_autorizo_id?: string | null
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "auditoria_eventos_caja_id_fkey"
            columns: ["caja_id"]
            isOneToOne: false
            referencedRelation: "cajas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auditoria_eventos_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auditoria_eventos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auditoria_eventos_turno_id_fkey"
            columns: ["turno_id"]
            isOneToOne: false
            referencedRelation: "turnos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auditoria_eventos_turno_id_fkey"
            columns: ["turno_id"]
            isOneToOne: false
            referencedRelation: "vw_efectivo_esperado_turno"
            referencedColumns: ["turno_id"]
          },
          {
            foreignKeyName: "auditoria_eventos_turno_id_fkey"
            columns: ["turno_id"]
            isOneToOne: false
            referencedRelation: "vw_resumen_turno"
            referencedColumns: ["turno_id"]
          },
        ]
      }
      autorizaciones_pin: {
        Row: {
          accion: string
          caja_id: string | null
          entidad_id: string | null
          entidad_tipo: string | null
          fecha: string
          id: string
          monto_mxn: number | null
          motivo: string
          permiso_codigo: string | null
          sucursal_id: string | null
          tenant_id: string
          turno_id: string | null
          usuario_autorizo_id: string
          usuario_solicitante_id: string
        }
        Insert: {
          accion: string
          caja_id?: string | null
          entidad_id?: string | null
          entidad_tipo?: string | null
          fecha?: string
          id?: string
          monto_mxn?: number | null
          motivo: string
          permiso_codigo?: string | null
          sucursal_id?: string | null
          tenant_id: string
          turno_id?: string | null
          usuario_autorizo_id: string
          usuario_solicitante_id: string
        }
        Update: {
          accion?: string
          caja_id?: string | null
          entidad_id?: string | null
          entidad_tipo?: string | null
          fecha?: string
          id?: string
          monto_mxn?: number | null
          motivo?: string
          permiso_codigo?: string | null
          sucursal_id?: string | null
          tenant_id?: string
          turno_id?: string | null
          usuario_autorizo_id?: string
          usuario_solicitante_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "autorizaciones_pin_caja_id_fkey"
            columns: ["caja_id"]
            isOneToOne: false
            referencedRelation: "cajas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "autorizaciones_pin_permiso_codigo_fkey"
            columns: ["permiso_codigo"]
            isOneToOne: false
            referencedRelation: "permisos"
            referencedColumns: ["codigo"]
          },
          {
            foreignKeyName: "autorizaciones_pin_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "autorizaciones_pin_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "autorizaciones_pin_turno_id_fkey"
            columns: ["turno_id"]
            isOneToOne: false
            referencedRelation: "turnos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "autorizaciones_pin_turno_id_fkey"
            columns: ["turno_id"]
            isOneToOne: false
            referencedRelation: "vw_efectivo_esperado_turno"
            referencedColumns: ["turno_id"]
          },
          {
            foreignKeyName: "autorizaciones_pin_turno_id_fkey"
            columns: ["turno_id"]
            isOneToOne: false
            referencedRelation: "vw_resumen_turno"
            referencedColumns: ["turno_id"]
          },
        ]
      }
      cajas: {
        Row: {
          activa: boolean
          bloqueada: boolean
          bloqueo_motivo: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          descripcion: string | null
          id: string
          identificador_dispositivo: string | null
          impresora_config: Json | null
          nombre: string
          numero: number
          sucursal_id: string
          tenant_id: string
          ultima_conexion: string | null
          ultima_ip: unknown
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          activa?: boolean
          bloqueada?: boolean
          bloqueo_motivo?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          descripcion?: string | null
          id?: string
          identificador_dispositivo?: string | null
          impresora_config?: Json | null
          nombre: string
          numero: number
          sucursal_id: string
          tenant_id: string
          ultima_conexion?: string | null
          ultima_ip?: unknown
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          activa?: boolean
          bloqueada?: boolean
          bloqueo_motivo?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          descripcion?: string | null
          id?: string
          identificador_dispositivo?: string | null
          impresora_config?: Json | null
          nombre?: string
          numero?: number
          sucursal_id?: string
          tenant_id?: string
          ultima_conexion?: string | null
          ultima_ip?: unknown
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cajas_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cajas_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      cancelaciones_ticket: {
        Row: {
          autorizacion_pin_id: string
          caja_id: string
          cancelar_cfdi_sat: boolean
          cfdi_cancelado_at: string | null
          client_id_local: string | null
          created_at: string
          created_by: string | null
          devolucion_id: string | null
          dia_contable: string
          fecha_cancelacion: string
          folio_completo: string
          folio_consecutivo: number
          id: string
          inventario_reversado_at: string | null
          motivo: Database["public"]["Enums"]["cancelacion_motivo"]
          motivo_texto: string | null
          nota: string | null
          reversar_inventario: boolean
          sucursal_id: string
          tenant_id: string
          ticket_dia_contable_snapshot: string
          ticket_estado_cocina_previo: Database["public"]["Enums"]["ticket_estado_cocina"]
          ticket_estado_fiscal_previo: Database["public"]["Enums"]["ticket_estado_fiscal"]
          ticket_folio_snapshot: string
          ticket_id: string
          ticket_total_snapshot: number
          turno_id: string
          updated_at: string
          updated_by: string | null
          usuario_autorizo_id: string
          usuario_solicitante_id: string
        }
        Insert: {
          autorizacion_pin_id: string
          caja_id: string
          cancelar_cfdi_sat?: boolean
          cfdi_cancelado_at?: string | null
          client_id_local?: string | null
          created_at?: string
          created_by?: string | null
          devolucion_id?: string | null
          dia_contable: string
          fecha_cancelacion?: string
          folio_completo: string
          folio_consecutivo: number
          id?: string
          inventario_reversado_at?: string | null
          motivo: Database["public"]["Enums"]["cancelacion_motivo"]
          motivo_texto?: string | null
          nota?: string | null
          reversar_inventario?: boolean
          sucursal_id: string
          tenant_id: string
          ticket_dia_contable_snapshot: string
          ticket_estado_cocina_previo: Database["public"]["Enums"]["ticket_estado_cocina"]
          ticket_estado_fiscal_previo: Database["public"]["Enums"]["ticket_estado_fiscal"]
          ticket_folio_snapshot: string
          ticket_id: string
          ticket_total_snapshot: number
          turno_id: string
          updated_at?: string
          updated_by?: string | null
          usuario_autorizo_id: string
          usuario_solicitante_id: string
        }
        Update: {
          autorizacion_pin_id?: string
          caja_id?: string
          cancelar_cfdi_sat?: boolean
          cfdi_cancelado_at?: string | null
          client_id_local?: string | null
          created_at?: string
          created_by?: string | null
          devolucion_id?: string | null
          dia_contable?: string
          fecha_cancelacion?: string
          folio_completo?: string
          folio_consecutivo?: number
          id?: string
          inventario_reversado_at?: string | null
          motivo?: Database["public"]["Enums"]["cancelacion_motivo"]
          motivo_texto?: string | null
          nota?: string | null
          reversar_inventario?: boolean
          sucursal_id?: string
          tenant_id?: string
          ticket_dia_contable_snapshot?: string
          ticket_estado_cocina_previo?: Database["public"]["Enums"]["ticket_estado_cocina"]
          ticket_estado_fiscal_previo?: Database["public"]["Enums"]["ticket_estado_fiscal"]
          ticket_folio_snapshot?: string
          ticket_id?: string
          ticket_total_snapshot?: number
          turno_id?: string
          updated_at?: string
          updated_by?: string | null
          usuario_autorizo_id?: string
          usuario_solicitante_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cancelaciones_ticket_autorizacion_pin_id_fkey"
            columns: ["autorizacion_pin_id"]
            isOneToOne: false
            referencedRelation: "autorizaciones_pin"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cancelaciones_ticket_caja_id_fkey"
            columns: ["caja_id"]
            isOneToOne: false
            referencedRelation: "cajas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cancelaciones_ticket_devolucion_id_fkey"
            columns: ["devolucion_id"]
            isOneToOne: false
            referencedRelation: "devoluciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cancelaciones_ticket_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cancelaciones_ticket_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cancelaciones_ticket_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cancelaciones_ticket_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "vw_cumplimiento_tiempos_cocina"
            referencedColumns: ["ticket_id"]
          },
          {
            foreignKeyName: "cancelaciones_ticket_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "vw_ventas_apps_externas"
            referencedColumns: ["ticket_id"]
          },
          {
            foreignKeyName: "cancelaciones_ticket_turno_id_fkey"
            columns: ["turno_id"]
            isOneToOne: false
            referencedRelation: "turnos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cancelaciones_ticket_turno_id_fkey"
            columns: ["turno_id"]
            isOneToOne: false
            referencedRelation: "vw_efectivo_esperado_turno"
            referencedColumns: ["turno_id"]
          },
          {
            foreignKeyName: "cancelaciones_ticket_turno_id_fkey"
            columns: ["turno_id"]
            isOneToOne: false
            referencedRelation: "vw_resumen_turno"
            referencedColumns: ["turno_id"]
          },
        ]
      }
      categorias: {
        Row: {
          activa: boolean
          codigo: string | null
          color_hex: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          descripcion: string | null
          icono: string | null
          id: string
          imagen_url: string | null
          modos_servicio_visibles: string[] | null
          nombre: string
          orden_visualizacion: number
          parent_id: string | null
          subtipos_personal_visibles: string[] | null
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          activa?: boolean
          codigo?: string | null
          color_hex?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          descripcion?: string | null
          icono?: string | null
          id?: string
          imagen_url?: string | null
          modos_servicio_visibles?: string[] | null
          nombre: string
          orden_visualizacion?: number
          parent_id?: string | null
          subtipos_personal_visibles?: string[] | null
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          activa?: boolean
          codigo?: string | null
          color_hex?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          descripcion?: string | null
          icono?: string | null
          id?: string
          imagen_url?: string | null
          modos_servicio_visibles?: string[] | null
          nombre?: string
          orden_visualizacion?: number
          parent_id?: string | null
          subtipos_personal_visibles?: string[] | null
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "categorias_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categorias_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      cfdi_sat_movimientos: {
        Row: {
          acuse_storage_path: string | null
          cfdi_id: string
          created_at: string
          created_by: string | null
          evento: Database["public"]["Enums"]["cfdi_sat_evento"]
          fecha_evento: string
          id: string
          pac_codigo_respuesta: string | null
          pac_mensaje: string | null
          pac_proveedor: Database["public"]["Enums"]["cfdi_proveedor_pac"]
          request_payload: Json | null
          response_payload: Json | null
          sat_codigo: string | null
          sat_mensaje: string | null
          tenant_id: string
          usuario_id: string | null
        }
        Insert: {
          acuse_storage_path?: string | null
          cfdi_id: string
          created_at?: string
          created_by?: string | null
          evento: Database["public"]["Enums"]["cfdi_sat_evento"]
          fecha_evento?: string
          id?: string
          pac_codigo_respuesta?: string | null
          pac_mensaje?: string | null
          pac_proveedor: Database["public"]["Enums"]["cfdi_proveedor_pac"]
          request_payload?: Json | null
          response_payload?: Json | null
          sat_codigo?: string | null
          sat_mensaje?: string | null
          tenant_id: string
          usuario_id?: string | null
        }
        Update: {
          acuse_storage_path?: string | null
          cfdi_id?: string
          created_at?: string
          created_by?: string | null
          evento?: Database["public"]["Enums"]["cfdi_sat_evento"]
          fecha_evento?: string
          id?: string
          pac_codigo_respuesta?: string | null
          pac_mensaje?: string | null
          pac_proveedor?: Database["public"]["Enums"]["cfdi_proveedor_pac"]
          request_payload?: Json | null
          response_payload?: Json | null
          sat_codigo?: string | null
          sat_mensaje?: string | null
          tenant_id?: string
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cfdi_sat_movimientos_cfdi_id_fkey"
            columns: ["cfdi_id"]
            isOneToOne: false
            referencedRelation: "tickets_cfdi"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cfdi_sat_movimientos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      cierres_dia: {
        Row: {
          cfdi_global_emitido: boolean
          cfdi_global_uuid: string | null
          created_at: string
          descuentos_mxn: number
          devoluciones_mxn: number
          dia_contable: string
          ejecutado_automatico: boolean
          ejecutado_por_id: string | null
          fecha_ejecucion: string
          finalizado: boolean
          id: string
          observaciones: string | null
          payload_detalle: Json
          sucursal_id: string
          tenant_id: string
          ticket_promedio_mxn: number | null
          tickets_cancelados: number
          tickets_cobrados: number
          turnos_count: number
          ventas_apps_externas_mxn: number
          ventas_brutas_mxn: number
          ventas_efectivo_mxn: number
          ventas_netas_mxn: number
          ventas_tarjeta_mxn: number
          ventas_transferencia_mxn: number
          ventas_vales_mxn: number
        }
        Insert: {
          cfdi_global_emitido?: boolean
          cfdi_global_uuid?: string | null
          created_at?: string
          descuentos_mxn?: number
          devoluciones_mxn?: number
          dia_contable: string
          ejecutado_automatico?: boolean
          ejecutado_por_id?: string | null
          fecha_ejecucion?: string
          finalizado?: boolean
          id?: string
          observaciones?: string | null
          payload_detalle?: Json
          sucursal_id: string
          tenant_id: string
          ticket_promedio_mxn?: number | null
          tickets_cancelados?: number
          tickets_cobrados?: number
          turnos_count?: number
          ventas_apps_externas_mxn?: number
          ventas_brutas_mxn?: number
          ventas_efectivo_mxn?: number
          ventas_netas_mxn?: number
          ventas_tarjeta_mxn?: number
          ventas_transferencia_mxn?: number
          ventas_vales_mxn?: number
        }
        Update: {
          cfdi_global_emitido?: boolean
          cfdi_global_uuid?: string | null
          created_at?: string
          descuentos_mxn?: number
          devoluciones_mxn?: number
          dia_contable?: string
          ejecutado_automatico?: boolean
          ejecutado_por_id?: string | null
          fecha_ejecucion?: string
          finalizado?: boolean
          id?: string
          observaciones?: string | null
          payload_detalle?: Json
          sucursal_id?: string
          tenant_id?: string
          ticket_promedio_mxn?: number | null
          tickets_cancelados?: number
          tickets_cobrados?: number
          turnos_count?: number
          ventas_apps_externas_mxn?: number
          ventas_brutas_mxn?: number
          ventas_efectivo_mxn?: number
          ventas_netas_mxn?: number
          ventas_tarjeta_mxn?: number
          ventas_transferencia_mxn?: number
          ventas_vales_mxn?: number
        }
        Relationships: [
          {
            foreignKeyName: "cierres_dia_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cierres_dia_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      clientes: {
        Row: {
          apellido_materno: string | null
          apellido_paterno: string | null
          bloqueado_por: string | null
          codigo_cliente: string | null
          codigo_postal_fiscal: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          email: string | null
          estado: Database["public"]["Enums"]["cliente_estado"]
          fecha_bloqueo: string | null
          id: string
          motivo_bloqueo: string | null
          nombre: string
          nombre_completo_busqueda: string | null
          notas_internas: string | null
          razon_social: string | null
          regimen_fiscal:
            | Database["public"]["Enums"]["regimen_fiscal_sat"]
            | null
          rfc: string | null
          telefono: string | null
          tenant_id: string
          tipo_fiscal: Database["public"]["Enums"]["cliente_tipo_fiscal"]
          updated_at: string
          updated_by: string | null
          uso_cfdi_default: Database["public"]["Enums"]["uso_cfdi"] | null
        }
        Insert: {
          apellido_materno?: string | null
          apellido_paterno?: string | null
          bloqueado_por?: string | null
          codigo_cliente?: string | null
          codigo_postal_fiscal?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          email?: string | null
          estado?: Database["public"]["Enums"]["cliente_estado"]
          fecha_bloqueo?: string | null
          id?: string
          motivo_bloqueo?: string | null
          nombre: string
          nombre_completo_busqueda?: string | null
          notas_internas?: string | null
          razon_social?: string | null
          regimen_fiscal?:
            | Database["public"]["Enums"]["regimen_fiscal_sat"]
            | null
          rfc?: string | null
          telefono?: string | null
          tenant_id: string
          tipo_fiscal?: Database["public"]["Enums"]["cliente_tipo_fiscal"]
          updated_at?: string
          updated_by?: string | null
          uso_cfdi_default?: Database["public"]["Enums"]["uso_cfdi"] | null
        }
        Update: {
          apellido_materno?: string | null
          apellido_paterno?: string | null
          bloqueado_por?: string | null
          codigo_cliente?: string | null
          codigo_postal_fiscal?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          email?: string | null
          estado?: Database["public"]["Enums"]["cliente_estado"]
          fecha_bloqueo?: string | null
          id?: string
          motivo_bloqueo?: string | null
          nombre?: string
          nombre_completo_busqueda?: string | null
          notas_internas?: string | null
          razon_social?: string | null
          regimen_fiscal?:
            | Database["public"]["Enums"]["regimen_fiscal_sat"]
            | null
          rfc?: string | null
          telefono?: string | null
          tenant_id?: string
          tipo_fiscal?: Database["public"]["Enums"]["cliente_tipo_fiscal"]
          updated_at?: string
          updated_by?: string | null
          uso_cfdi_default?: Database["public"]["Enums"]["uso_cfdi"] | null
        }
        Relationships: [
          {
            foreignKeyName: "clientes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      comanda_impresiones: {
        Row: {
          area_cocina_id: string
          area_cocina_nombre_snapshot: string
          autorizacion_pin_id: string | null
          created_at: string
          created_by: string | null
          error_detalle: string | null
          evento_tipo: Database["public"]["Enums"]["comanda_evento_tipo"]
          fecha_impresion: string
          id: string
          impresora_identificador: string | null
          items_incluidos_snapshot: Json
          razon_reimpresion: string | null
          resultado: Database["public"]["Enums"]["comanda_resultado"]
          sucursal_id: string
          tenant_id: string
          ticket_id: string
          usuario_id: string
        }
        Insert: {
          area_cocina_id: string
          area_cocina_nombre_snapshot: string
          autorizacion_pin_id?: string | null
          created_at?: string
          created_by?: string | null
          error_detalle?: string | null
          evento_tipo: Database["public"]["Enums"]["comanda_evento_tipo"]
          fecha_impresion?: string
          id?: string
          impresora_identificador?: string | null
          items_incluidos_snapshot?: Json
          razon_reimpresion?: string | null
          resultado?: Database["public"]["Enums"]["comanda_resultado"]
          sucursal_id: string
          tenant_id: string
          ticket_id: string
          usuario_id: string
        }
        Update: {
          area_cocina_id?: string
          area_cocina_nombre_snapshot?: string
          autorizacion_pin_id?: string | null
          created_at?: string
          created_by?: string | null
          error_detalle?: string | null
          evento_tipo?: Database["public"]["Enums"]["comanda_evento_tipo"]
          fecha_impresion?: string
          id?: string
          impresora_identificador?: string | null
          items_incluidos_snapshot?: Json
          razon_reimpresion?: string | null
          resultado?: Database["public"]["Enums"]["comanda_resultado"]
          sucursal_id?: string
          tenant_id?: string
          ticket_id?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comanda_impresiones_area_cocina_id_fkey"
            columns: ["area_cocina_id"]
            isOneToOne: false
            referencedRelation: "areas_cocina"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comanda_impresiones_autorizacion_pin_id_fkey"
            columns: ["autorizacion_pin_id"]
            isOneToOne: false
            referencedRelation: "autorizaciones_pin"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comanda_impresiones_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comanda_impresiones_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comanda_impresiones_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comanda_impresiones_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "vw_cumplimiento_tiempos_cocina"
            referencedColumns: ["ticket_id"]
          },
          {
            foreignKeyName: "comanda_impresiones_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "vw_ventas_apps_externas"
            referencedColumns: ["ticket_id"]
          },
        ]
      }
      configuracion_sucursal: {
        Row: {
          created_at: string
          fondo_estandar_mxn: number | null
          fondo_modo_captura: string | null
          id: string
          modo_servicio_default: string | null
          modos_servicio_activos: string[] | null
          notas_internas: string | null
          pie_ticket: string | null
          politica_cobro_cocina: string | null
          sucursal_id: string
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          fondo_estandar_mxn?: number | null
          fondo_modo_captura?: string | null
          id?: string
          modo_servicio_default?: string | null
          modos_servicio_activos?: string[] | null
          notas_internas?: string | null
          pie_ticket?: string | null
          politica_cobro_cocina?: string | null
          sucursal_id: string
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          fondo_estandar_mxn?: number | null
          fondo_modo_captura?: string | null
          id?: string
          modo_servicio_default?: string | null
          modos_servicio_activos?: string[] | null
          notas_internas?: string | null
          pie_ticket?: string | null
          politica_cobro_cocina?: string | null
          sucursal_id?: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "configuracion_sucursal_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: true
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "configuracion_sucursal_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      configuracion_tenant: {
        Row: {
          alerta_pedidos_espera_min: number
          alerta_reincidencia_cierres: number
          alerta_reincidencia_dias: number
          cfdi_folio_inicial: number | null
          cfdi_serie_default: string | null
          created_at: string
          csd_archivo_encrypted: string | null
          csd_password_encrypted: string | null
          fondo_estandar_mxn: number | null
          fondo_minimo_mxn: number
          fondo_modo_captura: string
          id: string
          modo_servicio_default: string
          modos_servicio_activos: string[]
          modulo_apps_externas_activo: boolean
          modulo_cfdi_activo: boolean
          modulo_crm_avanzado_activo: boolean
          modulo_delivery_propio_activo: boolean
          modulo_display_cliente_activo: boolean
          modulo_inventario_activo: boolean
          mostrar_nota_producto_ticket: boolean
          pac_credenciales_encrypted: string | null
          pac_proveedor: string | null
          pie_ticket: string | null
          politica_cobro_cocina: string
          propina_permite_otro_monto: boolean
          propina_porcentajes: number[]
          propina_sugerida_activa: boolean
          redondeo_efectivo_activo: boolean
          reimpresion_comanda_requiere_pin: boolean
          reimpresion_ticket_requiere_pin: boolean
          tenant_id: string
          umbral_sangria_sin_pin_mxn: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          alerta_pedidos_espera_min?: number
          alerta_reincidencia_cierres?: number
          alerta_reincidencia_dias?: number
          cfdi_folio_inicial?: number | null
          cfdi_serie_default?: string | null
          created_at?: string
          csd_archivo_encrypted?: string | null
          csd_password_encrypted?: string | null
          fondo_estandar_mxn?: number | null
          fondo_minimo_mxn?: number
          fondo_modo_captura?: string
          id?: string
          modo_servicio_default?: string
          modos_servicio_activos?: string[]
          modulo_apps_externas_activo?: boolean
          modulo_cfdi_activo?: boolean
          modulo_crm_avanzado_activo?: boolean
          modulo_delivery_propio_activo?: boolean
          modulo_display_cliente_activo?: boolean
          modulo_inventario_activo?: boolean
          mostrar_nota_producto_ticket?: boolean
          pac_credenciales_encrypted?: string | null
          pac_proveedor?: string | null
          pie_ticket?: string | null
          politica_cobro_cocina?: string
          propina_permite_otro_monto?: boolean
          propina_porcentajes?: number[]
          propina_sugerida_activa?: boolean
          redondeo_efectivo_activo?: boolean
          reimpresion_comanda_requiere_pin?: boolean
          reimpresion_ticket_requiere_pin?: boolean
          tenant_id: string
          umbral_sangria_sin_pin_mxn?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          alerta_pedidos_espera_min?: number
          alerta_reincidencia_cierres?: number
          alerta_reincidencia_dias?: number
          cfdi_folio_inicial?: number | null
          cfdi_serie_default?: string | null
          created_at?: string
          csd_archivo_encrypted?: string | null
          csd_password_encrypted?: string | null
          fondo_estandar_mxn?: number | null
          fondo_minimo_mxn?: number
          fondo_modo_captura?: string
          id?: string
          modo_servicio_default?: string
          modos_servicio_activos?: string[]
          modulo_apps_externas_activo?: boolean
          modulo_cfdi_activo?: boolean
          modulo_crm_avanzado_activo?: boolean
          modulo_delivery_propio_activo?: boolean
          modulo_display_cliente_activo?: boolean
          modulo_inventario_activo?: boolean
          mostrar_nota_producto_ticket?: boolean
          pac_credenciales_encrypted?: string | null
          pac_proveedor?: string | null
          pie_ticket?: string | null
          politica_cobro_cocina?: string
          propina_permite_otro_monto?: boolean
          propina_porcentajes?: number[]
          propina_sugerida_activa?: boolean
          redondeo_efectivo_activo?: boolean
          reimpresion_comanda_requiere_pin?: boolean
          reimpresion_ticket_requiere_pin?: boolean
          tenant_id?: string
          umbral_sangria_sin_pin_mxn?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "configuracion_tenant_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      contadores_folio: {
        Row: {
          anio: number
          created_at: string
          id: string
          sucursal_id: string
          tenant_id: string
          tipo_documento: string
          ultimo_consecutivo: number
          updated_at: string
        }
        Insert: {
          anio: number
          created_at?: string
          id?: string
          sucursal_id: string
          tenant_id: string
          tipo_documento?: string
          ultimo_consecutivo?: number
          updated_at?: string
        }
        Update: {
          anio?: number
          created_at?: string
          id?: string
          sucursal_id?: string
          tenant_id?: string
          tipo_documento?: string
          ultimo_consecutivo?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contadores_folio_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contadores_folio_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      conversiones_unidades: {
        Row: {
          created_at: string
          es_sistema: boolean
          factor: number
          id: string
          tenant_id: string | null
          unidad_destino_id: string
          unidad_origen_id: string
        }
        Insert: {
          created_at?: string
          es_sistema?: boolean
          factor: number
          id?: string
          tenant_id?: string | null
          unidad_destino_id: string
          unidad_origen_id: string
        }
        Update: {
          created_at?: string
          es_sistema?: boolean
          factor?: number
          id?: string
          tenant_id?: string | null
          unidad_destino_id?: string
          unidad_origen_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversiones_unidades_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversiones_unidades_unidad_destino_id_fkey"
            columns: ["unidad_destino_id"]
            isOneToOne: false
            referencedRelation: "unidades_medida"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversiones_unidades_unidad_origen_id_fkey"
            columns: ["unidad_origen_id"]
            isOneToOne: false
            referencedRelation: "unidades_medida"
            referencedColumns: ["id"]
          },
        ]
      }
      cortes_caja: {
        Row: {
          autorizacion_pin_id: string | null
          caja_id: string
          created_at: string
          created_by: string | null
          diferencia_mxn: number
          fecha_corte: string
          id: string
          motivo: string | null
          sucursal_id: string
          tenant_id: string
          total_declarado_mxn: number
          total_esperado_mxn: number
          turno_id: string
          updated_at: string
          updated_by: string | null
          usuario_id: string
        }
        Insert: {
          autorizacion_pin_id?: string | null
          caja_id: string
          created_at?: string
          created_by?: string | null
          diferencia_mxn?: number
          fecha_corte?: string
          id?: string
          motivo?: string | null
          sucursal_id: string
          tenant_id: string
          total_declarado_mxn?: number
          total_esperado_mxn?: number
          turno_id: string
          updated_at?: string
          updated_by?: string | null
          usuario_id: string
        }
        Update: {
          autorizacion_pin_id?: string | null
          caja_id?: string
          created_at?: string
          created_by?: string | null
          diferencia_mxn?: number
          fecha_corte?: string
          id?: string
          motivo?: string | null
          sucursal_id?: string
          tenant_id?: string
          total_declarado_mxn?: number
          total_esperado_mxn?: number
          turno_id?: string
          updated_at?: string
          updated_by?: string | null
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cortes_caja_autorizacion_pin_id_fkey"
            columns: ["autorizacion_pin_id"]
            isOneToOne: false
            referencedRelation: "autorizaciones_pin"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cortes_caja_caja_id_fkey"
            columns: ["caja_id"]
            isOneToOne: false
            referencedRelation: "cajas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cortes_caja_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cortes_caja_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cortes_caja_turno_id_fkey"
            columns: ["turno_id"]
            isOneToOne: false
            referencedRelation: "turnos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cortes_caja_turno_id_fkey"
            columns: ["turno_id"]
            isOneToOne: false
            referencedRelation: "vw_efectivo_esperado_turno"
            referencedColumns: ["turno_id"]
          },
          {
            foreignKeyName: "cortes_caja_turno_id_fkey"
            columns: ["turno_id"]
            isOneToOne: false
            referencedRelation: "vw_resumen_turno"
            referencedColumns: ["turno_id"]
          },
        ]
      }
      cortes_caja_detalle: {
        Row: {
          cantidad_transacciones: number
          corte_caja_id: string
          created_at: string
          created_by: string | null
          diferencia_mxn: number
          id: string
          metodo_pago: Database["public"]["Enums"]["metodo_pago"]
          monto_declarado_mxn: number
          monto_esperado_mxn: number
          nota: string | null
          tenant_id: string
        }
        Insert: {
          cantidad_transacciones?: number
          corte_caja_id: string
          created_at?: string
          created_by?: string | null
          diferencia_mxn: number
          id?: string
          metodo_pago: Database["public"]["Enums"]["metodo_pago"]
          monto_declarado_mxn: number
          monto_esperado_mxn: number
          nota?: string | null
          tenant_id: string
        }
        Update: {
          cantidad_transacciones?: number
          corte_caja_id?: string
          created_at?: string
          created_by?: string | null
          diferencia_mxn?: number
          id?: string
          metodo_pago?: Database["public"]["Enums"]["metodo_pago"]
          monto_declarado_mxn?: number
          monto_esperado_mxn?: number
          nota?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cortes_caja_detalle_corte_caja_id_fkey"
            columns: ["corte_caja_id"]
            isOneToOne: false
            referencedRelation: "cortes_caja"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cortes_caja_detalle_corte_caja_id_fkey"
            columns: ["corte_caja_id"]
            isOneToOne: false
            referencedRelation: "vw_resumen_corte_caja"
            referencedColumns: ["corte_id"]
          },
          {
            foreignKeyName: "cortes_caja_detalle_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      cortes_parciales: {
        Row: {
          created_at: string
          diferencia_mxn: number
          efectivo_contado_mxn: number
          efectivo_esperado_mxn: number
          fecha: string
          id: string
          notas: string | null
          tenant_id: string
          tickets_count: number
          turno_id: string
          usuario_id: string
          ventas_efectivo_mxn: number
          ventas_tarjeta_mxn: number
          ventas_transferencia_mxn: number
          ventas_vales_mxn: number
        }
        Insert: {
          created_at?: string
          diferencia_mxn: number
          efectivo_contado_mxn: number
          efectivo_esperado_mxn: number
          fecha?: string
          id?: string
          notas?: string | null
          tenant_id: string
          tickets_count?: number
          turno_id: string
          usuario_id: string
          ventas_efectivo_mxn?: number
          ventas_tarjeta_mxn?: number
          ventas_transferencia_mxn?: number
          ventas_vales_mxn?: number
        }
        Update: {
          created_at?: string
          diferencia_mxn?: number
          efectivo_contado_mxn?: number
          efectivo_esperado_mxn?: number
          fecha?: string
          id?: string
          notas?: string | null
          tenant_id?: string
          tickets_count?: number
          turno_id?: string
          usuario_id?: string
          ventas_efectivo_mxn?: number
          ventas_tarjeta_mxn?: number
          ventas_transferencia_mxn?: number
          ventas_vales_mxn?: number
        }
        Relationships: [
          {
            foreignKeyName: "cortes_parciales_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cortes_parciales_turno_id_fkey"
            columns: ["turno_id"]
            isOneToOne: false
            referencedRelation: "turnos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cortes_parciales_turno_id_fkey"
            columns: ["turno_id"]
            isOneToOne: false
            referencedRelation: "vw_efectivo_esperado_turno"
            referencedColumns: ["turno_id"]
          },
          {
            foreignKeyName: "cortes_parciales_turno_id_fkey"
            columns: ["turno_id"]
            isOneToOne: false
            referencedRelation: "vw_resumen_turno"
            referencedColumns: ["turno_id"]
          },
        ]
      }
      cuentas_abiertas: {
        Row: {
          caja_id: string
          client_id_local: string | null
          cliente_id: string | null
          created_at: string
          created_by: string | null
          estado: Database["public"]["Enums"]["cuenta_abierta_estado"]
          fecha_apertura: string
          fecha_cierre: string | null
          folio_completo: string
          folio_consecutivo: number
          id: string
          mesero_id: string | null
          nombre_cuenta: string
          nota: string | null
          sucursal_id: string
          tenant_id: string
          ticket_principal_id: string | null
          turno_id: string
          updated_at: string
          updated_by: string | null
          usuario_apertura_id: string
        }
        Insert: {
          caja_id: string
          client_id_local?: string | null
          cliente_id?: string | null
          created_at?: string
          created_by?: string | null
          estado?: Database["public"]["Enums"]["cuenta_abierta_estado"]
          fecha_apertura?: string
          fecha_cierre?: string | null
          folio_completo: string
          folio_consecutivo: number
          id?: string
          mesero_id?: string | null
          nombre_cuenta: string
          nota?: string | null
          sucursal_id: string
          tenant_id: string
          ticket_principal_id?: string | null
          turno_id: string
          updated_at?: string
          updated_by?: string | null
          usuario_apertura_id: string
        }
        Update: {
          caja_id?: string
          client_id_local?: string | null
          cliente_id?: string | null
          created_at?: string
          created_by?: string | null
          estado?: Database["public"]["Enums"]["cuenta_abierta_estado"]
          fecha_apertura?: string
          fecha_cierre?: string | null
          folio_completo?: string
          folio_consecutivo?: number
          id?: string
          mesero_id?: string | null
          nombre_cuenta?: string
          nota?: string | null
          sucursal_id?: string
          tenant_id?: string
          ticket_principal_id?: string | null
          turno_id?: string
          updated_at?: string
          updated_by?: string | null
          usuario_apertura_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cuentas_abiertas_caja_id_fkey"
            columns: ["caja_id"]
            isOneToOne: false
            referencedRelation: "cajas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cuentas_abiertas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cuentas_abiertas_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cuentas_abiertas_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cuentas_abiertas_turno_id_fkey"
            columns: ["turno_id"]
            isOneToOne: false
            referencedRelation: "turnos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cuentas_abiertas_turno_id_fkey"
            columns: ["turno_id"]
            isOneToOne: false
            referencedRelation: "vw_efectivo_esperado_turno"
            referencedColumns: ["turno_id"]
          },
          {
            foreignKeyName: "cuentas_abiertas_turno_id_fkey"
            columns: ["turno_id"]
            isOneToOne: false
            referencedRelation: "vw_resumen_turno"
            referencedColumns: ["turno_id"]
          },
          {
            foreignKeyName: "fk_cuentas_ticket_principal"
            columns: ["ticket_principal_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_cuentas_ticket_principal"
            columns: ["ticket_principal_id"]
            isOneToOne: false
            referencedRelation: "vw_cumplimiento_tiempos_cocina"
            referencedColumns: ["ticket_id"]
          },
          {
            foreignKeyName: "fk_cuentas_ticket_principal"
            columns: ["ticket_principal_id"]
            isOneToOne: false
            referencedRelation: "vw_ventas_apps_externas"
            referencedColumns: ["ticket_id"]
          },
        ]
      }
      delivery_asignaciones: {
        Row: {
          client_id_local: string | null
          created_at: string
          created_by: string | null
          destino_lat: number | null
          destino_lng: number | null
          diferencia_mxn: number | null
          distancia_km_estimada: number | null
          distancia_km_real: number | null
          estado: Database["public"]["Enums"]["delivery_estado"]
          fecha_asignacion: string
          fecha_destino: string | null
          fecha_entrega: string | null
          fecha_liquidacion: string | null
          fecha_no_entrega: string | null
          fecha_regreso: string | null
          fecha_salida: string | null
          id: string
          liquidacion_nota: string | null
          liquidado_por_id: string | null
          monto_a_liquidar_mxn: number
          monto_efectivo_entregado_mxn: number | null
          monto_tarjeta_aprobado_mxn: number | null
          no_entrega_motivo:
            | Database["public"]["Enums"]["delivery_no_entrega_motivo"]
            | null
          no_entrega_nota: string | null
          propina_repartidor_mxn: number
          repartidor_id: string
          sucursal_id: string
          tenant_id: string
          ticket_id: string
          tiempo_promesa_minutos: number | null
          tiempo_real_minutos: number | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          client_id_local?: string | null
          created_at?: string
          created_by?: string | null
          destino_lat?: number | null
          destino_lng?: number | null
          diferencia_mxn?: number | null
          distancia_km_estimada?: number | null
          distancia_km_real?: number | null
          estado?: Database["public"]["Enums"]["delivery_estado"]
          fecha_asignacion?: string
          fecha_destino?: string | null
          fecha_entrega?: string | null
          fecha_liquidacion?: string | null
          fecha_no_entrega?: string | null
          fecha_regreso?: string | null
          fecha_salida?: string | null
          id?: string
          liquidacion_nota?: string | null
          liquidado_por_id?: string | null
          monto_a_liquidar_mxn?: number
          monto_efectivo_entregado_mxn?: number | null
          monto_tarjeta_aprobado_mxn?: number | null
          no_entrega_motivo?:
            | Database["public"]["Enums"]["delivery_no_entrega_motivo"]
            | null
          no_entrega_nota?: string | null
          propina_repartidor_mxn?: number
          repartidor_id: string
          sucursal_id: string
          tenant_id: string
          ticket_id: string
          tiempo_promesa_minutos?: number | null
          tiempo_real_minutos?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          client_id_local?: string | null
          created_at?: string
          created_by?: string | null
          destino_lat?: number | null
          destino_lng?: number | null
          diferencia_mxn?: number | null
          distancia_km_estimada?: number | null
          distancia_km_real?: number | null
          estado?: Database["public"]["Enums"]["delivery_estado"]
          fecha_asignacion?: string
          fecha_destino?: string | null
          fecha_entrega?: string | null
          fecha_liquidacion?: string | null
          fecha_no_entrega?: string | null
          fecha_regreso?: string | null
          fecha_salida?: string | null
          id?: string
          liquidacion_nota?: string | null
          liquidado_por_id?: string | null
          monto_a_liquidar_mxn?: number
          monto_efectivo_entregado_mxn?: number | null
          monto_tarjeta_aprobado_mxn?: number | null
          no_entrega_motivo?:
            | Database["public"]["Enums"]["delivery_no_entrega_motivo"]
            | null
          no_entrega_nota?: string | null
          propina_repartidor_mxn?: number
          repartidor_id?: string
          sucursal_id?: string
          tenant_id?: string
          ticket_id?: string
          tiempo_promesa_minutos?: number | null
          tiempo_real_minutos?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "delivery_asignaciones_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_asignaciones_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_asignaciones_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_asignaciones_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "vw_cumplimiento_tiempos_cocina"
            referencedColumns: ["ticket_id"]
          },
          {
            foreignKeyName: "delivery_asignaciones_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "vw_ventas_apps_externas"
            referencedColumns: ["ticket_id"]
          },
        ]
      }
      denominaciones_conteo: {
        Row: {
          cantidad: number
          corte_parcial_id: string | null
          created_at: string
          denominacion_mxn: number
          id: string
          subtotal_mxn: number | null
          tenant_id: string
          tipo: string
          tipo_conteo: string
          turno_id: string
        }
        Insert: {
          cantidad: number
          corte_parcial_id?: string | null
          created_at?: string
          denominacion_mxn: number
          id?: string
          subtotal_mxn?: number | null
          tenant_id: string
          tipo: string
          tipo_conteo: string
          turno_id: string
        }
        Update: {
          cantidad?: number
          corte_parcial_id?: string | null
          created_at?: string
          denominacion_mxn?: number
          id?: string
          subtotal_mxn?: number | null
          tenant_id?: string
          tipo?: string
          tipo_conteo?: string
          turno_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "denominaciones_conteo_corte_parcial_id_fkey"
            columns: ["corte_parcial_id"]
            isOneToOne: false
            referencedRelation: "cortes_parciales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "denominaciones_conteo_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "denominaciones_conteo_turno_id_fkey"
            columns: ["turno_id"]
            isOneToOne: false
            referencedRelation: "turnos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "denominaciones_conteo_turno_id_fkey"
            columns: ["turno_id"]
            isOneToOne: false
            referencedRelation: "vw_efectivo_esperado_turno"
            referencedColumns: ["turno_id"]
          },
          {
            foreignKeyName: "denominaciones_conteo_turno_id_fkey"
            columns: ["turno_id"]
            isOneToOne: false
            referencedRelation: "vw_resumen_turno"
            referencedColumns: ["turno_id"]
          },
        ]
      }
      denominaciones_fondo: {
        Row: {
          cantidad: number
          created_at: string
          denominacion_mxn: number
          id: string
          subtotal_mxn: number | null
          tenant_id: string
          tipo: string
          turno_id: string
        }
        Insert: {
          cantidad: number
          created_at?: string
          denominacion_mxn: number
          id?: string
          subtotal_mxn?: number | null
          tenant_id: string
          tipo: string
          turno_id: string
        }
        Update: {
          cantidad?: number
          created_at?: string
          denominacion_mxn?: number
          id?: string
          subtotal_mxn?: number | null
          tenant_id?: string
          tipo?: string
          turno_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "denominaciones_fondo_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "denominaciones_fondo_turno_id_fkey"
            columns: ["turno_id"]
            isOneToOne: false
            referencedRelation: "turnos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "denominaciones_fondo_turno_id_fkey"
            columns: ["turno_id"]
            isOneToOne: false
            referencedRelation: "vw_efectivo_esperado_turno"
            referencedColumns: ["turno_id"]
          },
          {
            foreignKeyName: "denominaciones_fondo_turno_id_fkey"
            columns: ["turno_id"]
            isOneToOne: false
            referencedRelation: "vw_resumen_turno"
            referencedColumns: ["turno_id"]
          },
        ]
      }
      devolucion_items: {
        Row: {
          cantidad_devuelta: number
          cantidad_original: number
          client_id_local: string | null
          created_at: string
          created_by: string | null
          devolucion_id: string
          id: string
          iva_devuelto_mxn: number
          iva_incluido_en_precio_snapshot: boolean
          motivo_item: Database["public"]["Enums"]["devolucion_motivo"] | null
          nota_item: string | null
          precio_unitario_snapshot: number
          producto_id: string | null
          producto_nombre_snapshot: string
          producto_sku_snapshot: string | null
          reversar_inventario_item: boolean
          subtotal_devuelto_mxn: number
          tasa_iva_snapshot: number
          tenant_id: string
          ticket_item_id_original: string
          total_devuelto_mxn: number
        }
        Insert: {
          cantidad_devuelta: number
          cantidad_original: number
          client_id_local?: string | null
          created_at?: string
          created_by?: string | null
          devolucion_id: string
          id?: string
          iva_devuelto_mxn: number
          iva_incluido_en_precio_snapshot: boolean
          motivo_item?: Database["public"]["Enums"]["devolucion_motivo"] | null
          nota_item?: string | null
          precio_unitario_snapshot: number
          producto_id?: string | null
          producto_nombre_snapshot: string
          producto_sku_snapshot?: string | null
          reversar_inventario_item?: boolean
          subtotal_devuelto_mxn: number
          tasa_iva_snapshot: number
          tenant_id: string
          ticket_item_id_original: string
          total_devuelto_mxn: number
        }
        Update: {
          cantidad_devuelta?: number
          cantidad_original?: number
          client_id_local?: string | null
          created_at?: string
          created_by?: string | null
          devolucion_id?: string
          id?: string
          iva_devuelto_mxn?: number
          iva_incluido_en_precio_snapshot?: boolean
          motivo_item?: Database["public"]["Enums"]["devolucion_motivo"] | null
          nota_item?: string | null
          precio_unitario_snapshot?: number
          producto_id?: string | null
          producto_nombre_snapshot?: string
          producto_sku_snapshot?: string | null
          reversar_inventario_item?: boolean
          subtotal_devuelto_mxn?: number
          tasa_iva_snapshot?: number
          tenant_id?: string
          ticket_item_id_original?: string
          total_devuelto_mxn?: number
        }
        Relationships: [
          {
            foreignKeyName: "devolucion_items_devolucion_id_fkey"
            columns: ["devolucion_id"]
            isOneToOne: false
            referencedRelation: "devoluciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "devolucion_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "devolucion_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "devolucion_items_ticket_item_id_original_fkey"
            columns: ["ticket_item_id_original"]
            isOneToOne: false
            referencedRelation: "ticket_items"
            referencedColumns: ["id"]
          },
        ]
      }
      devoluciones: {
        Row: {
          alcance: Database["public"]["Enums"]["devolucion_alcance"]
          autorizacion_pin_id: string
          caja_id: string
          cfdi_nota_credito_id: string | null
          client_id_local: string | null
          cliente_id: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          dia_contable: string
          estado: string
          fecha_devolucion: string
          folio_completo: string
          folio_consecutivo: number
          id: string
          inventario_reversado_at: string | null
          iva_devuelto_mxn: number
          medio_devolucion: Database["public"]["Enums"]["devolucion_medio"]
          motivo: Database["public"]["Enums"]["devolucion_motivo"]
          motivo_texto: string | null
          nota: string | null
          reversar_inventario: boolean
          subtotal_devuelto_mxn: number
          sucursal_id: string
          tenant_id: string
          ticket_dia_contable_snapshot: string
          ticket_folio_snapshot: string
          ticket_original_id: string
          total_devuelto_mxn: number
          turno_id: string
          updated_at: string
          updated_by: string | null
          usuario_autorizo_id: string
          usuario_solicitante_id: string
        }
        Insert: {
          alcance: Database["public"]["Enums"]["devolucion_alcance"]
          autorizacion_pin_id: string
          caja_id: string
          cfdi_nota_credito_id?: string | null
          client_id_local?: string | null
          cliente_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          dia_contable: string
          estado?: string
          fecha_devolucion?: string
          folio_completo: string
          folio_consecutivo: number
          id?: string
          inventario_reversado_at?: string | null
          iva_devuelto_mxn?: number
          medio_devolucion: Database["public"]["Enums"]["devolucion_medio"]
          motivo: Database["public"]["Enums"]["devolucion_motivo"]
          motivo_texto?: string | null
          nota?: string | null
          reversar_inventario?: boolean
          subtotal_devuelto_mxn?: number
          sucursal_id: string
          tenant_id: string
          ticket_dia_contable_snapshot: string
          ticket_folio_snapshot: string
          ticket_original_id: string
          total_devuelto_mxn: number
          turno_id: string
          updated_at?: string
          updated_by?: string | null
          usuario_autorizo_id: string
          usuario_solicitante_id: string
        }
        Update: {
          alcance?: Database["public"]["Enums"]["devolucion_alcance"]
          autorizacion_pin_id?: string
          caja_id?: string
          cfdi_nota_credito_id?: string | null
          client_id_local?: string | null
          cliente_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          dia_contable?: string
          estado?: string
          fecha_devolucion?: string
          folio_completo?: string
          folio_consecutivo?: number
          id?: string
          inventario_reversado_at?: string | null
          iva_devuelto_mxn?: number
          medio_devolucion?: Database["public"]["Enums"]["devolucion_medio"]
          motivo?: Database["public"]["Enums"]["devolucion_motivo"]
          motivo_texto?: string | null
          nota?: string | null
          reversar_inventario?: boolean
          subtotal_devuelto_mxn?: number
          sucursal_id?: string
          tenant_id?: string
          ticket_dia_contable_snapshot?: string
          ticket_folio_snapshot?: string
          ticket_original_id?: string
          total_devuelto_mxn?: number
          turno_id?: string
          updated_at?: string
          updated_by?: string | null
          usuario_autorizo_id?: string
          usuario_solicitante_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "devoluciones_autorizacion_pin_id_fkey"
            columns: ["autorizacion_pin_id"]
            isOneToOne: false
            referencedRelation: "autorizaciones_pin"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "devoluciones_caja_id_fkey"
            columns: ["caja_id"]
            isOneToOne: false
            referencedRelation: "cajas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "devoluciones_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "devoluciones_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "devoluciones_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "devoluciones_ticket_original_id_fkey"
            columns: ["ticket_original_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "devoluciones_ticket_original_id_fkey"
            columns: ["ticket_original_id"]
            isOneToOne: false
            referencedRelation: "vw_cumplimiento_tiempos_cocina"
            referencedColumns: ["ticket_id"]
          },
          {
            foreignKeyName: "devoluciones_ticket_original_id_fkey"
            columns: ["ticket_original_id"]
            isOneToOne: false
            referencedRelation: "vw_ventas_apps_externas"
            referencedColumns: ["ticket_id"]
          },
          {
            foreignKeyName: "devoluciones_turno_id_fkey"
            columns: ["turno_id"]
            isOneToOne: false
            referencedRelation: "turnos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "devoluciones_turno_id_fkey"
            columns: ["turno_id"]
            isOneToOne: false
            referencedRelation: "vw_efectivo_esperado_turno"
            referencedColumns: ["turno_id"]
          },
          {
            foreignKeyName: "devoluciones_turno_id_fkey"
            columns: ["turno_id"]
            isOneToOne: false
            referencedRelation: "vw_resumen_turno"
            referencedColumns: ["turno_id"]
          },
          {
            foreignKeyName: "fk_devoluciones_cfdi_nota_credito"
            columns: ["cfdi_nota_credito_id"]
            isOneToOne: false
            referencedRelation: "tickets_cfdi"
            referencedColumns: ["id"]
          },
        ]
      }
      direcciones_cliente: {
        Row: {
          activa: boolean
          calle: string
          ciudad: string
          cliente_id: string
          codigo_postal: string
          colonia: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          es_principal: boolean
          estado_geo: string
          etiqueta: string
          geo_lat: number | null
          geo_lng: number | null
          id: string
          notas_repartidor: string | null
          numero_exterior: string
          numero_interior: string | null
          pais: string
          referencias: string | null
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          activa?: boolean
          calle: string
          ciudad: string
          cliente_id: string
          codigo_postal: string
          colonia: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          es_principal?: boolean
          estado_geo: string
          etiqueta?: string
          geo_lat?: number | null
          geo_lng?: number | null
          id?: string
          notas_repartidor?: string | null
          numero_exterior: string
          numero_interior?: string | null
          pais?: string
          referencias?: string | null
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          activa?: boolean
          calle?: string
          ciudad?: string
          cliente_id?: string
          codigo_postal?: string
          colonia?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          es_principal?: boolean
          estado_geo?: string
          etiqueta?: string
          geo_lat?: number | null
          geo_lng?: number | null
          id?: string
          notas_repartidor?: string | null
          numero_exterior?: string
          numero_interior?: string | null
          pais?: string
          referencias?: string | null
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "direcciones_cliente_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "direcciones_cliente_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      folios_movimientos: {
        Row: {
          cantidad: number
          cfdi_id: string | null
          created_at: string
          created_by: string | null
          dia_contable: string
          id: string
          paquete_id: string | null
          precio_pagado_mxn: number | null
          saldo_paquetes_resultante: number
          tenant_id: string
          tipo: Database["public"]["Enums"]["folio_movimiento_tipo"]
        }
        Insert: {
          cantidad: number
          cfdi_id?: string | null
          created_at?: string
          created_by?: string | null
          dia_contable: string
          id?: string
          paquete_id?: string | null
          precio_pagado_mxn?: number | null
          saldo_paquetes_resultante: number
          tenant_id: string
          tipo: Database["public"]["Enums"]["folio_movimiento_tipo"]
        }
        Update: {
          cantidad?: number
          cfdi_id?: string | null
          created_at?: string
          created_by?: string | null
          dia_contable?: string
          id?: string
          paquete_id?: string | null
          precio_pagado_mxn?: number | null
          saldo_paquetes_resultante?: number
          tenant_id?: string
          tipo?: Database["public"]["Enums"]["folio_movimiento_tipo"]
        }
        Relationships: [
          {
            foreignKeyName: "folios_movimientos_paquete_id_fkey"
            columns: ["paquete_id"]
            isOneToOne: false
            referencedRelation: "folios_paquetes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "folios_movimientos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      folios_paquetes: {
        Row: {
          activo: boolean
          cantidad_folios: number
          codigo: string
          created_at: string
          id: string
          nombre: string
          orden_visualizacion: number
          precio_mxn: number
          precio_por_folio: number
          updated_at: string
          visible_publico: boolean
        }
        Insert: {
          activo?: boolean
          cantidad_folios: number
          codigo: string
          created_at?: string
          id?: string
          nombre: string
          orden_visualizacion?: number
          precio_mxn: number
          precio_por_folio: number
          updated_at?: string
          visible_publico?: boolean
        }
        Update: {
          activo?: boolean
          cantidad_folios?: number
          codigo?: string
          created_at?: string
          id?: string
          nombre?: string
          orden_visualizacion?: number
          precio_mxn?: number
          precio_por_folio?: number
          updated_at?: string
          visible_publico?: boolean
        }
        Relationships: []
      }
      grupos_modificadores: {
        Row: {
          activo: boolean
          codigo_interno: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          descripcion: string | null
          id: string
          maximo_selecciones: number | null
          minimo_selecciones: number | null
          naturaleza: Database["public"]["Enums"]["modificador_naturaleza"]
          nombre: string
          orden_visualizacion: number
          tenant_id: string
          tipo_seleccion: Database["public"]["Enums"]["modificador_tipo_seleccion"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          activo?: boolean
          codigo_interno?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          descripcion?: string | null
          id?: string
          maximo_selecciones?: number | null
          minimo_selecciones?: number | null
          naturaleza?: Database["public"]["Enums"]["modificador_naturaleza"]
          nombre: string
          orden_visualizacion?: number
          tenant_id: string
          tipo_seleccion: Database["public"]["Enums"]["modificador_tipo_seleccion"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          activo?: boolean
          codigo_interno?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          descripcion?: string | null
          id?: string
          maximo_selecciones?: number | null
          minimo_selecciones?: number | null
          naturaleza?: Database["public"]["Enums"]["modificador_naturaleza"]
          nombre?: string
          orden_visualizacion?: number
          tenant_id?: string
          tipo_seleccion?: Database["public"]["Enums"]["modificador_tipo_seleccion"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "grupos_modificadores_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      insumo_stock_sucursal: {
        Row: {
          alerta_actual: Database["public"]["Enums"]["alerta_severidad"] | null
          created_at: string
          fecha_ultimo_conteo_fisico: string | null
          fecha_ultimo_movimiento: string | null
          id: string
          insumo_id: string
          stock_actual: number
          stock_critico: number | null
          stock_maximo: number | null
          stock_minimo: number | null
          stock_negativo_flag: boolean
          sucursal_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          alerta_actual?: Database["public"]["Enums"]["alerta_severidad"] | null
          created_at?: string
          fecha_ultimo_conteo_fisico?: string | null
          fecha_ultimo_movimiento?: string | null
          id?: string
          insumo_id: string
          stock_actual?: number
          stock_critico?: number | null
          stock_maximo?: number | null
          stock_minimo?: number | null
          stock_negativo_flag?: boolean
          sucursal_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          alerta_actual?: Database["public"]["Enums"]["alerta_severidad"] | null
          created_at?: string
          fecha_ultimo_conteo_fisico?: string | null
          fecha_ultimo_movimiento?: string | null
          id?: string
          insumo_id?: string
          stock_actual?: number
          stock_critico?: number | null
          stock_maximo?: number | null
          stock_minimo?: number | null
          stock_negativo_flag?: boolean
          sucursal_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "insumo_stock_sucursal_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "insumos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insumo_stock_sucursal_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insumo_stock_sucursal_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      insumos: {
        Row: {
          categoria: Database["public"]["Enums"]["insumo_categoria"]
          codigo_barras: string | null
          codigo_interno: string | null
          costo_unitario_mxn: number
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          descripcion: string | null
          estado: Database["public"]["Enums"]["insumo_estado"]
          fecha_caducidad_promedio_dias: number | null
          id: string
          metodo_valuacion: Database["public"]["Enums"]["valuacion_metodo"]
          nombre: string
          notas_internas: string | null
          proveedor_preferido_texto: string | null
          stock_critico_global: number | null
          stock_maximo_global: number | null
          stock_minimo_global: number | null
          tenant_id: string
          unidad_medida_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          categoria?: Database["public"]["Enums"]["insumo_categoria"]
          codigo_barras?: string | null
          codigo_interno?: string | null
          costo_unitario_mxn?: number
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          descripcion?: string | null
          estado?: Database["public"]["Enums"]["insumo_estado"]
          fecha_caducidad_promedio_dias?: number | null
          id?: string
          metodo_valuacion?: Database["public"]["Enums"]["valuacion_metodo"]
          nombre: string
          notas_internas?: string | null
          proveedor_preferido_texto?: string | null
          stock_critico_global?: number | null
          stock_maximo_global?: number | null
          stock_minimo_global?: number | null
          tenant_id: string
          unidad_medida_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          categoria?: Database["public"]["Enums"]["insumo_categoria"]
          codigo_barras?: string | null
          codigo_interno?: string | null
          costo_unitario_mxn?: number
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          descripcion?: string | null
          estado?: Database["public"]["Enums"]["insumo_estado"]
          fecha_caducidad_promedio_dias?: number | null
          id?: string
          metodo_valuacion?: Database["public"]["Enums"]["valuacion_metodo"]
          nombre?: string
          notas_internas?: string | null
          proveedor_preferido_texto?: string | null
          stock_critico_global?: number | null
          stock_maximo_global?: number | null
          stock_minimo_global?: number | null
          tenant_id?: string
          unidad_medida_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "insumos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insumos_unidad_medida_id_fkey"
            columns: ["unidad_medida_id"]
            isOneToOne: false
            referencedRelation: "unidades_medida"
            referencedColumns: ["id"]
          },
        ]
      }
      marcas_areas_cocina: {
        Row: {
          activa: boolean
          area_cocina_id: string
          created_at: string
          created_by: string | null
          id: string
          marca_virtual_id: string
          prioridad: number
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          activa?: boolean
          area_cocina_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          marca_virtual_id: string
          prioridad?: number
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          activa?: boolean
          area_cocina_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          marca_virtual_id?: string
          prioridad?: number
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marcas_areas_cocina_area_cocina_id_fkey"
            columns: ["area_cocina_id"]
            isOneToOne: false
            referencedRelation: "areas_cocina"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marcas_areas_cocina_marca_virtual_id_fkey"
            columns: ["marca_virtual_id"]
            isOneToOne: false
            referencedRelation: "marcas_virtuales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marcas_areas_cocina_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      marcas_virtuales: {
        Row: {
          activa: boolean
          apps_externas_config: Json
          codigo: string
          color_primario_hex: string | null
          color_secundario_hex: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          descripcion: string | null
          id: string
          logo_url: string | null
          nombre: string
          orden_visualizacion: number
          razon_social: string | null
          regimen_fiscal:
            | Database["public"]["Enums"]["regimen_fiscal_sat"]
            | null
          rfc: string | null
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          activa?: boolean
          apps_externas_config?: Json
          codigo: string
          color_primario_hex?: string | null
          color_secundario_hex?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          descripcion?: string | null
          id?: string
          logo_url?: string | null
          nombre: string
          orden_visualizacion?: number
          razon_social?: string | null
          regimen_fiscal?:
            | Database["public"]["Enums"]["regimen_fiscal_sat"]
            | null
          rfc?: string | null
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          activa?: boolean
          apps_externas_config?: Json
          codigo?: string
          color_primario_hex?: string | null
          color_secundario_hex?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          descripcion?: string | null
          id?: string
          logo_url?: string | null
          nombre?: string
          orden_visualizacion?: number
          razon_social?: string | null
          regimen_fiscal?:
            | Database["public"]["Enums"]["regimen_fiscal_sat"]
            | null
          rfc?: string | null
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marcas_virtuales_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      mesas: {
        Row: {
          activa: boolean
          capacidad: number
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          estado: Database["public"]["Enums"]["mesa_estado"]
          forma: string | null
          id: string
          nombre: string | null
          numero: string
          permite_juntar: boolean
          posicion_x: number | null
          posicion_y: number | null
          reservacion_actual_id: string | null
          seccion_id: string | null
          sucursal_id: string
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          activa?: boolean
          capacidad?: number
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          estado?: Database["public"]["Enums"]["mesa_estado"]
          forma?: string | null
          id?: string
          nombre?: string | null
          numero: string
          permite_juntar?: boolean
          posicion_x?: number | null
          posicion_y?: number | null
          reservacion_actual_id?: string | null
          seccion_id?: string | null
          sucursal_id: string
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          activa?: boolean
          capacidad?: number
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          estado?: Database["public"]["Enums"]["mesa_estado"]
          forma?: string | null
          id?: string
          nombre?: string | null
          numero?: string
          permite_juntar?: boolean
          posicion_x?: number | null
          posicion_y?: number | null
          reservacion_actual_id?: string | null
          seccion_id?: string | null
          sucursal_id?: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_mesas_reservacion_actual"
            columns: ["reservacion_actual_id"]
            isOneToOne: false
            referencedRelation: "reservaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mesas_seccion_id_fkey"
            columns: ["seccion_id"]
            isOneToOne: false
            referencedRelation: "secciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mesas_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mesas_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      modificador_componentes: {
        Row: {
          cantidad: number
          created_at: string
          id: string
          insumo_id: string
          notas: string | null
          opcion_modificador_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          cantidad: number
          created_at?: string
          id?: string
          insumo_id: string
          notas?: string | null
          opcion_modificador_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          cantidad?: number
          created_at?: string
          id?: string
          insumo_id?: string
          notas?: string | null
          opcion_modificador_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "modificador_componentes_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "insumos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "modificador_componentes_opcion_modificador_id_fkey"
            columns: ["opcion_modificador_id"]
            isOneToOne: false
            referencedRelation: "opciones_modificador"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "modificador_componentes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      movimientos_caja: {
        Row: {
          autorizacion_pin_id: string | null
          caja_destino_id: string | null
          caja_id: string
          cancelado: boolean
          cancelado_por: string | null
          comprobante_impreso: boolean
          created_at: string
          descripcion: string | null
          dia_contable: string
          fecha: string
          fecha_cancelacion: string | null
          fecha_impresion: string | null
          folio: string
          id: string
          monto_mxn: number
          motivo: string
          motivo_cancelacion: string | null
          sucursal_id: string
          tenant_id: string
          tipo: Database["public"]["Enums"]["movimiento_tipo"]
          turno_id: string
          usuario_autorizo_id: string | null
          usuario_solicitante_id: string
        }
        Insert: {
          autorizacion_pin_id?: string | null
          caja_destino_id?: string | null
          caja_id: string
          cancelado?: boolean
          cancelado_por?: string | null
          comprobante_impreso?: boolean
          created_at?: string
          descripcion?: string | null
          dia_contable: string
          fecha?: string
          fecha_cancelacion?: string | null
          fecha_impresion?: string | null
          folio: string
          id?: string
          monto_mxn: number
          motivo: string
          motivo_cancelacion?: string | null
          sucursal_id: string
          tenant_id: string
          tipo: Database["public"]["Enums"]["movimiento_tipo"]
          turno_id: string
          usuario_autorizo_id?: string | null
          usuario_solicitante_id: string
        }
        Update: {
          autorizacion_pin_id?: string | null
          caja_destino_id?: string | null
          caja_id?: string
          cancelado?: boolean
          cancelado_por?: string | null
          comprobante_impreso?: boolean
          created_at?: string
          descripcion?: string | null
          dia_contable?: string
          fecha?: string
          fecha_cancelacion?: string | null
          fecha_impresion?: string | null
          folio?: string
          id?: string
          monto_mxn?: number
          motivo?: string
          motivo_cancelacion?: string | null
          sucursal_id?: string
          tenant_id?: string
          tipo?: Database["public"]["Enums"]["movimiento_tipo"]
          turno_id?: string
          usuario_autorizo_id?: string | null
          usuario_solicitante_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_autorizacion_pin"
            columns: ["autorizacion_pin_id"]
            isOneToOne: false
            referencedRelation: "autorizaciones_pin"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_caja_caja_destino_id_fkey"
            columns: ["caja_destino_id"]
            isOneToOne: false
            referencedRelation: "cajas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_caja_caja_id_fkey"
            columns: ["caja_id"]
            isOneToOne: false
            referencedRelation: "cajas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_caja_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_caja_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_caja_turno_id_fkey"
            columns: ["turno_id"]
            isOneToOne: false
            referencedRelation: "turnos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_caja_turno_id_fkey"
            columns: ["turno_id"]
            isOneToOne: false
            referencedRelation: "vw_efectivo_esperado_turno"
            referencedColumns: ["turno_id"]
          },
          {
            foreignKeyName: "movimientos_caja_turno_id_fkey"
            columns: ["turno_id"]
            isOneToOne: false
            referencedRelation: "vw_resumen_turno"
            referencedColumns: ["turno_id"]
          },
        ]
      }
      movimientos_inventario: {
        Row: {
          autorizacion_pin_id: string | null
          cantidad: number
          costo_total_mxn: number | null
          costo_unitario_mxn: number
          created_at: string
          descripcion: string | null
          dia_contable: string
          factura_referencia: string | null
          fecha: string
          folio: string | null
          id: string
          insumo_id: string
          motivo: string | null
          proveedor_texto: string | null
          stock_antes: number
          stock_despues: number
          sucursal_destino_id: string | null
          sucursal_id: string
          tenant_id: string
          ticket_id: string | null
          ticket_item_id: string | null
          tipo: Database["public"]["Enums"]["movimiento_inventario_tipo"]
          transferencia_id: string | null
          usuario_autorizo_id: string | null
          usuario_id: string | null
        }
        Insert: {
          autorizacion_pin_id?: string | null
          cantidad: number
          costo_total_mxn?: number | null
          costo_unitario_mxn?: number
          created_at?: string
          descripcion?: string | null
          dia_contable: string
          factura_referencia?: string | null
          fecha?: string
          folio?: string | null
          id?: string
          insumo_id: string
          motivo?: string | null
          proveedor_texto?: string | null
          stock_antes: number
          stock_despues: number
          sucursal_destino_id?: string | null
          sucursal_id: string
          tenant_id: string
          ticket_id?: string | null
          ticket_item_id?: string | null
          tipo: Database["public"]["Enums"]["movimiento_inventario_tipo"]
          transferencia_id?: string | null
          usuario_autorizo_id?: string | null
          usuario_id?: string | null
        }
        Update: {
          autorizacion_pin_id?: string | null
          cantidad?: number
          costo_total_mxn?: number | null
          costo_unitario_mxn?: number
          created_at?: string
          descripcion?: string | null
          dia_contable?: string
          factura_referencia?: string | null
          fecha?: string
          folio?: string | null
          id?: string
          insumo_id?: string
          motivo?: string | null
          proveedor_texto?: string | null
          stock_antes?: number
          stock_despues?: number
          sucursal_destino_id?: string | null
          sucursal_id?: string
          tenant_id?: string
          ticket_id?: string | null
          ticket_item_id?: string | null
          tipo?: Database["public"]["Enums"]["movimiento_inventario_tipo"]
          transferencia_id?: string | null
          usuario_autorizo_id?: string | null
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "movimientos_inventario_autorizacion_pin_id_fkey"
            columns: ["autorizacion_pin_id"]
            isOneToOne: false
            referencedRelation: "autorizaciones_pin"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_inventario_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "insumos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_inventario_sucursal_destino_id_fkey"
            columns: ["sucursal_destino_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_inventario_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_inventario_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      opciones_modificador: {
        Row: {
          activa: boolean
          agotada: boolean
          codigo_interno: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          descripcion: string | null
          es_default: boolean
          grupo_id: string
          id: string
          nombre: string
          orden_visualizacion: number
          precio_extra_mxn: number
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          activa?: boolean
          agotada?: boolean
          codigo_interno?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          descripcion?: string | null
          es_default?: boolean
          grupo_id: string
          id?: string
          nombre: string
          orden_visualizacion?: number
          precio_extra_mxn?: number
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          activa?: boolean
          agotada?: boolean
          codigo_interno?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          descripcion?: string | null
          es_default?: boolean
          grupo_id?: string
          id?: string
          nombre?: string
          orden_visualizacion?: number
          precio_extra_mxn?: number
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "opciones_modificador_grupo_id_fkey"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "grupos_modificadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opciones_modificador_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      overrides_permisos: {
        Row: {
          concedido: boolean
          created_at: string
          created_by: string | null
          id: string
          motivo: string | null
          permiso_id: string
          rol_id: string
          tenant_id: string
        }
        Insert: {
          concedido: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          motivo?: string | null
          permiso_id: string
          rol_id: string
          tenant_id: string
        }
        Update: {
          concedido?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          motivo?: string | null
          permiso_id?: string
          rol_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "overrides_permisos_permiso_id_fkey"
            columns: ["permiso_id"]
            isOneToOne: false
            referencedRelation: "permisos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "overrides_permisos_rol_id_fkey"
            columns: ["rol_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "overrides_permisos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      pagos: {
        Row: {
          caja_id: string
          cambio_mxn: number
          client_id_local: string | null
          conciliado_at: string | null
          conciliado_por_id: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          dia_contable: string
          es_pago_al_recibir: boolean
          estado: Database["public"]["Enums"]["pago_estado"]
          fecha_pago: string
          folio_externo: string | null
          id: string
          metodo_pago: Database["public"]["Enums"]["metodo_pago"]
          metodo_real: Database["public"]["Enums"]["metodo_pago"] | null
          monto_mxn: number
          monto_real_mxn: number | null
          monto_recibido_mxn: number | null
          nota: string | null
          referencia: string | null
          sucursal_id: string
          tenant_id: string
          terminal_aprobacion: string | null
          ticket_id: string
          turno_id: string
          updated_at: string
          updated_by: string | null
          usuario_id: string
        }
        Insert: {
          caja_id: string
          cambio_mxn?: number
          client_id_local?: string | null
          conciliado_at?: string | null
          conciliado_por_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          dia_contable: string
          es_pago_al_recibir?: boolean
          estado?: Database["public"]["Enums"]["pago_estado"]
          fecha_pago?: string
          folio_externo?: string | null
          id?: string
          metodo_pago: Database["public"]["Enums"]["metodo_pago"]
          metodo_real?: Database["public"]["Enums"]["metodo_pago"] | null
          monto_mxn: number
          monto_real_mxn?: number | null
          monto_recibido_mxn?: number | null
          nota?: string | null
          referencia?: string | null
          sucursal_id: string
          tenant_id: string
          terminal_aprobacion?: string | null
          ticket_id: string
          turno_id: string
          updated_at?: string
          updated_by?: string | null
          usuario_id: string
        }
        Update: {
          caja_id?: string
          cambio_mxn?: number
          client_id_local?: string | null
          conciliado_at?: string | null
          conciliado_por_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          dia_contable?: string
          es_pago_al_recibir?: boolean
          estado?: Database["public"]["Enums"]["pago_estado"]
          fecha_pago?: string
          folio_externo?: string | null
          id?: string
          metodo_pago?: Database["public"]["Enums"]["metodo_pago"]
          metodo_real?: Database["public"]["Enums"]["metodo_pago"] | null
          monto_mxn?: number
          monto_real_mxn?: number | null
          monto_recibido_mxn?: number | null
          nota?: string | null
          referencia?: string | null
          sucursal_id?: string
          tenant_id?: string
          terminal_aprobacion?: string | null
          ticket_id?: string
          turno_id?: string
          updated_at?: string
          updated_by?: string | null
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pagos_caja_id_fkey"
            columns: ["caja_id"]
            isOneToOne: false
            referencedRelation: "cajas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagos_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagos_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagos_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "vw_cumplimiento_tiempos_cocina"
            referencedColumns: ["ticket_id"]
          },
          {
            foreignKeyName: "pagos_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "vw_ventas_apps_externas"
            referencedColumns: ["ticket_id"]
          },
          {
            foreignKeyName: "pagos_turno_id_fkey"
            columns: ["turno_id"]
            isOneToOne: false
            referencedRelation: "turnos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagos_turno_id_fkey"
            columns: ["turno_id"]
            isOneToOne: false
            referencedRelation: "vw_efectivo_esperado_turno"
            referencedColumns: ["turno_id"]
          },
          {
            foreignKeyName: "pagos_turno_id_fkey"
            columns: ["turno_id"]
            isOneToOne: false
            referencedRelation: "vw_resumen_turno"
            referencedColumns: ["turno_id"]
          },
        ]
      }
      permisos: {
        Row: {
          categoria: string
          codigo: string
          created_at: string
          descripcion: string | null
          id: string
          jerarquia_minima_pin: number | null
          nombre: string
          permite_autorizacion_pin: boolean
        }
        Insert: {
          categoria: string
          codigo: string
          created_at?: string
          descripcion?: string | null
          id?: string
          jerarquia_minima_pin?: number | null
          nombre: string
          permite_autorizacion_pin?: boolean
        }
        Update: {
          categoria?: string
          codigo?: string
          created_at?: string
          descripcion?: string | null
          id?: string
          jerarquia_minima_pin?: number | null
          nombre?: string
          permite_autorizacion_pin?: boolean
        }
        Relationships: []
      }
      pin_intentos: {
        Row: {
          caja_id: string | null
          exitoso: boolean
          fecha_intento: string
          id: string
          ip_address: unknown
          motivo_fallo: string | null
          tenant_id: string | null
          user_agent: string | null
          usuario_id: string | null
        }
        Insert: {
          caja_id?: string | null
          exitoso: boolean
          fecha_intento?: string
          id?: string
          ip_address?: unknown
          motivo_fallo?: string | null
          tenant_id?: string | null
          user_agent?: string | null
          usuario_id?: string | null
        }
        Update: {
          caja_id?: string | null
          exitoso?: boolean
          fecha_intento?: string
          id?: string
          ip_address?: unknown
          motivo_fallo?: string | null
          tenant_id?: string | null
          user_agent?: string | null
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pin_intentos_caja_id_fkey"
            columns: ["caja_id"]
            isOneToOne: false
            referencedRelation: "cajas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pin_intentos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      planes: {
        Row: {
          activo: boolean
          codigo: string
          created_at: string
          descripcion: string | null
          features_incluidos: Json
          id: string
          max_cajas_por_sucursal: number | null
          max_sucursales: number | null
          max_usuarios: number | null
          nombre: string
          orden_visualizacion: number
          precio_mensual_mxn: number
          timbres_cfdi_mensuales: number | null
          updated_at: string
          vertical: Database["public"]["Enums"]["vertical_tipo"]
          visible_publico: boolean
        }
        Insert: {
          activo?: boolean
          codigo: string
          created_at?: string
          descripcion?: string | null
          features_incluidos?: Json
          id?: string
          max_cajas_por_sucursal?: number | null
          max_sucursales?: number | null
          max_usuarios?: number | null
          nombre: string
          orden_visualizacion?: number
          precio_mensual_mxn: number
          timbres_cfdi_mensuales?: number | null
          updated_at?: string
          vertical: Database["public"]["Enums"]["vertical_tipo"]
          visible_publico?: boolean
        }
        Update: {
          activo?: boolean
          codigo?: string
          created_at?: string
          descripcion?: string | null
          features_incluidos?: Json
          id?: string
          max_cajas_por_sucursal?: number | null
          max_sucursales?: number | null
          max_usuarios?: number | null
          nombre?: string
          orden_visualizacion?: number
          precio_mensual_mxn?: number
          timbres_cfdi_mensuales?: number | null
          updated_at?: string
          vertical?: Database["public"]["Enums"]["vertical_tipo"]
          visible_publico?: boolean
        }
        Relationships: []
      }
      productos: {
        Row: {
          agotado_automatico: boolean
          agotado_manual: boolean
          area_cocina_id: string | null
          categoria_id: string
          clave_sat: string | null
          codigo_barras: string | null
          codigo_interno: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          descripcion: string | null
          estado: Database["public"]["Enums"]["producto_estado"]
          id: string
          imagen_url: string | null
          imprime_en_multiples_areas: boolean
          iva_incluido_en_precio: boolean
          marca_virtual_id: string | null
          modos_servicio_disponibles: string[] | null
          motivo_agotado: string | null
          nombre: string
          notas_internas: string | null
          orden_visualizacion: number
          precio_base_mxn: number
          tasa_iva: number
          tenant_id: string
          tiempo_preparacion_min: number | null
          tipo_venta: Database["public"]["Enums"]["producto_tipo_venta"]
          unidad_sat: string | null
          updated_at: string
          updated_by: string | null
          visible_en_pos: boolean
        }
        Insert: {
          agotado_automatico?: boolean
          agotado_manual?: boolean
          area_cocina_id?: string | null
          categoria_id: string
          clave_sat?: string | null
          codigo_barras?: string | null
          codigo_interno?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          descripcion?: string | null
          estado?: Database["public"]["Enums"]["producto_estado"]
          id?: string
          imagen_url?: string | null
          imprime_en_multiples_areas?: boolean
          iva_incluido_en_precio?: boolean
          marca_virtual_id?: string | null
          modos_servicio_disponibles?: string[] | null
          motivo_agotado?: string | null
          nombre: string
          notas_internas?: string | null
          orden_visualizacion?: number
          precio_base_mxn: number
          tasa_iva?: number
          tenant_id: string
          tiempo_preparacion_min?: number | null
          tipo_venta?: Database["public"]["Enums"]["producto_tipo_venta"]
          unidad_sat?: string | null
          updated_at?: string
          updated_by?: string | null
          visible_en_pos?: boolean
        }
        Update: {
          agotado_automatico?: boolean
          agotado_manual?: boolean
          area_cocina_id?: string | null
          categoria_id?: string
          clave_sat?: string | null
          codigo_barras?: string | null
          codigo_interno?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          descripcion?: string | null
          estado?: Database["public"]["Enums"]["producto_estado"]
          id?: string
          imagen_url?: string | null
          imprime_en_multiples_areas?: boolean
          iva_incluido_en_precio?: boolean
          marca_virtual_id?: string | null
          modos_servicio_disponibles?: string[] | null
          motivo_agotado?: string | null
          nombre?: string
          notas_internas?: string | null
          orden_visualizacion?: number
          precio_base_mxn?: number
          tasa_iva?: number
          tenant_id?: string
          tiempo_preparacion_min?: number | null
          tipo_venta?: Database["public"]["Enums"]["producto_tipo_venta"]
          unidad_sat?: string | null
          updated_at?: string
          updated_by?: string | null
          visible_en_pos?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "fk_productos_area_cocina"
            columns: ["area_cocina_id"]
            isOneToOne: false
            referencedRelation: "areas_cocina"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_productos_marca_virtual"
            columns: ["marca_virtual_id"]
            isOneToOne: false
            referencedRelation: "marcas_virtuales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "productos_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "productos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      productos_areas_cocina_extra: {
        Row: {
          area_cocina_id: string
          created_at: string
          id: string
          instruccion_area: string | null
          orden: number
          producto_id: string
          tenant_id: string
        }
        Insert: {
          area_cocina_id: string
          created_at?: string
          id?: string
          instruccion_area?: string | null
          orden?: number
          producto_id: string
          tenant_id: string
        }
        Update: {
          area_cocina_id?: string
          created_at?: string
          id?: string
          instruccion_area?: string | null
          orden?: number
          producto_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "productos_areas_cocina_extra_area_cocina_id_fkey"
            columns: ["area_cocina_id"]
            isOneToOne: false
            referencedRelation: "areas_cocina"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "productos_areas_cocina_extra_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "productos_areas_cocina_extra_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      productos_grupos_modificadores: {
        Row: {
          created_at: string
          created_by: string | null
          grupo_id: string
          id: string
          orden_visualizacion: number
          producto_id: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          grupo_id: string
          id?: string
          orden_visualizacion?: number
          producto_id: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          grupo_id?: string
          id?: string
          orden_visualizacion?: number
          producto_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "productos_grupos_modificadores_grupo_id_fkey"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "grupos_modificadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "productos_grupos_modificadores_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "productos_grupos_modificadores_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      promociones: {
        Row: {
          alcance: Database["public"]["Enums"]["promocion_alcance"]
          cantidad_compra: number | null
          cantidad_lleva: number | null
          codigo: string | null
          condiciones: Json
          created_at: string
          created_by: string | null
          deleted_at: string | null
          descripcion: string | null
          estado: Database["public"]["Enums"]["promocion_estado"]
          fecha_fin: string | null
          fecha_inicio: string
          id: string
          max_usos_cliente: number | null
          max_usos_total: number | null
          no_acumulable_con: string[]
          nombre: string
          precio_combo_mxn: number | null
          precio_especial_mxn: number | null
          prioridad: number
          requiere_cliente_identificado: boolean
          tenant_id: string
          tipo: Database["public"]["Enums"]["promocion_tipo"]
          updated_at: string
          updated_by: string | null
          usos_actuales: number
          valor_monto_mxn: number | null
          valor_porcentaje: number | null
          visible_en_ticket: boolean
        }
        Insert: {
          alcance: Database["public"]["Enums"]["promocion_alcance"]
          cantidad_compra?: number | null
          cantidad_lleva?: number | null
          codigo?: string | null
          condiciones?: Json
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          descripcion?: string | null
          estado?: Database["public"]["Enums"]["promocion_estado"]
          fecha_fin?: string | null
          fecha_inicio?: string
          id?: string
          max_usos_cliente?: number | null
          max_usos_total?: number | null
          no_acumulable_con?: string[]
          nombre: string
          precio_combo_mxn?: number | null
          precio_especial_mxn?: number | null
          prioridad?: number
          requiere_cliente_identificado?: boolean
          tenant_id: string
          tipo: Database["public"]["Enums"]["promocion_tipo"]
          updated_at?: string
          updated_by?: string | null
          usos_actuales?: number
          valor_monto_mxn?: number | null
          valor_porcentaje?: number | null
          visible_en_ticket?: boolean
        }
        Update: {
          alcance?: Database["public"]["Enums"]["promocion_alcance"]
          cantidad_compra?: number | null
          cantidad_lleva?: number | null
          codigo?: string | null
          condiciones?: Json
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          descripcion?: string | null
          estado?: Database["public"]["Enums"]["promocion_estado"]
          fecha_fin?: string | null
          fecha_inicio?: string
          id?: string
          max_usos_cliente?: number | null
          max_usos_total?: number | null
          no_acumulable_con?: string[]
          nombre?: string
          precio_combo_mxn?: number | null
          precio_especial_mxn?: number | null
          prioridad?: number
          requiere_cliente_identificado?: boolean
          tenant_id?: string
          tipo?: Database["public"]["Enums"]["promocion_tipo"]
          updated_at?: string
          updated_by?: string | null
          usos_actuales?: number
          valor_monto_mxn?: number | null
          valor_porcentaje?: number | null
          visible_en_ticket?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "promociones_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      promociones_productos: {
        Row: {
          categoria_id: string | null
          created_at: string
          id: string
          obligatorio_para_activar: boolean
          producto_id: string | null
          promocion_id: string
          tenant_id: string
        }
        Insert: {
          categoria_id?: string | null
          created_at?: string
          id?: string
          obligatorio_para_activar?: boolean
          producto_id?: string | null
          promocion_id: string
          tenant_id: string
        }
        Update: {
          categoria_id?: string | null
          created_at?: string
          id?: string
          obligatorio_para_activar?: boolean
          producto_id?: string | null
          promocion_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "promociones_productos_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promociones_productos_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promociones_productos_promocion_id_fkey"
            columns: ["promocion_id"]
            isOneToOne: false
            referencedRelation: "promociones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promociones_productos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      propinas_distribucion: {
        Row: {
          created_at: string
          created_by: string | null
          entregado_por_id: string | null
          estado: Database["public"]["Enums"]["propina_distribucion_estado"]
          fecha_entrega: string | null
          horas_trabajadas: number | null
          id: string
          metodo_reparto_usado: Database["public"]["Enums"]["propina_metodo_reparto"]
          monto_asignado_mxn: number
          nota: string | null
          participantes_fondo: number | null
          propinas_brutas_propias_mxn: number | null
          rol_snapshot: string
          sucursal_id: string
          tenant_id: string
          tickets_atendidos: number | null
          total_horas_turno: number | null
          turno_id: string
          updated_at: string
          updated_by: string | null
          usuario_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          entregado_por_id?: string | null
          estado?: Database["public"]["Enums"]["propina_distribucion_estado"]
          fecha_entrega?: string | null
          horas_trabajadas?: number | null
          id?: string
          metodo_reparto_usado: Database["public"]["Enums"]["propina_metodo_reparto"]
          monto_asignado_mxn: number
          nota?: string | null
          participantes_fondo?: number | null
          propinas_brutas_propias_mxn?: number | null
          rol_snapshot: string
          sucursal_id: string
          tenant_id: string
          tickets_atendidos?: number | null
          total_horas_turno?: number | null
          turno_id: string
          updated_at?: string
          updated_by?: string | null
          usuario_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          entregado_por_id?: string | null
          estado?: Database["public"]["Enums"]["propina_distribucion_estado"]
          fecha_entrega?: string | null
          horas_trabajadas?: number | null
          id?: string
          metodo_reparto_usado?: Database["public"]["Enums"]["propina_metodo_reparto"]
          monto_asignado_mxn?: number
          nota?: string | null
          participantes_fondo?: number | null
          propinas_brutas_propias_mxn?: number | null
          rol_snapshot?: string
          sucursal_id?: string
          tenant_id?: string
          tickets_atendidos?: number | null
          total_horas_turno?: number | null
          turno_id?: string
          updated_at?: string
          updated_by?: string | null
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "propinas_distribucion_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "propinas_distribucion_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "propinas_distribucion_turno_id_fkey"
            columns: ["turno_id"]
            isOneToOne: false
            referencedRelation: "turnos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "propinas_distribucion_turno_id_fkey"
            columns: ["turno_id"]
            isOneToOne: false
            referencedRelation: "vw_efectivo_esperado_turno"
            referencedColumns: ["turno_id"]
          },
          {
            foreignKeyName: "propinas_distribucion_turno_id_fkey"
            columns: ["turno_id"]
            isOneToOne: false
            referencedRelation: "vw_resumen_turno"
            referencedColumns: ["turno_id"]
          },
        ]
      }
      receta_componentes: {
        Row: {
          cantidad: number
          created_at: string
          es_critico: boolean
          id: string
          insumo_id: string
          notas: string | null
          orden_visualizacion: number
          receta_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          cantidad: number
          created_at?: string
          es_critico?: boolean
          id?: string
          insumo_id: string
          notas?: string | null
          orden_visualizacion?: number
          receta_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          cantidad?: number
          created_at?: string
          es_critico?: boolean
          id?: string
          insumo_id?: string
          notas?: string | null
          orden_visualizacion?: number
          receta_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "receta_componentes_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "insumos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receta_componentes_receta_id_fkey"
            columns: ["receta_id"]
            isOneToOne: false
            referencedRelation: "recetas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receta_componentes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      recetas: {
        Row: {
          activa: boolean
          costo_total_mxn: number
          created_at: string
          created_by: string | null
          id: string
          notas_preparacion: string | null
          producto_id: string
          tenant_id: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          activa?: boolean
          costo_total_mxn?: number
          created_at?: string
          created_by?: string | null
          id?: string
          notas_preparacion?: string | null
          producto_id: string
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          activa?: boolean
          costo_total_mxn?: number
          created_at?: string
          created_by?: string | null
          id?: string
          notas_preparacion?: string | null
          producto_id?: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "recetas_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: true
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recetas_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      reportes_z_historico: {
        Row: {
          autorizacion_pin_id: string | null
          caja_id: string
          cerrado_por_usuario_id: string
          created_at: string
          created_by: string | null
          dia_contable: string
          diferencia_efectivo_mxn: number | null
          efectivo_declarado_mxn: number | null
          efectivo_esperado_mxn: number
          fecha_cierre: string
          folio_z: string
          folio_z_consecutivo: number
          id: string
          nota: string | null
          payload_completo: Json
          sucursal_id: string
          tenant_id: string
          total_cancelaciones_mxn: number
          total_devoluciones_mxn: number
          total_iva_mxn: number
          total_propinas_mxn: number
          total_tickets: number
          total_ventas_mxn: number
          turno_id: string
        }
        Insert: {
          autorizacion_pin_id?: string | null
          caja_id: string
          cerrado_por_usuario_id: string
          created_at?: string
          created_by?: string | null
          dia_contable: string
          diferencia_efectivo_mxn?: number | null
          efectivo_declarado_mxn?: number | null
          efectivo_esperado_mxn?: number
          fecha_cierre?: string
          folio_z: string
          folio_z_consecutivo: number
          id?: string
          nota?: string | null
          payload_completo: Json
          sucursal_id: string
          tenant_id: string
          total_cancelaciones_mxn?: number
          total_devoluciones_mxn?: number
          total_iva_mxn?: number
          total_propinas_mxn?: number
          total_tickets?: number
          total_ventas_mxn: number
          turno_id: string
        }
        Update: {
          autorizacion_pin_id?: string | null
          caja_id?: string
          cerrado_por_usuario_id?: string
          created_at?: string
          created_by?: string | null
          dia_contable?: string
          diferencia_efectivo_mxn?: number | null
          efectivo_declarado_mxn?: number | null
          efectivo_esperado_mxn?: number
          fecha_cierre?: string
          folio_z?: string
          folio_z_consecutivo?: number
          id?: string
          nota?: string | null
          payload_completo?: Json
          sucursal_id?: string
          tenant_id?: string
          total_cancelaciones_mxn?: number
          total_devoluciones_mxn?: number
          total_iva_mxn?: number
          total_propinas_mxn?: number
          total_tickets?: number
          total_ventas_mxn?: number
          turno_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reportes_z_historico_autorizacion_pin_id_fkey"
            columns: ["autorizacion_pin_id"]
            isOneToOne: false
            referencedRelation: "autorizaciones_pin"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reportes_z_historico_caja_id_fkey"
            columns: ["caja_id"]
            isOneToOne: false
            referencedRelation: "cajas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reportes_z_historico_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reportes_z_historico_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reportes_z_historico_turno_id_fkey"
            columns: ["turno_id"]
            isOneToOne: true
            referencedRelation: "turnos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reportes_z_historico_turno_id_fkey"
            columns: ["turno_id"]
            isOneToOne: true
            referencedRelation: "vw_efectivo_esperado_turno"
            referencedColumns: ["turno_id"]
          },
          {
            foreignKeyName: "reportes_z_historico_turno_id_fkey"
            columns: ["turno_id"]
            isOneToOne: true
            referencedRelation: "vw_resumen_turno"
            referencedColumns: ["turno_id"]
          },
        ]
      }
      reservaciones: {
        Row: {
          canal: Database["public"]["Enums"]["reservacion_canal"]
          canal_referencia: string | null
          client_id_local: string | null
          cliente_email_snapshot: string | null
          cliente_id: string | null
          cliente_nombre_snapshot: string
          cliente_telefono_snapshot: string | null
          comensales: number
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          duracion_estimada_minutos: number
          estado: Database["public"]["Enums"]["reservacion_estado"]
          fecha_cancelacion: string | null
          fecha_hora_reserva: string
          fecha_llegada: string | null
          fecha_no_show_marcado: string | null
          folio_completo: string
          folio_consecutivo: number
          id: string
          mesa_asignada_id: string | null
          mesa_preferida_id: string | null
          motivo_cancelacion: string | null
          nota: string | null
          ocasion_especial: string | null
          seccion_preferida_id: string | null
          sucursal_id: string
          tenant_id: string
          ticket_id: string | null
          updated_at: string
          updated_by: string | null
          usuario_confirmacion_llegada_id: string | null
          usuario_creacion_id: string | null
        }
        Insert: {
          canal: Database["public"]["Enums"]["reservacion_canal"]
          canal_referencia?: string | null
          client_id_local?: string | null
          cliente_email_snapshot?: string | null
          cliente_id?: string | null
          cliente_nombre_snapshot: string
          cliente_telefono_snapshot?: string | null
          comensales: number
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          duracion_estimada_minutos?: number
          estado?: Database["public"]["Enums"]["reservacion_estado"]
          fecha_cancelacion?: string | null
          fecha_hora_reserva: string
          fecha_llegada?: string | null
          fecha_no_show_marcado?: string | null
          folio_completo: string
          folio_consecutivo: number
          id?: string
          mesa_asignada_id?: string | null
          mesa_preferida_id?: string | null
          motivo_cancelacion?: string | null
          nota?: string | null
          ocasion_especial?: string | null
          seccion_preferida_id?: string | null
          sucursal_id: string
          tenant_id: string
          ticket_id?: string | null
          updated_at?: string
          updated_by?: string | null
          usuario_confirmacion_llegada_id?: string | null
          usuario_creacion_id?: string | null
        }
        Update: {
          canal?: Database["public"]["Enums"]["reservacion_canal"]
          canal_referencia?: string | null
          client_id_local?: string | null
          cliente_email_snapshot?: string | null
          cliente_id?: string | null
          cliente_nombre_snapshot?: string
          cliente_telefono_snapshot?: string | null
          comensales?: number
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          duracion_estimada_minutos?: number
          estado?: Database["public"]["Enums"]["reservacion_estado"]
          fecha_cancelacion?: string | null
          fecha_hora_reserva?: string
          fecha_llegada?: string | null
          fecha_no_show_marcado?: string | null
          folio_completo?: string
          folio_consecutivo?: number
          id?: string
          mesa_asignada_id?: string | null
          mesa_preferida_id?: string | null
          motivo_cancelacion?: string | null
          nota?: string | null
          ocasion_especial?: string | null
          seccion_preferida_id?: string | null
          sucursal_id?: string
          tenant_id?: string
          ticket_id?: string | null
          updated_at?: string
          updated_by?: string | null
          usuario_confirmacion_llegada_id?: string | null
          usuario_creacion_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reservaciones_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservaciones_mesa_asignada_id_fkey"
            columns: ["mesa_asignada_id"]
            isOneToOne: false
            referencedRelation: "mesas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservaciones_mesa_asignada_id_fkey"
            columns: ["mesa_asignada_id"]
            isOneToOne: false
            referencedRelation: "vw_mesas_estado_actual"
            referencedColumns: ["mesa_id"]
          },
          {
            foreignKeyName: "reservaciones_mesa_preferida_id_fkey"
            columns: ["mesa_preferida_id"]
            isOneToOne: false
            referencedRelation: "mesas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservaciones_mesa_preferida_id_fkey"
            columns: ["mesa_preferida_id"]
            isOneToOne: false
            referencedRelation: "vw_mesas_estado_actual"
            referencedColumns: ["mesa_id"]
          },
          {
            foreignKeyName: "reservaciones_seccion_preferida_id_fkey"
            columns: ["seccion_preferida_id"]
            isOneToOne: false
            referencedRelation: "secciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservaciones_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservaciones_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservaciones_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservaciones_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "vw_cumplimiento_tiempos_cocina"
            referencedColumns: ["ticket_id"]
          },
          {
            foreignKeyName: "reservaciones_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "vw_ventas_apps_externas"
            referencedColumns: ["ticket_id"]
          },
        ]
      }
      rol_permisos: {
        Row: {
          concedido: boolean
          created_at: string
          id: string
          permiso_id: string
          rol_id: string
        }
        Insert: {
          concedido?: boolean
          created_at?: string
          id?: string
          permiso_id: string
          rol_id: string
        }
        Update: {
          concedido?: boolean
          created_at?: string
          id?: string
          permiso_id?: string
          rol_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rol_permisos_permiso_id_fkey"
            columns: ["permiso_id"]
            isOneToOne: false
            referencedRelation: "permisos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rol_permisos_rol_id_fkey"
            columns: ["rol_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          activo: boolean
          codigo: string
          created_at: string
          descripcion: string | null
          es_sistema: boolean
          id: string
          jerarquia: number
          nombre: string
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          activo?: boolean
          codigo: string
          created_at?: string
          descripcion?: string | null
          es_sistema?: boolean
          id?: string
          jerarquia: number
          nombre: string
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          activo?: boolean
          codigo?: string
          created_at?: string
          descripcion?: string | null
          es_sistema?: boolean
          id?: string
          jerarquia?: number
          nombre?: string
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "roles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      secciones: {
        Row: {
          activa: boolean
          color_hex: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          descripcion: string | null
          id: string
          nombre: string
          orden_visualizacion: number
          sucursal_id: string
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          activa?: boolean
          color_hex?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          descripcion?: string | null
          id?: string
          nombre: string
          orden_visualizacion?: number
          sucursal_id: string
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          activa?: boolean
          color_hex?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          descripcion?: string | null
          id?: string
          nombre?: string
          orden_visualizacion?: number
          sucursal_id?: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "secciones_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "secciones_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      sesiones_login: {
        Row: {
          caja_id: string | null
          duracion_minutos: number | null
          fecha_login: string
          fecha_logout: string | null
          id: string
          ip_address: unknown
          motivo_logout: string | null
          sucursal_id: string | null
          tenant_id: string
          tipo_acceso: Database["public"]["Enums"]["tipo_acceso"]
          user_agent: string | null
          usuario_id: string
        }
        Insert: {
          caja_id?: string | null
          duracion_minutos?: number | null
          fecha_login?: string
          fecha_logout?: string | null
          id?: string
          ip_address?: unknown
          motivo_logout?: string | null
          sucursal_id?: string | null
          tenant_id: string
          tipo_acceso: Database["public"]["Enums"]["tipo_acceso"]
          user_agent?: string | null
          usuario_id: string
        }
        Update: {
          caja_id?: string | null
          duracion_minutos?: number | null
          fecha_login?: string
          fecha_logout?: string | null
          id?: string
          ip_address?: unknown
          motivo_logout?: string | null
          sucursal_id?: string | null
          tenant_id?: string
          tipo_acceso?: Database["public"]["Enums"]["tipo_acceso"]
          user_agent?: string | null
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sesiones_login_caja_id_fkey"
            columns: ["caja_id"]
            isOneToOne: false
            referencedRelation: "cajas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sesiones_login_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sesiones_login_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      subtipos_personal: {
        Row: {
          activo: boolean
          capacidades: Json
          codigo: string
          created_at: string
          descripcion: string | null
          es_sistema: boolean
          id: string
          nombre: string
          tenant_id: string | null
          updated_at: string
          verticales_aplicables: Database["public"]["Enums"]["vertical_tipo"][]
        }
        Insert: {
          activo?: boolean
          capacidades?: Json
          codigo: string
          created_at?: string
          descripcion?: string | null
          es_sistema?: boolean
          id?: string
          nombre: string
          tenant_id?: string | null
          updated_at?: string
          verticales_aplicables?: Database["public"]["Enums"]["vertical_tipo"][]
        }
        Update: {
          activo?: boolean
          capacidades?: Json
          codigo?: string
          created_at?: string
          descripcion?: string | null
          es_sistema?: boolean
          id?: string
          nombre?: string
          tenant_id?: string | null
          updated_at?: string
          verticales_aplicables?: Database["public"]["Enums"]["vertical_tipo"][]
        }
        Relationships: [
          {
            foreignKeyName: "subtipos_personal_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      sucursal_propinas_config: {
        Row: {
          capturar_propina: boolean
          created_at: string
          created_by: string | null
          id: string
          incluir_bartender_en_fondo: boolean
          incluir_cajero_en_fondo: boolean
          metodo_reparto: Database["public"]["Enums"]["propina_metodo_reparto"]
          permitir_monto_libre: boolean
          permitir_sin_propina: boolean
          porcentaje_a_fondo_comun: number
          porcentajes_sugeridos: number[]
          redondear_a_pesos: boolean
          sucursal_id: string
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          capturar_propina?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          incluir_bartender_en_fondo?: boolean
          incluir_cajero_en_fondo?: boolean
          metodo_reparto?: Database["public"]["Enums"]["propina_metodo_reparto"]
          permitir_monto_libre?: boolean
          permitir_sin_propina?: boolean
          porcentaje_a_fondo_comun?: number
          porcentajes_sugeridos?: number[]
          redondear_a_pesos?: boolean
          sucursal_id: string
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          capturar_propina?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          incluir_bartender_en_fondo?: boolean
          incluir_cajero_en_fondo?: boolean
          metodo_reparto?: Database["public"]["Enums"]["propina_metodo_reparto"]
          permitir_monto_libre?: boolean
          permitir_sin_propina?: boolean
          porcentaje_a_fondo_comun?: number
          porcentajes_sugeridos?: number[]
          redondear_a_pesos?: boolean
          sucursal_id?: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sucursal_propinas_config_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: true
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sucursal_propinas_config_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      sucursales: {
        Row: {
          activa: boolean
          ciudad: string | null
          codigo: string
          codigo_postal: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          descripcion: string | null
          direccion_calle: string | null
          direccion_colonia: string | null
          direccion_numero: string | null
          email_contacto: string | null
          estado_geo: string | null
          fecha_apertura: string | null
          fecha_cierre: string | null
          geo_lat: number | null
          geo_lng: number | null
          hora_cierre_dia_contable: string | null
          horario_apertura: string | null
          horario_cierre: string | null
          id: string
          nombre: string
          pais: string
          telefono: string | null
          tenant_id: string
          timezone: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          activa?: boolean
          ciudad?: string | null
          codigo: string
          codigo_postal?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          descripcion?: string | null
          direccion_calle?: string | null
          direccion_colonia?: string | null
          direccion_numero?: string | null
          email_contacto?: string | null
          estado_geo?: string | null
          fecha_apertura?: string | null
          fecha_cierre?: string | null
          geo_lat?: number | null
          geo_lng?: number | null
          hora_cierre_dia_contable?: string | null
          horario_apertura?: string | null
          horario_cierre?: string | null
          id?: string
          nombre: string
          pais?: string
          telefono?: string | null
          tenant_id: string
          timezone?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          activa?: boolean
          ciudad?: string | null
          codigo?: string
          codigo_postal?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          descripcion?: string | null
          direccion_calle?: string | null
          direccion_colonia?: string | null
          direccion_numero?: string | null
          email_contacto?: string | null
          estado_geo?: string | null
          fecha_apertura?: string | null
          fecha_cierre?: string | null
          geo_lat?: number | null
          geo_lng?: number | null
          hora_cierre_dia_contable?: string | null
          horario_apertura?: string | null
          horario_cierre?: string | null
          id?: string
          nombre?: string
          pais?: string
          telefono?: string | null
          tenant_id?: string
          timezone?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sucursales_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      super_admin_accesos: {
        Row: {
          accion: string
          created_at: string
          id: string
          ip_address: unknown
          motivo: string
          payload: Json
          super_admin_id: string
          tenant_id: string
        }
        Insert: {
          accion: string
          created_at?: string
          id?: string
          ip_address?: unknown
          motivo: string
          payload?: Json
          super_admin_id: string
          tenant_id: string
        }
        Update: {
          accion?: string
          created_at?: string
          id?: string
          ip_address?: unknown
          motivo?: string
          payload?: Json
          super_admin_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "super_admin_accesos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      suscripciones: {
        Row: {
          ciclo_facturacion: string
          created_at: string
          created_by: string | null
          descuento_porcentaje: number
          estado: Database["public"]["Enums"]["suscripcion_estado"]
          fecha_fin: string | null
          fecha_inicio: string
          id: string
          notas: string | null
          plan_id: string
          precio_mensual_mxn: number
          proxima_fecha_cobro: string | null
          tenant_id: string
          ultima_fecha_cobro: string | null
          updated_at: string
        }
        Insert: {
          ciclo_facturacion?: string
          created_at?: string
          created_by?: string | null
          descuento_porcentaje?: number
          estado?: Database["public"]["Enums"]["suscripcion_estado"]
          fecha_fin?: string | null
          fecha_inicio: string
          id?: string
          notas?: string | null
          plan_id: string
          precio_mensual_mxn: number
          proxima_fecha_cobro?: string | null
          tenant_id: string
          ultima_fecha_cobro?: string | null
          updated_at?: string
        }
        Update: {
          ciclo_facturacion?: string
          created_at?: string
          created_by?: string | null
          descuento_porcentaje?: number
          estado?: Database["public"]["Enums"]["suscripcion_estado"]
          fecha_fin?: string | null
          fecha_inicio?: string
          id?: string
          notas?: string | null
          plan_id?: string
          precio_mensual_mxn?: number
          proxima_fecha_cobro?: string | null
          tenant_id?: string
          ultima_fecha_cobro?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "suscripciones_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "planes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suscripciones_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_conflictos: {
        Row: {
          client_id_local: string | null
          created_at: string
          created_by: string | null
          diferencia_detectada: Json | null
          entidad_id_local: string
          entidad_id_servidor: string | null
          entidad_tipo: string
          id: string
          payload_intentado: Json
          payload_servidor: Json | null
          resolucion: Database["public"]["Enums"]["sync_conflicto_resolucion"]
          resolucion_nota: string | null
          resolucion_regla_aplicada: string | null
          resuelto_at: string | null
          resuelto_por_id: string | null
          sync_evento_id: string
          tenant_id: string
          tipo_conflicto: Database["public"]["Enums"]["sync_conflicto_tipo"]
        }
        Insert: {
          client_id_local?: string | null
          created_at?: string
          created_by?: string | null
          diferencia_detectada?: Json | null
          entidad_id_local: string
          entidad_id_servidor?: string | null
          entidad_tipo: string
          id?: string
          payload_intentado: Json
          payload_servidor?: Json | null
          resolucion?: Database["public"]["Enums"]["sync_conflicto_resolucion"]
          resolucion_nota?: string | null
          resolucion_regla_aplicada?: string | null
          resuelto_at?: string | null
          resuelto_por_id?: string | null
          sync_evento_id: string
          tenant_id: string
          tipo_conflicto: Database["public"]["Enums"]["sync_conflicto_tipo"]
        }
        Update: {
          client_id_local?: string | null
          created_at?: string
          created_by?: string | null
          diferencia_detectada?: Json | null
          entidad_id_local?: string
          entidad_id_servidor?: string | null
          entidad_tipo?: string
          id?: string
          payload_intentado?: Json
          payload_servidor?: Json | null
          resolucion?: Database["public"]["Enums"]["sync_conflicto_resolucion"]
          resolucion_nota?: string | null
          resolucion_regla_aplicada?: string | null
          resuelto_at?: string | null
          resuelto_por_id?: string | null
          sync_evento_id?: string
          tenant_id?: string
          tipo_conflicto?: Database["public"]["Enums"]["sync_conflicto_tipo"]
        }
        Relationships: [
          {
            foreignKeyName: "sync_conflictos_sync_evento_id_fkey"
            columns: ["sync_evento_id"]
            isOneToOne: false
            referencedRelation: "sync_eventos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sync_conflictos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_eventos: {
        Row: {
          caja_id: string | null
          created_at: string
          dispositivo_descripcion: string | null
          dispositivo_id: string
          duracion_ms: number | null
          fecha_operacion_max: string | null
          fecha_operacion_min: string | null
          fecha_procesado_fin: string | null
          fecha_procesado_inicio: string | null
          fecha_recepcion: string
          id: string
          operaciones_conflicto: number
          operaciones_error: number
          operaciones_exitosas: number
          operaciones_idempotentes: number
          operaciones_total: number
          request_summary: Json
          response_summary: Json
          sucursal_id: string | null
          tenant_id: string
          usuario_id: string | null
        }
        Insert: {
          caja_id?: string | null
          created_at?: string
          dispositivo_descripcion?: string | null
          dispositivo_id: string
          duracion_ms?: number | null
          fecha_operacion_max?: string | null
          fecha_operacion_min?: string | null
          fecha_procesado_fin?: string | null
          fecha_procesado_inicio?: string | null
          fecha_recepcion?: string
          id?: string
          operaciones_conflicto?: number
          operaciones_error?: number
          operaciones_exitosas?: number
          operaciones_idempotentes?: number
          operaciones_total: number
          request_summary?: Json
          response_summary?: Json
          sucursal_id?: string | null
          tenant_id: string
          usuario_id?: string | null
        }
        Update: {
          caja_id?: string | null
          created_at?: string
          dispositivo_descripcion?: string | null
          dispositivo_id?: string
          duracion_ms?: number | null
          fecha_operacion_max?: string | null
          fecha_operacion_min?: string | null
          fecha_procesado_fin?: string | null
          fecha_procesado_inicio?: string | null
          fecha_recepcion?: string
          id?: string
          operaciones_conflicto?: number
          operaciones_error?: number
          operaciones_exitosas?: number
          operaciones_idempotentes?: number
          operaciones_total?: number
          request_summary?: Json
          response_summary?: Json
          sucursal_id?: string | null
          tenant_id?: string
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sync_eventos_caja_id_fkey"
            columns: ["caja_id"]
            isOneToOne: false
            referencedRelation: "cajas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sync_eventos_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sync_eventos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_addons: {
        Row: {
          activo: boolean
          addon_id: string
          created_at: string
          created_by: string | null
          fecha_fin: string | null
          fecha_inicio: string
          id: string
          notas: string | null
          precio_mensual_mxn: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          activo?: boolean
          addon_id: string
          created_at?: string
          created_by?: string | null
          fecha_fin?: string | null
          fecha_inicio: string
          id?: string
          notas?: string | null
          precio_mensual_mxn: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          activo?: boolean
          addon_id?: string
          created_at?: string
          created_by?: string | null
          fecha_fin?: string | null
          fecha_inicio?: string
          id?: string
          notas?: string | null
          precio_mensual_mxn?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_addons_addon_id_fkey"
            columns: ["addon_id"]
            isOneToOne: false
            referencedRelation: "addons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_addons_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_cfdi_emisor: {
        Row: {
          created_at: string
          csd_vigencia_hasta: string | null
          estado: string
          facturama_issuer_ref: string
          proveedor_pac: Database["public"]["Enums"]["cfdi_proveedor_pac"]
          rfc: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          csd_vigencia_hasta?: string | null
          estado?: string
          facturama_issuer_ref: string
          proveedor_pac?: Database["public"]["Enums"]["cfdi_proveedor_pac"]
          rfc: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          csd_vigencia_hasta?: string | null
          estado?: string
          facturama_issuer_ref?: string
          proveedor_pac?: Database["public"]["Enums"]["cfdi_proveedor_pac"]
          rfc?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_cfdi_emisor_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_feature_flags: {
        Row: {
          activado: boolean
          activado_por: string | null
          created_at: string
          fecha_fin: string | null
          fecha_inicio: string
          flag_codigo: string
          id: string
          motivo: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          activado?: boolean
          activado_por?: string | null
          created_at?: string
          fecha_fin?: string | null
          fecha_inicio?: string
          flag_codigo: string
          id?: string
          motivo?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          activado?: boolean
          activado_por?: string | null
          created_at?: string
          fecha_fin?: string | null
          fecha_inicio?: string
          flag_codigo?: string
          id?: string
          motivo?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_feature_flags_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_folios_saldo: {
        Row: {
          autorecarga_activa: boolean
          autorecarga_paquete_id: string | null
          folios_base_consumidos: number
          folios_base_mensuales: number
          periodo_actual: string
          saldo_paquetes: number
          tenant_id: string
          umbral_alerta: number
          updated_at: string
        }
        Insert: {
          autorecarga_activa?: boolean
          autorecarga_paquete_id?: string | null
          folios_base_consumidos?: number
          folios_base_mensuales?: number
          periodo_actual: string
          saldo_paquetes?: number
          tenant_id: string
          umbral_alerta?: number
          updated_at?: string
        }
        Update: {
          autorecarga_activa?: boolean
          autorecarga_paquete_id?: string | null
          folios_base_consumidos?: number
          folios_base_mensuales?: number
          periodo_actual?: string
          saldo_paquetes?: number
          tenant_id?: string
          umbral_alerta?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_folios_saldo_autorecarga_paquete_id_fkey"
            columns: ["autorecarga_paquete_id"]
            isOneToOne: false
            referencedRelation: "folios_paquetes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_folios_saldo_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_onboarding_estado: {
        Row: {
          fase: Database["public"]["Enums"]["onboarding_fase"]
          fase_wizard: number
          fecha_activacion: string | null
          fecha_go_live: string | null
          fecha_invitacion: string
          notas_internas: string | null
          recordatorios_enviados: number
          tenant_id: string
          ultimo_recordatorio: string | null
          updated_at: string
        }
        Insert: {
          fase?: Database["public"]["Enums"]["onboarding_fase"]
          fase_wizard?: number
          fecha_activacion?: string | null
          fecha_go_live?: string | null
          fecha_invitacion?: string
          notas_internas?: string | null
          recordatorios_enviados?: number
          tenant_id: string
          ultimo_recordatorio?: string | null
          updated_at?: string
        }
        Update: {
          fase?: Database["public"]["Enums"]["onboarding_fase"]
          fase_wizard?: number
          fecha_activacion?: string | null
          fecha_go_live?: string | null
          fecha_invitacion?: string
          notas_internas?: string | null
          recordatorios_enviados?: number
          tenant_id?: string
          ultimo_recordatorio?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_onboarding_estado_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          codigo: string
          codigo_postal_fiscal: string | null
          created_at: string
          deleted_at: string | null
          email_fiscal: string | null
          estado: Database["public"]["Enums"]["tenant_estado"]
          fecha_alta: string
          fecha_baja: string | null
          hora_cierre_dia_contable: string
          id: string
          motivo_baja: string | null
          nombre_comercial: string
          plan_actual_id: string | null
          razon_social: string | null
          regimen_fiscal:
            | Database["public"]["Enums"]["regimen_fiscal_sat"]
            | null
          rfc: string | null
          timezone: string
          updated_at: string
          usuario_dueno_id: string | null
          vertical_principal: Database["public"]["Enums"]["vertical_tipo"]
        }
        Insert: {
          codigo: string
          codigo_postal_fiscal?: string | null
          created_at?: string
          deleted_at?: string | null
          email_fiscal?: string | null
          estado?: Database["public"]["Enums"]["tenant_estado"]
          fecha_alta?: string
          fecha_baja?: string | null
          hora_cierre_dia_contable?: string
          id?: string
          motivo_baja?: string | null
          nombre_comercial: string
          plan_actual_id?: string | null
          razon_social?: string | null
          regimen_fiscal?:
            | Database["public"]["Enums"]["regimen_fiscal_sat"]
            | null
          rfc?: string | null
          timezone?: string
          updated_at?: string
          usuario_dueno_id?: string | null
          vertical_principal: Database["public"]["Enums"]["vertical_tipo"]
        }
        Update: {
          codigo?: string
          codigo_postal_fiscal?: string | null
          created_at?: string
          deleted_at?: string | null
          email_fiscal?: string | null
          estado?: Database["public"]["Enums"]["tenant_estado"]
          fecha_alta?: string
          fecha_baja?: string | null
          hora_cierre_dia_contable?: string
          id?: string
          motivo_baja?: string | null
          nombre_comercial?: string
          plan_actual_id?: string | null
          razon_social?: string | null
          regimen_fiscal?:
            | Database["public"]["Enums"]["regimen_fiscal_sat"]
            | null
          rfc?: string | null
          timezone?: string
          updated_at?: string
          usuario_dueno_id?: string | null
          vertical_principal?: Database["public"]["Enums"]["vertical_tipo"]
        }
        Relationships: [
          {
            foreignKeyName: "tenants_plan_actual_id_fkey"
            columns: ["plan_actual_id"]
            isOneToOne: false
            referencedRelation: "planes"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_descuentos_manuales: {
        Row: {
          aplicado_at: string
          autorizacion_pin_id: string
          client_id_local: string | null
          created_at: string
          created_by: string | null
          id: string
          monto_descontado_mxn: number
          motivo_categoria: Database["public"]["Enums"]["descuento_manual_motivo"]
          motivo_reverso: string | null
          motivo_texto: string | null
          precio_override_mxn: number | null
          reversado: boolean
          reversado_at: string | null
          reversado_por_id: string | null
          tenant_id: string
          ticket_id: string
          ticket_item_id: string | null
          tipo: Database["public"]["Enums"]["descuento_manual_tipo"]
          updated_at: string
          usuario_autorizo_id: string
          usuario_solicitante_id: string
          valor_monto_mxn: number | null
          valor_porcentaje: number | null
        }
        Insert: {
          aplicado_at?: string
          autorizacion_pin_id: string
          client_id_local?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          monto_descontado_mxn: number
          motivo_categoria: Database["public"]["Enums"]["descuento_manual_motivo"]
          motivo_reverso?: string | null
          motivo_texto?: string | null
          precio_override_mxn?: number | null
          reversado?: boolean
          reversado_at?: string | null
          reversado_por_id?: string | null
          tenant_id: string
          ticket_id: string
          ticket_item_id?: string | null
          tipo: Database["public"]["Enums"]["descuento_manual_tipo"]
          updated_at?: string
          usuario_autorizo_id: string
          usuario_solicitante_id: string
          valor_monto_mxn?: number | null
          valor_porcentaje?: number | null
        }
        Update: {
          aplicado_at?: string
          autorizacion_pin_id?: string
          client_id_local?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          monto_descontado_mxn?: number
          motivo_categoria?: Database["public"]["Enums"]["descuento_manual_motivo"]
          motivo_reverso?: string | null
          motivo_texto?: string | null
          precio_override_mxn?: number | null
          reversado?: boolean
          reversado_at?: string | null
          reversado_por_id?: string | null
          tenant_id?: string
          ticket_id?: string
          ticket_item_id?: string | null
          tipo?: Database["public"]["Enums"]["descuento_manual_tipo"]
          updated_at?: string
          usuario_autorizo_id?: string
          usuario_solicitante_id?: string
          valor_monto_mxn?: number | null
          valor_porcentaje?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ticket_descuentos_manuales_autorizacion_pin_id_fkey"
            columns: ["autorizacion_pin_id"]
            isOneToOne: false
            referencedRelation: "autorizaciones_pin"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_descuentos_manuales_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_descuentos_manuales_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_descuentos_manuales_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "vw_cumplimiento_tiempos_cocina"
            referencedColumns: ["ticket_id"]
          },
          {
            foreignKeyName: "ticket_descuentos_manuales_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "vw_ventas_apps_externas"
            referencedColumns: ["ticket_id"]
          },
          {
            foreignKeyName: "ticket_descuentos_manuales_ticket_item_id_fkey"
            columns: ["ticket_item_id"]
            isOneToOne: false
            referencedRelation: "ticket_items"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_item_modificadores: {
        Row: {
          cantidad: number
          client_id_local: string | null
          created_at: string
          created_by: string | null
          grupo_id: string | null
          grupo_nombre_snapshot: string
          id: string
          monto_total_mxn: number
          naturaleza_snapshot: Database["public"]["Enums"]["modificador_naturaleza"]
          opcion_modificador_id: string | null
          opcion_nombre_snapshot: string
          precio_extra_snapshot: number
          tenant_id: string
          ticket_item_id: string
          updated_at: string
        }
        Insert: {
          cantidad?: number
          client_id_local?: string | null
          created_at?: string
          created_by?: string | null
          grupo_id?: string | null
          grupo_nombre_snapshot: string
          id?: string
          monto_total_mxn?: number
          naturaleza_snapshot: Database["public"]["Enums"]["modificador_naturaleza"]
          opcion_modificador_id?: string | null
          opcion_nombre_snapshot: string
          precio_extra_snapshot?: number
          tenant_id: string
          ticket_item_id: string
          updated_at?: string
        }
        Update: {
          cantidad?: number
          client_id_local?: string | null
          created_at?: string
          created_by?: string | null
          grupo_id?: string | null
          grupo_nombre_snapshot?: string
          id?: string
          monto_total_mxn?: number
          naturaleza_snapshot?: Database["public"]["Enums"]["modificador_naturaleza"]
          opcion_modificador_id?: string | null
          opcion_nombre_snapshot?: string
          precio_extra_snapshot?: number
          tenant_id?: string
          ticket_item_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_item_modificadores_grupo_id_fkey"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "grupos_modificadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_item_modificadores_opcion_modificador_id_fkey"
            columns: ["opcion_modificador_id"]
            isOneToOne: false
            referencedRelation: "opciones_modificador"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_item_modificadores_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_item_modificadores_ticket_item_id_fkey"
            columns: ["ticket_item_id"]
            isOneToOne: false
            referencedRelation: "ticket_items"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_items: {
        Row: {
          area_cocina_nombre_snapshot: string | null
          autorizacion_cancelacion_id: string | null
          autorizacion_pin_override_id: string | null
          cancelado: boolean
          cancelado_at: string | null
          cantidad: number
          categoria_nombre_snapshot: string | null
          clave_sat_snapshot: string | null
          client_id_local: string | null
          created_at: string
          created_by: string | null
          descuento_item_mxn: number
          id: string
          iva_incluido_en_precio_snapshot: boolean
          iva_item_mxn: number
          modos_servicio_snapshot: string[] | null
          monto_modificadores_mxn: number
          motivo_cancelacion: string | null
          nota_cocina: string | null
          orden_visualizacion: number
          precio_override: boolean
          precio_unitario_original_snapshot: number | null
          precio_unitario_snapshot: number
          producto_id: string | null
          producto_nombre_snapshot: string
          producto_sku_snapshot: string | null
          promocion_item_mxn: number
          subtotal_bruto_mxn: number
          tasa_iva_snapshot: number
          tenant_id: string
          ticket_id: string
          total_item_mxn: number
          unidad_sat_snapshot: string | null
          updated_at: string
          updated_by: string | null
          usuario_cancelo_id: string | null
        }
        Insert: {
          area_cocina_nombre_snapshot?: string | null
          autorizacion_cancelacion_id?: string | null
          autorizacion_pin_override_id?: string | null
          cancelado?: boolean
          cancelado_at?: string | null
          cantidad: number
          categoria_nombre_snapshot?: string | null
          clave_sat_snapshot?: string | null
          client_id_local?: string | null
          created_at?: string
          created_by?: string | null
          descuento_item_mxn?: number
          id?: string
          iva_incluido_en_precio_snapshot: boolean
          iva_item_mxn?: number
          modos_servicio_snapshot?: string[] | null
          monto_modificadores_mxn?: number
          motivo_cancelacion?: string | null
          nota_cocina?: string | null
          orden_visualizacion?: number
          precio_override?: boolean
          precio_unitario_original_snapshot?: number | null
          precio_unitario_snapshot: number
          producto_id?: string | null
          producto_nombre_snapshot: string
          producto_sku_snapshot?: string | null
          promocion_item_mxn?: number
          subtotal_bruto_mxn?: number
          tasa_iva_snapshot: number
          tenant_id: string
          ticket_id: string
          total_item_mxn?: number
          unidad_sat_snapshot?: string | null
          updated_at?: string
          updated_by?: string | null
          usuario_cancelo_id?: string | null
        }
        Update: {
          area_cocina_nombre_snapshot?: string | null
          autorizacion_cancelacion_id?: string | null
          autorizacion_pin_override_id?: string | null
          cancelado?: boolean
          cancelado_at?: string | null
          cantidad?: number
          categoria_nombre_snapshot?: string | null
          clave_sat_snapshot?: string | null
          client_id_local?: string | null
          created_at?: string
          created_by?: string | null
          descuento_item_mxn?: number
          id?: string
          iva_incluido_en_precio_snapshot?: boolean
          iva_item_mxn?: number
          modos_servicio_snapshot?: string[] | null
          monto_modificadores_mxn?: number
          motivo_cancelacion?: string | null
          nota_cocina?: string | null
          orden_visualizacion?: number
          precio_override?: boolean
          precio_unitario_original_snapshot?: number | null
          precio_unitario_snapshot?: number
          producto_id?: string | null
          producto_nombre_snapshot?: string
          producto_sku_snapshot?: string | null
          promocion_item_mxn?: number
          subtotal_bruto_mxn?: number
          tasa_iva_snapshot?: number
          tenant_id?: string
          ticket_id?: string
          total_item_mxn?: number
          unidad_sat_snapshot?: string | null
          updated_at?: string
          updated_by?: string | null
          usuario_cancelo_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ticket_items_autorizacion_cancelacion_id_fkey"
            columns: ["autorizacion_cancelacion_id"]
            isOneToOne: false
            referencedRelation: "autorizaciones_pin"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_items_autorizacion_pin_override_id_fkey"
            columns: ["autorizacion_pin_override_id"]
            isOneToOne: false
            referencedRelation: "autorizaciones_pin"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_items_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_items_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "vw_cumplimiento_tiempos_cocina"
            referencedColumns: ["ticket_id"]
          },
          {
            foreignKeyName: "ticket_items_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "vw_ventas_apps_externas"
            referencedColumns: ["ticket_id"]
          },
        ]
      }
      ticket_promociones_aplicadas: {
        Row: {
          aplicado_at: string
          cancelada_at: string | null
          cancelada_por_cajero: boolean
          client_id_local: string | null
          cliente_id: string | null
          created_at: string
          created_by: string | null
          cumple_condiciones_snapshot: Json
          id: string
          items_afectados: string[]
          monto_descontado_mxn: number
          motivo_cancelacion: string | null
          precio_combo_snapshot: number | null
          precio_especial_snapshot: number | null
          promocion_alcance_snapshot: Database["public"]["Enums"]["promocion_alcance"]
          promocion_id: string
          promocion_nombre_snapshot: string
          promocion_tipo_snapshot: Database["public"]["Enums"]["promocion_tipo"]
          tenant_id: string
          ticket_id: string
          updated_at: string
          usuario_que_cancelo_id: string | null
          valor_monto_snapshot: number | null
          valor_porcentaje_snapshot: number | null
        }
        Insert: {
          aplicado_at?: string
          cancelada_at?: string | null
          cancelada_por_cajero?: boolean
          client_id_local?: string | null
          cliente_id?: string | null
          created_at?: string
          created_by?: string | null
          cumple_condiciones_snapshot?: Json
          id?: string
          items_afectados?: string[]
          monto_descontado_mxn: number
          motivo_cancelacion?: string | null
          precio_combo_snapshot?: number | null
          precio_especial_snapshot?: number | null
          promocion_alcance_snapshot: Database["public"]["Enums"]["promocion_alcance"]
          promocion_id: string
          promocion_nombre_snapshot: string
          promocion_tipo_snapshot: Database["public"]["Enums"]["promocion_tipo"]
          tenant_id: string
          ticket_id: string
          updated_at?: string
          usuario_que_cancelo_id?: string | null
          valor_monto_snapshot?: number | null
          valor_porcentaje_snapshot?: number | null
        }
        Update: {
          aplicado_at?: string
          cancelada_at?: string | null
          cancelada_por_cajero?: boolean
          client_id_local?: string | null
          cliente_id?: string | null
          created_at?: string
          created_by?: string | null
          cumple_condiciones_snapshot?: Json
          id?: string
          items_afectados?: string[]
          monto_descontado_mxn?: number
          motivo_cancelacion?: string | null
          precio_combo_snapshot?: number | null
          precio_especial_snapshot?: number | null
          promocion_alcance_snapshot?: Database["public"]["Enums"]["promocion_alcance"]
          promocion_id?: string
          promocion_nombre_snapshot?: string
          promocion_tipo_snapshot?: Database["public"]["Enums"]["promocion_tipo"]
          tenant_id?: string
          ticket_id?: string
          updated_at?: string
          usuario_que_cancelo_id?: string | null
          valor_monto_snapshot?: number | null
          valor_porcentaje_snapshot?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ticket_promociones_aplicadas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_promociones_aplicadas_promocion_id_fkey"
            columns: ["promocion_id"]
            isOneToOne: false
            referencedRelation: "promociones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_promociones_aplicadas_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_promociones_aplicadas_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_promociones_aplicadas_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "vw_cumplimiento_tiempos_cocina"
            referencedColumns: ["ticket_id"]
          },
          {
            foreignKeyName: "ticket_promociones_aplicadas_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "vw_ventas_apps_externas"
            referencedColumns: ["ticket_id"]
          },
        ]
      }
      tickets: {
        Row: {
          caja_id: string
          cambio_mxn: number
          client_id_local: string | null
          cliente_id: string | null
          comanda_impresa_at: string | null
          comanda_reimpresa_count: number
          created_at: string
          created_by: string | null
          cuenta_abierta_id: string | null
          deleted_at: string | null
          deleted_by: string | null
          descuentos_manuales_mxn: number
          dia_contable: string
          direccion_entrega_id: string | null
          en_espera: boolean
          envio_cocina_automatico: boolean
          estado_cocina: Database["public"]["Enums"]["ticket_estado_cocina"]
          estado_fiscal: Database["public"]["Enums"]["ticket_estado_fiscal"]
          etiqueta_espera: string | null
          fecha_apertura: string
          fecha_entrega: string | null
          fecha_envio_cocina: string | null
          fecha_listo: string | null
          fecha_pago: string | null
          fecha_primer_item: string | null
          fecha_puesto_en_espera: string | null
          folio_completo: string | null
          folio_consecutivo: number | null
          folio_externo_app: string | null
          id: string
          iva_mxn: number
          marca_virtual_id: string | null
          mesero_id: string | null
          modo_servicio: Database["public"]["Enums"]["modo_servicio"]
          monto_pagado_mxn: number
          monto_pendiente_mxn: number | null
          nota_general: string | null
          nota_imprime_en_comanda: boolean
          nota_imprime_en_ticket: boolean
          origen_creacion: Database["public"]["Enums"]["ticket_origen"]
          promociones_mxn: number
          propina_mxn: number
          sincronizado_at: string | null
          subtotal_mxn: number
          sucursal_id: string
          tenant_id: string
          total_mxn: number
          turno_id: string
          updated_at: string
          updated_by: string | null
          usuario_apertura_id: string | null
          usuario_cierre_id: string | null
          usuario_entrega_id: string | null
        }
        Insert: {
          caja_id: string
          cambio_mxn?: number
          client_id_local?: string | null
          cliente_id?: string | null
          comanda_impresa_at?: string | null
          comanda_reimpresa_count?: number
          created_at?: string
          created_by?: string | null
          cuenta_abierta_id?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          descuentos_manuales_mxn?: number
          dia_contable: string
          direccion_entrega_id?: string | null
          en_espera?: boolean
          envio_cocina_automatico?: boolean
          estado_cocina?: Database["public"]["Enums"]["ticket_estado_cocina"]
          estado_fiscal?: Database["public"]["Enums"]["ticket_estado_fiscal"]
          etiqueta_espera?: string | null
          fecha_apertura?: string
          fecha_entrega?: string | null
          fecha_envio_cocina?: string | null
          fecha_listo?: string | null
          fecha_pago?: string | null
          fecha_primer_item?: string | null
          fecha_puesto_en_espera?: string | null
          folio_completo?: string | null
          folio_consecutivo?: number | null
          folio_externo_app?: string | null
          id?: string
          iva_mxn?: number
          marca_virtual_id?: string | null
          mesero_id?: string | null
          modo_servicio: Database["public"]["Enums"]["modo_servicio"]
          monto_pagado_mxn?: number
          monto_pendiente_mxn?: number | null
          nota_general?: string | null
          nota_imprime_en_comanda?: boolean
          nota_imprime_en_ticket?: boolean
          origen_creacion?: Database["public"]["Enums"]["ticket_origen"]
          promociones_mxn?: number
          propina_mxn?: number
          sincronizado_at?: string | null
          subtotal_mxn?: number
          sucursal_id: string
          tenant_id: string
          total_mxn?: number
          turno_id: string
          updated_at?: string
          updated_by?: string | null
          usuario_apertura_id?: string | null
          usuario_cierre_id?: string | null
          usuario_entrega_id?: string | null
        }
        Update: {
          caja_id?: string
          cambio_mxn?: number
          client_id_local?: string | null
          cliente_id?: string | null
          comanda_impresa_at?: string | null
          comanda_reimpresa_count?: number
          created_at?: string
          created_by?: string | null
          cuenta_abierta_id?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          descuentos_manuales_mxn?: number
          dia_contable?: string
          direccion_entrega_id?: string | null
          en_espera?: boolean
          envio_cocina_automatico?: boolean
          estado_cocina?: Database["public"]["Enums"]["ticket_estado_cocina"]
          estado_fiscal?: Database["public"]["Enums"]["ticket_estado_fiscal"]
          etiqueta_espera?: string | null
          fecha_apertura?: string
          fecha_entrega?: string | null
          fecha_envio_cocina?: string | null
          fecha_listo?: string | null
          fecha_pago?: string | null
          fecha_primer_item?: string | null
          fecha_puesto_en_espera?: string | null
          folio_completo?: string | null
          folio_consecutivo?: number | null
          folio_externo_app?: string | null
          id?: string
          iva_mxn?: number
          marca_virtual_id?: string | null
          mesero_id?: string | null
          modo_servicio?: Database["public"]["Enums"]["modo_servicio"]
          monto_pagado_mxn?: number
          monto_pendiente_mxn?: number | null
          nota_general?: string | null
          nota_imprime_en_comanda?: boolean
          nota_imprime_en_ticket?: boolean
          origen_creacion?: Database["public"]["Enums"]["ticket_origen"]
          promociones_mxn?: number
          propina_mxn?: number
          sincronizado_at?: string | null
          subtotal_mxn?: number
          sucursal_id?: string
          tenant_id?: string
          total_mxn?: number
          turno_id?: string
          updated_at?: string
          updated_by?: string | null
          usuario_apertura_id?: string | null
          usuario_cierre_id?: string | null
          usuario_entrega_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tickets_caja_id_fkey"
            columns: ["caja_id"]
            isOneToOne: false
            referencedRelation: "cajas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_cuenta_abierta_id_fkey"
            columns: ["cuenta_abierta_id"]
            isOneToOne: false
            referencedRelation: "cuentas_abiertas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_direccion_entrega_id_fkey"
            columns: ["direccion_entrega_id"]
            isOneToOne: false
            referencedRelation: "direcciones_cliente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_marca_virtual_id_fkey"
            columns: ["marca_virtual_id"]
            isOneToOne: false
            referencedRelation: "marcas_virtuales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_turno_id_fkey"
            columns: ["turno_id"]
            isOneToOne: false
            referencedRelation: "turnos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_turno_id_fkey"
            columns: ["turno_id"]
            isOneToOne: false
            referencedRelation: "vw_efectivo_esperado_turno"
            referencedColumns: ["turno_id"]
          },
          {
            foreignKeyName: "tickets_turno_id_fkey"
            columns: ["turno_id"]
            isOneToOne: false
            referencedRelation: "vw_resumen_turno"
            referencedColumns: ["turno_id"]
          },
        ]
      }
      tickets_cfdi: {
        Row: {
          acuse_xml_storage_path: string | null
          cfdi_sustituye_id: string | null
          created_at: string
          created_by: string | null
          descuento_mxn: number
          devolucion_id: string | null
          emisor_lugar_expedicion: string
          emisor_razon_social: string
          emisor_regimen_fiscal: string
          emisor_rfc: string
          error_es_permanente: boolean
          estado_sat: Database["public"]["Enums"]["cfdi_estado_sat"]
          fecha_emision: string | null
          fecha_timbrado: string | null
          folio_fiscal: string | null
          forma_pago_sat: string
          id: string
          intentos: number
          intentos_timbrado: number
          iva_mxn: number
          metodo_pago_sat: string
          pac_costo_centavos: number | null
          pac_proveedor: Database["public"]["Enums"]["cfdi_proveedor_pac"]
          pac_referencia: string | null
          pdf_storage_path: string | null
          proximo_reintento_at: string | null
          receptor_codigo_postal: string | null
          receptor_email: string | null
          receptor_razon_social: string | null
          receptor_regimen_fiscal: string | null
          receptor_rfc: string | null
          receptor_uso_cfdi: string | null
          serie: string | null
          subtotal_mxn: number
          tenant_id: string
          ticket_id: string
          tipo_comprobante: Database["public"]["Enums"]["cfdi_tipo_comprobante"]
          total_mxn: number
          ultimo_error_codigo: string | null
          ultimo_error_msg: string | null
          ultimo_error_pac: string | null
          ultimo_intento_at: string | null
          updated_at: string
          updated_by: string | null
          uuid_fiscal: string | null
          xml_storage_path: string | null
        }
        Insert: {
          acuse_xml_storage_path?: string | null
          cfdi_sustituye_id?: string | null
          created_at?: string
          created_by?: string | null
          descuento_mxn?: number
          devolucion_id?: string | null
          emisor_lugar_expedicion: string
          emisor_razon_social: string
          emisor_regimen_fiscal: string
          emisor_rfc: string
          error_es_permanente?: boolean
          estado_sat?: Database["public"]["Enums"]["cfdi_estado_sat"]
          fecha_emision?: string | null
          fecha_timbrado?: string | null
          folio_fiscal?: string | null
          forma_pago_sat: string
          id?: string
          intentos?: number
          intentos_timbrado?: number
          iva_mxn?: number
          metodo_pago_sat: string
          pac_costo_centavos?: number | null
          pac_proveedor: Database["public"]["Enums"]["cfdi_proveedor_pac"]
          pac_referencia?: string | null
          pdf_storage_path?: string | null
          proximo_reintento_at?: string | null
          receptor_codigo_postal?: string | null
          receptor_email?: string | null
          receptor_razon_social?: string | null
          receptor_regimen_fiscal?: string | null
          receptor_rfc?: string | null
          receptor_uso_cfdi?: string | null
          serie?: string | null
          subtotal_mxn: number
          tenant_id: string
          ticket_id: string
          tipo_comprobante?: Database["public"]["Enums"]["cfdi_tipo_comprobante"]
          total_mxn: number
          ultimo_error_codigo?: string | null
          ultimo_error_msg?: string | null
          ultimo_error_pac?: string | null
          ultimo_intento_at?: string | null
          updated_at?: string
          updated_by?: string | null
          uuid_fiscal?: string | null
          xml_storage_path?: string | null
        }
        Update: {
          acuse_xml_storage_path?: string | null
          cfdi_sustituye_id?: string | null
          created_at?: string
          created_by?: string | null
          descuento_mxn?: number
          devolucion_id?: string | null
          emisor_lugar_expedicion?: string
          emisor_razon_social?: string
          emisor_regimen_fiscal?: string
          emisor_rfc?: string
          error_es_permanente?: boolean
          estado_sat?: Database["public"]["Enums"]["cfdi_estado_sat"]
          fecha_emision?: string | null
          fecha_timbrado?: string | null
          folio_fiscal?: string | null
          forma_pago_sat?: string
          id?: string
          intentos?: number
          intentos_timbrado?: number
          iva_mxn?: number
          metodo_pago_sat?: string
          pac_costo_centavos?: number | null
          pac_proveedor?: Database["public"]["Enums"]["cfdi_proveedor_pac"]
          pac_referencia?: string | null
          pdf_storage_path?: string | null
          proximo_reintento_at?: string | null
          receptor_codigo_postal?: string | null
          receptor_email?: string | null
          receptor_razon_social?: string | null
          receptor_regimen_fiscal?: string | null
          receptor_rfc?: string | null
          receptor_uso_cfdi?: string | null
          serie?: string | null
          subtotal_mxn?: number
          tenant_id?: string
          ticket_id?: string
          tipo_comprobante?: Database["public"]["Enums"]["cfdi_tipo_comprobante"]
          total_mxn?: number
          ultimo_error_codigo?: string | null
          ultimo_error_msg?: string | null
          ultimo_error_pac?: string | null
          ultimo_intento_at?: string | null
          updated_at?: string
          updated_by?: string | null
          uuid_fiscal?: string | null
          xml_storage_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tickets_cfdi_cfdi_sustituye_id_fkey"
            columns: ["cfdi_sustituye_id"]
            isOneToOne: false
            referencedRelation: "tickets_cfdi"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_cfdi_devolucion_id_fkey"
            columns: ["devolucion_id"]
            isOneToOne: false
            referencedRelation: "devoluciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_cfdi_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_cfdi_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_cfdi_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "vw_cumplimiento_tiempos_cocina"
            referencedColumns: ["ticket_id"]
          },
          {
            foreignKeyName: "tickets_cfdi_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "vw_ventas_apps_externas"
            referencedColumns: ["ticket_id"]
          },
        ]
      }
      tickets_mesas: {
        Row: {
          client_id_local: string | null
          created_at: string
          created_by: string | null
          es_mesa_principal: boolean
          fecha_asignacion: string
          fecha_liberacion: string | null
          id: string
          mesa_anterior_id: string | null
          mesa_id: string
          motivo_liberacion: string | null
          tenant_id: string
          ticket_id: string
          transferencia_autorizacion_pin_id: string | null
          transferencia_motivo: string | null
        }
        Insert: {
          client_id_local?: string | null
          created_at?: string
          created_by?: string | null
          es_mesa_principal?: boolean
          fecha_asignacion?: string
          fecha_liberacion?: string | null
          id?: string
          mesa_anterior_id?: string | null
          mesa_id: string
          motivo_liberacion?: string | null
          tenant_id: string
          ticket_id: string
          transferencia_autorizacion_pin_id?: string | null
          transferencia_motivo?: string | null
        }
        Update: {
          client_id_local?: string | null
          created_at?: string
          created_by?: string | null
          es_mesa_principal?: boolean
          fecha_asignacion?: string
          fecha_liberacion?: string | null
          id?: string
          mesa_anterior_id?: string | null
          mesa_id?: string
          motivo_liberacion?: string | null
          tenant_id?: string
          ticket_id?: string
          transferencia_autorizacion_pin_id?: string | null
          transferencia_motivo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tickets_mesas_mesa_anterior_id_fkey"
            columns: ["mesa_anterior_id"]
            isOneToOne: false
            referencedRelation: "mesas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_mesas_mesa_anterior_id_fkey"
            columns: ["mesa_anterior_id"]
            isOneToOne: false
            referencedRelation: "vw_mesas_estado_actual"
            referencedColumns: ["mesa_id"]
          },
          {
            foreignKeyName: "tickets_mesas_mesa_id_fkey"
            columns: ["mesa_id"]
            isOneToOne: false
            referencedRelation: "mesas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_mesas_mesa_id_fkey"
            columns: ["mesa_id"]
            isOneToOne: false
            referencedRelation: "vw_mesas_estado_actual"
            referencedColumns: ["mesa_id"]
          },
          {
            foreignKeyName: "tickets_mesas_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_mesas_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_mesas_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "vw_cumplimiento_tiempos_cocina"
            referencedColumns: ["ticket_id"]
          },
          {
            foreignKeyName: "tickets_mesas_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "vw_ventas_apps_externas"
            referencedColumns: ["ticket_id"]
          },
          {
            foreignKeyName: "tickets_mesas_transferencia_autorizacion_pin_id_fkey"
            columns: ["transferencia_autorizacion_pin_id"]
            isOneToOne: false
            referencedRelation: "autorizaciones_pin"
            referencedColumns: ["id"]
          },
        ]
      }
      turno_cajero_historial: {
        Row: {
          corte_parcial_id: string | null
          created_at: string
          fecha_fin: string | null
          fecha_inicio: string
          hizo_conteo_parcial: boolean
          id: string
          tenant_id: string
          turno_id: string
          usuario_id: string
        }
        Insert: {
          corte_parcial_id?: string | null
          created_at?: string
          fecha_fin?: string | null
          fecha_inicio: string
          hizo_conteo_parcial?: boolean
          id?: string
          tenant_id: string
          turno_id: string
          usuario_id: string
        }
        Update: {
          corte_parcial_id?: string | null
          created_at?: string
          fecha_fin?: string | null
          fecha_inicio?: string
          hizo_conteo_parcial?: boolean
          id?: string
          tenant_id?: string
          turno_id?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_corte_parcial"
            columns: ["corte_parcial_id"]
            isOneToOne: false
            referencedRelation: "cortes_parciales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "turno_cajero_historial_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "turno_cajero_historial_turno_id_fkey"
            columns: ["turno_id"]
            isOneToOne: false
            referencedRelation: "turnos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "turno_cajero_historial_turno_id_fkey"
            columns: ["turno_id"]
            isOneToOne: false
            referencedRelation: "vw_efectivo_esperado_turno"
            referencedColumns: ["turno_id"]
          },
          {
            foreignKeyName: "turno_cajero_historial_turno_id_fkey"
            columns: ["turno_id"]
            isOneToOne: false
            referencedRelation: "vw_resumen_turno"
            referencedColumns: ["turno_id"]
          },
        ]
      }
      turnos: {
        Row: {
          admin_decision:
            | Database["public"]["Enums"]["admin_decision_cierre"]
            | null
          admin_notas: string | null
          caja_id: string
          codigo_turno: string
          created_at: string
          dia_contable: string
          diferencia_descripcion: string | null
          diferencia_justificacion: string | null
          diferencia_mxn: number | null
          efectivo_contado_mxn: number | null
          efectivo_esperado_mxn: number | null
          estado: Database["public"]["Enums"]["turno_estado"]
          fecha_apertura: string
          fecha_cierre: string | null
          fecha_validacion: string | null
          fondo_inicial_mxn: number
          fondo_modo: Database["public"]["Enums"]["fondo_modo_captura"]
          id: string
          notas_apertura: string | null
          notas_cierre: string | null
          sucursal_id: string
          tenant_id: string
          updated_at: string
          usuario_apertura_id: string
          usuario_cierre_id: string | null
          usuario_validacion_id: string | null
        }
        Insert: {
          admin_decision?:
            | Database["public"]["Enums"]["admin_decision_cierre"]
            | null
          admin_notas?: string | null
          caja_id: string
          codigo_turno: string
          created_at?: string
          dia_contable: string
          diferencia_descripcion?: string | null
          diferencia_justificacion?: string | null
          diferencia_mxn?: number | null
          efectivo_contado_mxn?: number | null
          efectivo_esperado_mxn?: number | null
          estado?: Database["public"]["Enums"]["turno_estado"]
          fecha_apertura?: string
          fecha_cierre?: string | null
          fecha_validacion?: string | null
          fondo_inicial_mxn: number
          fondo_modo?: Database["public"]["Enums"]["fondo_modo_captura"]
          id?: string
          notas_apertura?: string | null
          notas_cierre?: string | null
          sucursal_id: string
          tenant_id: string
          updated_at?: string
          usuario_apertura_id: string
          usuario_cierre_id?: string | null
          usuario_validacion_id?: string | null
        }
        Update: {
          admin_decision?:
            | Database["public"]["Enums"]["admin_decision_cierre"]
            | null
          admin_notas?: string | null
          caja_id?: string
          codigo_turno?: string
          created_at?: string
          dia_contable?: string
          diferencia_descripcion?: string | null
          diferencia_justificacion?: string | null
          diferencia_mxn?: number | null
          efectivo_contado_mxn?: number | null
          efectivo_esperado_mxn?: number | null
          estado?: Database["public"]["Enums"]["turno_estado"]
          fecha_apertura?: string
          fecha_cierre?: string | null
          fecha_validacion?: string | null
          fondo_inicial_mxn?: number
          fondo_modo?: Database["public"]["Enums"]["fondo_modo_captura"]
          id?: string
          notas_apertura?: string | null
          notas_cierre?: string | null
          sucursal_id?: string
          tenant_id?: string
          updated_at?: string
          usuario_apertura_id?: string
          usuario_cierre_id?: string | null
          usuario_validacion_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "turnos_caja_id_fkey"
            columns: ["caja_id"]
            isOneToOne: false
            referencedRelation: "cajas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "turnos_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "turnos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      unidades_medida: {
        Row: {
          activa: boolean
          codigo: string
          created_at: string
          dimension: string
          es_sistema: boolean
          es_unidad_base: boolean
          id: string
          nombre: string
          orden_visualizacion: number
          simbolo: string
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          activa?: boolean
          codigo: string
          created_at?: string
          dimension: string
          es_sistema?: boolean
          es_unidad_base?: boolean
          id?: string
          nombre: string
          orden_visualizacion?: number
          simbolo: string
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          activa?: boolean
          codigo?: string
          created_at?: string
          dimension?: string
          es_sistema?: boolean
          es_unidad_base?: boolean
          id?: string
          nombre?: string
          orden_visualizacion?: number
          simbolo?: string
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "unidades_medida_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      usuarios_acceso: {
        Row: {
          activo: boolean
          created_at: string
          created_by: string | null
          fecha_fin: string | null
          fecha_inicio: string
          id: string
          notas: string | null
          rol_id: string
          subtipo_personal_id: string | null
          sucursal_id: string | null
          tenant_id: string
          updated_at: string
          updated_by: string | null
          usuario_id: string
        }
        Insert: {
          activo?: boolean
          created_at?: string
          created_by?: string | null
          fecha_fin?: string | null
          fecha_inicio?: string
          id?: string
          notas?: string | null
          rol_id: string
          subtipo_personal_id?: string | null
          sucursal_id?: string | null
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
          usuario_id: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          created_by?: string | null
          fecha_fin?: string | null
          fecha_inicio?: string
          id?: string
          notas?: string | null
          rol_id?: string
          subtipo_personal_id?: string | null
          sucursal_id?: string | null
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "usuarios_acceso_rol_id_fkey"
            columns: ["rol_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usuarios_acceso_subtipo_personal_id_fkey"
            columns: ["subtipo_personal_id"]
            isOneToOne: false
            referencedRelation: "subtipos_personal"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usuarios_acceso_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usuarios_acceso_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      usuarios_perfil: {
        Row: {
          apellido_materno: string | null
          apellido_paterno: string | null
          bloqueado_hasta: string | null
          created_at: string
          deleted_at: string | null
          estado: Database["public"]["Enums"]["usuario_estado"]
          fecha_ultimo_login_pin: string | null
          fecha_ultimo_login_web: string | null
          foto_url: string | null
          id: string
          intentos_pin_fallidos: number
          nombre: string
          pin_hash: string | null
          telefono: string | null
          updated_at: string
        }
        Insert: {
          apellido_materno?: string | null
          apellido_paterno?: string | null
          bloqueado_hasta?: string | null
          created_at?: string
          deleted_at?: string | null
          estado?: Database["public"]["Enums"]["usuario_estado"]
          fecha_ultimo_login_pin?: string | null
          fecha_ultimo_login_web?: string | null
          foto_url?: string | null
          id: string
          intentos_pin_fallidos?: number
          nombre: string
          pin_hash?: string | null
          telefono?: string | null
          updated_at?: string
        }
        Update: {
          apellido_materno?: string | null
          apellido_paterno?: string | null
          bloqueado_hasta?: string | null
          created_at?: string
          deleted_at?: string | null
          estado?: Database["public"]["Enums"]["usuario_estado"]
          fecha_ultimo_login_pin?: string | null
          fecha_ultimo_login_web?: string | null
          foto_url?: string | null
          id?: string
          intentos_pin_fallidos?: number
          nombre?: string
          pin_hash?: string | null
          telefono?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      vw_cumplimiento_delivery_agregado: {
        Row: {
          cumplidos: number | null
          deliveries_con_diferencia: number | null
          deliveries_total: number | null
          dia_contable: string | null
          diferencia_total_mxn: number | null
          no_entregados: number | null
          sucursal_id: string | null
          tarde_grave: number | null
          tarde_ligero: number | null
          tenant_id: string | null
          tiempo_promesa_promedio_min: number | null
          tiempo_real_promedio_min: number | null
        }
        Relationships: [
          {
            foreignKeyName: "delivery_asignaciones_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_asignaciones_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_cumplimiento_tiempos_cocina: {
        Row: {
          dia_contable: string | null
          fecha_entrega: string | null
          fecha_envio_cocina: string | null
          fecha_listo: string | null
          folio_completo: string | null
          minutos_cocina: number | null
          minutos_listo_a_entrega: number | null
          minutos_total: number | null
          modo_servicio: Database["public"]["Enums"]["modo_servicio"] | null
          sucursal_id: string | null
          tenant_id: string | null
          ticket_id: string | null
        }
        Insert: {
          dia_contable?: string | null
          fecha_entrega?: string | null
          fecha_envio_cocina?: string | null
          fecha_listo?: string | null
          folio_completo?: string | null
          minutos_cocina?: never
          minutos_listo_a_entrega?: never
          minutos_total?: never
          modo_servicio?: Database["public"]["Enums"]["modo_servicio"] | null
          sucursal_id?: string | null
          tenant_id?: string | null
          ticket_id?: string | null
        }
        Update: {
          dia_contable?: string | null
          fecha_entrega?: string | null
          fecha_envio_cocina?: string | null
          fecha_listo?: string | null
          folio_completo?: string | null
          minutos_cocina?: never
          minutos_listo_a_entrega?: never
          minutos_total?: never
          modo_servicio?: Database["public"]["Enums"]["modo_servicio"] | null
          sucursal_id?: string | null
          tenant_id?: string | null
          ticket_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tickets_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_cumplimiento_tiempos_cocina_agregado: {
        Row: {
          dia_contable: string | null
          minutos_cocina_max: number | null
          minutos_cocina_mediana: number | null
          minutos_cocina_p95: number | null
          minutos_cocina_promedio: number | null
          modo_servicio: Database["public"]["Enums"]["modo_servicio"] | null
          sucursal_id: string | null
          tenant_id: string | null
          tickets_cocina_16_30min: number | null
          tickets_cocina_bajo_15min: number | null
          tickets_cocina_mayor_30min: number | null
          tickets_total: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tickets_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_cumplimiento_tiempos_delivery: {
        Row: {
          cumplimiento_promesa: string | null
          delivery_estado_final:
            | Database["public"]["Enums"]["delivery_estado"]
            | null
          delivery_id: string | null
          dia_contable: string | null
          diferencia_liquidacion_mxn: number | null
          folio_completo: string | null
          repartidor_email: string | null
          repartidor_id: string | null
          sucursal_id: string | null
          tenant_id: string | null
          ticket_id: string | null
          tiempo_promesa_minutos: number | null
          tiempo_real_minutos: number | null
        }
        Relationships: [
          {
            foreignKeyName: "delivery_asignaciones_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_asignaciones_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_asignaciones_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_asignaciones_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "vw_cumplimiento_tiempos_cocina"
            referencedColumns: ["ticket_id"]
          },
          {
            foreignKeyName: "delivery_asignaciones_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "vw_ventas_apps_externas"
            referencedColumns: ["ticket_id"]
          },
        ]
      }
      vw_descuentos_por_usuario: {
        Row: {
          ajuste_count: number | null
          cantidad_descuentos: number | null
          cortesia_count: number | null
          defecto_count: number | null
          descuento_promedio_mxn: number | null
          dia_contable: string | null
          otro_count: number | null
          sucursal_id: string | null
          tenant_id: string | null
          total_descontado_mxn: number | null
          usuario_email: string | null
          usuario_id: string | null
          vip_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ticket_descuentos_manuales_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_efectivo_esperado_turno: {
        Row: {
          ajustes_mxn: number | null
          caja_id: string | null
          dia_contable: string | null
          efectivo_esperado_mxn: number | null
          fondo_inicial_mxn: number | null
          inyecciones_fondo_mxn: number | null
          pagos_efectivo_netos_mxn: number | null
          retiros_y_devoluciones_mxn: number | null
          sucursal_id: string | null
          tenant_id: string | null
          turno_estado: Database["public"]["Enums"]["turno_estado"] | null
          turno_id: string | null
          ultimo_corte_declarado_mxn: number | null
          ultimo_corte_diferencia_mxn: number | null
        }
        Insert: {
          ajustes_mxn?: never
          caja_id?: string | null
          dia_contable?: string | null
          efectivo_esperado_mxn?: never
          fondo_inicial_mxn?: number | null
          inyecciones_fondo_mxn?: never
          pagos_efectivo_netos_mxn?: never
          retiros_y_devoluciones_mxn?: never
          sucursal_id?: string | null
          tenant_id?: string | null
          turno_estado?: Database["public"]["Enums"]["turno_estado"] | null
          turno_id?: string | null
          ultimo_corte_declarado_mxn?: never
          ultimo_corte_diferencia_mxn?: never
        }
        Update: {
          ajustes_mxn?: never
          caja_id?: string | null
          dia_contable?: string | null
          efectivo_esperado_mxn?: never
          fondo_inicial_mxn?: number | null
          inyecciones_fondo_mxn?: never
          pagos_efectivo_netos_mxn?: never
          retiros_y_devoluciones_mxn?: never
          sucursal_id?: string | null
          tenant_id?: string | null
          turno_estado?: Database["public"]["Enums"]["turno_estado"] | null
          turno_id?: string | null
          ultimo_corte_declarado_mxn?: never
          ultimo_corte_diferencia_mxn?: never
        }
        Relationships: [
          {
            foreignKeyName: "turnos_caja_id_fkey"
            columns: ["caja_id"]
            isOneToOne: false
            referencedRelation: "cajas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "turnos_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "turnos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_estado_resultados_dia: {
        Row: {
          cancelaciones_post_pago_mxn: number | null
          comisiones_apps_mxn: number | null
          descuentos_manuales_mxn: number | null
          devoluciones_mxn: number | null
          dia_contable: string | null
          iva_neto_mxn: number | null
          promociones_mxn: number | null
          propinas_capturadas_mxn: number | null
          subtotal_neto_mxn: number | null
          sucursal_id: string | null
          tenant_id: string | null
          ticket_promedio_mxn: number | null
          tickets_apps: number | null
          tickets_cancelados: number | null
          tickets_comer_aqui: number | null
          tickets_completados: number | null
          tickets_delivery_propio: number | null
          tickets_para_llevar: number | null
          tickets_pendientes: number | null
          total_neto_mxn: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tickets_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_marcas_kpi_acumulado: {
        Row: {
          ingresos_totales_mxn: number | null
          marca_color: string | null
          marca_nombre: string | null
          marca_virtual_id: string | null
          modo_servicio_dominante:
            | Database["public"]["Enums"]["modo_servicio"]
            | null
          primer_dia_actividad: string | null
          tenant_id: string | null
          ticket_promedio_mxn: number | null
          tickets_apps: number | null
          tickets_totales: number | null
          ultimo_dia_actividad: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tickets_marca_virtual_id_fkey"
            columns: ["marca_virtual_id"]
            isOneToOne: false
            referencedRelation: "marcas_virtuales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_mesas_estado_actual: {
        Row: {
          capacidad: number | null
          forma: string | null
          mesa_estado: Database["public"]["Enums"]["mesa_estado"] | null
          mesa_id: string | null
          mesa_numero: string | null
          mesero_email: string | null
          minutos_ocupada: number | null
          posicion_x: number | null
          posicion_y: number | null
          reservacion_actual_id: string | null
          seccion_id: string | null
          seccion_nombre: string | null
          sucursal_id: string | null
          tenant_id: string | null
          ticket_activo_id: string | null
          ticket_fecha_apertura: string | null
          ticket_fecha_primer_item: string | null
          ticket_folio: string | null
          ticket_mesero_id: string | null
          ticket_total_mxn: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_mesas_reservacion_actual"
            columns: ["reservacion_actual_id"]
            isOneToOne: false
            referencedRelation: "reservaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mesas_seccion_id_fkey"
            columns: ["seccion_id"]
            isOneToOne: false
            referencedRelation: "secciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mesas_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mesas_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_mesas_ticket_id_fkey"
            columns: ["ticket_activo_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_mesas_ticket_id_fkey"
            columns: ["ticket_activo_id"]
            isOneToOne: false
            referencedRelation: "vw_cumplimiento_tiempos_cocina"
            referencedColumns: ["ticket_id"]
          },
          {
            foreignKeyName: "tickets_mesas_ticket_id_fkey"
            columns: ["ticket_activo_id"]
            isOneToOne: false
            referencedRelation: "vw_ventas_apps_externas"
            referencedColumns: ["ticket_id"]
          },
        ]
      }
      vw_no_shows_reservaciones: {
        Row: {
          canceladas: number | null
          comensales_llegaron: number | null
          comensales_no_show: number | null
          dia_reserva: string | null
          llegaron: number | null
          no_shows: number | null
          reservas_total: number | null
          sucursal_id: string | null
          tasa_no_show_pct: number | null
          tenant_id: string | null
          terminadas: number | null
        }
        Relationships: [
          {
            foreignKeyName: "reservaciones_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservaciones_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_reimpresiones_por_cajero: {
        Row: {
          cajero_email: string | null
          cajero_id: string | null
          dia: string | null
          reimpresiones_count: number | null
          sucursal_id: string | null
          tenant_id: string | null
          tickets_distintos: number | null
        }
        Relationships: [
          {
            foreignKeyName: "comanda_impresiones_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comanda_impresiones_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_resumen_corte_caja: {
        Row: {
          caja_id: string | null
          cajero_email: string | null
          cajero_id: string | null
          corte_id: string | null
          desglose_metodos: Json | null
          diferencia_total_mxn: number | null
          fecha_corte: string | null
          motivo_corte: string | null
          sucursal_id: string | null
          tenant_id: string | null
          total_declarado_mxn: number | null
          total_esperado_mxn: number | null
          turno_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cortes_caja_caja_id_fkey"
            columns: ["caja_id"]
            isOneToOne: false
            referencedRelation: "cajas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cortes_caja_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cortes_caja_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cortes_caja_turno_id_fkey"
            columns: ["turno_id"]
            isOneToOne: false
            referencedRelation: "turnos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cortes_caja_turno_id_fkey"
            columns: ["turno_id"]
            isOneToOne: false
            referencedRelation: "vw_efectivo_esperado_turno"
            referencedColumns: ["turno_id"]
          },
          {
            foreignKeyName: "cortes_caja_turno_id_fkey"
            columns: ["turno_id"]
            isOneToOne: false
            referencedRelation: "vw_resumen_turno"
            referencedColumns: ["turno_id"]
          },
        ]
      }
      vw_resumen_turno: {
        Row: {
          caja_id: string | null
          cancelaciones_count: number | null
          cortes_count: number | null
          devoluciones_count: number | null
          devoluciones_total_mxn: number | null
          dia_contable: string | null
          efectivo_esperado_mxn: number | null
          fecha_apertura: string | null
          fecha_cierre: string | null
          folio_z: string | null
          propinas_capturadas_mxn: number | null
          reporte_z_id: string | null
          sucursal_id: string | null
          tenant_id: string | null
          tickets_pagados: number | null
          total_vendido_mxn: number | null
          turno_estado: Database["public"]["Enums"]["turno_estado"] | null
          turno_id: string | null
          usuario_apertura_id: string | null
          usuario_cierre_id: string | null
          z_diferencia_efectivo_mxn: number | null
        }
        Insert: {
          caja_id?: string | null
          cancelaciones_count?: never
          cortes_count?: never
          devoluciones_count?: never
          devoluciones_total_mxn?: never
          dia_contable?: string | null
          efectivo_esperado_mxn?: never
          fecha_apertura?: string | null
          fecha_cierre?: string | null
          folio_z?: never
          propinas_capturadas_mxn?: never
          reporte_z_id?: never
          sucursal_id?: string | null
          tenant_id?: string | null
          tickets_pagados?: never
          total_vendido_mxn?: never
          turno_estado?: Database["public"]["Enums"]["turno_estado"] | null
          turno_id?: string | null
          usuario_apertura_id?: string | null
          usuario_cierre_id?: string | null
          z_diferencia_efectivo_mxn?: never
        }
        Update: {
          caja_id?: string | null
          cancelaciones_count?: never
          cortes_count?: never
          devoluciones_count?: never
          devoluciones_total_mxn?: never
          dia_contable?: string | null
          efectivo_esperado_mxn?: never
          fecha_apertura?: string | null
          fecha_cierre?: string | null
          folio_z?: never
          propinas_capturadas_mxn?: never
          reporte_z_id?: never
          sucursal_id?: string | null
          tenant_id?: string | null
          tickets_pagados?: never
          total_vendido_mxn?: never
          turno_estado?: Database["public"]["Enums"]["turno_estado"] | null
          turno_id?: string | null
          usuario_apertura_id?: string | null
          usuario_cierre_id?: string | null
          z_diferencia_efectivo_mxn?: never
        }
        Relationships: [
          {
            foreignKeyName: "turnos_caja_id_fkey"
            columns: ["caja_id"]
            isOneToOne: false
            referencedRelation: "cajas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "turnos_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "turnos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_ventas_apps_externas: {
        Row: {
          app_externa: Database["public"]["Enums"]["modo_servicio"] | null
          comision_app: number | null
          dia_contable: string | null
          diferencia_pos_vs_app: number | null
          estado_conciliacion: string | null
          folio_app: string | null
          folio_liquidacion_app: string | null
          folio_pos: string | null
          liquidacion_id: string | null
          monto_neto_liquidado_app: number | null
          monto_segun_liquidacion_app: number | null
          pago_registrado_pos_mxn: number | null
          periodo_fin: string | null
          periodo_inicio: string | null
          sucursal_id: string | null
          tenant_id: string | null
          ticket_id: string | null
          total_pos_mxn: number | null
        }
        Relationships: [
          {
            foreignKeyName: "apps_liquidacion_items_liquidacion_id_fkey"
            columns: ["liquidacion_id"]
            isOneToOne: false
            referencedRelation: "apps_liquidaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_ventas_por_area_cocina: {
        Row: {
          area_cocina: string | null
          dia_contable: string | null
          sucursal_id: string | null
          tenant_id: string | null
          tickets_con_area: number | null
          total_vendido_mxn: number | null
          unidades_preparadas: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tickets_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_ventas_por_categoria: {
        Row: {
          categoria: string | null
          dia_contable: string | null
          iva_mxn: number | null
          precio_unitario_promedio_mxn: number | null
          subtotal_mxn: number | null
          sucursal_id: string | null
          tenant_id: string | null
          tickets_con_categoria: number | null
          total_mxn: number | null
          unidades_vendidas: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tickets_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_ventas_por_marca: {
        Row: {
          descuentos_manuales_mxn: number | null
          dia_contable: string | null
          iva_neto_mxn: number | null
          marca_color: string | null
          marca_nombre: string | null
          marca_virtual_id: string | null
          promociones_mxn: number | null
          subtotal_neto_mxn: number | null
          sucursal_id: string | null
          tenant_id: string | null
          ticket_promedio_mxn: number | null
          tickets_cancelados: number | null
          tickets_completados: number | null
          total_neto_mxn: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tickets_marca_virtual_id_fkey"
            columns: ["marca_virtual_id"]
            isOneToOne: false
            referencedRelation: "marcas_virtuales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_ventas_por_mesero: {
        Row: {
          dia_contable: string | null
          mesero_email: string | null
          mesero_id: string | null
          propina_pct_promedio: number | null
          propinas_capturadas_mxn: number | null
          sucursal_id: string | null
          tenant_id: string | null
          ticket_promedio_mxn: number | null
          tickets_atendidos: number | null
          total_vendido_mxn: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tickets_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_ventas_por_modo_servicio: {
        Row: {
          comisiones_apps_mxn: number | null
          dia_contable: string | null
          modo_servicio: Database["public"]["Enums"]["modo_servicio"] | null
          sucursal_id: string | null
          tenant_id: string | null
          ticket_promedio_mxn: number | null
          tickets: number | null
          total_mxn: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tickets_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_ventas_por_producto: {
        Row: {
          dia_contable: string | null
          iva_mxn: number | null
          precio_unitario_promedio_mxn: number | null
          producto_id: string | null
          producto_nombre: string | null
          producto_sku: string | null
          subtotal_mxn: number | null
          sucursal_id: string | null
          tenant_id: string | null
          tickets_con_producto: number | null
          total_mxn: number | null
          unidades_vendidas: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ticket_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      abrir_cuenta: {
        Args: {
          p_caja_id: string
          p_client_id_local?: string
          p_cliente_id?: string
          p_mesero_id?: string
          p_nombre_cuenta: string
          p_sucursal_id: string
          p_turno_id: string
        }
        Returns: string
      }
      abrir_ticket: {
        Args: {
          p_caja_id: string
          p_client_id_local?: string
          p_cliente_id?: string
          p_marca_virtual_id?: string
          p_modo_servicio: Database["public"]["Enums"]["modo_servicio"]
          p_sucursal_id: string
          p_turno_id: string
          p_usuario_id?: string
        }
        Returns: string
      }
      agregar_item_a_ticket: {
        Args: {
          p_cantidad: number
          p_client_id_local?: string
          p_modificadores?: Json
          p_nota_cocina?: string
          p_producto_id: string
          p_ticket_id: string
        }
        Returns: string
      }
      aplicar_descuento_manual: {
        Args: {
          p_autorizacion_pin_id: string
          p_client_id_local?: string
          p_motivo_categoria: Database["public"]["Enums"]["descuento_manual_motivo"]
          p_motivo_texto: string
          p_ticket_id: string
          p_ticket_item_id: string
          p_tipo: Database["public"]["Enums"]["descuento_manual_tipo"]
          p_usuario_autorizo_id: string
          p_usuario_solicitante_id: string
          p_valor: number
        }
        Returns: string
      }
      aplicar_movimiento_inventario: {
        Args: {
          p_cantidad: number
          p_costo_unitario_mxn?: number
          p_descripcion?: string
          p_factura_referencia?: string
          p_insumo_id: string
          p_motivo?: string
          p_proveedor_texto?: string
          p_sucursal_id: string
          p_tenant_id: string
          p_ticket_id?: string
          p_tipo: Database["public"]["Enums"]["movimiento_inventario_tipo"]
          p_usuario_id?: string
        }
        Returns: string
      }
      aplicar_pago: {
        Args: {
          p_client_id_local?: string
          p_es_pago_al_recibir?: boolean
          p_folio_externo?: string
          p_metodo_pago: Database["public"]["Enums"]["metodo_pago"]
          p_monto_mxn: number
          p_monto_recibido_mxn?: number
          p_nota?: string
          p_referencia?: string
          p_terminal_aprobacion?: string
          p_ticket_id: string
        }
        Returns: string
      }
      arquear_caja: {
        Args: {
          p_autorizacion_pin_id?: string
          p_declaraciones: Json
          p_motivo_corte: string
          p_turno_id: string
          p_usuario_id: string
        }
        Returns: Json
      }
      asignar_delivery: {
        Args: {
          p_client_id_local?: string
          p_destino_lat?: number
          p_destino_lng?: number
          p_distancia_km_estimada?: number
          p_monto_a_liquidar_mxn: number
          p_repartidor_id: string
          p_ticket_id: string
          p_tiempo_promesa_minutos?: number
        }
        Returns: string
      }
      asignar_mesa_a_ticket: {
        Args: {
          p_client_id_local?: string
          p_es_principal?: boolean
          p_mesa_id: string
          p_ticket_id: string
        }
        Returns: string
      }
      auto_marcar_no_shows: { Args: never; Returns: number }
      buscar_clientes: {
        Args: { p_limit?: number; p_query: string; p_tenant_id: string }
        Returns: {
          id: string
          nombre: string
          rfc: string
          score: number
          telefono: string
        }[]
      }
      calcular_dia_contable: {
        Args: { p_tenant_id: string; p_ts?: string }
        Returns: string
      }
      calcular_distribucion_propinas: {
        Args: { p_turno_id: string }
        Returns: Json
      }
      calcular_efectivo_esperado: {
        Args: { p_turno_id: string }
        Returns: number
      }
      cancelar_item_ticket: {
        Args: {
          p_autorizacion_pin_id?: string
          p_motivo: string
          p_ticket_item_id: string
        }
        Returns: undefined
      }
      cancelar_reservacion: {
        Args: { p_motivo: string; p_reservacion_id: string }
        Returns: undefined
      }
      cancelar_ticket_pagado: {
        Args: {
          p_autorizacion_pin_id: string
          p_caja_id: string
          p_cancelar_cfdi_sat?: boolean
          p_client_id_local?: string
          p_devolver_dinero?: boolean
          p_medio_devolucion?: Database["public"]["Enums"]["devolucion_medio"]
          p_motivo: Database["public"]["Enums"]["cancelacion_motivo"]
          p_motivo_texto: string
          p_nota?: string
          p_reversar_inventario?: boolean
          p_ticket_id: string
          p_turno_id: string
          p_usuario_autorizo_id: string
          p_usuario_solicitante_id: string
        }
        Returns: string
      }
      cerrar_ticket_si_pagado: {
        Args: { p_ticket_id: string }
        Returns: boolean
      }
      cfdi_crear_borrador: {
        Args: {
          p_cfdi_sustituye_id?: string
          p_devolucion_id?: string
          p_emisor_lugar_expedicion: string
          p_emisor_razon_social: string
          p_emisor_regimen_fiscal: string
          p_emisor_rfc: string
          p_forma_pago_sat: string
          p_metodo_pago_sat: string
          p_pac_proveedor: Database["public"]["Enums"]["cfdi_proveedor_pac"]
          p_receptor_codigo_postal: string
          p_receptor_email: string
          p_receptor_razon_social: string
          p_receptor_regimen_fiscal: string
          p_receptor_rfc: string
          p_receptor_uso_cfdi: string
          p_ticket_id: string
          p_tipo_comprobante: Database["public"]["Enums"]["cfdi_tipo_comprobante"]
        }
        Returns: string
      }
      cfdi_marcar_cancelado_sat: {
        Args: {
          p_acuse_storage_path: string
          p_cfdi_id: string
          p_response_payload: Json
        }
        Returns: undefined
      }
      cfdi_marcar_error: {
        Args: {
          p_cfdi_id: string
          p_codigo_error: string
          p_mensaje_error: string
          p_request_payload: Json
          p_response_payload: Json
        }
        Returns: undefined
      }
      cfdi_marcar_timbrado: {
        Args: {
          p_cfdi_id: string
          p_fecha_emision: string
          p_fecha_timbrado: string
          p_folio_fiscal: string
          p_pac_costo_centavos: number
          p_pac_referencia: string
          p_pdf_storage_path: string
          p_request_payload: Json
          p_response_payload: Json
          p_serie: string
          p_uuid_fiscal: string
          p_xml_storage_path: string
        }
        Returns: undefined
      }
      confirmar_devolucion: {
        Args: { p_devolucion_id: string; p_usuario_id: string }
        Returns: undefined
      }
      confirmar_entrega_delivery: {
        Args: { p_asignacion_id: string; p_propina_repartidor_mxn?: number }
        Returns: undefined
      }
      confirmar_llegada_reservacion: {
        Args: {
          p_mesa_asignada_id?: string
          p_reservacion_id: string
          p_ticket_id?: string
        }
        Returns: undefined
      }
      confirmar_salida_delivery: {
        Args: { p_asignacion_id: string }
        Returns: undefined
      }
      consumir_folio_cfdi: {
        Args: { p_cfdi_id: string; p_es_global?: boolean; p_tenant_id: string }
        Returns: Json
      }
      convertir_unidad: {
        Args: {
          p_cantidad: number
          p_unidad_destino_id: string
          p_unidad_origen_id: string
        }
        Returns: number
      }
      crear_devolucion: {
        Args: {
          p_alcance: Database["public"]["Enums"]["devolucion_alcance"]
          p_autorizacion_pin_id: string
          p_caja_id: string
          p_client_id_local?: string
          p_cliente_id?: string
          p_items: Json
          p_medio_devolucion: Database["public"]["Enums"]["devolucion_medio"]
          p_motivo: Database["public"]["Enums"]["devolucion_motivo"]
          p_motivo_texto: string
          p_nota?: string
          p_reversar_inventario?: boolean
          p_ticket_original_id: string
          p_turno_id: string
          p_usuario_autorizo_id: string
          p_usuario_solicitante_id: string
        }
        Returns: string
      }
      crear_perfil_con_pin: {
        Args: { p_nombre: string; p_pin: string; p_usuario_id: string }
        Returns: undefined
      }
      crear_reservacion: {
        Args: {
          p_canal: Database["public"]["Enums"]["reservacion_canal"]
          p_client_id_local?: string
          p_cliente_email: string
          p_cliente_id?: string
          p_cliente_nombre: string
          p_cliente_telefono: string
          p_comensales: number
          p_duracion_estimada?: number
          p_fecha_hora: string
          p_mesa_preferida_id?: string
          p_nota?: string
          p_ocasion_especial?: string
          p_seccion_preferida_id?: string
          p_sucursal_id: string
        }
        Returns: string
      }
      crear_tenant_con_owner: {
        Args: {
          p_codigo: string
          p_estado?: Database["public"]["Enums"]["tenant_estado"]
          p_nombre_comercial: string
          p_nombre_owner: string
          p_notas_internas?: string
          p_owner_user_id: string
          p_plan_codigo: string
          p_telefono_owner: string
          p_vertical: Database["public"]["Enums"]["vertical_tipo"]
        }
        Returns: string
      }
      current_sucursal_id: { Args: never; Returns: string }
      current_tenant_id: { Args: never; Returns: string }
      custom_access_token_hook: { Args: { event: Json }; Returns: Json }
      descontar_inventario_por_venta: {
        Args: { p_ticket_id: string }
        Returns: undefined
      }
      detectar_descuentos_sospechosos: {
        Args: {
          p_fecha_desde: string
          p_fecha_hasta: string
          p_sucursal_id: string
          p_umbral_count?: number
          p_umbral_monto?: number
        }
        Returns: Json
      }
      entregar_propina: {
        Args: { p_distribucion_id: string }
        Returns: undefined
      }
      es_admin_del_tenant: { Args: { p_tenant_id: string }; Returns: boolean }
      establecer_propina_ticket: {
        Args: { p_monto_mxn: number; p_ticket_id: string }
        Returns: undefined
      }
      estado_resultados_periodo: {
        Args: {
          p_fecha_desde: string
          p_fecha_hasta: string
          p_sucursal_id: string
        }
        Returns: Json
      }
      evaluar_alertas_stock: {
        Args: { p_insumo_id: string; p_sucursal_id: string }
        Returns: undefined
      }
      evaluar_promociones_aplicables: {
        Args: { p_ticket_id: string }
        Returns: {
          alcance: Database["public"]["Enums"]["promocion_alcance"]
          condiciones: Json
          monto_descuento_estimado_mxn: number
          nombre: string
          prioridad: number
          promocion_id: string
          tipo: Database["public"]["Enums"]["promocion_tipo"]
        }[]
      }
      f_unaccent: { Args: { "": string }; Returns: string }
      generar_folio: {
        Args: {
          p_anio?: number
          p_sucursal_id: string
          p_tipo_documento?: string
        }
        Returns: {
          consecutivo: number
          folio_completo: string
        }[]
      }
      imprimir_comanda: {
        Args: {
          p_area_cocina_id: string
          p_autorizacion_pin_id?: string
          p_error_detalle?: string
          p_evento_tipo: Database["public"]["Enums"]["comanda_evento_tipo"]
          p_impresora_identificador: string
          p_items_incluidos: Json
          p_razon_reimpresion?: string
          p_resultado: Database["public"]["Enums"]["comanda_resultado"]
          p_ticket_id: string
        }
        Returns: string
      }
      kpis_dia_sucursal: {
        Args: { p_fecha: string; p_sucursal_id: string }
        Returns: Json
      }
      liquidar_delivery: {
        Args: {
          p_asignacion_id: string
          p_liquidacion_nota?: string
          p_liquidado_por_id: string
          p_monto_efectivo_mxn: number
          p_monto_tarjeta_mxn: number
        }
        Returns: Json
      }
      marcar_no_show_reservacion: {
        Args: { p_reservacion_id: string }
        Returns: undefined
      }
      marcar_pedido_entregado: {
        Args: { p_ticket_id: string }
        Returns: undefined
      }
      marcar_pedido_listo: { Args: { p_ticket_id: string }; Returns: undefined }
      obtener_reporte_z: { Args: { p_turno_id: string }; Returns: Json }
      onboarding_actualizar_fase: {
        Args: {
          p_fase: Database["public"]["Enums"]["onboarding_fase"]
          p_fase_wizard?: number
        }
        Returns: undefined
      }
      poner_ticket_en_espera: {
        Args: { p_etiqueta: string; p_ticket_id: string }
        Returns: undefined
      }
      recalcular_costo_recetas: {
        Args: { p_insumo_id: string }
        Returns: undefined
      }
      recalcular_totales_ticket: {
        Args: { p_ticket_id: string }
        Returns: undefined
      }
      registrar_autorizacion_propia: {
        Args: {
          p_accion: string
          p_caja_id: string
          p_entidad_id: string
          p_entidad_tipo: string
          p_monto: number
          p_motivo: string
          p_permiso_codigo: string
          p_turno_id: string
        }
        Returns: Json
      }
      registrar_no_entrega_delivery: {
        Args: {
          p_asignacion_id: string
          p_motivo: Database["public"]["Enums"]["delivery_no_entrega_motivo"]
          p_nota?: string
        }
        Returns: undefined
      }
      reporte_cancelaciones_periodo: {
        Args: {
          p_fecha_desde: string
          p_fecha_hasta: string
          p_sucursal_id: string
        }
        Returns: Json
      }
      reporte_x: { Args: { p_turno_id: string }; Returns: Json }
      reporte_z: {
        Args: {
          p_autorizacion_pin_id: string
          p_cerrado_por_usuario_id: string
          p_efectivo_declarado_mxn: number
          p_nota?: string
          p_turno_id: string
        }
        Returns: Json
      }
      resetear_pin_empleado: {
        Args: { p_pin_nuevo: string; p_usuario_id: string }
        Returns: undefined
      }
      retomar_ticket: { Args: { p_ticket_id: string }; Returns: undefined }
      reversar_inventario_por_cancelacion: {
        Args: { p_cancelacion_id: string }
        Returns: undefined
      }
      reversar_inventario_por_devolucion: {
        Args: { p_devolucion_id: string }
        Returns: undefined
      }
      sembrar_unidades_base: {
        Args: { p_tenant_id: string }
        Returns: undefined
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      split_cuenta: {
        Args: {
          p_autorizacion_pin_id: string
          p_cuenta_id: string
          p_n_partes: number
          p_usuario_autorizo_id: string
          p_usuario_solicitante_id: string
        }
        Returns: Json
      }
      sync_aplicar_operacion: {
        Args: {
          p_client_id_local: string
          p_entidad_id_local: string
          p_fecha_operacion: string
          p_operacion: string
          p_payload: Json
          p_sync_evento_id: string
          p_tabla: string
        }
        Returns: Json
      }
      sync_obtener_catalogo: {
        Args: { p_desde_timestamp?: string }
        Returns: Json
      }
      sync_procesar_push: {
        Args: {
          p_dispositivo_descripcion: string
          p_dispositivo_id: string
          p_operaciones: Json
        }
        Returns: Json
      }
      sync_resolver_conflicto: {
        Args: {
          p_conflicto_id: string
          p_nota: string
          p_resolucion: Database["public"]["Enums"]["sync_conflicto_resolucion"]
        }
        Returns: undefined
      }
      top_meseros: {
        Args: {
          p_fecha_desde: string
          p_fecha_hasta: string
          p_limite?: number
          p_sucursal_id: string
        }
        Returns: Json
      }
      top_productos: {
        Args: {
          p_fecha_desde: string
          p_fecha_hasta: string
          p_limite?: number
          p_sucursal_id: string
        }
        Returns: Json
      }
      transferir_mesa: {
        Args: {
          p_autorizacion_pin_id?: string
          p_mesa_nueva_id: string
          p_motivo: string
          p_ticket_id: string
        }
        Returns: string
      }
      transicionar_estado_cocina_con_autorizacion: {
        Args: {
          p_autorizacion_pin_id: string
          p_estado_destino: Database["public"]["Enums"]["ticket_estado_cocina"]
          p_motivo: string
          p_ticket_id: string
        }
        Returns: undefined
      }
      unaccent: { Args: { "": string }; Returns: string }
      verificar_autorizacion_pin: {
        Args: {
          p_accion: string
          p_caja_id: string
          p_entidad_id: string
          p_entidad_tipo: string
          p_monto: number
          p_motivo: string
          p_permiso_codigo: string
          p_pin: string
          p_turno_id: string
          p_usuario_solicitante_id: string
        }
        Returns: Json
      }
      verificar_pin_login: {
        Args: { p_caja_id: string; p_pin: string; p_usuario_id: string }
        Returns: Json
      }
    }
    Enums: {
      admin_decision_cierre:
        | "ACEPTAR_DIFERENCIA"
        | "PENDIENTE_EXTERNA"
        | "PENDIENTE_INVESTIGACION"
      alerta_severidad: "AMARILLA" | "ROJA" | "AGOTADO"
      cancelacion_motivo:
        | "ERROR_COBRO"
        | "CLIENTE_DESISTIO"
        | "PROBLEMA_OPERATIVO"
        | "COBRO_DUPLICADO"
        | "FRAUDE_DETECTADO"
        | "PRUEBA_OPERATIVA"
        | "OTRO"
      cfdi_estado_sat:
        | "BORRADOR"
        | "EN_PROCESO_TIMBRADO"
        | "TIMBRADO"
        | "ERROR_TIMBRADO"
        | "EN_PROCESO_CANCELACION"
        | "CANCELADO"
        | "CANCELACION_RECHAZADA"
        | "VIGENTE_SUSTITUIDO"
      cfdi_proveedor_pac:
        | "FACTURAPI"
        | "SOLUCIONFACTIBLE"
        | "FINKOK"
        | "EDICOM"
        | "PRODIGIA"
        | "OTRO"
      cfdi_sat_evento:
        | "TIMBRADO_SOLICITADO"
        | "TIMBRADO_CONFIRMADO"
        | "TIMBRADO_ERROR"
        | "CANCELACION_SOLICITADA"
        | "CANCELACION_CONFIRMADA"
        | "CANCELACION_RECHAZADA"
        | "SUSTITUCION_GENERADA"
        | "ACUSE_DESCARGADO"
      cfdi_tipo_comprobante: "INGRESO" | "EGRESO" | "TRASLADO" | "PAGO"
      cliente_estado: "ACTIVO" | "BLOQUEADO"
      cliente_tipo_fiscal: "PERSONA_FISICA" | "PERSONA_MORAL" | "EVENTUAL"
      comanda_evento_tipo:
        | "IMPRESION_INICIAL"
        | "REIMPRESION_CAJERO"
        | "REIMPRESION_AUTOMATICA"
        | "REIMPRESION_AREA"
        | "ANULACION_COMANDA"
      comanda_resultado:
        | "OK"
        | "IMPRESORA_OFFLINE"
        | "IMPRESORA_SIN_PAPEL"
        | "ERROR_DESCONOCIDO"
        | "CANCELADO_POR_USUARIO"
      cuenta_abierta_estado: "ABIERTA" | "CERRADA" | "CANCELADA"
      delivery_estado:
        | "ASIGNADO"
        | "EN_RUTA"
        | "EN_DESTINO"
        | "ENTREGADO"
        | "NO_ENTREGADO"
        | "EN_REGRESO"
        | "LIQUIDADO"
        | "CANCELADO"
      delivery_no_entrega_motivo:
        | "CLIENTE_AUSENTE"
        | "DIRECCION_INCORRECTA"
        | "CLIENTE_RECHAZO"
        | "ACCIDENTE_INCIDENTE"
        | "ZONA_INSEGURA"
        | "OTRO"
      descuento_manual_motivo:
        | "CLIENTE_FRECUENTE"
        | "INCONVENIENCIA_OPERATIVA"
        | "CORTESIA_INVITADO"
        | "PERSONAL_STAFF"
        | "PRODUCTO_DEFECTO_LEVE"
        | "OTRO"
      descuento_manual_tipo:
        | "PORCENTAJE"
        | "MONTO_FIJO"
        | "CORTESIA_TOTAL"
        | "OVERRIDE_PRECIO"
      devolucion_alcance: "TOTAL" | "PARCIAL"
      devolucion_medio:
        | "EFECTIVO"
        | "MISMO_METODO_PAGO"
        | "VALE_PROXIMA_COMPRA"
        | "CORTESIA_SIN_REEMBOLSO"
        | "NOTA_CREDITO_CFDI"
      devolucion_motivo:
        | "PRODUCTO_DEFECTUOSO"
        | "PRODUCTO_INCORRECTO"
        | "CLIENTE_NO_SATISFECHO"
        | "ERROR_COBRO"
        | "TIEMPO_EXCEDIDO"
        | "CANCELACION_PEDIDO"
        | "PROBLEMA_DELIVERY"
        | "OTRO"
      evento_categoria:
        | "AUTENTICACION"
        | "TURNO"
        | "CAJA"
        | "VENTA"
        | "COBRO"
        | "DESCUENTO"
        | "COCINA"
        | "CONFIGURACION"
        | "CATALOGO"
        | "USUARIOS"
        | "SISTEMA"
        | "OTRO"
        | "FISCAL"
      folio_movimiento_tipo:
        | "BASE_RESET"
        | "CONSUMO_BASE"
        | "COMPRA_PAQUETE"
        | "CONSUMO_PAQUETE"
        | "AJUSTE_MANUAL"
      fondo_modo_captura: "DENOMINACION" | "TOTAL"
      insumo_categoria:
        | "CARNICOS"
        | "LACTEOS"
        | "VEGETALES"
        | "FRUTAS"
        | "PANIFICACION"
        | "ABARROTES"
        | "BEBIDAS"
        | "CONDIMENTOS"
        | "CONGELADOS"
        | "EMPAQUE"
        | "LIMPIEZA"
        | "OTROS"
      insumo_estado: "ACTIVO" | "PAUSADO"
      mesa_estado:
        | "LIBRE"
        | "OCUPADA"
        | "RESERVADA"
        | "EN_LIMPIEZA"
        | "FUERA_DE_SERVICIO"
      metodo_pago:
        | "EFECTIVO"
        | "TARJETA_CREDITO"
        | "TARJETA_DEBITO"
        | "TRANSFERENCIA"
        | "VALES_DESPENSA"
        | "CUPON"
        | "CUENTA_INTERNA"
        | "APP_RAPPI"
        | "APP_UBEREATS"
        | "APP_DIDI"
        | "APP_IFOOD"
        | "APP_OTRO"
        | "PAGO_AL_RECIBIR"
        | "OTRO"
      modificador_naturaleza:
        | "EXTRA"
        | "SUSTITUCION"
        | "OMISION"
        | "PREPARACION"
        | "NEUTRO"
      modificador_tipo_seleccion:
        | "UNICA_OBLIGATORIA"
        | "UNICA_OPCIONAL"
        | "MULTIPLE_OPCIONAL"
        | "MULTIPLE_OBLIGATORIA_RANGO"
      modo_servicio:
        | "COMER_AQUI"
        | "PARA_LLEVAR"
        | "DRIVE_THRU"
        | "DELIVERY_PROPIO"
        | "APP_RAPPI"
        | "APP_UBEREATS"
        | "APP_DIDI"
        | "APP_IFOOD"
        | "APP_OTRO"
        | "MESA"
        | "BARRA"
        | "EVENTO_PRIVADO"
      movimiento_inventario_tipo:
        | "ENTRADA_COMPRA"
        | "SALIDA_VENTA"
        | "SALIDA_MODIFICADOR_EXTRA"
        | "REVERSA_CANCELACION"
        | "MERMA"
        | "AJUSTE_POSITIVO"
        | "AJUSTE_NEGATIVO"
        | "TRANSFERENCIA_SALIDA"
        | "TRANSFERENCIA_ENTRADA"
        | "DEVOLUCION_PROVEEDOR"
      movimiento_tipo:
        | "FONDO_APERTURA"
        | "INYECCION_FONDO"
        | "SANGRIA"
        | "DEPOSITO"
        | "PAGO_PROVEEDOR"
        | "DEVOLUCION_EFECTIVO"
        | "AJUSTE_POSITIVO"
        | "AJUSTE_NEGATIVO"
      onboarding_fase:
        | "INVITADO"
        | "EN_CONFIGURACION"
        | "GO_LIVE"
        | "ABANDONADO"
      pago_estado: "PENDIENTE" | "APLICADO" | "CONCILIADO" | "CANCELADO"
      producto_estado: "ACTIVO" | "PAUSADO" | "AGOTADO"
      producto_tipo_venta: "UNIDAD" | "PESO" | "VOLUMEN"
      promocion_alcance: "TICKET_COMPLETO" | "PRODUCTO" | "CATEGORIA"
      promocion_estado: "ACTIVA" | "PAUSADA" | "EXPIRADA" | "AGOTADA"
      promocion_tipo:
        | "PORCENTAJE"
        | "MONTO_FIJO"
        | "PRECIO_ESPECIAL"
        | "COMPRA_X_LLEVA_Y"
        | "COMBO_PAQUETE"
        | "CORTESIA_TOTAL"
      propina_distribucion_estado: "PENDIENTE" | "ENTREGADA" | "CANCELADA"
      propina_metodo_reparto:
        | "POR_MESA_ATENDIDA"
        | "POR_HORAS_TRABAJADAS"
        | "FONDO_COMUN"
        | "CUSTOM"
      regimen_fiscal_sat: "601" | "603" | "605" | "612" | "621" | "625" | "626"
      reservacion_canal:
        | "TELEFONO"
        | "WHATSAPP"
        | "WEB"
        | "PRESENCIAL"
        | "APP_INTERNA"
        | "OTRO"
      reservacion_estado:
        | "CONFIRMADA"
        | "LLEGO"
        | "CANCELADA"
        | "NO_SHOW"
        | "TERMINADA"
      suscripcion_estado: "ACTIVA" | "PAUSADA" | "CANCELADA" | "EXPIRADA"
      sync_conflicto_resolucion:
        | "PENDIENTE"
        | "RESUELTO_AUTOMATICO"
        | "RESUELTO_OPERADOR"
        | "DESCARTADO"
      sync_conflicto_tipo:
        | "TURNO_CERRADO_SERVIDOR"
        | "PRODUCTO_ELIMINADO"
        | "CAMBIO_PRECIO_DETECTADO"
        | "TICKET_YA_PAGADO_SERVIDOR"
        | "TICKET_YA_CANCELADO_SERVIDOR"
        | "FOLIO_DUPLICADO_INESPERADO"
        | "INVENTARIO_INSUFICIENTE"
        | "AUTORIZACION_INVALIDA"
        | "CLIENT_ID_LOCAL_REUSADO"
        | "ENTIDAD_REFERENCIA_NO_EXISTE"
        | "OTRO"
      tenant_estado: "TRIAL" | "ACTIVO" | "SUSPENDIDO" | "CANCELADO" | "INTERNO"
      ticket_estado_cocina:
        | "SIN_ENVIAR"
        | "EN_COCINA"
        | "LISTO"
        | "EN_RUTA"
        | "ENTREGADO_DOMICILIO"
        | "ENTREGADO"
      ticket_estado_fiscal:
        | "BORRADOR"
        | "ABIERTO"
        | "PAGADO"
        | "FACTURADO"
        | "CANCELADO"
      ticket_origen: "POS_ONLINE" | "POS_OFFLINE" | "API_EXTERNA" | "IMPORTADO"
      tipo_acceso: "PIN_OPERATIVO" | "WEB_ADMIN"
      turno_estado: "ABIERTO" | "PENDIENTE_VALIDACION" | "CERRADO"
      uso_cfdi: "G01" | "G02" | "G03" | "P01" | "D01" | "S01"
      usuario_estado:
        | "ACTIVO"
        | "BLOQUEADO_TEMP"
        | "BLOQUEADO_ADMIN"
        | "DESACTIVADO"
      valuacion_metodo: "PROMEDIO_PONDERADO" | "ULTIMO_COSTO"
      vertical_tipo:
        | "FOODTRUCK"
        | "QUICK_SERVICE"
        | "FULL_SERVICE"
        | "CAFE_BAR"
        | "DARK_KITCHEN"
        | "ENTERPRISE"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      admin_decision_cierre: [
        "ACEPTAR_DIFERENCIA",
        "PENDIENTE_EXTERNA",
        "PENDIENTE_INVESTIGACION",
      ],
      alerta_severidad: ["AMARILLA", "ROJA", "AGOTADO"],
      cancelacion_motivo: [
        "ERROR_COBRO",
        "CLIENTE_DESISTIO",
        "PROBLEMA_OPERATIVO",
        "COBRO_DUPLICADO",
        "FRAUDE_DETECTADO",
        "PRUEBA_OPERATIVA",
        "OTRO",
      ],
      cfdi_estado_sat: [
        "BORRADOR",
        "EN_PROCESO_TIMBRADO",
        "TIMBRADO",
        "ERROR_TIMBRADO",
        "EN_PROCESO_CANCELACION",
        "CANCELADO",
        "CANCELACION_RECHAZADA",
        "VIGENTE_SUSTITUIDO",
      ],
      cfdi_proveedor_pac: [
        "FACTURAPI",
        "SOLUCIONFACTIBLE",
        "FINKOK",
        "EDICOM",
        "PRODIGIA",
        "OTRO",
      ],
      cfdi_sat_evento: [
        "TIMBRADO_SOLICITADO",
        "TIMBRADO_CONFIRMADO",
        "TIMBRADO_ERROR",
        "CANCELACION_SOLICITADA",
        "CANCELACION_CONFIRMADA",
        "CANCELACION_RECHAZADA",
        "SUSTITUCION_GENERADA",
        "ACUSE_DESCARGADO",
      ],
      cfdi_tipo_comprobante: ["INGRESO", "EGRESO", "TRASLADO", "PAGO"],
      cliente_estado: ["ACTIVO", "BLOQUEADO"],
      cliente_tipo_fiscal: ["PERSONA_FISICA", "PERSONA_MORAL", "EVENTUAL"],
      comanda_evento_tipo: [
        "IMPRESION_INICIAL",
        "REIMPRESION_CAJERO",
        "REIMPRESION_AUTOMATICA",
        "REIMPRESION_AREA",
        "ANULACION_COMANDA",
      ],
      comanda_resultado: [
        "OK",
        "IMPRESORA_OFFLINE",
        "IMPRESORA_SIN_PAPEL",
        "ERROR_DESCONOCIDO",
        "CANCELADO_POR_USUARIO",
      ],
      cuenta_abierta_estado: ["ABIERTA", "CERRADA", "CANCELADA"],
      delivery_estado: [
        "ASIGNADO",
        "EN_RUTA",
        "EN_DESTINO",
        "ENTREGADO",
        "NO_ENTREGADO",
        "EN_REGRESO",
        "LIQUIDADO",
        "CANCELADO",
      ],
      delivery_no_entrega_motivo: [
        "CLIENTE_AUSENTE",
        "DIRECCION_INCORRECTA",
        "CLIENTE_RECHAZO",
        "ACCIDENTE_INCIDENTE",
        "ZONA_INSEGURA",
        "OTRO",
      ],
      descuento_manual_motivo: [
        "CLIENTE_FRECUENTE",
        "INCONVENIENCIA_OPERATIVA",
        "CORTESIA_INVITADO",
        "PERSONAL_STAFF",
        "PRODUCTO_DEFECTO_LEVE",
        "OTRO",
      ],
      descuento_manual_tipo: [
        "PORCENTAJE",
        "MONTO_FIJO",
        "CORTESIA_TOTAL",
        "OVERRIDE_PRECIO",
      ],
      devolucion_alcance: ["TOTAL", "PARCIAL"],
      devolucion_medio: [
        "EFECTIVO",
        "MISMO_METODO_PAGO",
        "VALE_PROXIMA_COMPRA",
        "CORTESIA_SIN_REEMBOLSO",
        "NOTA_CREDITO_CFDI",
      ],
      devolucion_motivo: [
        "PRODUCTO_DEFECTUOSO",
        "PRODUCTO_INCORRECTO",
        "CLIENTE_NO_SATISFECHO",
        "ERROR_COBRO",
        "TIEMPO_EXCEDIDO",
        "CANCELACION_PEDIDO",
        "PROBLEMA_DELIVERY",
        "OTRO",
      ],
      evento_categoria: [
        "AUTENTICACION",
        "TURNO",
        "CAJA",
        "VENTA",
        "COBRO",
        "DESCUENTO",
        "COCINA",
        "CONFIGURACION",
        "CATALOGO",
        "USUARIOS",
        "SISTEMA",
        "OTRO",
        "FISCAL",
      ],
      folio_movimiento_tipo: [
        "BASE_RESET",
        "CONSUMO_BASE",
        "COMPRA_PAQUETE",
        "CONSUMO_PAQUETE",
        "AJUSTE_MANUAL",
      ],
      fondo_modo_captura: ["DENOMINACION", "TOTAL"],
      insumo_categoria: [
        "CARNICOS",
        "LACTEOS",
        "VEGETALES",
        "FRUTAS",
        "PANIFICACION",
        "ABARROTES",
        "BEBIDAS",
        "CONDIMENTOS",
        "CONGELADOS",
        "EMPAQUE",
        "LIMPIEZA",
        "OTROS",
      ],
      insumo_estado: ["ACTIVO", "PAUSADO"],
      mesa_estado: [
        "LIBRE",
        "OCUPADA",
        "RESERVADA",
        "EN_LIMPIEZA",
        "FUERA_DE_SERVICIO",
      ],
      metodo_pago: [
        "EFECTIVO",
        "TARJETA_CREDITO",
        "TARJETA_DEBITO",
        "TRANSFERENCIA",
        "VALES_DESPENSA",
        "CUPON",
        "CUENTA_INTERNA",
        "APP_RAPPI",
        "APP_UBEREATS",
        "APP_DIDI",
        "APP_IFOOD",
        "APP_OTRO",
        "PAGO_AL_RECIBIR",
        "OTRO",
      ],
      modificador_naturaleza: [
        "EXTRA",
        "SUSTITUCION",
        "OMISION",
        "PREPARACION",
        "NEUTRO",
      ],
      modificador_tipo_seleccion: [
        "UNICA_OBLIGATORIA",
        "UNICA_OPCIONAL",
        "MULTIPLE_OPCIONAL",
        "MULTIPLE_OBLIGATORIA_RANGO",
      ],
      modo_servicio: [
        "COMER_AQUI",
        "PARA_LLEVAR",
        "DRIVE_THRU",
        "DELIVERY_PROPIO",
        "APP_RAPPI",
        "APP_UBEREATS",
        "APP_DIDI",
        "APP_IFOOD",
        "APP_OTRO",
        "MESA",
        "BARRA",
        "EVENTO_PRIVADO",
      ],
      movimiento_inventario_tipo: [
        "ENTRADA_COMPRA",
        "SALIDA_VENTA",
        "SALIDA_MODIFICADOR_EXTRA",
        "REVERSA_CANCELACION",
        "MERMA",
        "AJUSTE_POSITIVO",
        "AJUSTE_NEGATIVO",
        "TRANSFERENCIA_SALIDA",
        "TRANSFERENCIA_ENTRADA",
        "DEVOLUCION_PROVEEDOR",
      ],
      movimiento_tipo: [
        "FONDO_APERTURA",
        "INYECCION_FONDO",
        "SANGRIA",
        "DEPOSITO",
        "PAGO_PROVEEDOR",
        "DEVOLUCION_EFECTIVO",
        "AJUSTE_POSITIVO",
        "AJUSTE_NEGATIVO",
      ],
      onboarding_fase: [
        "INVITADO",
        "EN_CONFIGURACION",
        "GO_LIVE",
        "ABANDONADO",
      ],
      pago_estado: ["PENDIENTE", "APLICADO", "CONCILIADO", "CANCELADO"],
      producto_estado: ["ACTIVO", "PAUSADO", "AGOTADO"],
      producto_tipo_venta: ["UNIDAD", "PESO", "VOLUMEN"],
      promocion_alcance: ["TICKET_COMPLETO", "PRODUCTO", "CATEGORIA"],
      promocion_estado: ["ACTIVA", "PAUSADA", "EXPIRADA", "AGOTADA"],
      promocion_tipo: [
        "PORCENTAJE",
        "MONTO_FIJO",
        "PRECIO_ESPECIAL",
        "COMPRA_X_LLEVA_Y",
        "COMBO_PAQUETE",
        "CORTESIA_TOTAL",
      ],
      propina_distribucion_estado: ["PENDIENTE", "ENTREGADA", "CANCELADA"],
      propina_metodo_reparto: [
        "POR_MESA_ATENDIDA",
        "POR_HORAS_TRABAJADAS",
        "FONDO_COMUN",
        "CUSTOM",
      ],
      regimen_fiscal_sat: ["601", "603", "605", "612", "621", "625", "626"],
      reservacion_canal: [
        "TELEFONO",
        "WHATSAPP",
        "WEB",
        "PRESENCIAL",
        "APP_INTERNA",
        "OTRO",
      ],
      reservacion_estado: [
        "CONFIRMADA",
        "LLEGO",
        "CANCELADA",
        "NO_SHOW",
        "TERMINADA",
      ],
      suscripcion_estado: ["ACTIVA", "PAUSADA", "CANCELADA", "EXPIRADA"],
      sync_conflicto_resolucion: [
        "PENDIENTE",
        "RESUELTO_AUTOMATICO",
        "RESUELTO_OPERADOR",
        "DESCARTADO",
      ],
      sync_conflicto_tipo: [
        "TURNO_CERRADO_SERVIDOR",
        "PRODUCTO_ELIMINADO",
        "CAMBIO_PRECIO_DETECTADO",
        "TICKET_YA_PAGADO_SERVIDOR",
        "TICKET_YA_CANCELADO_SERVIDOR",
        "FOLIO_DUPLICADO_INESPERADO",
        "INVENTARIO_INSUFICIENTE",
        "AUTORIZACION_INVALIDA",
        "CLIENT_ID_LOCAL_REUSADO",
        "ENTIDAD_REFERENCIA_NO_EXISTE",
        "OTRO",
      ],
      tenant_estado: ["TRIAL", "ACTIVO", "SUSPENDIDO", "CANCELADO", "INTERNO"],
      ticket_estado_cocina: [
        "SIN_ENVIAR",
        "EN_COCINA",
        "LISTO",
        "EN_RUTA",
        "ENTREGADO_DOMICILIO",
        "ENTREGADO",
      ],
      ticket_estado_fiscal: [
        "BORRADOR",
        "ABIERTO",
        "PAGADO",
        "FACTURADO",
        "CANCELADO",
      ],
      ticket_origen: ["POS_ONLINE", "POS_OFFLINE", "API_EXTERNA", "IMPORTADO"],
      tipo_acceso: ["PIN_OPERATIVO", "WEB_ADMIN"],
      turno_estado: ["ABIERTO", "PENDIENTE_VALIDACION", "CERRADO"],
      uso_cfdi: ["G01", "G02", "G03", "P01", "D01", "S01"],
      usuario_estado: [
        "ACTIVO",
        "BLOQUEADO_TEMP",
        "BLOQUEADO_ADMIN",
        "DESACTIVADO",
      ],
      valuacion_metodo: ["PROMEDIO_PONDERADO", "ULTIMO_COSTO"],
      vertical_tipo: [
        "FOODTRUCK",
        "QUICK_SERVICE",
        "FULL_SERVICE",
        "CAFE_BAR",
        "DARK_KITCHEN",
        "ENTERPRISE",
      ],
    },
  },
} as const

