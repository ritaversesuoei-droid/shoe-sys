/**
 * Supabase データベース型（手書きの暫定版）。
 * 実DB接続後は `npm run db:types`（supabase gen types typescript）で自動生成に差し替える。
 * スキーマ定義: supabase/migrations/0001〜0008
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type EventType =
  | "departure"
  | "leg_departure"
  | "arrival"
  | "loading"
  | "unloading"
  | "long_rest"
  | "clock_out";

export type AlertStatus = "open" | "resolved";
export type ReportStatus = "draft" | "confirmed";
export type ProfileRole = "admin" | "driver";

type Timestamps = { created_at: string; updated_at: string };

export interface Database {
  public: {
    Tables: {
      drivers: {
        Row: {
          id: string;
          code: string;
          name: string;
          line_user_id: string | null;
          line_chat_url: string | null;
          default_vehicle_no: string | null;
          affiliation: string | null;
          is_active: boolean;
        } & Timestamps;
        Insert: {
          id?: string;
          code: string;
          name: string;
          line_user_id?: string | null;
          line_chat_url?: string | null;
          default_vehicle_no?: string | null;
          affiliation?: string | null;
          is_active?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["drivers"]["Insert"]>;
        Relationships: [];
      };
      vehicles: {
        Row: {
          id: string;
          vehicle_no: string;
          name: string | null;
          kind: string | null;
          is_active: boolean;
        } & Timestamps;
        Insert: {
          id?: string;
          vehicle_no: string;
          name?: string | null;
          kind?: string | null;
          is_active?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["vehicles"]["Insert"]>;
        Relationships: [];
      };
      customers: {
        Row: {
          id: string;
          postal_code: string | null;
          address: string | null;
          name: string;
          yago: string | null;
        } & Timestamps;
        Insert: {
          id?: string;
          postal_code?: string | null;
          address?: string | null;
          name: string;
          yago?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["customers"]["Insert"]>;
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          role: ProfileRole;
          driver_id: string | null;
          display_name: string | null;
        } & Timestamps;
        Insert: {
          id: string;
          role?: ProfileRole;
          driver_id?: string | null;
          display_name?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
        Relationships: [];
      };
      shifts: {
        Row: {
          id: string;
          driver_id: string;
          work_date: string;
          month_key: string;
          clock_in_at: string | null;
          clock_out_at: string | null;
          actual_in: string | null;
          actual_out: string | null;
          edited_in: string | null;
          edited_out: string | null;
          edited_in_adj_days: number;
          edited_out_adj_days: number;
          rest_time: string;
          restraint_min: number | null;
          labor_min: number | null;
          night_min: number | null;
          rest_period_min: number | null;
          warn_restraint: string | null;
          warn_rest: string | null;
          revision_status: "none" | "edited";
        } & Timestamps;
        Insert: {
          id?: string;
          driver_id: string;
          work_date: string;
          month_key: string;
          clock_in_at?: string | null;
          clock_out_at?: string | null;
          actual_in?: string | null;
          actual_out?: string | null;
          edited_in?: string | null;
          edited_out?: string | null;
          edited_in_adj_days?: number;
          edited_out_adj_days?: number;
          rest_time?: string;
          restraint_min?: number | null;
          labor_min?: number | null;
          night_min?: number | null;
          rest_period_min?: number | null;
          warn_restraint?: string | null;
          warn_rest?: string | null;
          revision_status?: "none" | "edited";
        };
        Update: Partial<Database["public"]["Tables"]["shifts"]["Insert"]>;
        Relationships: [];
      };
      events: {
        Row: {
          id: string;
          driver_id: string;
          shift_id: string | null;
          event_type: EventType;
          occurred_at: string;
          vehicle_no: string | null;
          address: string | null;
          lat: number | null;
          lng: number | null;
          customer_id: string | null;
          checks: string | null;
          alcohol_checked: boolean | null;
          note: string | null;
          idempotency_key: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          driver_id: string;
          shift_id?: string | null;
          event_type: EventType;
          occurred_at: string;
          vehicle_no?: string | null;
          address?: string | null;
          lat?: number | null;
          lng?: number | null;
          customer_id?: string | null;
          checks?: string | null;
          alcohol_checked?: boolean | null;
          note?: string | null;
          idempotency_key: string;
        };
        Update: Partial<Database["public"]["Tables"]["events"]["Insert"]>;
        Relationships: [];
      };
      event_items: {
        Row: {
          id: string;
          event_id: string;
          seq: number;
          shipper: string | null;
          delivery_spot: string | null;
          quantity: string | null;
          weight: string | null;
          slip_no: string | null;
          receipts: string | null;
          cargo_type: string | null;
          note: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          event_id: string;
          seq?: number;
          shipper?: string | null;
          delivery_spot?: string | null;
          quantity?: string | null;
          weight?: string | null;
          slip_no?: string | null;
          receipts?: string | null;
          cargo_type?: string | null;
          note?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["event_items"]["Insert"]>;
        Relationships: [];
      };
      event_photos: {
        Row: {
          id: string;
          event_id: string;
          storage_path: string;
          category: string | null;
          seq: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          event_id: string;
          storage_path: string;
          category?: string | null;
          seq?: number;
        };
        Update: Partial<Database["public"]["Tables"]["event_photos"]["Insert"]>;
        Relationships: [];
      };
      daily_reports: {
        Row: {
          id: string;
          driver_id: string;
          shift_id: string | null;
          report_date: string;
          status: ReportStatus;
          vehicle_no: string | null;
          crew: string | null;
          departure_at: string | null;
          return_at: string | null;
          rest_total_min: number;
          meter_start: number | null;
          meter_end: number | null;
          has_fatigue: boolean | null;
          drivable: boolean | null;
          confirm_place: string | null;
          notes: string | null;
          confirmed_at: string | null;
        } & Timestamps;
        Insert: {
          id?: string;
          driver_id: string;
          shift_id?: string | null;
          report_date: string;
          status?: ReportStatus;
          vehicle_no?: string | null;
          crew?: string | null;
          departure_at?: string | null;
          return_at?: string | null;
          rest_total_min?: number;
          meter_start?: number | null;
          meter_end?: number | null;
          has_fatigue?: boolean | null;
          drivable?: boolean | null;
          confirm_place?: string | null;
          notes?: string | null;
          confirmed_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["daily_reports"]["Insert"]>;
        Relationships: [];
      };
      daily_report_legs: {
        Row: {
          id: string;
          daily_report_id: string;
          seq: number;
          shipper: string | null;
          origin_spot: string | null;
          destination_spot: string | null;
          cargo: string | null;
          receipts: string | null;
          extra_work: string | null;
          meter: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          daily_report_id: string;
          seq?: number;
          shipper?: string | null;
          origin_spot?: string | null;
          destination_spot?: string | null;
          cargo?: string | null;
          receipts?: string | null;
          extra_work?: string | null;
          meter?: number | null;
        };
        Update: Partial<Database["public"]["Tables"]["daily_report_legs"]["Insert"]>;
        Relationships: [];
      };
      daily_report_rests: {
        Row: {
          id: string;
          daily_report_id: string;
          seq: number;
          rest_type: "rest" | "sleep";
          place: string | null;
          start_at: string | null;
          end_at: string | null;
          duration_min: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          daily_report_id: string;
          seq?: number;
          rest_type?: "rest" | "sleep";
          place?: string | null;
          start_at?: string | null;
          end_at?: string | null;
          duration_min?: number | null;
        };
        Update: Partial<Database["public"]["Tables"]["daily_report_rests"]["Insert"]>;
        Relationships: [];
      };
      compliance_alerts: {
        Row: {
          id: string;
          shift_id: string;
          driver_id: string;
          work_date: string;
          month_key: string;
          alert_types: string[];
          restraint_min: number | null;
          labor_min: number | null;
          rest_period_min: number | null;
          night_min: number | null;
          detail: Json;
          status: AlertStatus;
          correction_reason: string | null;
          correction_note: string | null;
          corrected_by: string | null;
          corrected_at: string | null;
        } & Timestamps;
        Insert: {
          id?: string;
          shift_id: string;
          driver_id: string;
          work_date: string;
          month_key: string;
          alert_types?: string[];
          restraint_min?: number | null;
          labor_min?: number | null;
          rest_period_min?: number | null;
          night_min?: number | null;
          detail?: Json;
          status?: AlertStatus;
          correction_reason?: string | null;
          correction_note?: string | null;
          corrected_by?: string | null;
          corrected_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["compliance_alerts"]["Insert"]>;
        Relationships: [];
      };
      dispatch_plans: {
        Row: {
          id: string;
          plan_date: string;
          driver_id: string | null;
          driver_name_raw: string | null;
          vehicle_no: string | null;
          shipper: string | null;
          delivery_spot: string | null;
          highway_instruction: string | null;
          is_subcontract: boolean;
          note: string | null;
        } & Timestamps;
        Insert: {
          id?: string;
          plan_date: string;
          driver_id?: string | null;
          driver_name_raw?: string | null;
          vehicle_no?: string | null;
          shipper?: string | null;
          delivery_spot?: string | null;
          highway_instruction?: string | null;
          is_subcontract?: boolean;
          note?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["dispatch_plans"]["Insert"]>;
        Relationships: [];
      };
      line_usage: {
        Row: {
          month_key: string;
          sent_count: number;
          limit_count: number | null;
          updated_at: string;
        };
        Insert: {
          month_key: string;
          sent_count?: number;
          limit_count?: number | null;
        };
        Update: Partial<Database["public"]["Tables"]["line_usage"]["Insert"]>;
        Relationships: [];
      };
      app_settings: {
        Row: {
          key: string;
          value: Json;
          description: string | null;
          updated_at: string;
        };
        Insert: { key: string; value: Json; description?: string | null };
        Update: Partial<Database["public"]["Tables"]["app_settings"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      is_admin: { Args: Record<string, never>; Returns: boolean };
      current_driver_id: { Args: Record<string, never>; Returns: string };
      to_month_key: { Args: { ts: string }; Returns: string };
      increment_line_usage: {
        Args: { p_month_key: string; p_delta?: number };
        Returns: undefined;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

// 便利型エイリアス
export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
export type TablesInsert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];
