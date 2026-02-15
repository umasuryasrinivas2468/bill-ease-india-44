import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useUser } from '@clerk/clerk-react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { normalizeUserId, isValidUserId } from '@/lib/userUtils';
import { 
  Expense, 
  ExpenseCategory, 
  CreateExpenseData, 
  ExpenseStats, 
  ExpenseFilters,
  Vendor,
  ExpenseAttachment 
} from '@/types/expenses';

export const useExpenses = (filters?: ExpenseFilters) => {
  const { user } = useUser();
  
  return useQuery({
    queryKey: ['expenses', user?.id, filters],
    queryFn: async () => {
      if (!user || !isValidUserId(user.id)) {
        throw new Error('User not authenticated or invalid user ID');
      }
      
      const normalizedUserId = normalizeUserId(user.id);
      let query = supabase
        .from('expenses')
        .select('*')
        .eq('user_id', normalizedUserId)
        .order('expense_date', { ascending: false });

      // Apply filters
      if (filters?.startDate) {
        query = query.gte('expense_date', filters.startDate);
      }
      if (filters?.endDate) {
        query = query.lte('expense_date', filters.endDate);
      }
      if (filters?.categoryId) {
        query = query.eq('category_id', filters.categoryId);
      }
      if (filters?.vendorId) {
        query = query.eq('vendor_id', filters.vendorId);
      }
      if (filters?.paymentMode) {
        query = query.eq('payment_mode', filters.paymentMode);
      }
      if (filters?.status) {
        query = query.eq('status', filters.status);
      }
      if (filters?.searchTerm) {
        query = query.or(`description.ilike.%${filters.searchTerm}%,vendor_name.ilike.%${filters.searchTerm}%,expense_number.ilike.%${filters.searchTerm}%`);
      }

      const { data, error } = await query;

      if (error) {
        throw new Error(`Failed to fetch expenses: ${error.message}`);
      }

      return data as Expense[];
    },
    enabled: !!user && isValidUserId(user?.id),
  });
};

export const useExpenseCategories = () => {
  const { user } = useUser();
  
  return useQuery({
    queryKey: ['expense-categories', user?.id],
    queryFn: async () => {
      if (!user || !isValidUserId(user.id)) {
        throw new Error('User not authenticated or invalid user ID');
      }
      
      const normalizedUserId = normalizeUserId(user.id);
      const { data, error } = await supabase
        .from('expense_categories')
        .select('*')
        .or(`user_id.eq.${normalizedUserId},user_id.eq.system`)
        .eq('is_active', true)
        .order('category_name');

      if (error) {
        throw new Error(`Failed to fetch expense categories: ${error.message}`);
      }

      return data as ExpenseCategory[];
    },
    enabled: !!user && isValidUserId(user?.id),
  });
};

export const useVendors = () => {
  const { user } = useUser();
  
  return useQuery({
    queryKey: ['vendors', user?.id],
    queryFn: async () => {
      if (!user || !isValidUserId(user.id)) {
        throw new Error('User not authenticated or invalid user ID');
      }
      
      const normalizedUserId = normalizeUserId(user.id);
      const { data, error } = await supabase
        .from('vendors')
        .select('*, linked_tds_section_id, tds_enabled, pan_required, pan')
        .eq('user_id', normalizedUserId)
        .order('name');

      if (error) {
        throw new Error(`Failed to fetch vendors: ${error.message}`);
      }

      return data as Vendor[];
    },
    enabled: !!user && isValidUserId(user?.id),
  });
};

