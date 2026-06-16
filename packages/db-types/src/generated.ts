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
      audit_log: {
        Row: {
          action: string
          after: Json | null
          before: Json | null
          created_at: string
          entity: string
          entity_id: string
          id: number
          ip_address: unknown
          org_id: string
          store_id: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity: string
          entity_id: string
          id?: number
          ip_address?: unknown
          org_id: string
          store_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity?: string
          entity_id?: string
          id?: number
          ip_address?: unknown
          org_id?: string
          store_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log_2026_05: {
        Row: {
          action: string
          after: Json | null
          before: Json | null
          created_at: string
          entity: string
          entity_id: string
          id: number
          ip_address: unknown
          org_id: string
          store_id: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity: string
          entity_id: string
          id?: number
          ip_address?: unknown
          org_id: string
          store_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity?: string
          entity_id?: string
          id?: number
          ip_address?: unknown
          org_id?: string
          store_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      audit_log_2026_06: {
        Row: {
          action: string
          after: Json | null
          before: Json | null
          created_at: string
          entity: string
          entity_id: string
          id: number
          ip_address: unknown
          org_id: string
          store_id: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity: string
          entity_id: string
          id?: number
          ip_address?: unknown
          org_id: string
          store_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity?: string
          entity_id?: string
          id?: number
          ip_address?: unknown
          org_id?: string
          store_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      audit_log_2026_07: {
        Row: {
          action: string
          after: Json | null
          before: Json | null
          created_at: string
          entity: string
          entity_id: string
          id: number
          ip_address: unknown
          org_id: string
          store_id: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity: string
          entity_id: string
          id?: number
          ip_address?: unknown
          org_id: string
          store_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity?: string
          entity_id?: string
          id?: number
          ip_address?: unknown
          org_id?: string
          store_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      audit_log_2026_08: {
        Row: {
          action: string
          after: Json | null
          before: Json | null
          created_at: string
          entity: string
          entity_id: string
          id: number
          ip_address: unknown
          org_id: string
          store_id: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity: string
          entity_id: string
          id?: number
          ip_address?: unknown
          org_id: string
          store_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity?: string
          entity_id?: string
          id?: number
          ip_address?: unknown
          org_id?: string
          store_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      audit_log_2026_09: {
        Row: {
          action: string
          after: Json | null
          before: Json | null
          created_at: string
          entity: string
          entity_id: string
          id: number
          ip_address: unknown
          org_id: string
          store_id: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity: string
          entity_id: string
          id?: number
          ip_address?: unknown
          org_id: string
          store_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity?: string
          entity_id?: string
          id?: number
          ip_address?: unknown
          org_id?: string
          store_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      audit_log_2026_10: {
        Row: {
          action: string
          after: Json | null
          before: Json | null
          created_at: string
          entity: string
          entity_id: string
          id: number
          ip_address: unknown
          org_id: string
          store_id: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity: string
          entity_id: string
          id?: number
          ip_address?: unknown
          org_id: string
          store_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity?: string
          entity_id?: string
          id?: number
          ip_address?: unknown
          org_id?: string
          store_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      audit_log_default: {
        Row: {
          action: string
          after: Json | null
          before: Json | null
          created_at: string
          entity: string
          entity_id: string
          id: number
          ip_address: unknown
          org_id: string
          store_id: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity: string
          entity_id: string
          id?: number
          ip_address?: unknown
          org_id: string
          store_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity?: string
          entity_id?: string
          id?: number
          ip_address?: unknown
          org_id?: string
          store_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      batches: {
        Row: {
          batch_barcode: string | null
          batch_number: string
          challan_id: string | null
          created_at: string
          current_quantity: number
          deleted_at: string | null
          expiry_date: string
          gst_percentage: number
          id: string
          initial_quantity: number
          is_blocked: boolean
          medicine_id: string
          mrp: number
          org_id: string
          purchase_item_id: string | null
          purchase_rate: number
          selling_price: number | null
          store_id: string
          supplier_id: string | null
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          batch_barcode?: string | null
          batch_number: string
          challan_id?: string | null
          created_at?: string
          current_quantity?: number
          deleted_at?: string | null
          expiry_date: string
          gst_percentage?: number
          id?: string
          initial_quantity?: number
          is_blocked?: boolean
          medicine_id: string
          mrp?: number
          org_id: string
          purchase_item_id?: string | null
          purchase_rate?: number
          selling_price?: number | null
          store_id: string
          supplier_id?: string | null
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          batch_barcode?: string | null
          batch_number?: string
          challan_id?: string | null
          created_at?: string
          current_quantity?: number
          deleted_at?: string | null
          expiry_date?: string
          gst_percentage?: number
          id?: string
          initial_quantity?: number
          is_blocked?: boolean
          medicine_id?: string
          mrp?: number
          org_id?: string
          purchase_item_id?: string | null
          purchase_rate?: number
          selling_price?: number | null
          store_id?: string
          supplier_id?: string | null
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "batches_challan_id_fkey"
            columns: ["challan_id"]
            isOneToOne: false
            referencedRelation: "challans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batches_medicine_id_fkey"
            columns: ["medicine_id"]
            isOneToOne: false
            referencedRelation: "medicines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batches_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batches_purchase_item_id_fkey"
            columns: ["purchase_item_id"]
            isOneToOne: false
            referencedRelation: "purchase_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batches_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batches_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batches_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      bill_counters: {
        Row: {
          last_value: number
          scope: string
          store_id: string
          updated_at: string
        }
        Insert: {
          last_value?: number
          scope: string
          store_id: string
          updated_at?: string
        }
        Update: {
          last_value?: number
          scope?: string
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bill_counters_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      challan_items: {
        Row: {
          accepted_quantity: number
          batch_number: string
          challan_id: string
          created_at: string
          expiry_date: string
          gst_percentage: number
          id: string
          medicine_id: string
          mrp: number
          org_id: string
          purchase_rate: number
          received_quantity: number
          returned_quantity: number
          status: string
          store_id: string
        }
        Insert: {
          accepted_quantity?: number
          batch_number: string
          challan_id: string
          created_at?: string
          expiry_date: string
          gst_percentage?: number
          id?: string
          medicine_id: string
          mrp?: number
          org_id: string
          purchase_rate?: number
          received_quantity?: number
          returned_quantity?: number
          status?: string
          store_id: string
        }
        Update: {
          accepted_quantity?: number
          batch_number?: string
          challan_id?: string
          created_at?: string
          expiry_date?: string
          gst_percentage?: number
          id?: string
          medicine_id?: string
          mrp?: number
          org_id?: string
          purchase_rate?: number
          received_quantity?: number
          returned_quantity?: number
          status?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "challan_items_challan_id_fkey"
            columns: ["challan_id"]
            isOneToOne: false
            referencedRelation: "challans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "challan_items_medicine_id_fkey"
            columns: ["medicine_id"]
            isOneToOne: false
            referencedRelation: "medicines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "challan_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "challan_items_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      challans: {
        Row: {
          challan_date: string
          challan_number: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          expected_return_date: string | null
          id: string
          linked_purchase_id: string | null
          notes: string | null
          org_id: string
          status: string
          store_id: string
          supplier_id: string
          total_items: number
          total_quantity: number
          updated_at: string
          version: number
        }
        Insert: {
          challan_date: string
          challan_number: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          expected_return_date?: string | null
          id?: string
          linked_purchase_id?: string | null
          notes?: string | null
          org_id: string
          status?: string
          store_id: string
          supplier_id: string
          total_items?: number
          total_quantity?: number
          updated_at?: string
          version?: number
        }
        Update: {
          challan_date?: string
          challan_number?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          expected_return_date?: string | null
          id?: string
          linked_purchase_id?: string | null
          notes?: string | null
          org_id?: string
          status?: string
          store_id?: string
          supplier_id?: string
          total_items?: number
          total_quantity?: number
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "challans_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "challans_linked_purchase_id_fkey"
            columns: ["linked_purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "challans_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "challans_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "challans_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_regular_medicines: {
        Row: {
          created_at: string
          customer_id: string
          id: string
          interval_days: number | null
          last_dispensed_date: string | null
          medicine_id: string
          next_due_date: string | null
          notes: string | null
          org_id: string
          remind_days_before: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          id?: string
          interval_days?: number | null
          last_dispensed_date?: string | null
          medicine_id: string
          next_due_date?: string | null
          notes?: string | null
          org_id: string
          remind_days_before?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          id?: string
          interval_days?: number | null
          last_dispensed_date?: string | null
          medicine_id?: string
          next_due_date?: string | null
          notes?: string | null
          org_id?: string
          remind_days_before?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_regular_medicines_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_regular_medicines_medicine_id_fkey"
            columns: ["medicine_id"]
            isOneToOne: false
            referencedRelation: "medicines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_regular_medicines_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address: string | null
          created_at: string
          credit_days: number | null
          credit_limit: number | null
          customer_type: string
          deleted_at: string | null
          email: string | null
          gstin: string | null
          id: string
          is_active: boolean
          last_purchase_date: string | null
          name: string
          org_id: string
          outstanding_balance: number
          phone: string
          special_discount_label: string | null
          special_discount_type: string | null
          special_discount_value: number
          state: string | null
          store_id: string | null
          total_purchases: number
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          address?: string | null
          created_at?: string
          credit_days?: number | null
          credit_limit?: number | null
          customer_type?: string
          deleted_at?: string | null
          email?: string | null
          gstin?: string | null
          id?: string
          is_active?: boolean
          last_purchase_date?: string | null
          name: string
          org_id: string
          outstanding_balance?: number
          phone?: string
          special_discount_label?: string | null
          special_discount_type?: string | null
          special_discount_value?: number
          state?: string | null
          store_id?: string | null
          total_purchases?: number
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          address?: string | null
          created_at?: string
          credit_days?: number | null
          credit_limit?: number | null
          customer_type?: string
          deleted_at?: string | null
          email?: string | null
          gstin?: string | null
          id?: string
          is_active?: boolean
          last_purchase_date?: string | null
          name?: string
          org_id?: string
          outstanding_balance?: number
          phone?: string
          special_discount_label?: string | null
          special_discount_type?: string | null
          special_discount_value?: number
          state?: string | null
          store_id?: string | null
          total_purchases?: number
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "customers_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      doctor_commission_payouts: {
        Row: {
          amount: number
          created_at: string
          deleted_at: string | null
          doctor_id: string
          id: string
          notes: string | null
          org_id: string
          paid_at: string
          paid_by: string | null
          store_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          deleted_at?: string | null
          doctor_id: string
          id?: string
          notes?: string | null
          org_id: string
          paid_at?: string
          paid_by?: string | null
          store_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          deleted_at?: string | null
          doctor_id?: string
          id?: string
          notes?: string | null
          org_id?: string
          paid_at?: string
          paid_by?: string | null
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "doctor_commission_payouts_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doctor_commission_payouts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doctor_commission_payouts_paid_by_fkey"
            columns: ["paid_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doctor_commission_payouts_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      doctors: {
        Row: {
          clinic_address: string | null
          clinic_name: string | null
          commission_rate: number
          commission_type: string
          created_at: string
          deleted_at: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          org_id: string
          phone: string | null
          specialization: string | null
          store_id: string | null
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          clinic_address?: string | null
          clinic_name?: string | null
          commission_rate?: number
          commission_type?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          org_id: string
          phone?: string | null
          specialization?: string | null
          store_id?: string | null
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          clinic_address?: string | null
          clinic_name?: string | null
          commission_rate?: number
          commission_type?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          org_id?: string
          phone?: string | null
          specialization?: string | null
          store_id?: string | null
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "doctors_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doctors_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doctors_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
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
      expense_categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          is_system: boolean
          name: string
          org_id: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_system?: boolean
          name: string
          org_id?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_system?: boolean
          name?: string
          org_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expense_categories_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          attachment_url: string | null
          category_id: string | null
          client_uuid: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string
          expense_date: string
          id: string
          notes: string | null
          org_id: string
          payment_method: string | null
          store_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          attachment_url?: string | null
          category_id?: string | null
          client_uuid?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description: string
          expense_date: string
          id?: string
          notes?: string | null
          org_id: string
          payment_method?: string | null
          store_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          attachment_url?: string | null
          category_id?: string | null
          client_uuid?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string
          expense_date?: string
          id?: string
          notes?: string | null
          org_id?: string
          payment_method?: string | null
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      master_medicines: {
        Row: {
          barcode: string | null
          created_at: string
          default_gst_rate: number | null
          dosage_form: string | null
          hsn_code: string | null
          id: string
          manufacturer: string | null
          name: string
          pack_size: number | null
          pack_unit: string | null
          salt_composition: string | null
          strength: string | null
          units_per_pack: number | null
          updated_at: string
        }
        Insert: {
          barcode?: string | null
          created_at?: string
          default_gst_rate?: number | null
          dosage_form?: string | null
          hsn_code?: string | null
          id?: string
          manufacturer?: string | null
          name: string
          pack_size?: number | null
          pack_unit?: string | null
          salt_composition?: string | null
          strength?: string | null
          units_per_pack?: number | null
          updated_at?: string
        }
        Update: {
          barcode?: string | null
          created_at?: string
          default_gst_rate?: number | null
          dosage_form?: string | null
          hsn_code?: string | null
          id?: string
          manufacturer?: string | null
          name?: string
          pack_size?: number | null
          pack_unit?: string | null
          salt_composition?: string | null
          strength?: string | null
          units_per_pack?: number | null
          updated_at?: string
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
      notifications: {
        Row: {
          action_url: string | null
          created_at: string
          id: string
          is_read: boolean
          kind: string
          message: string
          org_id: string
          priority: string
          read_at: string | null
          store_id: string | null
          target_user_id: string | null
          title: string
        }
        Insert: {
          action_url?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          kind?: string
          message: string
          org_id: string
          priority?: string
          read_at?: string | null
          store_id?: string | null
          target_user_id?: string | null
          title: string
        }
        Update: {
          action_url?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          kind?: string
          message?: string
          org_id?: string
          priority?: string
          read_at?: string | null
          store_id?: string | null
          target_user_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_target_user_id_fkey"
            columns: ["target_user_id"]
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
      pos_hotkey_group_items: {
        Row: {
          created_at: string
          group_id: string
          id: string
          medicine_id: string
          quantity: number
          sort_order: number
        }
        Insert: {
          created_at?: string
          group_id: string
          id?: string
          medicine_id: string
          quantity?: number
          sort_order?: number
        }
        Update: {
          created_at?: string
          group_id?: string
          id?: string
          medicine_id?: string
          quantity?: number
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "pos_hotkey_group_items_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "pos_hotkey_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_hotkey_group_items_medicine_id_fkey"
            columns: ["medicine_id"]
            isOneToOne: false
            referencedRelation: "medicines"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_hotkey_groups: {
        Row: {
          created_at: string
          digit: number
          id: string
          name: string | null
          org_id: string
          store_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          digit: number
          id?: string
          name?: string | null
          org_id: string
          store_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          digit?: number
          id?: string
          name?: string | null
          org_id?: string
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_hotkey_groups_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_hotkey_groups_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_items: {
        Row: {
          amount: number
          batch_number: string
          created_at: string
          discount_percentage: number | null
          expiry_date: string
          free_quantity: number | null
          gst_percentage: number
          id: string
          medicine_id: string
          mrp: number
          org_id: string
          purchase_id: string
          purchase_rate: number
          quantity: number
          returned_quantity: number
          selling_price: number | null
          store_id: string
        }
        Insert: {
          amount?: number
          batch_number: string
          created_at?: string
          discount_percentage?: number | null
          expiry_date: string
          free_quantity?: number | null
          gst_percentage?: number
          id?: string
          medicine_id: string
          mrp?: number
          org_id: string
          purchase_id: string
          purchase_rate?: number
          quantity?: number
          returned_quantity?: number
          selling_price?: number | null
          store_id: string
        }
        Update: {
          amount?: number
          batch_number?: string
          created_at?: string
          discount_percentage?: number | null
          expiry_date?: string
          free_quantity?: number | null
          gst_percentage?: number
          id?: string
          medicine_id?: string
          mrp?: number
          org_id?: string
          purchase_id?: string
          purchase_rate?: number
          quantity?: number
          returned_quantity?: number
          selling_price?: number | null
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_items_medicine_id_fkey"
            columns: ["medicine_id"]
            isOneToOne: false
            referencedRelation: "medicines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_items_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_items_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_order_items: {
        Row: {
          created_at: string
          id: string
          medicine_id: string
          org_id: string
          po_id: string
          requested_quantity: number
        }
        Insert: {
          created_at?: string
          id?: string
          medicine_id: string
          org_id: string
          po_id: string
          requested_quantity?: number
        }
        Update: {
          created_at?: string
          id?: string
          medicine_id?: string
          org_id?: string
          po_id?: string
          requested_quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_items_medicine_id_fkey"
            columns: ["medicine_id"]
            isOneToOne: false
            referencedRelation: "medicines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          linked_purchase_id: string | null
          notes: string | null
          order_date: string
          org_id: string
          status: string
          store_id: string
          supplier_id: string
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          linked_purchase_id?: string | null
          notes?: string | null
          order_date?: string
          org_id: string
          status?: string
          store_id: string
          supplier_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          linked_purchase_id?: string | null
          notes?: string | null
          order_date?: string
          org_id?: string
          status?: string
          store_id?: string
          supplier_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_linked_purchase_id_fkey"
            columns: ["linked_purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_return_items: {
        Row: {
          amount: number
          batch_id: string
          created_at: string
          id: string
          medicine_id: string
          org_id: string
          purchase_item_id: string
          purchase_return_id: string
          quantity: number
          store_id: string
        }
        Insert: {
          amount?: number
          batch_id: string
          created_at?: string
          id?: string
          medicine_id: string
          org_id: string
          purchase_item_id: string
          purchase_return_id: string
          quantity?: number
          store_id: string
        }
        Update: {
          amount?: number
          batch_id?: string
          created_at?: string
          id?: string
          medicine_id?: string
          org_id?: string
          purchase_item_id?: string
          purchase_return_id?: string
          quantity?: number
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_return_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_return_items_medicine_id_fkey"
            columns: ["medicine_id"]
            isOneToOne: false
            referencedRelation: "medicines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_return_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_return_items_purchase_item_id_fkey"
            columns: ["purchase_item_id"]
            isOneToOne: false
            referencedRelation: "purchase_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_return_items_purchase_return_id_fkey"
            columns: ["purchase_return_id"]
            isOneToOne: false
            referencedRelation: "purchase_returns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_return_items_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_returns: {
        Row: {
          client_uuid: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          gst_amount: number
          id: string
          org_id: string
          purchase_id: string
          reason: string | null
          return_date: string
          return_number: string
          store_id: string
          subtotal: number
          supplier_id: string
          total_amount: number
          updated_at: string
          version: number
        }
        Insert: {
          client_uuid?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          gst_amount?: number
          id?: string
          org_id: string
          purchase_id: string
          reason?: string | null
          return_date: string
          return_number: string
          store_id: string
          subtotal?: number
          supplier_id: string
          total_amount?: number
          updated_at?: string
          version?: number
        }
        Update: {
          client_uuid?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          gst_amount?: number
          id?: string
          org_id?: string
          purchase_id?: string
          reason?: string | null
          return_date?: string
          return_number?: string
          store_id?: string
          subtotal?: number
          supplier_id?: string
          total_amount?: number
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_returns_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_returns_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_returns_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_returns_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_returns_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      purchases: {
        Row: {
          bill_date: string
          bill_image_url: string | null
          bill_number: string
          cgst_amount: number
          client_uuid: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          discount_amount: number | null
          gst_amount: number
          id: string
          igst_amount: number
          is_ai_scanned: boolean
          notes: string | null
          org_id: string
          paid_amount: number
          payment_date: string | null
          payment_method: string | null
          payment_status: string
          sgst_amount: number
          store_id: string
          subtotal: number
          supplier_id: string
          taxable_amount: number
          total_amount: number
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          bill_date: string
          bill_image_url?: string | null
          bill_number: string
          cgst_amount?: number
          client_uuid?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          discount_amount?: number | null
          gst_amount?: number
          id?: string
          igst_amount?: number
          is_ai_scanned?: boolean
          notes?: string | null
          org_id: string
          paid_amount?: number
          payment_date?: string | null
          payment_method?: string | null
          payment_status?: string
          sgst_amount?: number
          store_id: string
          subtotal?: number
          supplier_id: string
          taxable_amount?: number
          total_amount?: number
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          bill_date?: string
          bill_image_url?: string | null
          bill_number?: string
          cgst_amount?: number
          client_uuid?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          discount_amount?: number | null
          gst_amount?: number
          id?: string
          igst_amount?: number
          is_ai_scanned?: boolean
          notes?: string | null
          org_id?: string
          paid_amount?: number
          payment_date?: string | null
          payment_method?: string | null
          payment_status?: string
          sgst_amount?: number
          store_id?: string
          subtotal?: number
          supplier_id?: string
          taxable_amount?: number
          total_amount?: number
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchases_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchases_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchases_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchases_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchases_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_items: {
        Row: {
          amount: number
          batch_id: string | null
          cgst_amount: number
          cgst_percentage: number
          created_at: string
          discount_percentage: number | null
          gst_percentage: number
          id: string
          igst_amount: number
          igst_percentage: number
          is_misc_item: boolean
          is_modified_item: boolean
          item_discount_type: string | null
          item_discount_value: number | null
          medicine_id: string | null
          misc_note: string | null
          mrp: number
          org_id: string
          original_quantity: number | null
          quantity: number
          returned_quantity: number
          sale_id: string
          selling_unit: string
          sgst_amount: number
          sgst_percentage: number
          store_id: string
          taxable_amount: number
        }
        Insert: {
          amount?: number
          batch_id?: string | null
          cgst_amount?: number
          cgst_percentage?: number
          created_at?: string
          discount_percentage?: number | null
          gst_percentage?: number
          id?: string
          igst_amount?: number
          igst_percentage?: number
          is_misc_item?: boolean
          is_modified_item?: boolean
          item_discount_type?: string | null
          item_discount_value?: number | null
          medicine_id?: string | null
          misc_note?: string | null
          mrp?: number
          org_id: string
          original_quantity?: number | null
          quantity?: number
          returned_quantity?: number
          sale_id: string
          selling_unit?: string
          sgst_amount?: number
          sgst_percentage?: number
          store_id: string
          taxable_amount?: number
        }
        Update: {
          amount?: number
          batch_id?: string | null
          cgst_amount?: number
          cgst_percentage?: number
          created_at?: string
          discount_percentage?: number | null
          gst_percentage?: number
          id?: string
          igst_amount?: number
          igst_percentage?: number
          is_misc_item?: boolean
          is_modified_item?: boolean
          item_discount_type?: string | null
          item_discount_value?: number | null
          medicine_id?: string | null
          misc_note?: string | null
          mrp?: number
          org_id?: string
          original_quantity?: number | null
          quantity?: number
          returned_quantity?: number
          sale_id?: string
          selling_unit?: string
          sgst_amount?: number
          sgst_percentage?: number
          store_id?: string
          taxable_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "sale_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_medicine_id_fkey"
            columns: ["medicine_id"]
            isOneToOne: false
            referencedRelation: "medicines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          org_id: string
          paid_at: string
          payment_method: string
          reference_number: string | null
          sale_id: string
          store_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          org_id: string
          paid_at?: string
          payment_method: string
          reference_number?: string | null
          sale_id: string
          store_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          org_id?: string
          paid_at?: string
          payment_method?: string
          reference_number?: string | null
          sale_id?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sale_payments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_payments_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_payments_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_return_items: {
        Row: {
          amount: number
          batch_id: string
          created_at: string
          id: string
          medicine_id: string
          org_id: string
          quantity: number
          sale_item_id: string
          sale_return_id: string
          store_id: string
        }
        Insert: {
          amount?: number
          batch_id: string
          created_at?: string
          id?: string
          medicine_id: string
          org_id: string
          quantity?: number
          sale_item_id: string
          sale_return_id: string
          store_id: string
        }
        Update: {
          amount?: number
          batch_id?: string
          created_at?: string
          id?: string
          medicine_id?: string
          org_id?: string
          quantity?: number
          sale_item_id?: string
          sale_return_id?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sale_return_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_return_items_medicine_id_fkey"
            columns: ["medicine_id"]
            isOneToOne: false
            referencedRelation: "medicines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_return_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_return_items_sale_item_id_fkey"
            columns: ["sale_item_id"]
            isOneToOne: false
            referencedRelation: "sale_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_return_items_sale_return_id_fkey"
            columns: ["sale_return_id"]
            isOneToOne: false
            referencedRelation: "sale_returns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_return_items_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_returns: {
        Row: {
          client_uuid: string
          created_at: string
          created_by: string | null
          customer_id: string | null
          deleted_at: string | null
          gst_amount: number
          id: string
          org_id: string
          reason: string | null
          refund_method: string
          return_date: string
          return_number: string
          sale_id: string
          store_id: string
          subtotal: number
          total_amount: number
          updated_at: string
          version: number
        }
        Insert: {
          client_uuid?: string
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          deleted_at?: string | null
          gst_amount?: number
          id?: string
          org_id: string
          reason?: string | null
          refund_method?: string
          return_date: string
          return_number: string
          sale_id: string
          store_id: string
          subtotal?: number
          total_amount?: number
          updated_at?: string
          version?: number
        }
        Update: {
          client_uuid?: string
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          deleted_at?: string | null
          gst_amount?: number
          id?: string
          org_id?: string
          reason?: string | null
          refund_method?: string
          return_date?: string
          return_number?: string
          sale_id?: string
          store_id?: string
          subtotal?: number
          total_amount?: number
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "sale_returns_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_returns_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_returns_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_returns_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_returns_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          bill_date: string
          bill_number: string
          cgst_amount: number
          client_uuid: string
          created_at: string
          created_by: string | null
          customer_gstin: string | null
          customer_id: string | null
          customer_state: string | null
          customer_type: string
          deleted_at: string | null
          discount_amount: number | null
          doctor_id: string | null
          doctor_name: string | null
          gst_amount: number
          id: string
          igst_amount: number
          is_fully_returned: boolean
          is_modified: boolean
          is_prescription_sale: boolean
          is_returned: boolean
          misc_charge: number | null
          modification_note: string | null
          modified_at: string | null
          notes: string | null
          org_id: string
          paid_amount: number
          payment_method: string
          payment_status: string
          prescription_image_path: string | null
          round_off: number
          sgst_amount: number
          source: string
          special_discount_amount: number
          special_discount_label: string | null
          store_id: string
          subtotal: number
          taxable_amount: number
          total_amount: number
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          bill_date: string
          bill_number: string
          cgst_amount?: number
          client_uuid?: string
          created_at?: string
          created_by?: string | null
          customer_gstin?: string | null
          customer_id?: string | null
          customer_state?: string | null
          customer_type?: string
          deleted_at?: string | null
          discount_amount?: number | null
          doctor_id?: string | null
          doctor_name?: string | null
          gst_amount?: number
          id?: string
          igst_amount?: number
          is_fully_returned?: boolean
          is_modified?: boolean
          is_prescription_sale?: boolean
          is_returned?: boolean
          misc_charge?: number | null
          modification_note?: string | null
          modified_at?: string | null
          notes?: string | null
          org_id: string
          paid_amount?: number
          payment_method?: string
          payment_status?: string
          prescription_image_path?: string | null
          round_off?: number
          sgst_amount?: number
          source?: string
          special_discount_amount?: number
          special_discount_label?: string | null
          store_id: string
          subtotal?: number
          taxable_amount?: number
          total_amount?: number
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          bill_date?: string
          bill_number?: string
          cgst_amount?: number
          client_uuid?: string
          created_at?: string
          created_by?: string | null
          customer_gstin?: string | null
          customer_id?: string | null
          customer_state?: string | null
          customer_type?: string
          deleted_at?: string | null
          discount_amount?: number | null
          doctor_id?: string | null
          doctor_name?: string | null
          gst_amount?: number
          id?: string
          igst_amount?: number
          is_fully_returned?: boolean
          is_modified?: boolean
          is_prescription_sale?: boolean
          is_returned?: boolean
          misc_charge?: number | null
          modification_note?: string | null
          modified_at?: string | null
          notes?: string | null
          org_id?: string
          paid_amount?: number
          payment_method?: string
          payment_status?: string
          prescription_image_path?: string | null
          round_off?: number
          sgst_amount?: number
          source?: string
          special_discount_amount?: number
          special_discount_label?: string | null
          store_id?: string
          subtotal?: number
          taxable_amount?: number
          total_amount?: number
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "sales_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_corrections: {
        Row: {
          after_qty: number
          batch_id: string
          before_qty: number
          client_uuid: string
          created_at: string
          delta: number
          id: string
          medicine_id: string
          org_id: string
          performed_by: string
          reason: string
          store_id: string
        }
        Insert: {
          after_qty: number
          batch_id: string
          before_qty: number
          client_uuid?: string
          created_at?: string
          delta: number
          id?: string
          medicine_id: string
          org_id: string
          performed_by: string
          reason: string
          store_id: string
        }
        Update: {
          after_qty?: number
          batch_id?: string
          before_qty?: number
          client_uuid?: string
          created_at?: string
          delta?: number
          id?: string
          medicine_id?: string
          org_id?: string
          performed_by?: string
          reason?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_corrections_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_corrections_medicine_id_fkey"
            columns: ["medicine_id"]
            isOneToOne: false
            referencedRelation: "medicines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_corrections_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_corrections_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_corrections_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_transfer_items: {
        Row: {
          approved_quantity: number | null
          batch_number: string
          created_at: string
          dest_batch_id: string | null
          expiry_date: string
          gst_percentage: number
          id: string
          medicine_id: string
          medicine_name: string
          mrp: number
          notes: string | null
          org_id: string
          purchase_rate: number
          received_quantity: number | null
          requested_quantity: number
          source_batch_id: string
          transfer_id: string
        }
        Insert: {
          approved_quantity?: number | null
          batch_number: string
          created_at?: string
          dest_batch_id?: string | null
          expiry_date: string
          gst_percentage?: number
          id?: string
          medicine_id: string
          medicine_name: string
          mrp: number
          notes?: string | null
          org_id: string
          purchase_rate: number
          received_quantity?: number | null
          requested_quantity: number
          source_batch_id: string
          transfer_id: string
        }
        Update: {
          approved_quantity?: number | null
          batch_number?: string
          created_at?: string
          dest_batch_id?: string | null
          expiry_date?: string
          gst_percentage?: number
          id?: string
          medicine_id?: string
          medicine_name?: string
          mrp?: number
          notes?: string | null
          org_id?: string
          purchase_rate?: number
          received_quantity?: number | null
          requested_quantity?: number
          source_batch_id?: string
          transfer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_transfer_items_dest_batch_id_fkey"
            columns: ["dest_batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfer_items_medicine_id_fkey"
            columns: ["medicine_id"]
            isOneToOne: false
            referencedRelation: "medicines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfer_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfer_items_source_batch_id_fkey"
            columns: ["source_batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfer_items_transfer_id_fkey"
            columns: ["transfer_id"]
            isOneToOne: false
            referencedRelation: "stock_transfers"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_transfers: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          cancelled_at: string | null
          client_uuid: string
          created_at: string
          flow: string
          from_store_id: string
          id: string
          notes: string | null
          org_id: string
          received_at: string | null
          received_by: string | null
          rejected_at: string | null
          requested_by: string | null
          shipped_at: string | null
          shipped_by: string | null
          status: string
          to_store_id: string
          transfer_no: string
          updated_at: string
          version: number
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          cancelled_at?: string | null
          client_uuid?: string
          created_at?: string
          flow: string
          from_store_id: string
          id?: string
          notes?: string | null
          org_id: string
          received_at?: string | null
          received_by?: string | null
          rejected_at?: string | null
          requested_by?: string | null
          shipped_at?: string | null
          shipped_by?: string | null
          status?: string
          to_store_id: string
          transfer_no: string
          updated_at?: string
          version?: number
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          cancelled_at?: string | null
          client_uuid?: string
          created_at?: string
          flow?: string
          from_store_id?: string
          id?: string
          notes?: string | null
          org_id?: string
          received_at?: string | null
          received_by?: string | null
          rejected_at?: string | null
          requested_by?: string | null
          shipped_at?: string | null
          shipped_by?: string | null
          status?: string
          to_store_id?: string
          transfer_no?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "stock_transfers_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfers_from_store_id_fkey"
            columns: ["from_store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfers_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfers_received_by_fkey"
            columns: ["received_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfers_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfers_shipped_by_fkey"
            columns: ["shipped_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfers_to_store_id_fkey"
            columns: ["to_store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
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
          upi_vpa: string | null
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
          upi_vpa?: string | null
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
          upi_vpa?: string | null
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
      suppliers: {
        Row: {
          address: string | null
          city: string | null
          contact_person: string | null
          created_at: string
          credit_days: number | null
          credit_limit: number | null
          deleted_at: string | null
          email: string | null
          gstin: string | null
          id: string
          is_active: boolean
          name: string
          opening_balance: number
          org_id: string
          outstanding_balance: number
          phone: string | null
          pincode: string | null
          state: string | null
          store_id: string | null
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          address?: string | null
          city?: string | null
          contact_person?: string | null
          created_at?: string
          credit_days?: number | null
          credit_limit?: number | null
          deleted_at?: string | null
          email?: string | null
          gstin?: string | null
          id?: string
          is_active?: boolean
          name: string
          opening_balance?: number
          org_id: string
          outstanding_balance?: number
          phone?: string | null
          pincode?: string | null
          state?: string | null
          store_id?: string | null
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          address?: string | null
          city?: string | null
          contact_person?: string | null
          created_at?: string
          credit_days?: number | null
          credit_limit?: number | null
          deleted_at?: string | null
          email?: string | null
          gstin?: string | null
          id?: string
          is_active?: boolean
          name?: string
          opening_balance?: number
          org_id?: string
          outstanding_balance?: number
          phone?: string | null
          pincode?: string | null
          state?: string | null
          store_id?: string | null
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suppliers_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suppliers_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
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
      create_audit_log_partition: {
        Args: { p_month_start: string }
        Returns: undefined
      }
      current_org: { Args: never; Returns: string }
      current_store: { Args: never; Returns: string }
      log_audit: {
        Args: {
          p_action: string
          p_after?: Json
          p_before?: Json
          p_entity: string
          p_entity_id: string
          p_org_id: string
          p_store_id: string
        }
        Returns: undefined
      }
      rpc_accept_challan: {
        Args: { p_payload: Json }
        Returns: Json
      }
      rpc_add_batch_manual: {
        Args: { p_medicine_id: string; p_payload: Json; p_store_id: string }
        Returns: Json
      }
      rpc_check_duplicate_bill: {
        Args: { p_bill_number: string; p_store_id: string; p_supplier_id: string }
        Returns: boolean
      }
      rpc_create_challan: {
        Args: { p_payload: Json }
        Returns: string
      }
      rpc_commit_purchase: {
        Args: { p_payload: Json }
        Returns: {
          bill_number: string
          purchase_id: string
        }[]
      }
      rpc_commit_purchase_return: {
        Args: { p_payload: Json }
        Returns: {
          return_id: string
          return_number: string
        }[]
      }
      rpc_commit_sale: {
        Args: { p_payload: Json }
        Returns: {
          bill_number: string
          sale_id: string
        }[]
      }
      rpc_commit_sale_return: {
        Args: { p_payload: Json }
        Returns: {
          return_id: string
          return_number: string
        }[]
      }
      rpc_create_category: {
        Args: { p_name: string; p_store_id?: string }
        Returns: {
          id: string
          is_system: boolean
          name: string
          store_id: string
        }[]
      }
      rpc_create_customer: {
        Args: { p_payload: Json }
        Returns: {
          customer_type: string
          email: string
          id: string
          is_active: boolean
          name: string
          phone: string
        }[]
      }
      rpc_create_doctor: {
        Args: { p_payload: Json }
        Returns: {
          clinic_address: string
          clinic_name: string
          commission_rate: number
          commission_type: string
          id: string
          is_active: boolean
          name: string
          phone: string
          specialization: string
        }[]
      }
      rpc_get_doctor_detail: { Args: { p_doctor_id: string }; Returns: Json }
      rpc_get_doctor_sales: {
        Args: { p_doctor_id: string; p_from?: string; p_to?: string; p_limit?: number; p_offset?: number }
        Returns: {
          sale_id: string
          bill_number: string
          bill_date: string
          customer_name: string
          total_amount: number
          commission_amount: number
        }[]
      }
      rpc_record_doctor_commission_payout: { Args: { p_payload: Json }; Returns: Json }
      rpc_get_doctor_commission_payouts: {
        Args: { p_doctor_id: string; p_limit?: number }
        Returns: {
          id: string
          amount: number
          notes: string
          paid_at: string
          paid_by_name: string
          created_at: string
        }[]
      }
      rpc_update_doctor: {
        Args: { p_doctor_id: string; p_payload: Json }
        Returns: {
          clinic_address: string
          clinic_name: string
          commission_rate: number
          commission_type: string
          id: string
          is_active: boolean
          name: string
          phone: string
          specialization: string
        }[]
      }
      rpc_create_medicine: {
        Args: { p_payload: Json }
        Returns: {
          default_gst_rate: number
          id: string
          manufacturer: string
          name: string
          pack_size: number
          pack_unit: string
        }[]
      }
      rpc_create_org_with_owner: {
        Args: { p_full_name: string; p_org_name: string; p_phone?: string }
        Returns: {
          org_id: string
          profile_id: string
        }[]
      }
      rpc_create_purchase_order: {
        Args: { p_payload: Json }
        Returns: string
      }
      rpc_create_store: {
        Args: { p_payload: Json }
        Returns: {
          code: string
          id: string
          name: string
        }[]
      }
      rpc_create_supplier: {
        Args: { p_payload: Json }
        Returns: {
          city: string
          credit_limit: number
          gstin: string
          id: string
          is_active: boolean
          name: string
          outstanding_balance: number
          phone: string
          state: string
        }[]
      }
      rpc_get_supplier_detail: { Args: { p_supplier_id: string }; Returns: Json }
      rpc_get_supplier_ledger: {
        Args: { p_supplier_id: string; p_limit?: number; p_offset?: number }
        Returns: {
          id: string
          transaction_type: string
          amount: number
          balance_after: number
          payment_method: string
          notes: string
          reference_type: string
          reference_id: string
          created_at: string
        }[]
      }
      rpc_record_supplier_payment: { Args: { p_payload: Json }; Returns: Json }
      rpc_update_supplier: { Args: { p_supplier_id: string; p_payload: Json }; Returns: Json }
      rpc_get_supplier_medicines: {
        Args: { p_supplier_id: string }
        Returns: {
          medicine_id: string
          medicine_name: string
          batch_id: string
          batch_number: string
          expiry_date: string
          current_quantity: number
          purchase_rate: number
          mrp: number
          gst_percentage: number
          days_to_expiry: number
          min_stock_level: number
          reorder_level: number
          is_low_stock: boolean
          purchase_item_id: string
          purchase_id: string
          last_purchase_date: string
        }[]
      }
      rpc_dashboard_chart_data: {
        Args: { p_store_id: string; p_days?: number }
        Returns: { day: string; sales: number; purchases: number; returns: number }[]
      }
      rpc_dashboard_stats: { Args: { p_store_id: string }; Returns: Json }
      rpc_dashboard_summary: { Args: { p_store_id?: string }; Returns: Json }
      rpc_upcoming_refills: {
        Args: { p_store_id: string; p_days?: number }
        Returns: {
          customer_id: string
          customer_name: string
          customer_phone: string
          medicine_id: string
          medicine_name: string
          sale_unit_mode: string
          units_per_pack: number | null
          interval_days: number | null
          remind_days_before: number
          last_dispensed_date: string | null
          next_due_date: string | null
          days_until_due: number | null
          total_stock: number
          min_stock_level: number
        }[]
      }
      rpc_delete_customer_routine: { Args: { p_id: string }; Returns: undefined }
      rpc_delete_purchase_return: { Args: { p_return_id: string }; Returns: undefined }
      rpc_get_customer_detail: {
        Args: { p_customer_id: string }
        Returns: Json
      }
      rpc_get_customer_ledger: {
        Args: { p_customer_id: string; p_limit?: number; p_offset?: number }
        Returns: {
          id: string
          transaction_type: string
          reference_type: string | null
          reference_id: string | null
          amount: number
          balance_after: number
          payment_method: string | null
          notes: string | null
          created_at: string
        }[]
      }
      rpc_get_customer_routine: {
        Args: { p_customer_id: string }
        Returns: {
          id: string
          medicine_id: string
          medicine_name: string
          sale_unit_mode: string
          units_per_pack: number | null
          interval_days: number | null
          remind_days_before: number
          last_dispensed_date: string | null
          next_due_date: string | null
          days_until_due: number | null
          notes: string | null
        }[]
      }
      rpc_list_customer_returns: {
        Args: { p_customer_id: string; p_limit?: number; p_offset?: number }
        Returns: {
          id: string
          return_number: string
          return_date: string
          bill_number: string
          sale_id: string
          total_amount: number
          refund_method: string | null
          created_at: string
        }[]
      }
      rpc_list_customer_sales: {
        Args: { p_customer_id: string; p_limit?: number; p_offset?: number }
        Returns: {
          id: string
          bill_number: string
          bill_date: string
          total_amount: number
          paid_amount: number
          payment_status: string
          items_count: number
          created_at: string
        }[]
      }
      rpc_record_customer_payment: {
        Args: { p_payload: Json }
        Returns: Json
      }
      rpc_update_customer: { Args: { p_payload: Json }; Returns: undefined }
      rpc_upsert_customer_routine: {
        Args: { p_payload: Json }
        Returns: string
      }
      rpc_list_expense_categories: {
        Args: { p_store_id: string }
        Returns: {
          id: string
          name: string
          is_system: boolean
        }[]
      }
      rpc_add_expense_category: {
        Args: { p_store_id: string; p_name: string }
        Returns: string
      }
      rpc_delete_expense_category: {
        Args: { p_store_id: string; p_category_id: string }
        Returns: undefined
      }
      rpc_list_expenses: {
        Args: { p_store_id: string; p_from: string; p_to: string }
        Returns: {
          id: string
          category_id: string | null
          category_name: string | null
          description: string
          amount: number
          expense_date: string
          payment_method: string | null
          notes: string | null
          created_at: string
        }[]
      }
      rpc_add_expense: {
        Args: {
          p_store_id: string
          p_description: string
          p_amount: number
          p_expense_date: string
          p_category_id?: string | null
          p_payment_method?: string
          p_notes?: string | null
        }
        Returns: string
      }
      rpc_update_expense: {
        Args: {
          p_expense_id: string
          p_store_id: string
          p_description: string
          p_amount: number
          p_expense_date: string
          p_category_id?: string | null
          p_payment_method?: string
          p_notes?: string | null
        }
        Returns: undefined
      }
      rpc_delete_expense: {
        Args: { p_expense_id: string; p_store_id: string }
        Returns: undefined
      }
      rpc_expense_summary: {
        Args: { p_store_id: string; p_from: string; p_to: string }
        Returns: {
          category: string
          total: number
          cnt: number
        }[]
      }
      rpc_expiring_batches: {
        Args: { p_days?: number; p_limit?: number; p_store_id: string }
        Returns: {
          batch_id: string
          batch_number: string
          days_left: number
          expiry_date: string
          medicine_id: string
          medicine_name: string
          on_hand: number
        }[]
      }
      rpc_finalize_staff_profile: {
        Args: {
          p_email: string
          p_full_name: string
          p_phone?: string
          p_role: string
          p_store_id?: string
          p_user_id: string
        }
        Returns: {
          email: string
          full_name: string
          id: string
          role: string
          store_id: string
        }[]
      }
      rpc_get_challan_detail: {
        Args: { p_challan_id: string }
        Returns: Json
      }
      rpc_get_medicine_detail: {
        Args: { p_medicine_id: string; p_store_id: string }
        Returns: Json
      }
      rpc_get_purchase_detail: {
        Args: { p_purchase_id: string }
        Returns: Json
      }
      rpc_get_recent_purchase_rates: {
        Args: { p_limit?: number; p_medicine_id: string; p_store_id: string }
        Returns: {
          bill_date: string
          rate: number
          supplier_name: string
        }[]
      }
      rpc_get_purchase_for_return: {
        Args: { p_bill_number: string; p_store_id: string }
        Returns: Json
      }
      rpc_get_purchase_order: {
        Args: { p_po_id: string }
        Returns: Json
      }
      rpc_get_purchase_return_detail: {
        Args: { p_return_id: string }
        Returns: Json
      }
      rpc_get_sale_detail: { Args: { p_sale_id: string }; Returns: Json }
      rpc_get_prescription_signed_url: { Args: { p_sale_id: string }; Returns: string | null }
      rpc_list_batches_for_barcodes: {
        Args: { p_medicine_id?: string; p_store_id: string }
        Returns: {
          batch_barcode: string
          batch_id: string
          batch_number: string
          current_qty: number
          expiry_date: string
          gst_percentage: number
          manufacturer: string
          medicine_id: string
          medicine_name: string
          mrp: number
        }[]
      }
      rpc_list_categories: {
        Args: { p_store_id?: string }
        Returns: {
          id: string
          is_system: boolean
          name: string
          store_id: string
        }[]
      }
      rpc_list_doctors: {
        Args: { p_store_id?: string; p_include_inactive?: boolean }
        Returns: {
          clinic_address: string
          clinic_name: string
          commission_rate: number
          commission_type: string
          id: string
          is_active: boolean
          name: string
          phone: string
          specialization: string
        }[]
      }
      rpc_list_medicines_with_stock: {
        Args: {
          p_limit?: number
          p_page?: number
          p_query?: string
          p_store_id: string
        }
        Returns: {
          active_batch_count: number
          category_id: string
          category_name: string
          created_at: string
          default_gst_rate: number
          dosage_form_id: string
          dosage_form_name: string
          focus_label: string
          hsn_code: string
          id: string
          is_focused: boolean
          manufacturer: string
          min_stock_level: number
          mrp: number
          name: string
          near_expiry_count: number
          pack_size: number
          pack_unit: string
          purchase_rate: number
          rack_location: string
          reorder_level: number
          sale_unit_mode: string
          salt_composition: string
          selling_price: number
          strength: string
          total_count: number
          total_stock: number
          units_per_pack: number
        }[]
      }
      rpc_list_policies: {
        Args: { p_table: string }
        Returns: {
          cmd: string
          permissive: string
          policy_name: string
          qual: string
          roles: string[]
          with_check: string
        }[]
      }
      rpc_list_challans: {
        Args: { p_store_id: string; p_status?: string | null; p_supplier_id?: string | null }
        Returns: {
          id: string
          supplier_id: string
          supplier_name: string | null
          challan_number: string
          challan_date: string
          expected_return_date: string | null
          status: string
          linked_purchase_id: string | null
          total_items: number
          total_quantity: number
          notes: string | null
          created_at: string
        }[]
      }
      rpc_list_purchase_orders: {
        Args: { p_status?: string; p_store_id: string }
        Returns: {
          created_at: string
          id: string
          linked_purchase_id: string | null
          order_date: string
          status: string
          supplier_id: string
          supplier_name: string
          total_items: number
        }[]
      }
      rpc_list_purchase_returns: {
        Args: { p_limit?: number; p_store_id: string }
        Returns: {
          bill_number: string
          id: string
          item_count: number
          return_date: string
          return_number: string
          supplier_id: string
          supplier_name: string
          total_amount: number
        }[]
      }
      rpc_list_purchases: {
        Args: {
          p_from?: string
          p_limit?: number
          p_offset?: number
          p_store_id: string
          p_to?: string
        }
        Returns: {
          bill_date: string
          bill_number: string
          created_at: string
          id: string
          is_ai_scanned: boolean
          payment_status: string
          return_status: string
          supplier_id: string
          supplier_name: string | null
          total_amount: number
        }[]
      }
      rpc_list_returns: {
        Args: { p_store_id: string; p_from?: string; p_to?: string; p_limit?: number; p_offset?: number }
        Returns: {
          id: string; return_number: string; return_date: string; bill_number: string
          sale_id: string; customer_id: string | null; customer_name: string
          item_count: number; total_amount: number; refund_method: string
          created_by_name: string; created_at: string
        }[]
      }
      rpc_get_return_detail: { Args: { p_return_id: string }; Returns: Json }
      rpc_pos_quick_bill_finder: {
        Args: { p_store_id: string; p_query: string }
        Returns: {
          sale_id: string; bill_number: string; bill_date: string
          customer_name: string; total_amount: number; medicine_snippet: string
        }[]
      }
      rpc_list_sales: {
        Args: {
          p_from?: string
          p_limit?: number
          p_offset?: number
          p_store_id: string
          p_to?: string
        }
        Returns: {
          bill_date: string
          bill_number: string
          created_at: string
          created_by_name: string
          customer_id: string
          customer_name: string
          id: string
          is_fully_returned: boolean
          is_modified: boolean
          is_returned: boolean
          item_count: number
          payment_method: string
          payment_status: string
          source: string
          total_amount: number
        }[]
      }
      rpc_list_staff: {
        Args: never
        Returns: {
          created_at: string
          email: string
          full_name: string
          id: string
          is_active: boolean
          last_login_at: string
          phone: string
          role: string
          store_code: string
          store_id: string
          store_name: string
        }[]
      }
      rpc_list_stock_batches: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_query?: string
          p_store_id: string
        }
        Returns: {
          batch_id: string
          batch_number: string
          days_to_expiry: number
          expiry_date: string
          gst_percentage: number
          is_blocked: boolean
          manufacturer: string
          medicine_id: string
          medicine_name: string
          mrp: number
          on_hand: number
          purchase_rate: number
        }[]
      }
      rpc_list_suppliers: {
        Args: { p_store_id?: string; p_filter?: string }
        Returns: {
          city: string
          credit_limit: number
          gstin: string
          id: string
          is_active: boolean
          name: string
          outstanding_balance: number
          phone: string
          state: string
        }[]
      }
      rpc_low_stock_alerts: {
        Args: { p_limit?: number; p_store_id: string }
        Returns: {
          manufacturer: string
          medicine_id: string
          min_level: number
          name: string
          on_hand: number
        }[]
      }
      rpc_mark_purchase_order_fulfilled: {
        Args: { p_po_id: string; p_purchase_id: string }
        Returns: undefined
      }
      rpc_master_medicine_search: {
        Args: { p_limit?: number; p_query: string }
        Returns: {
          barcode: string | null
          created_at: string
          default_gst_rate: number | null
          dosage_form: string | null
          hsn_code: string | null
          id: string
          manufacturer: string | null
          name: string
          pack_size: number | null
          pack_unit: string | null
          salt_composition: string | null
          strength: string | null
          units_per_pack: number | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "master_medicines"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      rpc_pos_add_hotkey_medicine: {
        Args: {
          p_digit: number
          p_medicine_id: string
          p_quantity?: number
          p_store_id: string
        }
        Returns: undefined
      }
      rpc_pos_clear_hotkey_group: {
        Args: { p_digit: number; p_store_id: string }
        Returns: undefined
      }
      rpc_pos_get_customer: {
        Args: { p_customer_id: string }
        Returns: {
          customer_type: string
          email: string
          gstin: string
          id: string
          name: string
          outstanding: number
          phone: string
          special_discount_label: string
          special_discount_type: string
          special_discount_value: number
          state: string
        }[]
      }
      rpc_pos_get_hotkey_groups: { Args: { p_store_id: string }; Returns: Json }
      rpc_pos_get_store_context: {
        Args: { p_store_id: string }
        Returns: {
          org_gstin: string
          org_name: string
          store_code: string
          store_id: string
          store_name: string
          store_state: string
        }[]
      }
      rpc_pos_list_batches_for_medicine: {
        Args: { p_medicine_id: string; p_store_id: string }
        Returns: {
          batch_id: string
          batch_number: string
          current_quantity: number
          days_to_expiry: number
          expiry_date: string
          gst_percentage: number
          mrp: number
          purchase_rate: number
          selling_price: number
          supplier_name: string
        }[]
      }
      rpc_pos_next_bill_number: {
        Args: { p_prefix?: string; p_store_id: string }
        Returns: string
      }
      rpc_pos_quick_access: {
        Args: {
          p_customer_id?: string
          p_limit_per?: number
          p_store_id: string
        }
        Returns: Json
      }
      rpc_pos_recent_bill_items: {
        Args: { p_customer_id: string; p_store_id: string }
        Returns: {
          batch_id: string
          batch_number: string
          current_quantity: number
          default_gst_rate: number
          expiry_date: string
          gst_percentage: number
          hsn_code: string
          manufacturer: string
          medicine_id: string
          mrp: number
          name: string
          original_qty: number
          pack_size: number
          pack_unit: string
          purchase_rate: number
          selling_price: number
        }[]
      }
      rpc_pending_challan_count: {
        Args: { p_store_id: string }
        Returns: number
      }
      rpc_soft_delete_purchase: {
        Args: { p_purchase_id: string; p_store_id: string }
        Returns: undefined
      }
      rpc_pos_remove_hotkey_medicine: {
        Args: { p_digit: number; p_medicine_id: string; p_store_id: string }
        Returns: undefined
      }
      rpc_pos_search_customers: {
        Args: { p_limit?: number; p_query: string; p_store_id: string }
        Returns: {
          customer_type: string
          email: string
          gstin: string
          id: string
          name: string
          outstanding: number
          phone: string
          special_discount_label: string
          special_discount_type: string
          special_discount_value: number
          state: string
        }[]
      }
      rpc_pos_search_medicines: {
        Args: { p_limit?: number; p_query: string; p_store_id: string }
        Returns: {
          batch_id: string
          batch_number: string
          current_quantity: number
          default_gst_rate: number
          expiry_date: string
          gst_percentage: number
          hsn_code: string
          manufacturer: string
          medicine_id: string
          mrp: number
          name: string
          pack_size: number
          pack_unit: string
          purchase_rate: number
          sale_unit_mode: string
          selling_price: number
          units_per_pack: number | null
        }[]
      }
      rpc_pos_set_hotkey_name: {
        Args: { p_digit: number; p_name: string; p_store_id: string }
        Returns: undefined
      }
      rpc_pos_toggle_favourite: {
        Args: { p_medicine_id: string; p_value: boolean }
        Returns: boolean
      }
      rpc_report_expiry: {
        Args: { p_store_id: string; p_days_ahead?: number }
        Returns: {
          batch_id: string
          batch_number: string
          medicine_id: string
          medicine_name: string
          manufacturer: string
          supplier_id: string | null
          supplier_name: string | null
          expiry_date: string
          current_quantity: number
          purchase_rate: number
          mrp: number
          gst_percentage: number
          sale_unit_mode: string
          units_per_pack: number
          pack_unit: string
          days_to_expiry: number
          is_expired: boolean
          value_at_mrp: number
        }[]
      }
      rpc_report_shortage: {
        Args: { p_store_id: string }
        Returns: {
          medicine_id: string
          medicine_name: string
          manufacturer: string
          current_quantity: number
          min_stock_level: number
          reorder_level: number
          sale_unit_mode: string
          units_per_pack: number
          pack_unit: string
          is_out_of_stock: boolean
          shortage_qty: number
          primary_supplier_id: string | null
          primary_supplier_name: string
          last_purchase_date: string | null
          last_purchase_rate: number | null
          estimated_reorder_value: number
        }[]
      }
      rpc_report_stock_summary: {
        Args: { p_store_id: string }
        Returns: {
          medicine_id: string
          medicine_name: string
          manufacturer: string
          sale_unit_mode: string
          units_per_pack: number
          pack_unit: string
          min_stock_level: number
          reorder_level: number
          total_quantity: number
          active_batches: number
          nearest_expiry: string | null
          stock_value: number
          is_low_stock: boolean
        }[]
      }
      rpc_report_gst_monthly: {
        Args: { p_store_id: string; p_month: number; p_year: number }
        Returns: Json
      }
      rpc_report_doctors: {
        Args: { p_store_id: string; p_from?: string | null; p_to?: string | null }
        Returns: Json
      }
      rpc_report_daily: {
        Args: { p_store_id: string; p_from: string; p_to: string }
        Returns: Json
      }
      rpc_report_gst_summary: {
        Args: { p_from?: string; p_store_id: string; p_to?: string }
        Returns: {
          cgst_amount: number
          gst_rate: number
          igst_amount: number
          line_count: number
          sgst_amount: number
          taxable_amount: number
          total_amount: number
        }[]
      }
      rpc_report_sales_trend: {
        Args: { p_days?: number; p_store_id: string }
        Returns: {
          bill_count: number
          day: string
          gst_amount: number
          total_amount: number
        }[]
      }
      rpc_report_top_medicines: {
        Args: { p_days?: number; p_limit?: number; p_store_id: string }
        Returns: {
          bills: number
          manufacturer: string
          medicine_id: string
          name: string
          qty_sold: number
          revenue: number
        }[]
      }
      rpc_return_challan: {
        Args: { p_challan_id: string; p_store_id: string }
        Returns: Json
      }
      rpc_save_batch_barcodes: {
        Args: { p_batch_ids: string[] }
        Returns: Json
      }
      rpc_stock_correction: {
        Args: {
          p_batch_id: string
          p_client_uuid?: string
          p_delta: number
          p_reason: string
        }
        Returns: string
      }
      rpc_stock_transfer_approve: {
        Args: { p_approvals: Json; p_transfer_id: string }
        Returns: undefined
      }
      rpc_stock_transfer_receive: {
        Args: { p_receipts: Json; p_transfer_id: string }
        Returns: undefined
      }
      rpc_stock_transfer_request: {
        Args: { p_payload: Json }
        Returns: {
          transfer_id: string
          transfer_no: string
        }[]
      }
      rpc_toggle_focused: {
        Args: { p_is_focused: boolean; p_label?: string; p_medicine_id: string }
        Returns: Json
      }
      rpc_update_batch: {
        Args: { p_batch_id: string; p_payload: Json }
        Returns: Json
      }
      rpc_update_medicine: {
        Args: { p_medicine_id: string; p_payload: Json }
        Returns: Json
      }
      rpc_update_my_profile: { Args: { p_payload: Json }; Returns: Json }
      rpc_update_org_settings: { Args: { p_payload: Json }; Returns: Json }
      rpc_update_purchase_return: { Args: { p_payload: Json }; Returns: undefined }
      rpc_update_store_settings: {
        Args: { p_payload: Json; p_store_id: string }
        Returns: Json
      }
      rpc_update_store_upi: {
        Args: { p_store_id: string; p_vpa: string }
        Returns: string
      }
      rpc_whoami: { Args: never; Returns: Json }
      user_has_store_access: {
        Args: { target_store_id: string }
        Returns: boolean
      }
      user_org_has_shared_masters: { Args: never; Returns: boolean }
      user_role: { Args: never; Returns: string }
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
