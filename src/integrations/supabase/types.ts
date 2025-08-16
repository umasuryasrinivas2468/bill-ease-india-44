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
    PostgrestVersion: "12.2.3 (519615d)"
  }
  public: {
    Tables: {
      accounts: {
        Row: {
          account_code: string
          account_name: string
          account_type: string
          created_at: string | null
          id: string
          is_active: boolean | null
          opening_balance: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          account_code: string
          account_name: string
          account_type: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          opening_balance?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          account_code?: string
          account_name?: string
          account_type?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          opening_balance?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      apps: {
        Row: {
          category: string
          created_at: string | null
          description: string | null
          developer: string | null
          icon_url: string | null
          id: string
          is_active: boolean | null
          name: string
          updated_at: string | null
          version: string | null
        }
        Insert: {
          category?: string
          created_at?: string | null
          description?: string | null
          developer?: string | null
          icon_url?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          updated_at?: string | null
          version?: string | null
        }
        Update: {
          category?: string
          created_at?: string | null
          description?: string | null
          developer?: string | null
          icon_url?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          updated_at?: string | null
          version?: string | null
        }
        Relationships: []
      }
      bank_details: {
        Row: {
          account_holder_name: string | null
          account_number: string
          account_type: string | null
          bank_address: string | null
          bank_name: string
          branch_name: string | null
          created_at: string | null
          id: string
          ifsc_code: string
          is_primary: boolean | null
          swift_code: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          account_holder_name?: string | null
          account_number: string
          account_type?: string | null
          bank_address?: string | null
          bank_name: string
          branch_name?: string | null
          created_at?: string | null
          id?: string
          ifsc_code: string
          is_primary?: boolean | null
          swift_code?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          account_holder_name?: string | null
          account_number?: string
          account_type?: string | null
          bank_address?: string | null
          bank_name?: string
          branch_name?: string | null
          created_at?: string | null
          id?: string
          ifsc_code?: string
          is_primary?: boolean | null
          swift_code?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      business_assets: {
        Row: {
          asset_data: string
          asset_type: string
          created_at: string | null
          file_name: string | null
          id: string
          mime_type: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          asset_data: string
          asset_type: string
          created_at?: string | null
          file_name?: string | null
          id?: string
          mime_type?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          asset_data?: string
          asset_type?: string
          created_at?: string | null
          file_name?: string | null
          id?: string
          mime_type?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      business_profiles: {
        Row: {
          address: string | null
          business_name: string
          city: string | null
          country: string | null
          created_at: string | null
          currency: string | null
          email: string | null
          gst_number: string | null
          gst_rate: string | null
          id: string
          iec_number: string | null
          is_import_export_applicable: string | null
          lut_number: string | null
          owner_name: string
          phone: string | null
          pincode: string | null
          state: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          address?: string | null
          business_name: string
          city?: string | null
          country?: string | null
          created_at?: string | null
          currency?: string | null
          email?: string | null
          gst_number?: string | null
          gst_rate?: string | null
          id?: string
          iec_number?: string | null
          is_import_export_applicable?: string | null
          lut_number?: string | null
          owner_name: string
          phone?: string | null
          pincode?: string | null
          state?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          address?: string | null
          business_name?: string
          city?: string | null
          country?: string | null
          created_at?: string | null
          currency?: string | null
          email?: string | null
          gst_number?: string | null
          gst_rate?: string | null
          id?: string
          iec_number?: string | null
          is_import_export_applicable?: string | null
          lut_number?: string | null
          owner_name?: string
          phone?: string | null
          pincode?: string | null
          state?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      clients: {
        Row: {
          address: string | null
          created_at: string | null
          email: string | null
          gst_number: string | null
          id: string
          name: string
          phone: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          address?: string | null
          created_at?: string | null
          email?: string | null
          gst_number?: string | null
          id?: string
          name: string
          phone?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          address?: string | null
          created_at?: string | null
          email?: string | null
          gst_number?: string | null
          id?: string
          name?: string
          phone?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      credit_notes: {
        Row: {
          amount: number
          client_address: string | null
          client_email: string | null
          client_gst_number: string | null
          client_name: string
          created_at: string | null
          credit_note_date: string
          credit_note_number: string
          gst_amount: number
          id: string
          items: Json
          original_invoice_id: string | null
          reason: string | null
          status: string | null
          total_amount: number
          updated_at: string | null
          user_id: string
        }
        Insert: {
          amount: number
          client_address?: string | null
          client_email?: string | null
          client_gst_number?: string | null
          client_name: string
          created_at?: string | null
          credit_note_date: string
          credit_note_number: string
          gst_amount: number
          id?: string
          items?: Json
          original_invoice_id?: string | null
          reason?: string | null
          status?: string | null
          total_amount: number
          updated_at?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          client_address?: string | null
          client_email?: string | null
          client_gst_number?: string | null
          client_name?: string
          created_at?: string | null
          credit_note_date?: string
          credit_note_number?: string
          gst_amount?: number
          id?: string
          items?: Json
          original_invoice_id?: string | null
          reason?: string | null
          status?: string | null
          total_amount?: number
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_notes_original_invoice_id_fkey"
            columns: ["original_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      debit_notes: {
        Row: {
          amount: number
          created_at: string | null
          debit_note_date: string
          debit_note_number: string
          gst_amount: number
          id: string
          items: Json
          original_invoice_id: string | null
          reason: string | null
          status: string | null
          total_amount: number
          updated_at: string | null
          user_id: string
          vendor_address: string | null
          vendor_email: string | null
          vendor_gst_number: string | null
          vendor_name: string
        }
        Insert: {
          amount: number
          created_at?: string | null
          debit_note_date: string
          debit_note_number: string
          gst_amount: number
          id?: string
          items?: Json
          original_invoice_id?: string | null
          reason?: string | null
          status?: string | null
          total_amount: number
          updated_at?: string | null
          user_id: string
          vendor_address?: string | null
          vendor_email?: string | null
          vendor_gst_number?: string | null
          vendor_name: string
        }
        Update: {
          amount?: number
          created_at?: string | null
          debit_note_date?: string
          debit_note_number?: string
          gst_amount?: number
          id?: string
          items?: Json
          original_invoice_id?: string | null
          reason?: string | null
          status?: string | null
          total_amount?: number
          updated_at?: string | null
          user_id?: string
          vendor_address?: string | null
          vendor_email?: string | null
          vendor_gst_number?: string | null
          vendor_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "debit_notes_original_invoice_id_fkey"
            columns: ["original_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory: {
        Row: {
          category: string
          created_at: string | null
          id: string
          product_name: string
          purchase_price: number | null
          reorder_level: number | null
          selling_price: number
          sku: string
          stock_quantity: number | null
          supplier_contact: string | null
          supplier_email: string | null
          supplier_name: string | null
          type: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          category: string
          created_at?: string | null
          id?: string
          product_name: string
          purchase_price?: number | null
          reorder_level?: number | null
          selling_price: number
          sku: string
          stock_quantity?: number | null
          supplier_contact?: string | null
          supplier_email?: string | null
          supplier_name?: string | null
          type: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string | null
          id?: string
          product_name?: string
          purchase_price?: number | null
          reorder_level?: number | null
          selling_price?: number
          sku?: string
          stock_quantity?: number | null
          supplier_contact?: string | null
          supplier_email?: string | null
          supplier_name?: string | null
          type?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      invoices: {
        Row: {
          advance: number | null
          amount: number
          client_address: string | null
          client_email: string | null
          client_gst_number: string | null
          client_id: string | null
          client_name: string
          created_at: string | null
          discount: number | null
          due_date: string
          from_email: string | null
          gst_amount: number
          gst_rate: number | null
          id: string
          invoice_date: string
          invoice_number: string
          items: Json
          notes: string | null
          roundoff: number | null
          status: string | null
          total_amount: number
          updated_at: string | null
          user_id: string
        }
        Insert: {
          advance?: number | null
          amount: number
          client_address?: string | null
          client_email?: string | null
          client_gst_number?: string | null
          client_id?: string | null
          client_name: string
          created_at?: string | null
          discount?: number | null
          due_date: string
          from_email?: string | null
          gst_amount: number
          gst_rate?: number | null
          id?: string
          invoice_date: string
          invoice_number: string
          items?: Json
          notes?: string | null
          roundoff?: number | null
          status?: string | null
          total_amount: number
          updated_at?: string | null
          user_id: string
        }
        Update: {
          advance?: number | null
          amount?: number
          client_address?: string | null
          client_email?: string | null
          client_gst_number?: string | null
          client_id?: string | null
          client_name?: string
          created_at?: string | null
          discount?: number | null
          due_date?: string
          from_email?: string | null
          gst_amount?: number
          gst_rate?: number | null
          id?: string
          invoice_date?: string
          invoice_number?: string
          items?: Json
          notes?: string | null
          roundoff?: number | null
          status?: string | null
          total_amount?: number
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_lines: {
        Row: {
          account_id: string | null
          created_at: string | null
          credit: number | null
          debit: number | null
          id: string
          journal_id: string | null
          line_narration: string | null
        }
        Insert: {
          account_id?: string | null
          created_at?: string | null
          credit?: number | null
          debit?: number | null
          id?: string
          journal_id?: string | null
          line_narration?: string | null
        }
        Update: {
          account_id?: string | null
          created_at?: string | null
          credit?: number | null
          debit?: number | null
          id?: string
          journal_id?: string | null
          line_narration?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "journal_lines_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_lines_journal_id_fkey"
            columns: ["journal_id"]
            isOneToOne: false
            referencedRelation: "journals"
            referencedColumns: ["id"]
          },
        ]
      }
      journals: {
        Row: {
          created_at: string | null
          id: string
          journal_date: string
          journal_number: string
          narration: string
          status: string | null
          total_credit: number | null
          total_debit: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          journal_date: string
          journal_number: string
          narration: string
          status?: string | null
          total_credit?: number | null
          total_debit?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          journal_date?: string
          journal_number?: string
          narration?: string
          status?: string | null
          total_credit?: number | null
          total_debit?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      payment_reminders: {
        Row: {
          created_at: string | null
          email_sent_to: string
          id: string
          invoice_id: string
          reminder_type: string
          response_token: string | null
          scheduled_date: string
          sent_at: string | null
          status: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          email_sent_to: string
          id?: string
          invoice_id: string
          reminder_type: string
          response_token?: string | null
          scheduled_date: string
          sent_at?: string | null
          status?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          email_sent_to?: string
          id?: string
          invoice_id?: string
          reminder_type?: string
          response_token?: string | null
          scheduled_date?: string
          sent_at?: string | null
          status?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_reminders_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      processed_documents: {
        Row: {
          created_at: string | null
          file_name: string
          id: string
          original_file_url: string | null
          processed_file_url: string | null
          records_count: number | null
          status: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          file_name: string
          id?: string
          original_file_url?: string | null
          processed_file_url?: string | null
          records_count?: number | null
          status?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          file_name?: string
          id?: string
          original_file_url?: string | null
          processed_file_url?: string | null
          records_count?: number | null
          status?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      purchase_bills: {
        Row: {
          amount: number
          bill_date: string
          bill_number: string
          created_at: string | null
          due_date: string
          gst_amount: number
          id: string
          items: Json
          notes: string | null
          paid_amount: number | null
          status: string | null
          total_amount: number
          updated_at: string | null
          user_id: string
          vendor_address: string | null
          vendor_email: string | null
          vendor_gst_number: string | null
          vendor_id: string | null
          vendor_name: string
        }
        Insert: {
          amount: number
          bill_date: string
          bill_number: string
          created_at?: string | null
          due_date: string
          gst_amount: number
          id?: string
          items?: Json
          notes?: string | null
          paid_amount?: number | null
          status?: string | null
          total_amount: number
          updated_at?: string | null
          user_id: string
          vendor_address?: string | null
          vendor_email?: string | null
          vendor_gst_number?: string | null
          vendor_id?: string | null
          vendor_name: string
        }
        Update: {
          amount?: number
          bill_date?: string
          bill_number?: string
          created_at?: string | null
          due_date?: string
          gst_amount?: number
          id?: string
          items?: Json
          notes?: string | null
          paid_amount?: number | null
          status?: string | null
          total_amount?: number
          updated_at?: string | null
          user_id?: string
          vendor_address?: string | null
          vendor_email?: string | null
          vendor_gst_number?: string | null
          vendor_id?: string | null
          vendor_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_bills_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      quotations: {
        Row: {
          client_address: string | null
          client_email: string | null
          client_name: string
          client_phone: string | null
          created_at: string | null
          discount: number | null
          id: string
          items: Json
          quotation_date: string
          quotation_number: string
          status: string | null
          subtotal: number
          tax_amount: number
          terms_conditions: string | null
          total_amount: number
          updated_at: string | null
          user_id: string
          validity_period: number
        }
        Insert: {
          client_address?: string | null
          client_email?: string | null
          client_name: string
          client_phone?: string | null
          created_at?: string | null
          discount?: number | null
          id?: string
          items?: Json
          quotation_date: string
          quotation_number: string
          status?: string | null
          subtotal: number
          tax_amount: number
          terms_conditions?: string | null
          total_amount: number
          updated_at?: string | null
          user_id: string
          validity_period?: number
        }
        Update: {
          client_address?: string | null
          client_email?: string | null
          client_name?: string
          client_phone?: string | null
          created_at?: string | null
          discount?: number | null
          id?: string
          items?: Json
          quotation_date?: string
          quotation_number?: string
          status?: string | null
          subtotal?: number
          tax_amount?: number
          terms_conditions?: string | null
          total_amount?: number
          updated_at?: string | null
          user_id?: string
          validity_period?: number
        }
        Relationships: []
      }
      reminder_responses: {
        Row: {
          id: string
          ip_address: string | null
          reminder_id: string
          responded_at: string | null
          response_type: string
          user_agent: string | null
        }
        Insert: {
          id?: string
          ip_address?: string | null
          reminder_id: string
          responded_at?: string | null
          response_type: string
          user_agent?: string | null
        }
        Update: {
          id?: string
          ip_address?: string | null
          reminder_id?: string
          responded_at?: string | null
          response_type?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reminder_responses_reminder_id_fkey"
            columns: ["reminder_id"]
            isOneToOne: false
            referencedRelation: "payment_reminders"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          b2b_sales: number | null
          b2c_sales: number | null
          cgst: number | null
          created_at: string | null
          id: string
          igst: number | null
          month: number
          sgst: number | null
          total_gst: number | null
          total_sales: number | null
          updated_at: string | null
          user_id: string
          year: number
        }
        Insert: {
          b2b_sales?: number | null
          b2c_sales?: number | null
          cgst?: number | null
          created_at?: string | null
          id?: string
          igst?: number | null
          month: number
          sgst?: number | null
          total_gst?: number | null
          total_sales?: number | null
          updated_at?: string | null
          user_id: string
          year: number
        }
        Update: {
          b2b_sales?: number | null
          b2c_sales?: number | null
          cgst?: number | null
          created_at?: string | null
          id?: string
          igst?: number | null
          month?: number
          sgst?: number | null
          total_gst?: number | null
          total_sales?: number | null
          updated_at?: string | null
          user_id?: string
          year?: number
        }
        Relationships: []
      }
      time_tracking: {
        Row: {
          client_name: string | null
          created_at: string | null
          duration_minutes: number | null
          end_time: string | null
          hourly_rate: number | null
          id: string
          project_name: string
          start_time: string
          status: string | null
          task_description: string | null
          total_amount: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          client_name?: string | null
          created_at?: string | null
          duration_minutes?: number | null
          end_time?: string | null
          hourly_rate?: number | null
          id?: string
          project_name: string
          start_time: string
          status?: string | null
          task_description?: string | null
          total_amount?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          client_name?: string | null
          created_at?: string | null
          duration_minutes?: number | null
          end_time?: string | null
          hourly_rate?: number | null
          id?: string
          project_name?: string
          start_time?: string
          status?: string | null
          task_description?: string | null
          total_amount?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_apps: {
        Row: {
          app_id: string | null
          id: string
          installed_at: string | null
          is_active: boolean | null
          user_id: string
        }
        Insert: {
          app_id?: string | null
          id?: string
          installed_at?: string | null
          is_active?: boolean | null
          user_id: string
        }
        Update: {
          app_id?: string | null
          id?: string
          installed_at?: string | null
          is_active?: boolean | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_apps_app_id_fkey"
            columns: ["app_id"]
            isOneToOne: false
            referencedRelation: "apps"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          clerk_id: string
          created_at: string | null
          email: string
          full_name: string | null
          id: string
          is_pro: boolean | null
          phone_number: string | null
          updated_at: string | null
        }
        Insert: {
          clerk_id: string
          created_at?: string | null
          email: string
          full_name?: string | null
          id?: string
          is_pro?: boolean | null
          phone_number?: string | null
          updated_at?: string | null
        }
        Update: {
          clerk_id?: string
          created_at?: string | null
          email?: string
          full_name?: string | null
          id?: string
          is_pro?: boolean | null
          phone_number?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      vendors: {
        Row: {
          address: string | null
          created_at: string | null
          email: string | null
          gst_number: string | null
          id: string
          name: string
          payment_terms: number | null
          phone: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          address?: string | null
          created_at?: string | null
          email?: string | null
          gst_number?: string | null
          id?: string
          name: string
          payment_terms?: number | null
          phone?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          address?: string | null
          created_at?: string | null
          email?: string | null
          gst_number?: string | null
          id?: string
          name?: string
          payment_terms?: number | null
          phone?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