export const useExpenseStats = (filters?: ExpenseFilters) => {
  const { user } = useUser();
  
  return useQuery({
    queryKey: ['expense-stats', user?.id, filters],
    queryFn: async () => {
      if (!user || !isValidUserId(user.id)) {
        throw new Error('User not authenticated or invalid user ID');
      }
      
      const normalizedUserId = normalizeUserId(user.id);
      
      // Build base query with filters
      let query = supabase
        .from('expenses')
        .select('*')
        .eq('user_id', normalizedUserId);

      if (filters?.startDate) {
        query = query.gte('expense_date', filters.startDate);
      }
      if (filters?.endDate) {
        query = query.lte('expense_date', filters.endDate);
      }
      if (filters?.categoryId) {
        query = query.eq('category_id', filters.categoryId);
      }

      const { data: expenses, error } = await query;

      if (error) {
        throw new Error(`Failed to fetch expense stats: ${error.message}`);
      }

      const currentMonth = new Date().toISOString().substring(0, 7); // YYYY-MM format
      const monthlyExpenses = expenses?.filter(exp => 
        exp.expense_date.substring(0, 7) === currentMonth
      ) || [];

      // Calculate category breakdown
      const categoryMap = new Map();
      expenses?.forEach(exp => {
        const key = exp.category_name;
        if (categoryMap.has(key)) {
          const existing = categoryMap.get(key);
          categoryMap.set(key, {
            category_name: key,
            total_amount: existing.total_amount + Number(exp.total_amount),
            count: existing.count + 1
          });
        } else {
          categoryMap.set(key, {
            category_name: key,
            total_amount: Number(exp.total_amount),
            count: 1
          });
        }
      });

      // Calculate payment mode breakdown
      const paymentModeMap = new Map();
      expenses?.forEach(exp => {
        const key = exp.payment_mode;
        if (paymentModeMap.has(key)) {
          const existing = paymentModeMap.get(key);
          paymentModeMap.set(key, {
            payment_mode: key,
            total_amount: existing.total_amount + Number(exp.total_amount),
            count: existing.count + 1
          });
        } else {
          paymentModeMap.set(key, {
            payment_mode: key,
            total_amount: Number(exp.total_amount),
            count: 1
          });
        }
      });

      // Calculate monthly trend (last 12 months)
      const monthlyTrendMap = new Map();
      expenses?.forEach(exp => {
        const month = exp.expense_date.substring(0, 7);
        if (monthlyTrendMap.has(month)) {
          const existing = monthlyTrendMap.get(month);
          monthlyTrendMap.set(month, {
            month,
            total_amount: existing.total_amount + Number(exp.total_amount),
            count: existing.count + 1
          });
        } else {
          monthlyTrendMap.set(month, {
            month,
            total_amount: Number(exp.total_amount),
            count: 1
          });
        }
      });

      const stats: ExpenseStats = {
        totalExpenses: expenses?.length || 0,
        totalAmount: expenses?.reduce((sum, exp) => sum + Number(exp.total_amount), 0) || 0,
        totalTaxAmount: expenses?.reduce((sum, exp) => sum + Number(exp.tax_amount), 0) || 0,
        monthlyExpenses: monthlyExpenses.length,
        monthlyAmount: monthlyExpenses.reduce((sum, exp) => sum + Number(exp.total_amount), 0),
        categoryBreakdown: Array.from(categoryMap.values()).sort((a, b) => b.total_amount - a.total_amount),
        paymentModeBreakdown: Array.from(paymentModeMap.values()).sort((a, b) => b.total_amount - a.total_amount),
        monthlyTrend: Array.from(monthlyTrendMap.values()).sort((a, b) => a.month.localeCompare(b.month))
      };

      return stats;
    },
    enabled: !!user && isValidUserId(user?.id),
  });
};

