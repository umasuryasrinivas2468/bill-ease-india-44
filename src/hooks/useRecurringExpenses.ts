import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useUser } from '@clerk/clerk-react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { normalizeUserId, isValidUserId } from '@/lib/userUtils';
import { RecurringExpense, CreateRecurringExpenseData } from '@/types/expenses';
import { addDays, addWeeks, addMonths, addQuarters, addYears, format } from 'date-fns';

// Calculate the next due date based on frequency
export function calcNextDueDate(currentDue: string, frequency: RecurringExpense['frequency']): string {
  const date = new Date(currentDue);
  switch (frequency) {
    case 'daily':     return format(addDays(date, 1),    'yyyy-MM-dd');
    case 'weekly':    return format(addWeeks(date, 1),   'yyyy-MM-dd');
    case 'monthly':   return format(addMonths(date, 1),  'yyyy-MM-dd');
    case 'quarterly': return format(addQuarters(date, 1),'yyyy-MM-dd');
    case 'yearly':    return format(addYears(date, 1),   'yyyy-MM-dd');
  }
}

export const useRecurringExpenses = () => {
  const { user } = useUser();

  return useQuery({
    queryKey: ['recurring-expenses', user?.id],
    queryFn: async () => {
      if (!user || !isValidUserId(user.id)) throw new Error('User not authenticated');
      const normalizedUserId = normalizeUserId(user.id);
      const { data, error } = await supabase
        .from('recurring_expenses')
        .select('*')
        .eq('user_id', normalizedUserId)
        .order('next_due_date', { ascending: true });
      if (error) throw new Error(`Failed to fetch recurring expenses: ${error.message}`);
      return data as RecurringExpense[];
    },
    enabled: !!user && isValidUserId(user?.id),
  });
};

export const useCreateRecurringExpense = () => {
  const { user } = useUser();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: CreateRecurringExpenseData) => {
      if (!user || !isValidUserId(user.id)) throw new Error('User not authenticated');
      const normalizedUserId = normalizeUserId(user.id);
      const total_amount = Number(data.amount) + Number(data.tax_amount || 0);
      const { data: created, error } = await supabase
        .from('recurring_expenses')
        .insert({ ...data, user_id: normalizedUserId, total_amount })
        .select()
        .single();
      if (error) throw new Error(`Failed to create recurring expense: ${error.message}`);
      return created as RecurringExpense;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recurring-expenses'] });
      toast({ title: 'Recurring Expense Created', description: 'Recurring expense has been set up successfully.' });
    },
    onError: (error) => {
      toast({ title: 'Creation Failed', description: error instanceof Error ? error.message : 'Unknown error', variant: 'destructive' });
    },
  });
};

export const useUpdateRecurringExpense = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<RecurringExpense> }) => {
      const total_amount = data.amount !== undefined
        ? Number(data.amount) + Number(data.tax_amount || 0)
        : undefined;
      const { data: updated, error } = await supabase
        .from('recurring_expenses')
        .update({ ...data, ...(total_amount !== undefined ? { total_amount } : {}) })
        .eq('id', id)
        .select()
        .single();
      if (error) throw new Error(`Failed to update: ${error.message}`);
      return updated as RecurringExpense;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recurring-expenses'] });
      toast({ title: 'Updated', description: 'Recurring expense updated successfully.' });
    },
    onError: (error) => {
      toast({ title: 'Update Failed', description: error instanceof Error ? error.message : 'Unknown error', variant: 'destructive' });
    },
  });
};

export const useDeleteRecurringExpense = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('recurring_expenses').delete().eq('id', id);
      if (error) throw new Error(`Failed to delete: ${error.message}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recurring-expenses'] });
      toast({ title: 'Deleted', description: 'Recurring expense deleted.' });
    },
    onError: (error) => {
      toast({ title: 'Delete Failed', description: error instanceof Error ? error.message : 'Unknown error', variant: 'destructive' });
    },
  });
};

// Generate actual expense entries for overdue recurring expenses
export const useGenerateRecurringExpenses = () => {
  const { user } = useUser();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async () => {
      if (!user || !isValidUserId(user.id)) throw new Error('User not authenticated');
      const normalizedUserId = normalizeUserId(user.id);
      const today = format(new Date(), 'yyyy-MM-dd');

      // Fetch all active recurring expenses due today or earlier
      const { data: due, error } = await supabase
        .from('recurring_expenses')
        .select('*')
        .eq('user_id', normalizedUserId)
        .eq('is_active', true)
        .lte('next_due_date', today);

      if (error) throw new Error(error.message);
      if (!due || due.length === 0) return 0;

      let generated = 0;
      for (const rec of due as RecurringExpense[]) {
        // Skip if end_date is set and already passed
        if (rec.end_date && rec.end_date < today) {
          await supabase.from('recurring_expenses').update({ is_active: false }).eq('id', rec.id);
          continue;
        }

        // Insert actual expense
        await supabase.from('expenses').insert({
          user_id: normalizedUserId,
          vendor_name: rec.vendor_name,
          vendor_id: rec.vendor_id || null,
          expense_date: rec.next_due_date,
          category_id: rec.category_id || null,
          category_name: rec.category_name,
          description: rec.description || rec.name,
          amount: rec.amount,
          tax_amount: rec.tax_amount,
          total_amount: rec.total_amount,
          payment_mode: rec.payment_mode,
          reference_number: rec.reference_number || null,
          notes: `Auto-generated from recurring: ${rec.name}`,
          status: 'pending',
          posted_to_ledger: false,
        });

        // Advance next_due_date
        const nextDue = calcNextDueDate(rec.next_due_date, rec.frequency);
        await supabase
          .from('recurring_expenses')
          .update({ next_due_date: nextDue, last_generated_date: rec.next_due_date })
          .eq('id', rec.id);

        generated++;
      }
      return generated;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ['recurring-expenses'] });
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      if (count > 0) {
        toast({ title: 'Expenses Generated', description: `${count} recurring expense(s) have been posted.` });
      } else {
        toast({ title: 'Up to Date', description: 'No recurring expenses are due today.' });
      }
    },
    onError: (error) => {
      toast({ title: 'Failed', description: error instanceof Error ? error.message : 'Unknown error', variant: 'destructive' });
    },
  });
};
