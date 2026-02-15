/**
 * Data Service with Org & Branch Scoping
 * All queries automatically filtered by active organization/branch context
 * Uses Clerk for auth context validation
 */

import { supabase } from '@/lib/supabaseClient';
import { useClerkAuthorization } from '@/hooks/useClerkAuthorization';

/**
 * Creating a scoped query service
 * Example showing how to layer organization/branch context
 */
export function useBillService() {
  const auth = useClerkAuthorization();

  if (!auth.orgId) {
    throw new Error('Organization context required');
  }

  return {
    /**
     * Get all bills for current org/branch
     */
    async getBills(filters?: { status?: string; limit?: number }) {
      const query = supabase
        .from('bills')
        .select('*')
        .eq('org_id', auth.orgId); // Filter by org

      // Filter by branch if set
      if (auth.branchId) {
        query.eq('branch_id', auth.branchId);
      }

      // Apply additional filters
      if (filters?.status) {
        query.eq('status', filters.status);
      }

      // Order and limit
      const { data, error } = await query
        .order('created_at', { ascending: false })
        .limit(filters?.limit || 100);

      if (error) throw error;
      return data;
    },

    /**
     * Get single bill with permission check
     */
    async getBill(billId: string) {
      // Check read permission
      if (!auth.hasPermission('bill:read')) {
        throw new Error('Not authorized to read bills');
      }

      const { data, error } = await supabase
        .from('bills')
        .select('*')
        .eq('id', billId)
        .eq('org_id', auth.orgId) // Ensure org scoping
        .single();

      if (error) throw error;
      if (!data) throw new Error('Bill not found');

      // Additional: check branch access
      if (data.branch_id && !auth.canAccessBranch(data.branch_id)) {
        throw new Error('Not authorized to access this branch');
      }

      return data;
    },

    /**
     * Create new bill
     */
    async createBill(billData: any) {
      // Check write permission
      if (!auth.hasPermission('bill:create')) {
        throw new Error('Not authorized to create bills');
      }

      const { data, error } = await supabase
        .from('bills')
        .insert({
          ...billData,
          org_id: auth.orgId, // Auto-scope to current org
          branch_id: auth.branchId, // Auto-scope to current branch
          created_by: auth.userId,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },

    /**
     * Update bill
     */
    async updateBill(billId: string, updates: any) {
      // Check permission
      if (!auth.hasPermission('bill:update')) {
        throw new Error('Not authorized to update bills');
      }

      // Verify ownership/access
      const existing = await this.getBill(billId);
      if (!existing) {
        throw new Error('Bill not found');
      }

      const { data, error } = await supabase
        .from('bills')
        .update(updates)
        .eq('id', billId)
        .eq('org_id', auth.orgId) // Ensure org scoping in update
        .select()
        .single();

      if (error) throw error;
      return data;
    },

    /**
     * Delete bill
     */
    async deleteBill(billId: string) {
      if (!auth.hasPermission('bill:delete')) {
        throw new Error('Not authorized to delete bills');
      }

      // Verify access before delete
      await this.getBill(billId);

      const { error } = await supabase
        .from('bills')
        .delete()
        .eq('id', billId)
        .eq('org_id', auth.orgId); // Ensure org scoping

      if (error) throw error;
    },

    /**
     * Export bills
     */
    async exportBills(format: 'csv' | 'pdf' = 'csv') {
      if (!auth.hasPermission('bill:export')) {
        throw new Error('Not authorized to export');
      }

      const bills = await this.getBills();
      
      if (format === 'csv') {
        return this.billsToCSV(bills);
      } else if (format === 'pdf') {
        return this.billsToPDF(bills);
      }
    },

    /**
     * Helper: Convert to CSV
     */
    billsToCSV(bills: any[]): string {
      // Implementation
      const headers = ['ID', 'Date', 'Amount', 'Vendor', 'Status'];
      const rows = bills.map(b => [b.id, b.date, b.amount, b.vendor, b.status]);
      
      const csv = [
        headers.join(','),
        ...rows.map(row => row.join(','))
      ].join('\n');

      return csv;
    },

    /**
     * Helper: Convert to PDF
     */
    billsToPDF(bills: any[]): Blob {
      // Implementation using jsPDF or pdfkit
      throw new Error('PDF export not implemented');
    },
  };
}

/**
 * Report Service with Org Scoping
 */
export function useReportService() {
  const auth = useClerkAuthorization();

  if (!auth.orgId) {
    throw new Error('Organization context required');
  }

  return {
    /**
     * Get organization reports
     */
    async getReports(filters?: { type?: string; period?: string }) {
      const query = supabase
        .from('reports')
        .select('*')
        .eq('org_id', auth.orgId);

      if (filters?.type) {
        query.eq('type', filters.type);
      }

      const { data, error } = await query.order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },

    /**
     * Generate new report
     */
    async generateReport(type: string, period: string) {
      if (!auth.hasPermission('report:generate')) {
        throw new Error('Not authorized to generate reports');
      }

      const { data, error } = await supabase
        .from('reports')
        .insert({
          org_id: auth.orgId,
          branch_id: auth.branchId,
          type,
          period,
          generated_by: auth.userId,
          generated_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
  };
}

export default { useBillService, useReportService };