export const useCreateExpense = () => {
  const { user } = useUser();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: tdsMasters } = useQuery({
    queryKey: ['tds-masters'],
    queryFn: async () => {
      const { data } = await supabase.from('tds_master').select('*').eq('user_id', normalizeUserId(user?.id || ''));
      return data || [];
    },
    enabled: !!user,
  });

  return useMutation({
    mutationFn: async (expenseData: CreateExpenseData) => {
      if (!user || !isValidUserId(user.id)) {
        throw new Error('User not authenticated');
      }
      
      const normalizedUserId = normalizeUserId(user.id);
      const totalAmount = Number(expenseData.amount) + Number(expenseData.tax_amount || 0);
      // Insert expense first
      const { data: createdExpense, error: createError } = await supabase
        .from('expenses')
        .insert({
          ...expenseData,
          user_id: normalizedUserId,
          total_amount: totalAmount,
          tax_amount: expenseData.tax_amount || 0,
        })
        .select()
        .single();

      if (createError) {
        throw new Error(`Failed to create expense: ${createError.message}`);
      }

      // Check vendor TDS and create tds_transaction if applicable
      let tdsAmount = 0;
      try {
        if (expenseData.vendor_id) {
          const { data: vendor } = await supabase
            .from('vendors')
            .select('id, name, linked_tds_section_id, tds_enabled, pan')
            .eq('id', expenseData.vendor_id)
            .single();

          if (vendor && vendor.tds_enabled && vendor.linked_tds_section_id) {
            // fetch tds master
            const { data: tds } = await supabase.from('tds_master').select('*').eq('id', vendor.linked_tds_section_id).single();
            if (tds) {
              // check threshold
              const gross = Number(expenseData.amount);
              const applies = gross >= Number(tds.threshold_amount || 0);
              if (applies) {
                tdsAmount = Math.round(gross * Number(tds.rate || 0) / 100 * 100) / 100;

                // insert tds transaction
                await supabase.from('tds_transactions').insert({
                  user_id: normalizedUserId,
                  related_type: 'expense',
                  related_id: createdExpense.id,
                  vendor_id: vendor.id,
                  tds_master_id: tds.id,
                  gross_amount: gross,
                  tds_amount: tdsAmount,
                  rate: Number(tds.rate || 0),
                  threshold_applied: true,
                  status: 'deducted'
                });
              }
            }
          }
        }
      } catch (err) {
        console.error('Error creating TDS transaction:', err);
      }

      // Post to ledger including tds amount
      try {
        // Lazy import to avoid circular deps
        const { postExpenseToLedger } = await import('@/utils/journalPosting');
        await postExpenseToLedger(normalizedUserId, {
          id: createdExpense.id,
          expense_date: createdExpense.expense_date,
          vendor_name: createdExpense.vendor_name,
          category_name: createdExpense.category_name,
          amount: Number(createdExpense.amount),
          tax_amount: Number(createdExpense.tax_amount || 0),
          payment_mode: createdExpense.payment_mode,
          description: createdExpense.description,
          tds_amount: tdsAmount
        });
      } catch (err) {
        console.error('Error posting expense to ledger with TDS:', err);
      }

      const data = createdExpense;

      return data as Expense;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['expense-stats'] });
      
      toast({
        title: 'Expense Created',
        description: 'New expense has been created successfully',
      });
    },
    onError: (error) => {
      toast({
        title: 'Expense Creation Failed',
        description: error instanceof Error ? error.message : 'Unknown error occurred',
        variant: 'destructive',
      });
    },
  });
};

export const useUpdateExpense = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Expense> }) => {
      const { data: updatedExpense, error } = await supabase
        .from('expenses')
        .update(data)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to update expense: ${error.message}`);
      }

      return updatedExpense as Expense;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['expense-stats'] });
      
      toast({
        title: 'Expense Updated',
        description: 'Expense has been updated successfully',
      });
    },
    onError: (error) => {
      toast({
        title: 'Expense Update Failed',
        description: error instanceof Error ? error.message : 'Unknown error occurred',
        variant: 'destructive',
      });
    },
  });
};

export const useDeleteExpense = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('expenses')
        .delete()
        .eq('id', id);

      if (error) {
        throw new Error(`Failed to delete expense: ${error.message}`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['expense-stats'] });
      
      toast({
        title: 'Expense Deleted',
        description: 'Expense has been deleted successfully',
      });
    },
    onError: (error) => {
      toast({
        title: 'Expense Deletion Failed',
        description: error instanceof Error ? error.message : 'Unknown error occurred',
        variant: 'destructive',
      });
    },
  });
};

export const useCreateExpenseCategory = () => {
  const { user } = useUser();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (categoryData: { category_name: string; description?: string }) => {
      if (!user || !isValidUserId(user.id)) {
        throw new Error('User not authenticated');
      }
      
      const normalizedUserId = normalizeUserId(user.id);
      const { data, error } = await supabase
        .from('expense_categories')
        .insert({
          ...categoryData,
          user_id: normalizedUserId,
          is_default: false,
        })
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to create expense category: ${error.message}`);
      }

      return data as ExpenseCategory;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expense-categories'] });
      
      toast({
        title: 'Category Created',
        description: 'New expense category has been created successfully',
      });
    },
    onError: (error) => {
      toast({
        title: 'Category Creation Failed',
        description: error instanceof Error ? error.message : 'Unknown error occurred',
        variant: 'destructive',
      });
    },
  });
};