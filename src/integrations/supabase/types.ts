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
          org_id: string | null
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
          org_id?: string | null
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
          org_id?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      advance_adjustments: {
        Row: {
          adjustment_date: string
          advance_id: string
          advance_number: string
          amount: number
          bill_id: string
          bill_number: string
          created_at: string
          id: string
          journal_id: string | null
          notes: string | null
          org_id: string | null
          user_id: string
          vendor_id: string
          vendor_name: string
        }
        Insert: {
          adjustment_date: string
          advance_id: string
          advance_number: string
          amount: number
          bill_id: string
          bill_number: string
          created_at?: string
          id?: string
          journal_id?: string | null
          notes?: string | null
          org_id?: string | null
          user_id: string
          vendor_id: string
          vendor_name: string
        }
        Update: {
          adjustment_date?: string
          advance_id?: string
          advance_number?: string
          amount?: number
          bill_id?: string
          bill_number?: string
          created_at?: string
          id?: string
          journal_id?: string | null
          notes?: string | null
          org_id?: string | null
          user_id?: string
          vendor_id?: string
          vendor_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "advance_adjustments_advance_id_fkey"
            columns: ["advance_id"]
            isOneToOne: false
            referencedRelation: "vendor_advances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "advance_adjustments_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "purchase_bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "advance_adjustments_journal_id_fkey"
            columns: ["journal_id"]
            isOneToOne: false
            referencedRelation: "journals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "advance_adjustments_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
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
          org_id: string | null
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
          org_id?: string | null
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
          org_id?: string | null
          swift_code?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_details_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_reconciliations: {
        Row: {
          bank_balance: number | null
          bank_name: string | null
          bank_transactions: Json
          created_at: string | null
          detected_columns: Json | null
          difference: number | null
          file_name: string
          id: string
          ledger_balance: number | null
          matched: Json
          matched_count: number
          reconciled_at: string | null
          status: string | null
          total_deposits: number | null
          total_transactions: number
          total_withdrawals: number | null
          unmatched_bank: Json
          unmatched_bank_count: number
          unmatched_ledger: Json
          unmatched_ledger_count: number
          user_id: string
        }
        Insert: {
          bank_balance?: number | null
          bank_name?: string | null
          bank_transactions?: Json
          created_at?: string | null
          detected_columns?: Json | null
          difference?: number | null
          file_name: string
          id?: string
          ledger_balance?: number | null
          matched?: Json
          matched_count?: number
          reconciled_at?: string | null
          status?: string | null
          total_deposits?: number | null
          total_transactions?: number
          total_withdrawals?: number | null
          unmatched_bank?: Json
          unmatched_bank_count?: number
          unmatched_ledger?: Json
          unmatched_ledger_count?: number
          user_id: string
        }
        Update: {
          bank_balance?: number | null
          bank_name?: string | null
          bank_transactions?: Json
          created_at?: string | null
          detected_columns?: Json | null
          difference?: number | null
          file_name?: string
          id?: string
          ledger_balance?: number | null
          matched?: Json
          matched_count?: number
          reconciled_at?: string | null
          status?: string | null
          total_deposits?: number | null
          total_transactions?: number
          total_withdrawals?: number | null
          unmatched_bank?: Json
          unmatched_bank_count?: number
          unmatched_ledger?: Json
          unmatched_ledger_count?: number
          user_id?: string
        }
        Relationships: []
      }
      bank_statement_reconciliation: {
        Row: {
          bank_statement_id: string | null
          created_at: string | null
          id: string
          journal_id: string | null
          match_score: number | null
          match_type: string
          user_id: string
        }
        Insert: {
          bank_statement_id?: string | null
          created_at?: string | null
          id?: string
          journal_id?: string | null
          match_score?: number | null
          match_type: string
          user_id: string
        }
        Update: {
          bank_statement_id?: string | null
          created_at?: string | null
          id?: string
          journal_id?: string | null
          match_score?: number | null
          match_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_statement_reconciliation_bank_statement_id_fkey"
            columns: ["bank_statement_id"]
            isOneToOne: false
            referencedRelation: "bank_statements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_statement_reconciliation_journal_id_fkey"
            columns: ["journal_id"]
            isOneToOne: false
            referencedRelation: "journals"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_statements: {
        Row: {
          balance: number | null
          created_at: string | null
          credit: number | null
          debit: number | null
          description: string
          file_import_date: string | null
          file_name: string | null
          id: string
          matched_journal_id: string | null
          status: string | null
          transaction_date: string
          transaction_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          balance?: number | null
          created_at?: string | null
          credit?: number | null
          debit?: number | null
          description: string
          file_import_date?: string | null
          file_name?: string | null
          id?: string
          matched_journal_id?: string | null
          status?: string | null
          transaction_date: string
          transaction_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          balance?: number | null
          created_at?: string | null
          credit?: number | null
          debit?: number | null
          description?: string
          file_import_date?: string | null
          file_name?: string | null
          id?: string
          matched_journal_id?: string | null
          status?: string | null
          transaction_date?: string
          transaction_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_statements_matched_journal_id_fkey"
            columns: ["matched_journal_id"]
            isOneToOne: false
            referencedRelation: "journals"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_alerts: {
        Row: {
          amount_at_alert: number | null
          budget_id: string
          created_at: string | null
          id: string
          level: string
          user_id: string
        }
        Insert: {
          amount_at_alert?: number | null
          budget_id: string
          created_at?: string | null
          id?: string
          level: string
          user_id: string
        }
        Update: {
          amount_at_alert?: number | null
          budget_id?: string
          created_at?: string | null
          id?: string
          level?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "budget_alerts_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "budgets"
            referencedColumns: ["id"]
          },
        ]
      }
      budgets: {
        Row: {
          amount: number
          category_name: string | null
          cost_center: string | null
          created_at: string | null
          department: string | null
          id: string
          is_active: boolean | null
          name: string
          period_end: string
          period_start: string
          period_type: string
          user_id: string
          warn_at_percent: number | null
        }
        Insert: {
          amount: number
          category_name?: string | null
          cost_center?: string | null
          created_at?: string | null
          department?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          period_end: string
          period_start: string
          period_type?: string
          user_id: string
          warn_at_percent?: number | null
        }
        Update: {
          amount?: number
          category_name?: string | null
          cost_center?: string | null
          created_at?: string | null
          department?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          period_end?: string
          period_start?: string
          period_type?: string
          user_id?: string
          warn_at_percent?: number | null
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
          org_id: string | null
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
          org_id?: string | null
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
          org_id?: string | null
          owner_name?: string
          phone?: string | null
          pincode?: string | null
          state?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_profiles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
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
      cfo_pulse_log: {
        Row: {
          alerts: Json | null
          created_at: string | null
          id: string
          metrics: Json
          pulse_date: string
          user_id: string
        }
        Insert: {
          alerts?: Json | null
          created_at?: string | null
          id?: string
          metrics: Json
          pulse_date: string
          user_id: string
        }
        Update: {
          alerts?: Json | null
          created_at?: string | null
          id?: string
          metrics?: Json
          pulse_date?: string
          user_id?: string
        }
        Relationships: []
      }
      cfo_questions: {
        Row: {
          answer: string | null
          context: Json | null
          created_at: string | null
          id: string
          question: string
          user_id: string
        }
        Insert: {
          answer?: string | null
          context?: Json | null
          created_at?: string | null
          id?: string
          question: string
          user_id: string
        }
        Update: {
          answer?: string | null
          context?: Json | null
          created_at?: string | null
          id?: string
          question?: string
          user_id?: string
        }
        Relationships: []
      }
      clients: {
        Row: {
          address: string | null
          client_type: string | null
          company_name: string | null
          created_at: string | null
          credit_limit: number | null
          currency: string | null
          display_name: string | null
          email: string | null
          first_name: string | null
          gst_number: string | null
          gst_treatment: string | null
          id: string
          language: string | null
          last_name: string | null
          name: string
          opening_balance: number | null
          org_id: string | null
          pan: string | null
          payment_terms: number | null
          phone: string | null
          place_of_supply: string | null
          risk_score: number | null
          salutation: string | null
          tax_preference: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          address?: string | null
          client_type?: string | null
          company_name?: string | null
          created_at?: string | null
          credit_limit?: number | null
          currency?: string | null
          display_name?: string | null
          email?: string | null
          first_name?: string | null
          gst_number?: string | null
          gst_treatment?: string | null
          id?: string
          language?: string | null
          last_name?: string | null
          name: string
          opening_balance?: number | null
          org_id?: string | null
          pan?: string | null
          payment_terms?: number | null
          phone?: string | null
          place_of_supply?: string | null
          risk_score?: number | null
          salutation?: string | null
          tax_preference?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          address?: string | null
          client_type?: string | null
          company_name?: string | null
          created_at?: string | null
          credit_limit?: number | null
          currency?: string | null
          display_name?: string | null
          email?: string | null
          first_name?: string | null
          gst_number?: string | null
          gst_treatment?: string | null
          id?: string
          language?: string | null
          last_name?: string | null
          name?: string
          opening_balance?: number | null
          org_id?: string | null
          pan?: string | null
          payment_terms?: number | null
          phone?: string | null
          place_of_supply?: string | null
          risk_score?: number | null
          salutation?: string | null
          tax_preference?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_notes: {
        Row: {
          amount: number
          cess_amount: number | null
          cgst_amount: number | null
          client_address: string | null
          client_email: string | null
          client_gst_number: string | null
          client_name: string
          created_at: string | null
          credit_note_date: string
          credit_note_number: string
          gst_amount: number
          id: string
          igst_amount: number | null
          intra_state: boolean | null
          items: Json
          org_id: string | null
          original_invoice_id: string | null
          place_of_supply: string | null
          reason: string | null
          seller_state: string | null
          sgst_amount: number | null
          status: string | null
          taxable_value: number | null
          total_amount: number
          updated_at: string | null
          user_id: string
        }
        Insert: {
          amount: number
          cess_amount?: number | null
          cgst_amount?: number | null
          client_address?: string | null
          client_email?: string | null
          client_gst_number?: string | null
          client_name: string
          created_at?: string | null
          credit_note_date: string
          credit_note_number: string
          gst_amount: number
          id?: string
          igst_amount?: number | null
          intra_state?: boolean | null
          items?: Json
          org_id?: string | null
          original_invoice_id?: string | null
          place_of_supply?: string | null
          reason?: string | null
          seller_state?: string | null
          sgst_amount?: number | null
          status?: string | null
          taxable_value?: number | null
          total_amount: number
          updated_at?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          cess_amount?: number | null
          cgst_amount?: number | null
          client_address?: string | null
          client_email?: string | null
          client_gst_number?: string | null
          client_name?: string
          created_at?: string | null
          credit_note_date?: string
          credit_note_number?: string
          gst_amount?: number
          id?: string
          igst_amount?: number | null
          intra_state?: boolean | null
          items?: Json
          org_id?: string | null
          original_invoice_id?: string | null
          place_of_supply?: string | null
          reason?: string | null
          seller_state?: string | null
          sgst_amount?: number | null
          status?: string | null
          taxable_value?: number | null
          total_amount?: number
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_notes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      debit_notes: {
        Row: {
          amount: number
          cgst_amount: number | null
          created_at: string | null
          debit_note_date: string
          debit_note_number: string
          gst_amount: number
          id: string
          igst_amount: number | null
          items: Json
          org_id: string | null
          original_invoice_id: string | null
          place_of_supply: string | null
          reason: string | null
          sgst_amount: number | null
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
          cgst_amount?: number | null
          created_at?: string | null
          debit_note_date: string
          debit_note_number: string
          gst_amount: number
          id?: string
          igst_amount?: number | null
          items?: Json
          org_id?: string | null
          original_invoice_id?: string | null
          place_of_supply?: string | null
          reason?: string | null
          sgst_amount?: number | null
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
          cgst_amount?: number | null
          created_at?: string | null
          debit_note_date?: string
          debit_note_number?: string
          gst_amount?: number
          id?: string
          igst_amount?: number | null
          items?: Json
          org_id?: string | null
          original_invoice_id?: string | null
          place_of_supply?: string | null
          reason?: string | null
          sgst_amount?: number | null
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
            foreignKeyName: "debit_notes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
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
          org_id: string | null
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
          org_id?: string | null
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
          org_id?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_challans_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
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
      expense_cost_allocations: {
        Row: {
          amount: number
          cost_center: string
          created_at: string | null
          expense_id: string
          id: string
          notes: string | null
          percent: number | null
          user_id: string
        }
        Insert: {
          amount: number
          cost_center: string
          created_at?: string | null
          expense_id: string
          id?: string
          notes?: string | null
          percent?: number | null
          user_id: string
        }
        Update: {
          amount?: number
          cost_center?: string
          created_at?: string | null
          expense_id?: string
          id?: string
          notes?: string | null
          percent?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_cost_allocations_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          branch: string | null
          category_id: string | null
          category_name: string | null
          client_id: string | null
          cost_center: string | null
          created_at: string | null
          department: string | null
          description: string | null
          employee_id: string | null
          employee_name: string | null
          expense_date: string
          expense_number: string | null
          gst_amount: number | null
          id: string
          is_rcm: boolean | null
          itc_eligible: boolean | null
          journal_id: string | null
          org_id: string | null
          payment_mode: string | null
          posted_to_ledger: boolean | null
          project_id: string | null
          project_name: string | null
          rcm_amount: number | null
          rcm_rate: number | null
          status: string | null
          tax_amount: number | null
          tds_amount: number | null
          tds_rule_id: string | null
          total_amount: number | null
          updated_at: string | null
          user_id: string
          vendor_gst_status: string | null
          vendor_id: string | null
          vendor_name: string | null
        }
        Insert: {
          amount?: number
          branch?: string | null
          category_id?: string | null
          category_name?: string | null
          client_id?: string | null
          cost_center?: string | null
          created_at?: string | null
          department?: string | null
          description?: string | null
          employee_id?: string | null
          employee_name?: string | null
          expense_date: string
          expense_number?: string | null
          gst_amount?: number | null
          id?: string
          is_rcm?: boolean | null
          itc_eligible?: boolean | null
          journal_id?: string | null
          org_id?: string | null
          payment_mode?: string | null
          posted_to_ledger?: boolean | null
          project_id?: string | null
          project_name?: string | null
          rcm_amount?: number | null
          rcm_rate?: number | null
          status?: string | null
          tax_amount?: number | null
          tds_amount?: number | null
          tds_rule_id?: string | null
          total_amount?: number | null
          updated_at?: string | null
          user_id: string
          vendor_gst_status?: string | null
          vendor_id?: string | null
          vendor_name?: string | null
        }
        Update: {
          amount?: number
          branch?: string | null
          category_id?: string | null
          category_name?: string | null
          client_id?: string | null
          cost_center?: string | null
          created_at?: string | null
          department?: string | null
          description?: string | null
          employee_id?: string | null
          employee_name?: string | null
          expense_date?: string
          expense_number?: string | null
          gst_amount?: number | null
          id?: string
          is_rcm?: boolean | null
          itc_eligible?: boolean | null
          journal_id?: string | null
          org_id?: string | null
          payment_mode?: string | null
          posted_to_ledger?: boolean | null
          project_id?: string | null
          project_name?: string | null
          rcm_amount?: number | null
          rcm_rate?: number | null
          status?: string | null
          tax_amount?: number | null
          tds_amount?: number | null
          tds_rule_id?: string | null
          total_amount?: number | null
          updated_at?: string | null
          user_id?: string
          vendor_gst_status?: string | null
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
            foreignKeyName: "expenses_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
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
            foreignKeyName: "expenses_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
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
      fee_recipients: {
        Row: {
          bank_account_holder_name: string | null
          bank_account_number: string | null
          bank_ifsc_code: string | null
          bank_name: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          is_verified: boolean | null
          notes: Json | null
          recipient_email: string | null
          recipient_name: string
          recipient_phone: string | null
          recipient_type: string
          updated_at: string | null
          upi_id: string | null
          user_id: string
        }
        Insert: {
          bank_account_holder_name?: string | null
          bank_account_number?: string | null
          bank_ifsc_code?: string | null
          bank_name?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          is_verified?: boolean | null
          notes?: Json | null
          recipient_email?: string | null
          recipient_name: string
          recipient_phone?: string | null
          recipient_type: string
          updated_at?: string | null
          upi_id?: string | null
          user_id: string
        }
        Update: {
          bank_account_holder_name?: string | null
          bank_account_number?: string | null
          bank_ifsc_code?: string | null
          bank_name?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          is_verified?: boolean | null
          notes?: Json | null
          recipient_email?: string | null
          recipient_name?: string
          recipient_phone?: string | null
          recipient_type?: string
          updated_at?: string | null
          upi_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      fee_structures: {
        Row: {
          created_at: string | null
          gateway_fee_enabled: boolean | null
          gateway_fee_fixed: number | null
          gateway_fee_percentage: number | null
          gateway_fee_type: string | null
          gateway_recipient_id: string | null
          id: string
          is_default: boolean | null
          other_fees: Json | null
          platform_fee_enabled: boolean | null
          platform_fee_type: string | null
          platform_fee_value: number | null
          platform_recipient_id: string | null
          structure_name: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          gateway_fee_enabled?: boolean | null
          gateway_fee_fixed?: number | null
          gateway_fee_percentage?: number | null
          gateway_fee_type?: string | null
          gateway_recipient_id?: string | null
          id?: string
          is_default?: boolean | null
          other_fees?: Json | null
          platform_fee_enabled?: boolean | null
          platform_fee_type?: string | null
          platform_fee_value?: number | null
          platform_recipient_id?: string | null
          structure_name: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          gateway_fee_enabled?: boolean | null
          gateway_fee_fixed?: number | null
          gateway_fee_percentage?: number | null
          gateway_fee_type?: string | null
          gateway_recipient_id?: string | null
          id?: string
          is_default?: boolean | null
          other_fees?: Json | null
          platform_fee_enabled?: boolean | null
          platform_fee_type?: string | null
          platform_fee_value?: number | null
          platform_recipient_id?: string | null
          structure_name?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fee_structures_gateway_recipient_id_fkey"
            columns: ["gateway_recipient_id"]
            isOneToOne: false
            referencedRelation: "fee_recipients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_structures_platform_recipient_id_fkey"
            columns: ["platform_recipient_id"]
            isOneToOne: false
            referencedRelation: "fee_recipients"
            referencedColumns: ["id"]
          },
        ]
      }
      gst_payments: {
        Row: {
          cess_paid: number | null
          cgst_paid: number | null
          challan_reference: string | null
          created_at: string | null
          filing_id: string | null
          id: string
          igst_paid: number | null
          interest_paid: number | null
          late_fee_paid: number | null
          payment_date: string
          payment_mode: string | null
          period: string | null
          remarks: string | null
          sgst_paid: number | null
          total_paid: number | null
          user_id: string
        }
        Insert: {
          cess_paid?: number | null
          cgst_paid?: number | null
          challan_reference?: string | null
          created_at?: string | null
          filing_id?: string | null
          id?: string
          igst_paid?: number | null
          interest_paid?: number | null
          late_fee_paid?: number | null
          payment_date?: string
          payment_mode?: string | null
          period?: string | null
          remarks?: string | null
          sgst_paid?: number | null
          total_paid?: number | null
          user_id: string
        }
        Update: {
          cess_paid?: number | null
          cgst_paid?: number | null
          challan_reference?: string | null
          created_at?: string | null
          filing_id?: string | null
          id?: string
          igst_paid?: number | null
          interest_paid?: number | null
          late_fee_paid?: number | null
          payment_date?: string
          payment_mode?: string | null
          period?: string | null
          remarks?: string | null
          sgst_paid?: number | null
          total_paid?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gst_payments_filing_id_fkey"
            columns: ["filing_id"]
            isOneToOne: false
            referencedRelation: "gst_return_filings"
            referencedColumns: ["id"]
          },
        ]
      }
      gst_return_filings: {
        Row: {
          acknowledgement: Json | null
          arn: string | null
          created_at: string | null
          days_late: number | null
          due_date: string
          filed_payload: Json | null
          filing_date: string | null
          id: string
          interest_paid: number | null
          is_nil_return: boolean | null
          itc_claimed: number | null
          late_fee_paid: number | null
          net_cash_paid: number | null
          notes: string | null
          period: string
          return_type: string
          status: string
          tax_payable: number | null
          taxable_value: number | null
          total_penalty: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          acknowledgement?: Json | null
          arn?: string | null
          created_at?: string | null
          days_late?: number | null
          due_date: string
          filed_payload?: Json | null
          filing_date?: string | null
          id?: string
          interest_paid?: number | null
          is_nil_return?: boolean | null
          itc_claimed?: number | null
          late_fee_paid?: number | null
          net_cash_paid?: number | null
          notes?: string | null
          period: string
          return_type: string
          status?: string
          tax_payable?: number | null
          taxable_value?: number | null
          total_penalty?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          acknowledgement?: Json | null
          arn?: string | null
          created_at?: string | null
          days_late?: number | null
          due_date?: string
          filed_payload?: Json | null
          filing_date?: string | null
          id?: string
          interest_paid?: number | null
          is_nil_return?: boolean | null
          itc_claimed?: number | null
          late_fee_paid?: number | null
          net_cash_paid?: number | null
          notes?: string | null
          period?: string
          return_type?: string
          status?: string
          tax_payable?: number | null
          taxable_value?: number | null
          total_penalty?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      gstr2b_uploads: {
        Row: {
          created_at: string | null
          file_name: string | null
          id: string
          period: string | null
          portal_invoice_count: number | null
          portal_total_cess: number | null
          portal_total_cgst: number | null
          portal_total_igst: number | null
          portal_total_sgst: number | null
          raw_json: Json | null
          uploaded_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          file_name?: string | null
          id?: string
          period?: string | null
          portal_invoice_count?: number | null
          portal_total_cess?: number | null
          portal_total_cgst?: number | null
          portal_total_igst?: number | null
          portal_total_sgst?: number | null
          raw_json?: Json | null
          uploaded_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          file_name?: string | null
          id?: string
          period?: string | null
          portal_invoice_count?: number | null
          portal_total_cess?: number | null
          portal_total_cgst?: number | null
          portal_total_igst?: number | null
          portal_total_sgst?: number | null
          raw_json?: Json | null
          uploaded_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      inventory: {
        Row: {
          average_cost: number | null
          base_uom: string | null
          category: string
          created_at: string | null
          default_warehouse_id: string | null
          hsn_code: string | null
          id: string
          negative_stock_policy: string | null
          org_id: string | null
          product_name: string
          purchase_price: number | null
          reorder_level: number | null
          sac_code: string | null
          selling_price: number
          sku: string
          stock_quantity: number | null
          stock_value: number | null
          supplier_contact: string | null
          supplier_email: string | null
          supplier_name: string | null
          track_batch: boolean | null
          track_serial: boolean | null
          type: string
          uom: string
          updated_at: string | null
          user_id: string
          valuation_method: string | null
        }
        Insert: {
          average_cost?: number | null
          base_uom?: string | null
          category: string
          created_at?: string | null
          default_warehouse_id?: string | null
          hsn_code?: string | null
          id?: string
          negative_stock_policy?: string | null
          org_id?: string | null
          product_name: string
          purchase_price?: number | null
          reorder_level?: number | null
          sac_code?: string | null
          selling_price: number
          sku: string
          stock_quantity?: number | null
          stock_value?: number | null
          supplier_contact?: string | null
          supplier_email?: string | null
          supplier_name?: string | null
          track_batch?: boolean | null
          track_serial?: boolean | null
          type: string
          uom?: string
          updated_at?: string | null
          user_id: string
          valuation_method?: string | null
        }
        Update: {
          average_cost?: number | null
          base_uom?: string | null
          category?: string
          created_at?: string | null
          default_warehouse_id?: string | null
          hsn_code?: string | null
          id?: string
          negative_stock_policy?: string | null
          org_id?: string | null
          product_name?: string
          purchase_price?: number | null
          reorder_level?: number | null
          sac_code?: string | null
          selling_price?: number
          sku?: string
          stock_quantity?: number | null
          stock_value?: number | null
          supplier_contact?: string | null
          supplier_email?: string | null
          supplier_name?: string | null
          track_batch?: boolean | null
          track_serial?: boolean | null
          type?: string
          uom?: string
          updated_at?: string | null
          user_id?: string
          valuation_method?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_default_warehouse_id_fkey"
            columns: ["default_warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_alerts: {
        Row: {
          alert_type: string
          generated_at: string | null
          id: string
          is_resolved: boolean | null
          item_id: string | null
          message: string
          resolved_at: string | null
          severity: string | null
          title: string
          user_id: string
        }
        Insert: {
          alert_type: string
          generated_at?: string | null
          id?: string
          is_resolved?: boolean | null
          item_id?: string | null
          message: string
          resolved_at?: string | null
          severity?: string | null
          title: string
          user_id: string
        }
        Update: {
          alert_type?: string
          generated_at?: string | null
          id?: string
          is_resolved?: boolean | null
          item_id?: string | null
          message?: string
          resolved_at?: string | null
          severity?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_alerts_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_alerts_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "vw_stock_summary"
            referencedColumns: ["item_id"]
          },
        ]
      }
      inventory_batches: {
        Row: {
          batch_number: string | null
          created_at: string | null
          expiry_date: string | null
          id: string
          item_id: string
          quantity_on_hand: number
          received_date: string | null
          remaining_value: number
          serial_number: string | null
          source_id: string | null
          source_type: string | null
          unit_cost: number
          updated_at: string | null
          user_id: string
          warehouse_id: string | null
        }
        Insert: {
          batch_number?: string | null
          created_at?: string | null
          expiry_date?: string | null
          id?: string
          item_id: string
          quantity_on_hand?: number
          received_date?: string | null
          remaining_value?: number
          serial_number?: string | null
          source_id?: string | null
          source_type?: string | null
          unit_cost?: number
          updated_at?: string | null
          user_id: string
          warehouse_id?: string | null
        }
        Update: {
          batch_number?: string | null
          created_at?: string | null
          expiry_date?: string | null
          id?: string
          item_id?: string
          quantity_on_hand?: number
          received_date?: string | null
          remaining_value?: number
          serial_number?: string | null
          source_id?: string | null
          source_type?: string | null
          unit_cost?: number
          updated_at?: string | null
          user_id?: string
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_batches_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_batches_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "vw_stock_summary"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "inventory_batches_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_movements: {
        Row: {
          batch_id: string | null
          cogs_amount: number
          created_at: string | null
          gst_amount: number
          id: string
          item_id: string
          movement_date: string
          movement_type: string
          notes: string | null
          party_id: string | null
          party_name: string | null
          quantity_in: number
          quantity_out: number
          source_id: string | null
          source_number: string | null
          source_type: string
          unit_cost: number
          user_id: string
          valuation_method: string | null
          value_in: number
          value_out: number
          warehouse_id: string | null
        }
        Insert: {
          batch_id?: string | null
          cogs_amount?: number
          created_at?: string | null
          gst_amount?: number
          id?: string
          item_id: string
          movement_date?: string
          movement_type: string
          notes?: string | null
          party_id?: string | null
          party_name?: string | null
          quantity_in?: number
          quantity_out?: number
          source_id?: string | null
          source_number?: string | null
          source_type: string
          unit_cost?: number
          user_id: string
          valuation_method?: string | null
          value_in?: number
          value_out?: number
          warehouse_id?: string | null
        }
        Update: {
          batch_id?: string | null
          cogs_amount?: number
          created_at?: string | null
          gst_amount?: number
          id?: string
          item_id?: string
          movement_date?: string
          movement_type?: string
          notes?: string | null
          party_id?: string | null
          party_name?: string | null
          quantity_in?: number
          quantity_out?: number
          source_id?: string | null
          source_number?: string | null
          source_type?: string
          unit_cost?: number
          user_id?: string
          valuation_method?: string | null
          value_in?: number
          value_out?: number
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "inventory_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "vw_stock_summary"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "inventory_movements_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_settings: {
        Row: {
          auto_post_journals: boolean | null
          created_at: string | null
          dead_stock_days: number | null
          enable_batches: boolean | null
          enable_multi_warehouse: boolean | null
          fast_moving_days: number | null
          negative_stock_policy: string | null
          updated_at: string | null
          user_id: string
          valuation_method: string | null
        }
        Insert: {
          auto_post_journals?: boolean | null
          created_at?: string | null
          dead_stock_days?: number | null
          enable_batches?: boolean | null
          enable_multi_warehouse?: boolean | null
          fast_moving_days?: number | null
          negative_stock_policy?: string | null
          updated_at?: string | null
          user_id: string
          valuation_method?: string | null
        }
        Update: {
          auto_post_journals?: boolean | null
          created_at?: string | null
          dead_stock_days?: number | null
          enable_batches?: boolean | null
          enable_multi_warehouse?: boolean | null
          fast_moving_days?: number | null
          negative_stock_policy?: string | null
          updated_at?: string | null
          user_id?: string
          valuation_method?: string | null
        }
        Relationships: []
      }
      invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          organization_id: string
          role: string
          token: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          expires_at: string
          id?: string
          invited_by: string
          organization_id: string
          role: string
          token: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          organization_id?: string
          role?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_lifecycle_events: {
        Row: {
          actor: string | null
          created_at: string | null
          id: string
          invoice_id: string
          notes: string | null
          stage: string
          user_id: string
        }
        Insert: {
          actor?: string | null
          created_at?: string | null
          id?: string
          invoice_id: string
          notes?: string | null
          stage: string
          user_id: string
        }
        Update: {
          actor?: string | null
          created_at?: string | null
          id?: string
          invoice_id?: string
          notes?: string | null
          stage?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_lifecycle_events_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_payments: {
        Row: {
          amount: number
          created_at: string | null
          id: string
          invoice_id: string
          notes: string | null
          payment_date: string
          payment_mode: string | null
          reference_number: string | null
          short_payment: number | null
          tds_deducted: number | null
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string | null
          id?: string
          invoice_id: string
          notes?: string | null
          payment_date: string
          payment_mode?: string | null
          reference_number?: string | null
          short_payment?: number | null
          tds_deducted?: number | null
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string | null
          id?: string
          invoice_id?: string
          notes?: string | null
          payment_date?: string
          payment_mode?: string | null
          reference_number?: string | null
          short_payment?: number | null
          tds_deducted?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_reminder_log: {
        Row: {
          channel: string
          error_message: string | null
          id: string
          invoice_id: string
          rule_id: string | null
          sent_at: string | null
          status: string | null
          user_id: string
        }
        Insert: {
          channel: string
          error_message?: string | null
          id?: string
          invoice_id: string
          rule_id?: string | null
          sent_at?: string | null
          status?: string | null
          user_id: string
        }
        Update: {
          channel?: string
          error_message?: string | null
          id?: string
          invoice_id?: string
          rule_id?: string | null
          sent_at?: string | null
          status?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_reminder_log_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_reminder_log_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "invoice_reminder_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_reminder_rules: {
        Row: {
          channels: string[]
          created_at: string | null
          id: string
          is_active: boolean | null
          name: string
          offset_days: number
          template: string | null
          trigger_type: string
          user_id: string
        }
        Insert: {
          channels?: string[]
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          offset_days?: number
          template?: string | null
          trigger_type: string
          user_id: string
        }
        Update: {
          channels?: string[]
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          offset_days?: number
          template?: string | null
          trigger_type?: string
          user_id?: string
        }
        Relationships: []
      }
      invoice_risk_flags: {
        Row: {
          created_at: string | null
          details: Json | null
          flag_type: string
          id: string
          invoice_id: string
          resolved: boolean | null
          resolved_at: string | null
          severity: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          details?: Json | null
          flag_type: string
          id?: string
          invoice_id: string
          resolved?: boolean | null
          resolved_at?: string | null
          severity?: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          details?: Json | null
          flag_type?: string
          id?: string
          invoice_id?: string
          resolved?: boolean | null
          resolved_at?: string | null
          severity?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_risk_flags_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          accepted_at: string | null
          advance: number | null
          amount: number
          approved_at: string | null
          branch: string | null
          cess_amount: number | null
          cgst_amount: number | null
          client_address: string | null
          client_email: string | null
          client_gst_number: string | null
          client_name: string
          closed_at: string | null
          created_at: string | null
          created_by_name: string | null
          currency: string
          discount: number | null
          due_date: string
          edit_count: number | null
          fees_calculated: boolean | null
          from_email: string | null
          gst_amount: number
          gst_rate: number | null
          id: string
          igst_amount: number | null
          intra_state: boolean | null
          invoice_date: string
          invoice_number: string
          items: Json
          items_with_product_id: Json | null
          last_updated_by: string | null
          lifecycle_stage: string | null
          notes: string | null
          org_id: string | null
          paid_amount: number | null
          payment_terms_days: number | null
          payment_token: string | null
          payouts_completed: boolean | null
          place_of_supply: string | null
          pricing_mode: string | null
          rate_buckets: Json | null
          razorpay_payment_id: string | null
          razorpay_route_account_id: string | null
          roundoff: number | null
          seller_state: string | null
          sent_at: string | null
          sgst_amount: number | null
          shipping_address: string | null
          status: string | null
          taxable_value: number | null
          total_amount: number
          transaction_fee_id: string | null
          updated_at: string | null
          user_id: string
          viewed_at: string | null
        }
        Insert: {
          accepted_at?: string | null
          advance?: number | null
          amount?: number
          approved_at?: string | null
          branch?: string | null
          cess_amount?: number | null
          cgst_amount?: number | null
          client_address?: string | null
          client_email?: string | null
          client_gst_number?: string | null
          client_name: string
          closed_at?: string | null
          created_at?: string | null
          created_by_name?: string | null
          currency?: string
          discount?: number | null
          due_date: string
          edit_count?: number | null
          fees_calculated?: boolean | null
          from_email?: string | null
          gst_amount?: number
          gst_rate?: number | null
          id?: string
          igst_amount?: number | null
          intra_state?: boolean | null
          invoice_date: string
          invoice_number: string
          items?: Json
          items_with_product_id?: Json | null
          last_updated_by?: string | null
          lifecycle_stage?: string | null
          notes?: string | null
          org_id?: string | null
          paid_amount?: number | null
          payment_terms_days?: number | null
          payment_token?: string | null
          payouts_completed?: boolean | null
          place_of_supply?: string | null
          pricing_mode?: string | null
          rate_buckets?: Json | null
          razorpay_payment_id?: string | null
          razorpay_route_account_id?: string | null
          roundoff?: number | null
          seller_state?: string | null
          sent_at?: string | null
          sgst_amount?: number | null
          shipping_address?: string | null
          status?: string | null
          taxable_value?: number | null
          total_amount?: number
          transaction_fee_id?: string | null
          updated_at?: string | null
          user_id: string
          viewed_at?: string | null
        }
        Update: {
          accepted_at?: string | null
          advance?: number | null
          amount?: number
          approved_at?: string | null
          branch?: string | null
          cess_amount?: number | null
          cgst_amount?: number | null
          client_address?: string | null
          client_email?: string | null
          client_gst_number?: string | null
          client_name?: string
          closed_at?: string | null
          created_at?: string | null
          created_by_name?: string | null
          currency?: string
          discount?: number | null
          due_date?: string
          edit_count?: number | null
          fees_calculated?: boolean | null
          from_email?: string | null
          gst_amount?: number
          gst_rate?: number | null
          id?: string
          igst_amount?: number | null
          intra_state?: boolean | null
          invoice_date?: string
          invoice_number?: string
          items?: Json
          items_with_product_id?: Json | null
          last_updated_by?: string | null
          lifecycle_stage?: string | null
          notes?: string | null
          org_id?: string | null
          paid_amount?: number | null
          payment_terms_days?: number | null
          payment_token?: string | null
          payouts_completed?: boolean | null
          place_of_supply?: string | null
          pricing_mode?: string | null
          rate_buckets?: Json | null
          razorpay_payment_id?: string | null
          razorpay_route_account_id?: string | null
          roundoff?: number | null
          seller_state?: string | null
          sent_at?: string | null
          sgst_amount?: number | null
          shipping_address?: string | null
          status?: string | null
          taxable_value?: number | null
          total_amount?: number
          transaction_fee_id?: string | null
          updated_at?: string | null
          user_id?: string
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_transaction_fee_id_fkey"
            columns: ["transaction_fee_id"]
            isOneToOne: false
            referencedRelation: "transaction_fees"
            referencedColumns: ["id"]
          },
        ]
      }
      itc_mismatches: {
        Row: {
          book_gst: number | null
          book_gstin: string | null
          book_vendor: string | null
          created_at: string | null
          gst_diff: number | null
          id: string
          invoice_number: string
          note: string | null
          period: string | null
          portal_gst: number | null
          portal_gstin: string | null
          portal_supplier: string | null
          resolution_note: string | null
          resolved: boolean | null
          status: string
          updated_at: string | null
          upload_id: string | null
          user_id: string
        }
        Insert: {
          book_gst?: number | null
          book_gstin?: string | null
          book_vendor?: string | null
          created_at?: string | null
          gst_diff?: number | null
          id?: string
          invoice_number: string
          note?: string | null
          period?: string | null
          portal_gst?: number | null
          portal_gstin?: string | null
          portal_supplier?: string | null
          resolution_note?: string | null
          resolved?: boolean | null
          status: string
          updated_at?: string | null
          upload_id?: string | null
          user_id: string
        }
        Update: {
          book_gst?: number | null
          book_gstin?: string | null
          book_vendor?: string | null
          created_at?: string | null
          gst_diff?: number | null
          id?: string
          invoice_number?: string
          note?: string | null
          period?: string | null
          portal_gst?: number | null
          portal_gstin?: string | null
          portal_supplier?: string | null
          resolution_note?: string | null
          resolved?: boolean | null
          status?: string
          updated_at?: string | null
          upload_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "itc_mismatches_upload_id_fkey"
            columns: ["upload_id"]
            isOneToOne: false
            referencedRelation: "gstr2b_uploads"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_approval_workflow: {
        Row: {
          approval_status: string | null
          approved_at: string | null
          approved_by: string | null
          bank_statement_id: string | null
          created_at: string | null
          created_from_bank_statement: boolean | null
          id: string
          journal_id: string | null
          rejection_reason: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          approval_status?: string | null
          approved_at?: string | null
          approved_by?: string | null
          bank_statement_id?: string | null
          created_at?: string | null
          created_from_bank_statement?: boolean | null
          id?: string
          journal_id?: string | null
          rejection_reason?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          approval_status?: string | null
          approved_at?: string | null
          approved_by?: string | null
          bank_statement_id?: string | null
          created_at?: string | null
          created_from_bank_statement?: boolean | null
          id?: string
          journal_id?: string | null
          rejection_reason?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_approval_workflow_bank_statement_id_fkey"
            columns: ["bank_statement_id"]
            isOneToOne: false
            referencedRelation: "bank_statements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_approval_workflow_journal_id_fkey"
            columns: ["journal_id"]
            isOneToOne: false
            referencedRelation: "journals"
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
          org_id: string | null
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
          org_id?: string | null
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
          org_id?: string | null
          status?: string | null
          total_credit?: number | null
          total_debit?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "journals_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
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
          org_id: string | null
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
          org_id?: string | null
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
          org_id?: string | null
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
            foreignKeyName: "payables_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payables_related_purchase_order_id_fkey"
            columns: ["related_purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_received: {
        Row: {
          amount: number
          attachments: Json | null
          bank_charges: number | null
          created_at: string | null
          customer_id: string | null
          customer_name: string
          deposit_account: string | null
          deposit_reference: string | null
          description: string | null
          id: string
          invoice_allocations: Json | null
          notes: string | null
          payment_date: string
          payment_mode: string | null
          payment_type: string
          place_of_supply: string | null
          reference_number: string | null
          status: string | null
          tax_amount: number | null
          tax_deducted: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          amount?: number
          attachments?: Json | null
          bank_charges?: number | null
          created_at?: string | null
          customer_id?: string | null
          customer_name: string
          deposit_account?: string | null
          deposit_reference?: string | null
          description?: string | null
          id?: string
          invoice_allocations?: Json | null
          notes?: string | null
          payment_date?: string
          payment_mode?: string | null
          payment_type: string
          place_of_supply?: string | null
          reference_number?: string | null
          status?: string | null
          tax_amount?: number | null
          tax_deducted?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          attachments?: Json | null
          bank_charges?: number | null
          created_at?: string | null
          customer_id?: string | null
          customer_name?: string
          deposit_account?: string | null
          deposit_reference?: string | null
          description?: string | null
          id?: string
          invoice_allocations?: Json | null
          notes?: string | null
          payment_date?: string
          payment_mode?: string | null
          payment_type?: string
          place_of_supply?: string | null
          reference_number?: string | null
          status?: string | null
          tax_amount?: number | null
          tax_deducted?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_received_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_settings: {
        Row: {
          created_at: string | null
          id: string
          razorpay_access_token: string | null
          razorpay_account_id: string | null
          razorpay_account_status: string | null
          razorpay_product_id: string | null
          razorpay_public_token: string | null
          razorpay_refresh_token: string | null
          razorpay_token_expires_at: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          razorpay_access_token?: string | null
          razorpay_account_id?: string | null
          razorpay_account_status?: string | null
          razorpay_product_id?: string | null
          razorpay_public_token?: string | null
          razorpay_refresh_token?: string | null
          razorpay_token_expires_at?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          razorpay_access_token?: string | null
          razorpay_account_id?: string | null
          razorpay_account_status?: string | null
          razorpay_product_id?: string | null
          razorpay_public_token?: string | null
          razorpay_refresh_token?: string | null
          razorpay_token_expires_at?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      payout_records: {
        Row: {
          bank_account_number: string | null
          bank_ifsc_code: string | null
          completed_at: string | null
          created_at: string | null
          error_message: string | null
          external_payout_id: string | null
          failed_at: string | null
          id: string
          initiated_at: string | null
          invoice_id: string | null
          notes: Json | null
          payout_amount: number
          payout_method: string | null
          recipient_id: string | null
          recipient_name: string
          recipient_type: string
          retry_count: number | null
          status: string | null
          transaction_fee_id: string | null
          updated_at: string | null
          upi_id: string | null
          user_id: string
        }
        Insert: {
          bank_account_number?: string | null
          bank_ifsc_code?: string | null
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          external_payout_id?: string | null
          failed_at?: string | null
          id?: string
          initiated_at?: string | null
          invoice_id?: string | null
          notes?: Json | null
          payout_amount: number
          payout_method?: string | null
          recipient_id?: string | null
          recipient_name: string
          recipient_type: string
          retry_count?: number | null
          status?: string | null
          transaction_fee_id?: string | null
          updated_at?: string | null
          upi_id?: string | null
          user_id: string
        }
        Update: {
          bank_account_number?: string | null
          bank_ifsc_code?: string | null
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          external_payout_id?: string | null
          failed_at?: string | null
          id?: string
          initiated_at?: string | null
          invoice_id?: string | null
          notes?: Json | null
          payout_amount?: number
          payout_method?: string | null
          recipient_id?: string | null
          recipient_name?: string
          recipient_type?: string
          retry_count?: number | null
          status?: string | null
          transaction_fee_id?: string | null
          updated_at?: string | null
          upi_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payout_records_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payout_records_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "fee_recipients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payout_records_transaction_fee_id_fkey"
            columns: ["transaction_fee_id"]
            isOneToOne: false
            referencedRelation: "transaction_fees"
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
      projects: {
        Row: {
          assigned_users: Json
          billing_method: string
          client_id: string | null
          client_name: string | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          project_code: string | null
          project_name: string
          tasks: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          assigned_users?: Json
          billing_method?: string
          client_id?: string | null
          client_name?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          project_code?: string | null
          project_name: string
          tasks?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          assigned_users?: Json
          billing_method?: string
          client_id?: string | null
          client_name?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          project_code?: string | null
          project_name?: string
          tasks?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_bills: {
        Row: {
          amount: number
          bill_attachment_name: string | null
          bill_attachment_url: string | null
          bill_date: string
          bill_number: string
          cgst_amount: number | null
          created_at: string | null
          due_date: string
          gst_amount: number
          id: string
          igst_amount: number | null
          is_rcm: boolean | null
          itc_eligible: boolean | null
          items: Json
          notes: string | null
          order_number: string | null
          org_id: string | null
          paid_amount: number | null
          payment_terms: string | null
          place_of_supply: string | null
          sgst_amount: number | null
          status: string | null
          subject: string | null
          tcs_amount: number | null
          tds_amount: number | null
          total_amount: number
          updated_at: string | null
          user_id: string
          vendor_address: string | null
          vendor_email: string | null
          vendor_gst_number: string | null
          vendor_gst_status: string | null
          vendor_id: string | null
          vendor_name: string
        }
        Insert: {
          amount: number
          bill_attachment_name?: string | null
          bill_attachment_url?: string | null
          bill_date: string
          bill_number: string
          cgst_amount?: number | null
          created_at?: string | null
          due_date: string
          gst_amount: number
          id?: string
          igst_amount?: number | null
          is_rcm?: boolean | null
          itc_eligible?: boolean | null
          items?: Json
          notes?: string | null
          order_number?: string | null
          org_id?: string | null
          paid_amount?: number | null
          payment_terms?: string | null
          place_of_supply?: string | null
          sgst_amount?: number | null
          status?: string | null
          subject?: string | null
          tcs_amount?: number | null
          tds_amount?: number | null
          total_amount: number
          updated_at?: string | null
          user_id: string
          vendor_address?: string | null
          vendor_email?: string | null
          vendor_gst_number?: string | null
          vendor_gst_status?: string | null
          vendor_id?: string | null
          vendor_name: string
        }
        Update: {
          amount?: number
          bill_attachment_name?: string | null
          bill_attachment_url?: string | null
          bill_date?: string
          bill_number?: string
          cgst_amount?: number | null
          created_at?: string | null
          due_date?: string
          gst_amount?: number
          id?: string
          igst_amount?: number | null
          is_rcm?: boolean | null
          itc_eligible?: boolean | null
          items?: Json
          notes?: string | null
          order_number?: string | null
          org_id?: string | null
          paid_amount?: number | null
          payment_terms?: string | null
          place_of_supply?: string | null
          sgst_amount?: number | null
          status?: string | null
          subject?: string | null
          tcs_amount?: number | null
          tds_amount?: number | null
          total_amount?: number
          updated_at?: string | null
          user_id?: string
          vendor_address?: string | null
          vendor_email?: string | null
          vendor_gst_number?: string | null
          vendor_gst_status?: string | null
          vendor_id?: string | null
          vendor_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_bills_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
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
          org_id: string | null
          payment_status: string | null
          status: string | null
          subtotal: number
          tax_amount: number
          total_amount: number
          updated_at: string | null
          user_id: string
          vendor_address: string | null
          vendor_bank_account_holder: string | null
          vendor_bank_account_number: string | null
          vendor_bank_branch: string | null
          vendor_bank_ifsc: string | null
          vendor_bank_name: string | null
          vendor_company_name: string | null
          vendor_email: string | null
          vendor_gst: string | null
          vendor_gst_treatment: string | null
          vendor_id: string | null
          vendor_msme_registered: boolean
          vendor_name: string
          vendor_phone: string | null
          vendor_state: string | null
          vendor_udyam_aadhaar: string | null
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
          org_id?: string | null
          payment_status?: string | null
          status?: string | null
          subtotal?: number
          tax_amount?: number
          total_amount?: number
          updated_at?: string | null
          user_id: string
          vendor_address?: string | null
          vendor_bank_account_holder?: string | null
          vendor_bank_account_number?: string | null
          vendor_bank_branch?: string | null
          vendor_bank_ifsc?: string | null
          vendor_bank_name?: string | null
          vendor_company_name?: string | null
          vendor_email?: string | null
          vendor_gst?: string | null
          vendor_gst_treatment?: string | null
          vendor_id?: string | null
          vendor_msme_registered?: boolean
          vendor_name: string
          vendor_phone?: string | null
          vendor_state?: string | null
          vendor_udyam_aadhaar?: string | null
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
          org_id?: string | null
          payment_status?: string | null
          status?: string | null
          subtotal?: number
          tax_amount?: number
          total_amount?: number
          updated_at?: string | null
          user_id?: string
          vendor_address?: string | null
          vendor_bank_account_holder?: string | null
          vendor_bank_account_number?: string | null
          vendor_bank_branch?: string | null
          vendor_bank_ifsc?: string | null
          vendor_bank_name?: string | null
          vendor_company_name?: string | null
          vendor_email?: string | null
          vendor_gst?: string | null
          vendor_gst_treatment?: string | null
          vendor_id?: string | null
          vendor_msme_registered?: boolean
          vendor_name?: string
          vendor_phone?: string | null
          vendor_state?: string | null
          vendor_udyam_aadhaar?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
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
          currency: string
          discount: number | null
          id: string
          items: Json
          items_with_product_id: Json | null
          org_id: string | null
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
          currency?: string
          discount?: number | null
          id?: string
          items?: Json
          items_with_product_id?: Json | null
          org_id?: string | null
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
          currency?: string
          discount?: number | null
          id?: string
          items?: Json
          items_with_product_id?: Json | null
          org_id?: string | null
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
        Relationships: [
          {
            foreignKeyName: "quotations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      razorpay_oauth_states: {
        Row: {
          created_at: string
          expires_at: string
          state: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          state: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          state?: string
          user_id?: string
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
          org_id: string | null
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
          org_id?: string | null
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
          org_id?: string | null
          payment_date?: string | null
          related_sales_order_id?: string | null
          related_sales_order_number?: string | null
          status?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "receivables_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receivables_related_sales_order_id_fkey"
            columns: ["related_sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_expenses: {
        Row: {
          amount: number
          category_id: string | null
          category_name: string
          created_at: string | null
          description: string | null
          end_date: string | null
          frequency: string
          id: string
          is_active: boolean
          last_generated_date: string | null
          name: string
          next_due_date: string
          notes: string | null
          payment_mode: string
          project_id: string | null
          project_name: string | null
          reference_number: string | null
          start_date: string
          tax_amount: number
          total_amount: number
          updated_at: string | null
          user_id: string
          vendor_id: string | null
          vendor_name: string
        }
        Insert: {
          amount?: number
          category_id?: string | null
          category_name?: string
          created_at?: string | null
          description?: string | null
          end_date?: string | null
          frequency?: string
          id?: string
          is_active?: boolean
          last_generated_date?: string | null
          name: string
          next_due_date: string
          notes?: string | null
          payment_mode?: string
          project_id?: string | null
          project_name?: string | null
          reference_number?: string | null
          start_date: string
          tax_amount?: number
          total_amount?: number
          updated_at?: string | null
          user_id: string
          vendor_id?: string | null
          vendor_name?: string
        }
        Update: {
          amount?: number
          category_id?: string | null
          category_name?: string
          created_at?: string | null
          description?: string | null
          end_date?: string | null
          frequency?: string
          id?: string
          is_active?: boolean
          last_generated_date?: string | null
          name?: string
          next_due_date?: string
          notes?: string | null
          payment_mode?: string
          project_id?: string | null
          project_name?: string | null
          reference_number?: string | null
          start_date?: string
          tax_amount?: number
          total_amount?: number
          updated_at?: string | null
          user_id?: string
          vendor_id?: string | null
          vendor_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_expenses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_expenses_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_expenses_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_invoices: {
        Row: {
          amount: number
          client_email: string | null
          client_gst_number: string | null
          client_name: string
          created_at: string | null
          cron_expression: string | null
          frequency: string | null
          gst_rate: number | null
          id: string
          is_active: boolean | null
          items: Json | null
          last_run_date: string | null
          next_run_date: string
          notes: string | null
          org_id: string | null
          total_generated: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          amount?: number
          client_email?: string | null
          client_gst_number?: string | null
          client_name: string
          created_at?: string | null
          cron_expression?: string | null
          frequency?: string | null
          gst_rate?: number | null
          id?: string
          is_active?: boolean | null
          items?: Json | null
          last_run_date?: string | null
          next_run_date: string
          notes?: string | null
          org_id?: string | null
          total_generated?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          client_email?: string | null
          client_gst_number?: string | null
          client_name?: string
          created_at?: string | null
          cron_expression?: string | null
          frequency?: string | null
          gst_rate?: number | null
          id?: string
          is_active?: boolean | null
          items?: Json | null
          last_run_date?: string | null
          next_run_date?: string
          notes?: string | null
          org_id?: string | null
          total_generated?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_invoices_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
      revenue_recognition_periods: {
        Row: {
          amount: number
          id: string
          period_end: string
          period_start: string
          recognized: boolean | null
          recognized_at: string | null
          schedule_id: string
          user_id: string
        }
        Insert: {
          amount: number
          id?: string
          period_end: string
          period_start: string
          recognized?: boolean | null
          recognized_at?: string | null
          schedule_id: string
          user_id: string
        }
        Update: {
          amount?: number
          id?: string
          period_end?: string
          period_start?: string
          recognized?: boolean | null
          recognized_at?: string | null
          schedule_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "revenue_recognition_periods_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "revenue_recognition_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      revenue_recognition_schedules: {
        Row: {
          contract_value: number
          created_at: string | null
          end_date: string
          id: string
          invoice_id: string
          notes: string | null
          recognition_frequency: string
          start_date: string
          user_id: string
        }
        Insert: {
          contract_value: number
          created_at?: string | null
          end_date: string
          id?: string
          invoice_id: string
          notes?: string | null
          recognition_frequency: string
          start_date: string
          user_id: string
        }
        Update: {
          contract_value?: number
          created_at?: string | null
          end_date?: string
          id?: string
          invoice_id?: string
          notes?: string | null
          recognition_frequency?: string
          start_date?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "revenue_recognition_schedules_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
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
          shipping_address: string | null
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
          shipping_address?: string | null
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
          shipping_address?: string | null
          status?: string | null
          subtotal?: number
          tax_amount?: number
          total_amount?: number
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      stock_adjustments: {
        Row: {
          adjustment_date: string
          adjustment_number: string
          created_at: string | null
          id: string
          items: Json
          reason: string | null
          status: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          adjustment_date?: string
          adjustment_number: string
          created_at?: string | null
          id?: string
          items?: Json
          reason?: string | null
          status?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          adjustment_date?: string
          adjustment_number?: string
          created_at?: string | null
          id?: string
          items?: Json
          reason?: string | null
          status?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          billing_cycle: string | null
          category: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          last_used_at: string | null
          monthly_cost: number
          next_renewal_date: string | null
          notes: string | null
          product_name: string
          seats: number | null
          used_seats: number | null
          user_id: string
          vendor_name: string
        }
        Insert: {
          billing_cycle?: string | null
          category?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          last_used_at?: string | null
          monthly_cost: number
          next_renewal_date?: string | null
          notes?: string | null
          product_name: string
          seats?: number | null
          used_seats?: number | null
          user_id: string
          vendor_name: string
        }
        Update: {
          billing_cycle?: string | null
          category?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          last_used_at?: string | null
          monthly_cost?: number
          next_renewal_date?: string | null
          notes?: string | null
          product_name?: string
          seats?: number | null
          used_seats?: number | null
          user_id?: string
          vendor_name?: string
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
      transaction_fees: {
        Row: {
          created_at: string | null
          fee_breakdown: Json | null
          fee_structure_id: string | null
          gateway_fee: number | null
          id: string
          invoice_id: string | null
          order_id: string | null
          other_fees: number | null
          payment_id: string | null
          platform_fee: number | null
          status: string | null
          total_amount: number
          total_fees: number | null
          updated_at: string | null
          user_id: string
          vendor_amount: number
        }
        Insert: {
          created_at?: string | null
          fee_breakdown?: Json | null
          fee_structure_id?: string | null
          gateway_fee?: number | null
          id?: string
          invoice_id?: string | null
          order_id?: string | null
          other_fees?: number | null
          payment_id?: string | null
          platform_fee?: number | null
          status?: string | null
          total_amount: number
          total_fees?: number | null
          updated_at?: string | null
          user_id: string
          vendor_amount: number
        }
        Update: {
          created_at?: string | null
          fee_breakdown?: Json | null
          fee_structure_id?: string | null
          gateway_fee?: number | null
          id?: string
          invoice_id?: string | null
          order_id?: string | null
          other_fees?: number | null
          payment_id?: string | null
          platform_fee?: number | null
          status?: string | null
          total_amount?: number
          total_fees?: number | null
          updated_at?: string | null
          user_id?: string
          vendor_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "transaction_fees_fee_structure_id_fkey"
            columns: ["fee_structure_id"]
            isOneToOne: false
            referencedRelation: "fee_structures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_fees_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      unit_conversions: {
        Row: {
          created_at: string | null
          factor: number
          from_uom: string
          id: string
          item_id: string | null
          to_uom: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          factor: number
          from_uom: string
          id?: string
          item_id?: string | null
          to_uom: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          factor?: number
          from_uom?: string
          id?: string
          item_id?: string | null
          to_uom?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "unit_conversions_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unit_conversions_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "vw_stock_summary"
            referencedColumns: ["item_id"]
          },
        ]
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
      vehicle_mileage_logs: {
        Row: {
          amount: number
          created_at: string
          distance_km: number
          end_km: number
          end_location: string | null
          id: string
          notes: string | null
          rate_per_km: number
          start_km: number
          start_location: string | null
          trip_date: string
          trip_purpose: string
          updated_at: string
          user_id: string
          vehicle_name: string
          vendor_id: string | null
          vendor_name: string | null
        }
        Insert: {
          amount?: number
          created_at?: string
          distance_km?: number
          end_km?: number
          end_location?: string | null
          id?: string
          notes?: string | null
          rate_per_km?: number
          start_km?: number
          start_location?: string | null
          trip_date: string
          trip_purpose: string
          updated_at?: string
          user_id: string
          vehicle_name: string
          vendor_id?: string | null
          vendor_name?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          distance_km?: number
          end_km?: number
          end_location?: string | null
          id?: string
          notes?: string | null
          rate_per_km?: number
          start_km?: number
          start_location?: string | null
          trip_date?: string
          trip_purpose?: string
          updated_at?: string
          user_id?: string
          vehicle_name?: string
          vendor_id?: string | null
          vendor_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_mileage_logs_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_advances: {
        Row: {
          adjusted_amount: number
          advance_date: string
          advance_number: string
          amount: number
          attachment_name: string | null
          attachment_url: string | null
          created_at: string
          id: string
          journal_id: string | null
          notes: string | null
          org_id: string | null
          payment_mode: string
          reference_number: string | null
          status: string
          unadjusted_amount: number
          updated_at: string
          user_id: string
          vendor_id: string
          vendor_name: string
        }
        Insert: {
          adjusted_amount?: number
          advance_date: string
          advance_number: string
          amount: number
          attachment_name?: string | null
          attachment_url?: string | null
          created_at?: string
          id?: string
          journal_id?: string | null
          notes?: string | null
          org_id?: string | null
          payment_mode?: string
          reference_number?: string | null
          status?: string
          unadjusted_amount?: number
          updated_at?: string
          user_id: string
          vendor_id: string
          vendor_name: string
        }
        Update: {
          adjusted_amount?: number
          advance_date?: string
          advance_number?: string
          amount?: number
          attachment_name?: string | null
          attachment_url?: string | null
          created_at?: string
          id?: string
          journal_id?: string | null
          notes?: string | null
          org_id?: string | null
          payment_mode?: string
          reference_number?: string | null
          status?: string
          unadjusted_amount?: number
          updated_at?: string
          user_id?: string
          vendor_id?: string
          vendor_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_advances_journal_id_fkey"
            columns: ["journal_id"]
            isOneToOne: false
            referencedRelation: "journals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_advances_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_bill_payments: {
        Row: {
          advance_id: string | null
          advance_number: string | null
          amount: number
          attachment_name: string | null
          attachment_url: string | null
          bill_id: string
          bill_number: string
          created_at: string
          id: string
          journal_id: string | null
          notes: string | null
          org_id: string | null
          payment_date: string
          payment_mode: string
          payment_type: string
          reference_number: string | null
          user_id: string
          vendor_id: string
          vendor_name: string
        }
        Insert: {
          advance_id?: string | null
          advance_number?: string | null
          amount: number
          attachment_name?: string | null
          attachment_url?: string | null
          bill_id: string
          bill_number: string
          created_at?: string
          id?: string
          journal_id?: string | null
          notes?: string | null
          org_id?: string | null
          payment_date: string
          payment_mode?: string
          payment_type?: string
          reference_number?: string | null
          user_id: string
          vendor_id: string
          vendor_name: string
        }
        Update: {
          advance_id?: string | null
          advance_number?: string | null
          amount?: number
          attachment_name?: string | null
          attachment_url?: string | null
          bill_id?: string
          bill_number?: string
          created_at?: string
          id?: string
          journal_id?: string | null
          notes?: string | null
          org_id?: string | null
          payment_date?: string
          payment_mode?: string
          payment_type?: string
          reference_number?: string | null
          user_id?: string
          vendor_id?: string
          vendor_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_bill_payments_advance_id_fkey"
            columns: ["advance_id"]
            isOneToOne: false
            referencedRelation: "vendor_advances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_bill_payments_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "purchase_bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_bill_payments_journal_id_fkey"
            columns: ["journal_id"]
            isOneToOne: false
            referencedRelation: "journals"
            referencedColumns: ["id"]
          },
        ]
      }
      vendors: {
        Row: {
          address: string | null
          bank_account_holder: string | null
          bank_account_number: string | null
          bank_branch: string | null
          bank_ifsc: string | null
          bank_name: string | null
          company_name: string | null
          created_at: string | null
          email: string | null
          gst_number: string | null
          gst_treatment: string | null
          id: string
          linked_tds_section_id: string | null
          msme_registered: boolean
          name: string
          org_id: string | null
          pan: string | null
          payment_terms: number | null
          phone: string | null
          state: string | null
          tds_enabled: boolean | null
          udyam_aadhaar: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          address?: string | null
          bank_account_holder?: string | null
          bank_account_number?: string | null
          bank_branch?: string | null
          bank_ifsc?: string | null
          bank_name?: string | null
          company_name?: string | null
          created_at?: string | null
          email?: string | null
          gst_number?: string | null
          gst_treatment?: string | null
          id?: string
          linked_tds_section_id?: string | null
          msme_registered?: boolean
          name: string
          org_id?: string | null
          pan?: string | null
          payment_terms?: number | null
          phone?: string | null
          state?: string | null
          tds_enabled?: boolean | null
          udyam_aadhaar?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          address?: string | null
          bank_account_holder?: string | null
          bank_account_number?: string | null
          bank_branch?: string | null
          bank_ifsc?: string | null
          bank_name?: string | null
          company_name?: string | null
          created_at?: string | null
          email?: string | null
          gst_number?: string | null
          gst_treatment?: string | null
          id?: string
          linked_tds_section_id?: string | null
          msme_registered?: boolean
          name?: string
          org_id?: string | null
          pan?: string | null
          payment_terms?: number | null
          phone?: string | null
          state?: string | null
          tds_enabled?: boolean | null
          udyam_aadhaar?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendors_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouses: {
        Row: {
          address: string | null
          code: string
          created_at: string | null
          id: string
          is_active: boolean | null
          is_default: boolean | null
          name: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          address?: string | null
          code: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          name: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          address?: string | null
          code?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          name?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      v_gst_monthly_itc: {
        Row: {
          bill_count: number | null
          cgst: number | null
          igst: number | null
          period: string | null
          rcm_gst: number | null
          sgst: number | null
          taxable_value: number | null
          total_gst: number | null
          user_id: string | null
        }
        Relationships: []
      }
      v_gst_monthly_output: {
        Row: {
          cess: number | null
          cgst: number | null
          igst: number | null
          invoice_count: number | null
          period: string | null
          sgst: number | null
          taxable_value: number | null
          total_gst: number | null
          user_id: string | null
        }
        Relationships: []
      }
      vw_client_profitability: {
        Row: {
          attributed_cost: number | null
          client_name: string | null
          gross_margin: number | null
          revenue: number | null
          user_id: string | null
        }
        Relationships: []
      }
      vw_cogs_report: {
        Row: {
          cogs_amount: number | null
          item_id: string | null
          movement_date: string | null
          party_name: string | null
          quantity_sold: number | null
          source_number: string | null
          source_type: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "vw_stock_summary"
            referencedColumns: ["item_id"]
          },
        ]
      }
      vw_conversion_funnel: {
        Row: {
          invoices_count: number | null
          paid_count: number | null
          quotations_count: number | null
          sales_orders_count: number | null
          user_id: string | null
        }
        Relationships: []
      }
      vw_customer_billing_behavior: {
        Row: {
          accepted_count: number | null
          avg_payment_delay_days: number | null
          client_name: string | null
          invoice_count: number | null
          open_balance: number | null
          total_billed: number | null
          user_id: string | null
        }
        Relationships: []
      }
      vw_inventory_valuation: {
        Row: {
          category: string | null
          item_count: number | null
          total_quantity: number | null
          total_value: number | null
          user_id: string | null
          valuation_method: string | null
        }
        Relationships: []
      }
      vw_item_profitability: {
        Row: {
          cogs_amount: number | null
          gross_profit: number | null
          item_id: string | null
          product_name: string | null
          quantity_sold: number | null
          revenue: number | null
          user_id: string | null
        }
        Relationships: []
      }
      vw_monthly_variance: {
        Row: {
          expenses: number | null
          month: string | null
          rent: number | null
          revenue: number | null
          travel: number | null
          user_id: string | null
        }
        Relationships: []
      }
      vw_purchase_sales_trend: {
        Row: {
          issue_value: number | null
          month: string | null
          purchase_value: number | null
          quantity_in: number | null
          quantity_out: number | null
          user_id: string | null
        }
        Relationships: []
      }
      vw_stock_aging: {
        Row: {
          age_days: number | null
          batch_number: string | null
          expiry_date: string | null
          item_id: string | null
          product_name: string | null
          quantity_on_hand: number | null
          received_date: string | null
          remaining_value: number | null
          user_id: string | null
          warehouse_id: string | null
          warehouse_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_batches_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_batches_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "vw_stock_summary"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "inventory_batches_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_stock_summary: {
        Row: {
          average_cost: number | null
          category: string | null
          is_low_stock: boolean | null
          item_id: string | null
          product_name: string | null
          reorder_level: number | null
          sku: string | null
          stock_quantity: number | null
          stock_value: number | null
          type: string | null
          uom: string | null
          user_id: string | null
          valuation_method: string | null
        }
        Insert: {
          average_cost?: number | null
          category?: string | null
          is_low_stock?: never
          item_id?: string | null
          product_name?: string | null
          reorder_level?: number | null
          sku?: string | null
          stock_quantity?: number | null
          stock_value?: number | null
          type?: string | null
          uom?: string | null
          user_id?: string | null
          valuation_method?: string | null
        }
        Update: {
          average_cost?: number | null
          category?: string | null
          is_low_stock?: never
          item_id?: string | null
          product_name?: string | null
          reorder_level?: number | null
          sku?: string | null
          stock_quantity?: number | null
          stock_value?: number | null
          type?: string | null
          uom?: string | null
          user_id?: string | null
          valuation_method?: string | null
        }
        Relationships: []
      }
      vw_vendor_spend: {
        Row: {
          avg_bill: number | null
          expense_count: number | null
          spend_last_30: number | null
          spend_prev_30: number | null
          total_spend: number | null
          user_id: string | null
          vendor_name: string | null
        }
        Relationships: []
      }
      vw_warehouse_stock: {
        Row: {
          item_id: string | null
          product_name: string | null
          quantity_on_hand: number | null
          stock_value: number | null
          user_id: string | null
          warehouse_id: string | null
          warehouse_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "vw_stock_summary"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "inventory_movements_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
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
      calculate_match_score: {
        Args: {
          p_amount: number
          p_date: string
          p_description: string
          p_journal_amount: number
          p_journal_date: string
          p_journal_narration: string
        }
        Returns: number
      }
      calculate_transaction_fees: {
        Args: {
          p_fee_structure_id?: string
          p_total_amount: number
          p_user_id: string
        }
        Returns: Json
      }
      can_user_generate_license: {
        Args: { user_email: string }
        Returns: boolean
      }
      cleanup_expired_oauth_states: { Args: never; Returns: undefined }
      confirm_invoice_payment: {
        Args: {
          p_amount: number
          p_invoice_id: string
          p_razorpay_payment_id: string
          p_token: string
        }
        Returns: Json
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
      ensure_default_warehouse: { Args: { p_user_id: string }; Returns: string }
      generate_expense_number: { Args: never; Returns: string }
      get_invoice_for_payment: {
        Args: { p_invoice_id: string; p_token: string }
        Returns: Json
      }
      get_payout_summary: {
        Args: { p_date_from?: string; p_date_to?: string; p_user_id: string }
        Returns: Json
      }
      get_user_organizations: {
        Args: { _user_id: string }
        Returns: {
          is_ca_client: boolean
          organization_id: string
          role: Database["public"]["Enums"]["app_role"]
        }[]
      }
      get_vendor_razorpay_account: {
        Args: { p_user_id: string }
        Returns: Json
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
      user_belongs_to_org: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
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
