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
  public: {
    Tables: {
      dosage_forms: {
        Row: {
          base_unit: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          sort_order: number
        }
        Insert: {
          base_unit: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
        }
        Update: {
          base_unit?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      medicine_categories: {
        Row: {
          created_at: string
          deleted_at: string | null
          description: string | null
          id: string
          is_active: boolean
          is_system: boolean
          name: string
          org_id: string
          store_id: string | null
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_system?: boolean
          name: string
          org_id: string
          store_id?: string | null
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_system?: boolean
          name?: string
          org_id?: string
          store_id?: string | null
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "medicine_categories_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medicine_categories_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medicine_categories_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      medicines: {
        Row: {
          barcode: string | null
          category_id: string | null
          created_at: string
          default_gst_rate: number
          deleted_at: string | null
          dosage_form_id: string
          focus_label: string | null
          hsn_code: string | null
          id: string
          is_favourite: boolean
          is_focused: boolean
          manufacturer: string
          min_stock_level: number
          name: string
          org_id: string
          pack_size: number
          pack_unit: string
          rack_location: string | null
          reorder_level: number
          sale_unit_mode: string
          salt_composition: string | null
          scan_confidence: number | null
          store_id: string | null
          strength: string | null
          units_per_pack: number | null
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          barcode?: string | null
          category_id?: string | null
          created_at?: string
          default_gst_rate?: number
          deleted_at?: string | null
          dosage_form_id: string
          focus_label?: string | null
          hsn_code?: string | null
          id?: string
          is_favourite?: boolean
          is_focused?: boolean
          manufacturer?: string
          min_stock_level?: number
          name: string
          org_id: string
          pack_size?: number
          pack_unit?: string
          rack_location?: string | null
          reorder_level?: number
          sale_unit_mode?: string
          salt_composition?: string | null
          scan_confidence?: number | null
          store_id?: string | null
          strength?: string | null
          units_per_pack?: number | null
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          barcode?: string | null
          category_id?: string | null
          created_at?: string
          default_gst_rate?: number
          deleted_at?: string | null
          dosage_form_id?: string
          focus_label?: string | null
          hsn_code?: string | null
          id?: string
          is_favourite?: boolean
          is_focused?: boolean
          manufacturer?: string
          min_stock_level?: number
          name?: string
          org_id?: string
          pack_size?: number
          pack_unit?: string
          rack_location?: string | null
          reorder_level?: number
          sale_unit_mode?: string
          salt_composition?: string | null
          scan_confidence?: number | null
          store_id?: string | null
          strength?: string | null
          units_per_pack?: number | null
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "medicines_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "medicine_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medicines_dosage_form_id_fkey"
            columns: ["dosage_form_id"]
            isOneToOne: false
            referencedRelation: "dosage_forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medicines_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medicines_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medicines_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          billing_status: string
          created_at: string
          gstin_default: string | null
          id: string
          legal_name: string | null
          name: string
          plan_tier: string
          razorpay_customer_id: string | null
          razorpay_subscription_id: string | null
          shared_masters_enabled: boolean
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          billing_status?: string
          created_at?: string
          gstin_default?: string | null
          id?: string
          legal_name?: string | null
          name: string
          plan_tier?: string
          razorpay_customer_id?: string | null
          razorpay_subscription_id?: string | null
          shared_masters_enabled?: boolean
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          billing_status?: string
          created_at?: string
          gstin_default?: string | null
          id?: string
          legal_name?: string | null
          name?: string
          plan_tier?: string
          razorpay_customer_id?: string | null
          razorpay_subscription_id?: string | null
          shared_masters_enabled?: boolean
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      stores: {
        Row: {
          address: string
          city: string
          code: string
          created_at: string
          drug_license_no: string | null
          email: string
          gst_filing_type: string
          gst_scheme: string
          gstin: string | null
          id: string
          idle_lock_minutes: number
          is_active: boolean
          name: string
          org_id: string
          owner_name: string
          phone: string
          pincode: string
          state: string
          updated_at: string
        }
        Insert: {
          address?: string
          city?: string
          code: string
          created_at?: string
          drug_license_no?: string | null
          email?: string
          gst_filing_type?: string
          gst_scheme?: string
          gstin?: string | null
          id?: string
          idle_lock_minutes?: number
          is_active?: boolean
          name: string
          org_id: string
          owner_name?: string
          phone?: string
          pincode?: string
          state?: string
          updated_at?: string
        }
        Update: {
          address?: string
          city?: string
          code?: string
          created_at?: string
          drug_license_no?: string | null
          email?: string
          gst_filing_type?: string
          gst_scheme?: string
          gstin?: string | null
          id?: string
          idle_lock_minutes?: number
          is_active?: boolean
          name?: string
          org_id?: string
          owner_name?: string
          phone?: string
          pincode?: string
          state?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stores_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          created_at: string
          email: string
          full_name: string
          id: string
          is_active: boolean
          last_login_at: string | null
          org_id: string
          phone: string | null
          pin_hash: string | null
          pin_set_at: string | null
          role: string
          store_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name: string
          id: string
          is_active?: boolean
          last_login_at?: string | null
          org_id: string
          phone?: string | null
          pin_hash?: string | null
          pin_set_at?: string | null
          role: string
          store_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          is_active?: boolean
          last_login_at?: string | null
          org_id?: string
          phone?: string | null
          pin_hash?: string | null
          pin_set_at?: string | null
          role?: string
          store_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_profiles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_profiles_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_org: { Args: never; Returns: string }
      current_role: { Args: never; Returns: string }
      current_store: { Args: never; Returns: string }
      rpc_create_org_with_owner: {
        Args: { p_full_name: string; p_org_name: string; p_phone?: string }
        Returns: {
          org_id: string
          profile_id: string
        }[]
      }
      user_has_store_access: {
        Args: { target_store_id: string }
        Returns: boolean
      }
      user_org_has_shared_masters: { Args: never; Returns: boolean }
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
  public: {
    Enums: {},
  },
} as const
