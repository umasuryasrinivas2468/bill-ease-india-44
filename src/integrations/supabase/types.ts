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
          developer: string
          icon_url: string | null
          id: string
          is_active: boolean | null
          name: string
          updated_at: string | null
          version: string
        }
        Insert: {
          category: string
          created_at?: string | null
          description?: string | null
          developer: string
          icon_url?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          updated_at?: string | null
          version?: string
        }
        Update: {
          category?: string
          created_at?: string | null
          description?: string | null
          developer?: string
          icon_url?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          updated_at?: string | null
          version?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string | null
          id: string
          ip_address: unknown
          metadata: Json | null
          new_values: Json | null
          old_values: Json | null
          organization_id: string | null
          resource_id: string | null
          resource_type: string
          session_id: string | null
          severity: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string | null
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          new_values?: Json | null
          old_values?: Json | null
          organization_id?: string | null
          resource_id?: string | null
          resource_type: string
          session_id?: string | null
          severity?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string | null
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          new_values?: Json | null
          old_values?: Json | null
          organization_id?: string | null
          resource_id?: string | null
          resource_type?: string
          session_id?: string | null
          severity?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
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
      ca_client_assignments: {
        Row: {
          access_level: string | null
          assigned_at: string | null
          assigned_by: string | null
          ca_user_id: string
          client_organization_id: string
          created_at: string | null
          expires_at: string | null
          id: string
          is_active: boolean | null
          notes: string | null
          updated_at: string | null
        }
        Insert: {
          access_level?: string | null
          assigned_at?: string | null
          assigned_by?: string | null
          ca_user_id: string
          client_organization_id: string
          created_at?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          notes?: string | null
          updated_at?: string | null
        }
        Update: {
          access_level?: string | null
          assigned_at?: string | null
          assigned_by?: string | null
          ca_user_id?: string
          client_organization_id?: string
          created_at?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          notes?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ca_client_assignments_client_organization_id_fkey"
            columns: ["client_organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
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
        Relationships: []
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
        Relationships: []
      }
      delivery_challans: {
        Row: {
          challan_date: string
          challan_number: string
          created_at: string | null
          customer_address: string | null
          customer_email: string | null
          customer_gst_number: string | null
          customer_name: string
          customer_phone: string | null
          delivery_status: string
          id: string
          items: Json
          notes: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          challan_date: string
          challan_number: string
          created_at?: string | null
          customer_address?: string | null
          customer_email?: string | null
          customer_gst_number?: string | null
          customer_name: string
          customer_phone?: string | null
          delivery_status?: string
          id?: string
          items?: Json
          notes?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          challan_date?: string
          challan_number?: string
          created_at?: string | null
          customer_address?: string | null
          customer_email?: string | null
          customer_gst_number?: string | null
          customer_name?: string
          customer_phone?: string | null
          delivery_status?: string
          id?: string
          items?: Json
          notes?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      expense_attachments: {
        Row: {
          content_type: string | null
          created_at: string | null
          expense_id: string | null
          file_name: string | null
          file_url: string | null
          id: string
          size_bytes: number | null
        }
        Insert: {
          content_type?: string | null
          created_at?: string | null
          expense_id?: string | null
          file_name?: string | null
          file_url?: string | null
          id?: string
          size_bytes?: number | null
        }
        Update: {
          content_type?: string | null
          created_at?: string | null
          expense_id?: string | null
          file_name?: string | null
          file_url?: string | null
          id?: string
          size_bytes?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "expense_attachments_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_categories: {
        Row: {
          category_name: string
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          category_name: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          category_name?: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      expenses: {
        Row: {
          amount: number
          category_id: string | null
          category_name: string | null
          created_at: string | null
          description: string | null
          expense_date: string
          expense_number: string | null
          id: string
          journal_id: string | null
          payment_mode: string | null
          posted_to_ledger: boolean | null
          status: string | null
          tax_amount: number | null
          tds_amount: number | null
          tds_rule_id: string | null
          total_amount: number | null
          updated_at: string | null
          user_id: string
          vendor_id: string | null
          vendor_name: string | null
        }
        Insert: {
          amount?: number
          category_id?: string | null
          category_name?: string | null
          created_at?: string | null
          description?: string | null
          expense_date: string
          expense_number?: string | null
          id?: string
          journal_id?: string | null
          payment_mode?: string | null
          posted_to_ledger?: boolean | null
          status?: string | null
          tax_amount?: number | null
          tds_amount?: number | null
          tds_rule_id?: string | null
          total_amount?: number | null
          updated_at?: string | null
          user_id: string
          vendor_id?: string | null
          vendor_name?: string | null
        }
        Update: {
          amount?: number
          category_id?: string | null
          category_name?: string | null
          created_at?: string | null
          description?: string | null
          expense_date?: string
          expense_number?: string | null
          id?: string
          journal_id?: string | null
          payment_mode?: string | null
          posted_to_ledger?: boolean | null
          status?: string | null
          tax_amount?: number | null
          tds_amount?: number | null
          tds_rule_id?: string | null
          total_amount?: number | null
          updated_at?: string | null
          user_id?: string
          vendor_id?: string | null
          vendor_name?: string | null
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
            foreignKeyName: "expenses_tds_rule_id_fkey"
            columns: ["tds_rule_id"]
            isOneToOne: false
            referencedRelation: "tds_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
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
          items_with_product_id: Json | null
          notes: string | null
          roundoff: number | null
          status: string | null
          total_amount: number
          updated_at: string | null
          user_id: string
        }
        Insert: {
          advance?: number | null
          amount?: number
          client_address?: string | null
          client_email?: string | null
          client_gst_number?: string | null
          client_name: string
          created_at?: string | null
          discount?: number | null
          due_date: string
          from_email?: string | null
          gst_amount?: number
          gst_rate?: number | null
          id?: string
          invoice_date: string
          invoice_number: string
          items?: Json
          items_with_product_id?: Json | null
          notes?: string | null
          roundoff?: number | null
          status?: string | null
          total_amount?: number
          updated_at?: string | null
          user_id: string
        }
        Update: {
          advance?: number | null
          amount?: number
          client_address?: string | null
          client_email?: string | null
          client_gst_number?: string | null
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
          items_with_product_id?: Json | null
          notes?: string | null
          roundoff?: number | null
          status?: string | null
          total_amount?: number
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
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
      license: {
        Row: {
          created_at: string | null
          date_created: string | null
          due_date: string
          email: string
          id: string
          license_key: string
          plan_type: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          date_created?: string | null
          due_date: string
          email: string
          id?: string
          license_key: string
          plan_type: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          date_created?: string | null
          due_date?: string
          email?: string
          id?: string
          license_key?: string
          plan_type?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      organizations: {
        Row: {
          address: string | null
          city: string | null
          created_at: string | null
          created_by: string | null
          email: string | null
          gstin: string | null
          id: string
          is_active: boolean | null
          logo_url: string | null
          name: string
          pan: string | null
          phone: string | null
          pincode: string | null
          settings: Json | null
          slug: string
          state: string | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          created_at?: string | null
          created_by?: string | null
          email?: string | null
          gstin?: string | null
          id?: string
          is_active?: boolean | null
          logo_url?: string | null
          name: string
          pan?: string | null
          phone?: string | null
          pincode?: string | null
          settings?: Json | null
          slug: string
          state?: string | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          created_at?: string | null
          created_by?: string | null
          email?: string | null
          gstin?: string | null
          id?: string
          is_active?: boolean | null
          logo_url?: string | null
          name?: string
          pan?: string | null
          phone?: string | null
          pincode?: string | null
          settings?: Json | null
          slug?: string
          state?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      payables: {
        Row: {
          amount_due: number
          amount_paid: number | null
          amount_remaining: number
          bill_number: string | null
          created_at: string | null
          due_date: string
          id: string
          notes: string | null
          payment_date: string | null
          related_purchase_order_id: string | null
          related_purchase_order_number: string | null
          status: string | null
          updated_at: string | null
          user_id: string
          vendor_email: string | null
          vendor_name: string
          vendor_phone: string | null
        }
        Insert: {
          amount_due: number
          amount_paid?: number | null
          amount_remaining: number
          bill_number?: string | null
          created_at?: string | null
          due_date: string
          id?: string
          notes?: string | null
          payment_date?: string | null
          related_purchase_order_id?: string | null
          related_purchase_order_number?: string | null
          status?: string | null
          updated_at?: string | null
          user_id: string
          vendor_email?: string | null
          vendor_name: string
          vendor_phone?: string | null
        }
        Update: {
          amount_due?: number
          amount_paid?: number | null
          amount_remaining?: number
          bill_number?: string | null
          created_at?: string | null
          due_date?: string
          id?: string
          notes?: string | null
          payment_date?: string | null
          related_purchase_order_id?: string | null
          related_purchase_order_number?: string | null
          status?: string | null
          updated_at?: string | null
          user_id?: string
          vendor_email?: string | null
          vendor_name?: string
          vendor_phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payables_related_purchase_order_id_fkey"
            columns: ["related_purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          action: string
          category: string | null
          code: string
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          resource: string
        }
        Insert: {
          action: string
          category?: string | null
          code: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          resource: string
        }
        Update: {
          action?: string
          category?: string | null
          code?: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          resource?: string
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
      purchase_orders: {
        Row: {
          created_at: string | null
          discount: number | null
          due_date: string
          id: string
          items: Json
          notes: string | null
          order_date: string
          order_number: string
          payment_status: string | null
          status: string | null
          subtotal: number
          tax_amount: number
          total_amount: number
          updated_at: string | null
          user_id: string
          vendor_address: string | null
          vendor_email: string | null
          vendor_gst: string | null
          vendor_id: string | null
          vendor_name: string
          vendor_phone: string | null
        }
        Insert: {
          created_at?: string | null
          discount?: number | null
          due_date: string
          id?: string
          items?: Json
          notes?: string | null
          order_date: string
          order_number: string
          payment_status?: string | null
          status?: string | null
          subtotal?: number
          tax_amount?: number
          total_amount?: number
          updated_at?: string | null
          user_id: string
          vendor_address?: string | null
          vendor_email?: string | null
          vendor_gst?: string | null
          vendor_id?: string | null
          vendor_name: string
          vendor_phone?: string | null
        }
        Update: {
          created_at?: string | null
          discount?: number | null
          due_date?: string
          id?: string
          items?: Json
          notes?: string | null
          order_date?: string
          order_number?: string
          payment_status?: string | null
          status?: string | null
          subtotal?: number
          tax_amount?: number
          total_amount?: number
          updated_at?: string | null
          user_id?: string
          vendor_address?: string | null
          vendor_email?: string | null
          vendor_gst?: string | null
          vendor_id?: string | null
          vendor_name?: string
          vendor_phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_vendor_id_fkey"
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
          items_with_product_id: Json | null
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
          items_with_product_id?: Json | null
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
          items_with_product_id?: Json | null
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
      receivables: {
        Row: {
          amount_due: number
          amount_paid: number | null
          amount_remaining: number
          created_at: string | null
          customer_email: string | null
          customer_name: string
          customer_phone: string | null
          due_date: string
          id: string
          invoice_number: string | null
          notes: string | null
          payment_date: string | null
          related_sales_order_id: string | null
          related_sales_order_number: string | null
          status: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          amount_due: number
          amount_paid?: number | null
          amount_remaining: number
          created_at?: string | null
          customer_email?: string | null
          customer_name: string
          customer_phone?: string | null
          due_date: string
          id?: string
          invoice_number?: string | null
          notes?: string | null
          payment_date?: string | null
          related_sales_order_id?: string | null
          related_sales_order_number?: string | null
          status?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          amount_due?: number
          amount_paid?: number | null
          amount_remaining?: number
          created_at?: string | null
          customer_email?: string | null
          customer_name?: string
          customer_phone?: string | null
          due_date?: string
          id?: string
          invoice_number?: string | null
          notes?: string | null
          payment_date?: string | null
          related_sales_order_id?: string | null
          related_sales_order_number?: string | null
          status?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "receivables_related_sales_order_id_fkey"
            columns: ["related_sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
        ]
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
        Relationships: []
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
      role_permissions: {
        Row: {
          created_at: string | null
          id: string
          organization_id: string | null
          permission_id: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          created_at?: string | null
          id?: string
          organization_id?: string | null
          permission_id: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          created_at?: string | null
          id?: string
          organization_id?: string | null
          permission_id?: string
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_orders: {
        Row: {
          client_address: string | null
          client_email: string | null
          client_gst: string | null
          client_name: string
          client_phone: string | null
          created_at: string | null
          discount: number | null
          due_date: string
          id: string
          items: Json
          notes: string | null
          order_date: string
          order_number: string
          payment_status: string | null
          status: string | null
          subtotal: number
          tax_amount: number
          total_amount: number
          updated_at: string | null
          user_id: string
        }
        Insert: {
          client_address?: string | null
          client_email?: string | null
          client_gst?: string | null
          client_name: string
          client_phone?: string | null
          created_at?: string | null
          discount?: number | null
          due_date: string
          id?: string
          items?: Json
          notes?: string | null
          order_date: string
          order_number: string
          payment_status?: string | null
          status?: string | null
          subtotal?: number
          tax_amount?: number
          total_amount?: number
          updated_at?: string | null
          user_id: string
        }
        Update: {
          client_address?: string | null
          client_email?: string | null
          client_gst?: string | null
          client_name?: string
          client_phone?: string | null
          created_at?: string | null
          discount?: number | null
          due_date?: string
          id?: string
          items?: Json
          notes?: string | null
          order_date?: string
          order_number?: string
          payment_status?: string | null
          status?: string | null
          subtotal?: number
          tax_amount?: number
          total_amount?: number
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      tds_deposits: {
        Row: {
          amount: number
          created_at: string | null
          deposit_date: string
          id: string
          reference: string | null
          tds_transaction_id: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string | null
          deposit_date: string
          id?: string
          reference?: string | null
          tds_transaction_id?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string | null
          deposit_date?: string
          id?: string
          reference?: string | null
          tds_transaction_id?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tds_deposits_tds_transaction_id_fkey"
            columns: ["tds_transaction_id"]
            isOneToOne: false
            referencedRelation: "tds_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      tds_master: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          payee_type: string
          rate: number
          section_code: string
          threshold_amount: number
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          payee_type: string
          rate: number
          section_code: string
          threshold_amount?: number
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          payee_type?: string
          rate?: number
          section_code?: string
          threshold_amount?: number
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      tds_rules: {
        Row: {
          category: string
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          rate_percentage: number
          threshold_amount: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          category: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          rate_percentage: number
          threshold_amount?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          rate_percentage?: number
          threshold_amount?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      tds_transactions: {
        Row: {
          certificate_number: string | null
          client_id: string | null
          created_at: string | null
          description: string | null
          id: string
          invoice_id: string | null
          net_payable: number
          tds_amount: number
          tds_rate: number
          tds_rule_id: string | null
          transaction_amount: number
          transaction_date: string
          updated_at: string | null
          user_id: string
          vendor_name: string
          vendor_pan: string | null
        }
        Insert: {
          certificate_number?: string | null
          client_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          invoice_id?: string | null
          net_payable: number
          tds_amount: number
          tds_rate: number
          tds_rule_id?: string | null
          transaction_amount: number
          transaction_date: string
          updated_at?: string | null
          user_id: string
          vendor_name: string
          vendor_pan?: string | null
        }
        Update: {
          certificate_number?: string | null
          client_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          invoice_id?: string | null
          net_payable?: number
          tds_amount?: number
          tds_rate?: number
          tds_rule_id?: string | null
          transaction_amount?: number
          transaction_date?: string
          updated_at?: string | null
          user_id?: string
          vendor_name?: string
          vendor_pan?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tds_transactions_tds_rule_id_fkey"
            columns: ["tds_rule_id"]
            isOneToOne: false
            referencedRelation: "tds_rules"
            referencedColumns: ["id"]
          },
        ]
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
      user_branding: {
        Row: {
          created_at: string | null
          id: string
          logo_url: string | null
          signature_url: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          logo_url?: string | null
          signature_url?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          logo_url?: string | null
          signature_url?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_mapping: {
        Row: {
          clerk_id: string
          id: string
        }
        Insert: {
          clerk_id: string
          id?: string
        }
        Update: {
          clerk_id?: string
          id?: string
        }
        Relationships: []
      }
      user_organizations: {
        Row: {
          created_at: string | null
          id: string
          invited_by: string | null
          is_active: boolean | null
          is_primary: boolean | null
          joined_at: string | null
          organization_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          invited_by?: string | null
          is_active?: boolean | null
          is_primary?: boolean | null
          joined_at?: string | null
          organization_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          invited_by?: string | null
          is_active?: boolean | null
          is_primary?: boolean | null
          joined_at?: string | null
          organization_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_organizations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string | null
          expires_at: string | null
          granted_at: string | null
          granted_by: string | null
          id: string
          is_active: boolean | null
          organization_id: string | null
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          expires_at?: string | null
          granted_at?: string | null
          granted_by?: string | null
          id?: string
          is_active?: boolean | null
          organization_id?: string | null
          role: Database["public"]["Enums"]["app_role"]
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          expires_at?: string | null
          granted_at?: string | null
          granted_by?: string | null
          id?: string
          is_active?: boolean | null
          organization_id?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_sessions: {
        Row: {
          created_at: string | null
          device_info: Json | null
          expires_at: string
          id: string
          ip_address: unknown
          is_active: boolean | null
          last_activity_at: string | null
          organization_id: string | null
          session_token: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          device_info?: Json | null
          expires_at: string
          id?: string
          ip_address?: unknown
          is_active?: boolean | null
          last_activity_at?: string | null
          organization_id?: string | null
          session_token: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          device_info?: Json | null
          expires_at?: string
          id?: string
          ip_address?: unknown
          is_active?: boolean | null
          last_activity_at?: string | null
          organization_id?: string | null
          session_token?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_sessions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          clerk_id: string | null
          created_at: string | null
          email: string
          full_name: string | null
          id: string
          is_pro: boolean | null
          licenseKey: string | null
          onboarding_completed: boolean | null
          phone_number: string | null
          updated_at: string | null
        }
        Insert: {
          clerk_id?: string | null
          created_at?: string | null
          email: string
          full_name?: string | null
          id?: string
          is_pro?: boolean | null
          licenseKey?: string | null
          onboarding_completed?: boolean | null
          phone_number?: string | null
          updated_at?: string | null
        }
        Update: {
          clerk_id?: string | null
          created_at?: string | null
          email?: string
          full_name?: string | null
          id?: string
          is_pro?: boolean | null
          licenseKey?: string | null
          onboarding_completed?: boolean | null
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
          linked_tds_section_id: string | null
          name: string
          pan: string | null
          payment_terms: number | null
          phone: string | null
          tds_enabled: boolean | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          address?: string | null
          created_at?: string | null
          email?: string | null
          gst_number?: string | null
          id?: string
          linked_tds_section_id?: string | null
          name: string
          pan?: string | null
          payment_terms?: number | null
          phone?: string | null
          tds_enabled?: boolean | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          address?: string | null
          created_at?: string | null
          email?: string | null
          gst_number?: string | null
          id?: string
          linked_tds_section_id?: string | null
          name?: string
          pan?: string | null
          payment_terms?: number | null
          phone?: string | null
          tds_enabled?: boolean | null
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
      approve_journal_from_bank_statement: {
        Args: {
          p_approval_id: string
          p_approved_by: string
          p_user_id: string
        }
        Returns: boolean
      }
      auto_match_bank_statements: {
        Args: { p_user_id: string }
        Returns: {
          matched_count: number
          partially_matched_count: number
        }[]
      }
      can_user_generate_license: {
        Args: { user_email: string }
        Returns: boolean
      }
      create_journal_from_bank_statement: {
        Args: {
          p_account_id: string
          p_amount: number
          p_bank_statement_id: string
          p_contra_account_id?: string
          p_is_debit: boolean
          p_journal_date: string
          p_narration: string
          p_user_id: string
        }
        Returns: string
      }
      create_sample_data_for_testing: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      generate_expense_number: { Args: never; Returns: string }
      get_user_organizations: {
        Args: { _user_id: string }
        Returns: {
          is_ca_client: boolean
          organization_id: string
          role: Database["public"]["Enums"]["app_role"]
        }[]
      }
      has_ca_access: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
      has_permission: {
        Args: { _org_id?: string; _permission_code: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _org_id?: string
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_org_member: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
      setup_basic_accounts_for_user: {
        Args: { p_user_id: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role:
        | "super_admin"
        | "org_admin"
        | "ca"
        | "manager"
        | "accountant"
        | "viewer"
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
    Enums: {
      app_role: [
        "super_admin",
        "org_admin",
        "ca",
        "manager",
        "accountant",
        "viewer",
      ],
    },
  },
} as const
