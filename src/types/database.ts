export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
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
      app_settings: {
        Row: {
          description: string | null
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          description?: string | null
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          description?: string | null
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      compliance_alerts: {
        Row: {
          alert_types: string[]
          corrected_at: string | null
          corrected_by: string | null
          correction_note: string | null
          correction_reason: string | null
          created_at: string
          detail: Json
          driver_id: string
          id: string
          labor_min: number | null
          month_key: string
          night_min: number | null
          rest_period_min: number | null
          restraint_min: number | null
          shift_id: string
          status: string
          updated_at: string
          work_date: string
        }
        Insert: {
          alert_types?: string[]
          corrected_at?: string | null
          corrected_by?: string | null
          correction_note?: string | null
          correction_reason?: string | null
          created_at?: string
          detail?: Json
          driver_id: string
          id?: string
          labor_min?: number | null
          month_key: string
          night_min?: number | null
          rest_period_min?: number | null
          restraint_min?: number | null
          shift_id: string
          status?: string
          updated_at?: string
          work_date: string
        }
        Update: {
          alert_types?: string[]
          corrected_at?: string | null
          corrected_by?: string | null
          correction_note?: string | null
          correction_reason?: string | null
          created_at?: string
          detail?: Json
          driver_id?: string
          id?: string
          labor_min?: number | null
          month_key?: string
          night_min?: number | null
          rest_period_min?: number | null
          restraint_min?: number | null
          shift_id?: string
          status?: string
          updated_at?: string
          work_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "compliance_alerts_corrected_by_fkey"
            columns: ["corrected_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_alerts_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_alerts_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: true
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address: string | null
          created_at: string
          id: string
          name: string
          postal_code: string | null
          updated_at: string
          yago: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string
          id?: string
          name: string
          postal_code?: string | null
          updated_at?: string
          yago?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string
          id?: string
          name?: string
          postal_code?: string | null
          updated_at?: string
          yago?: string | null
        }
        Relationships: []
      }
      daily_report_legs: {
        Row: {
          cargo: string | null
          confirmed: boolean
          created_at: string
          daily_report_id: string
          destination_spot: string | null
          extra_work: string | null
          id: string
          meter: number | null
          origin_spot: string | null
          receipts: string | null
          seq: number
          shipper: string | null
        }
        Insert: {
          cargo?: string | null
          confirmed?: boolean
          created_at?: string
          daily_report_id: string
          destination_spot?: string | null
          extra_work?: string | null
          id?: string
          meter?: number | null
          origin_spot?: string | null
          receipts?: string | null
          seq?: number
          shipper?: string | null
        }
        Update: {
          cargo?: string | null
          confirmed?: boolean
          created_at?: string
          daily_report_id?: string
          destination_spot?: string | null
          extra_work?: string | null
          id?: string
          meter?: number | null
          origin_spot?: string | null
          receipts?: string | null
          seq?: number
          shipper?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_report_legs_daily_report_id_fkey"
            columns: ["daily_report_id"]
            isOneToOne: false
            referencedRelation: "daily_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_report_rests: {
        Row: {
          created_at: string
          daily_report_id: string
          duration_min: number | null
          end_at: string | null
          id: string
          place: string | null
          rest_type: string
          seq: number
          start_at: string | null
        }
        Insert: {
          created_at?: string
          daily_report_id: string
          duration_min?: number | null
          end_at?: string | null
          id?: string
          place?: string | null
          rest_type?: string
          seq?: number
          start_at?: string | null
        }
        Update: {
          created_at?: string
          daily_report_id?: string
          duration_min?: number | null
          end_at?: string | null
          id?: string
          place?: string | null
          rest_type?: string
          seq?: number
          start_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_report_rests_daily_report_id_fkey"
            columns: ["daily_report_id"]
            isOneToOne: false
            referencedRelation: "daily_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_reports: {
        Row: {
          confirm_place: string | null
          confirmed_at: string | null
          created_at: string
          crew: string | null
          departure_at: string | null
          drivable: boolean | null
          driver_id: string
          has_fatigue: boolean | null
          id: string
          meter_end: number | null
          meter_start: number | null
          notes: string | null
          pdf_generated_at: string | null
          pdf_path: string | null
          report_date: string
          rest_total_min: number
          return_at: string | null
          shift_id: string | null
          status: string
          updated_at: string
          vehicle_no: string | null
        }
        Insert: {
          confirm_place?: string | null
          confirmed_at?: string | null
          created_at?: string
          crew?: string | null
          departure_at?: string | null
          drivable?: boolean | null
          driver_id: string
          has_fatigue?: boolean | null
          id?: string
          meter_end?: number | null
          meter_start?: number | null
          notes?: string | null
          pdf_generated_at?: string | null
          pdf_path?: string | null
          report_date: string
          rest_total_min?: number
          return_at?: string | null
          shift_id?: string | null
          status?: string
          updated_at?: string
          vehicle_no?: string | null
        }
        Update: {
          confirm_place?: string | null
          confirmed_at?: string | null
          created_at?: string
          crew?: string | null
          departure_at?: string | null
          drivable?: boolean | null
          driver_id?: string
          has_fatigue?: boolean | null
          id?: string
          meter_end?: number | null
          meter_start?: number | null
          notes?: string | null
          pdf_generated_at?: string | null
          pdf_path?: string | null
          report_date?: string
          rest_total_min?: number
          return_at?: string | null
          shift_id?: string | null
          status?: string
          updated_at?: string
          vehicle_no?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_reports_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_reports_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      dispatch_plans: {
        Row: {
          created_at: string
          delivery_spot: string | null
          driver_id: string | null
          driver_name_raw: string | null
          highway_instruction: string | null
          id: string
          is_subcontract: boolean
          note: string | null
          plan_date: string
          shipper: string | null
          updated_at: string
          vehicle_no: string | null
        }
        Insert: {
          created_at?: string
          delivery_spot?: string | null
          driver_id?: string | null
          driver_name_raw?: string | null
          highway_instruction?: string | null
          id?: string
          is_subcontract?: boolean
          note?: string | null
          plan_date: string
          shipper?: string | null
          updated_at?: string
          vehicle_no?: string | null
        }
        Update: {
          created_at?: string
          delivery_spot?: string | null
          driver_id?: string | null
          driver_name_raw?: string | null
          highway_instruction?: string | null
          id?: string
          is_subcontract?: boolean
          note?: string | null
          plan_date?: string
          shipper?: string | null
          updated_at?: string
          vehicle_no?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dispatch_plans_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      drivers: {
        Row: {
          affiliation: string | null
          code: string
          created_at: string
          default_vehicle_no: string | null
          id: string
          is_active: boolean
          line_chat_url: string | null
          line_user_id: string | null
          name: string
          updated_at: string
        }
        Insert: {
          affiliation?: string | null
          code: string
          created_at?: string
          default_vehicle_no?: string | null
          id?: string
          is_active?: boolean
          line_chat_url?: string | null
          line_user_id?: string | null
          name: string
          updated_at?: string
        }
        Update: {
          affiliation?: string | null
          code?: string
          created_at?: string
          default_vehicle_no?: string | null
          id?: string
          is_active?: boolean
          line_chat_url?: string | null
          line_user_id?: string | null
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      event_items: {
        Row: {
          cargo_type: string | null
          created_at: string
          delivery_spot: string | null
          event_id: string
          id: string
          note: string | null
          quantity: string | null
          receipts: string | null
          seq: number
          shipper: string | null
          slip_no: string | null
          weight: string | null
        }
        Insert: {
          cargo_type?: string | null
          created_at?: string
          delivery_spot?: string | null
          event_id: string
          id?: string
          note?: string | null
          quantity?: string | null
          receipts?: string | null
          seq?: number
          shipper?: string | null
          slip_no?: string | null
          weight?: string | null
        }
        Update: {
          cargo_type?: string | null
          created_at?: string
          delivery_spot?: string | null
          event_id?: string
          id?: string
          note?: string | null
          quantity?: string | null
          receipts?: string | null
          seq?: number
          shipper?: string | null
          slip_no?: string | null
          weight?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_items_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_photos: {
        Row: {
          category: string | null
          created_at: string
          event_id: string
          id: string
          seq: number
          storage_path: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          event_id: string
          id?: string
          seq?: number
          storage_path: string
        }
        Update: {
          category?: string | null
          created_at?: string
          event_id?: string
          id?: string
          seq?: number
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_photos_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          address: string | null
          alcohol_checked: boolean | null
          checks: string | null
          created_at: string
          customer_id: string | null
          driver_id: string
          event_type: string
          id: string
          idempotency_key: string
          lat: number | null
          lng: number | null
          note: string | null
          occurred_at: string
          shift_id: string | null
          vehicle_no: string | null
        }
        Insert: {
          address?: string | null
          alcohol_checked?: boolean | null
          checks?: string | null
          created_at?: string
          customer_id?: string | null
          driver_id: string
          event_type: string
          id?: string
          idempotency_key: string
          lat?: number | null
          lng?: number | null
          note?: string | null
          occurred_at: string
          shift_id?: string | null
          vehicle_no?: string | null
        }
        Update: {
          address?: string | null
          alcohol_checked?: boolean | null
          checks?: string | null
          created_at?: string
          customer_id?: string | null
          driver_id?: string
          event_type?: string
          id?: string
          idempotency_key?: string
          lat?: number | null
          lng?: number | null
          note?: string | null
          occurred_at?: string
          shift_id?: string | null
          vehicle_no?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      line_usage: {
        Row: {
          limit_count: number | null
          month_key: string
          sent_count: number
          updated_at: string
        }
        Insert: {
          limit_count?: number | null
          month_key: string
          sent_count?: number
          updated_at?: string
        }
        Update: {
          limit_count?: number | null
          month_key?: string
          sent_count?: number
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          driver_id: string | null
          id: string
          role: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          driver_id?: string | null
          id: string
          role?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          driver_id?: string | null
          id?: string
          role?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      shifts: {
        Row: {
          actual_in: string | null
          actual_out: string | null
          clock_in_at: string | null
          clock_out_at: string | null
          created_at: string
          driver_id: string
          edited_in: string | null
          edited_in_adj_days: number
          edited_out: string | null
          edited_out_adj_days: number
          id: string
          labor_min: number | null
          month_key: string
          night_min: number | null
          rest_period_min: number | null
          rest_time: string
          restraint_min: number | null
          revision_reason: string | null
          revision_status: string
          crew_type: string
          ferry_min: number
          split_rest: boolean
          updated_at: string
          warn_rest: string | null
          warn_restraint: string | null
          work_date: string
        }
        Insert: {
          actual_in?: string | null
          actual_out?: string | null
          clock_in_at?: string | null
          clock_out_at?: string | null
          created_at?: string
          driver_id: string
          edited_in?: string | null
          edited_in_adj_days?: number
          edited_out?: string | null
          edited_out_adj_days?: number
          id?: string
          labor_min?: number | null
          month_key: string
          night_min?: number | null
          rest_period_min?: number | null
          rest_time?: string
          restraint_min?: number | null
          revision_reason?: string | null
          revision_status?: string
          crew_type?: string
          ferry_min?: number
          split_rest?: boolean
          updated_at?: string
          warn_rest?: string | null
          warn_restraint?: string | null
          work_date: string
        }
        Update: {
          actual_in?: string | null
          actual_out?: string | null
          clock_in_at?: string | null
          clock_out_at?: string | null
          created_at?: string
          driver_id?: string
          edited_in?: string | null
          edited_in_adj_days?: number
          edited_out?: string | null
          edited_out_adj_days?: number
          id?: string
          labor_min?: number | null
          month_key?: string
          night_min?: number | null
          rest_period_min?: number | null
          rest_time?: string
          restraint_min?: number | null
          revision_reason?: string | null
          revision_status?: string
          crew_type?: string
          ferry_min?: number
          split_rest?: boolean
          updated_at?: string
          warn_rest?: string | null
          warn_restraint?: string | null
          work_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "shifts_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicles: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          kind: string | null
          name: string | null
          updated_at: string
          vehicle_no: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          kind?: string | null
          name?: string | null
          updated_at?: string
          vehicle_no: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          kind?: string | null
          name?: string | null
          updated_at?: string
          vehicle_no?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_driver_id: { Args: never; Returns: string }
      increment_line_usage: {
        Args: { p_delta?: number; p_month_key: string }
        Returns: undefined
      }
      is_admin: { Args: never; Returns: boolean }
      to_month_key: { Args: { ts: string }; Returns: string }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const

// --- 便利型エイリアス（CHECK制約列のリテラル型 / 手動補完） ---
export type ProfileRole = "admin" | "driver";
export type EventType =
  | "departure"
  | "leg_departure"
  | "arrival"
  | "loading"
  | "unloading"
  | "long_rest"
  | "clock_out"
  | "rest_start"
  | "rest_end";
export type AlertStatus = "open" | "resolved";
export type ReportStatus = "draft" | "confirmed";
