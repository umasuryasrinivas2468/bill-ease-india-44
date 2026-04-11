import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useUser } from '@clerk/clerk-react';
import { normalizeUserId, isValidUserId } from '@/lib/userUtils';

export type CashflowView = 'day' | 'month';

export interface CashflowDataPoint {
  label: string;
  inflow: number;
  outflow: number;
  net: number;
}

export const useCashflowData = (view: CashflowView = 'month') => {
  const { user } = useUser();

  return useQuery({
    queryKey: ['cashflow-data', user?.id, view],
    queryFn: async (): Promise<{ points: CashflowDataPoint[]; lastUpdated: Date }> => {
      if (!user || !isValidUserId(user.id)) throw new Error('User not authenticated');

      const normalizedUserId = normalizeUserId(user.id);
      const now = new Date();

      if (view === 'day') {
        // Today's data grouped into 8 three-hour slots
        const todayStr = now.toISOString().split('T')[0];

        const [{ data: invoices }, { data: expenses }] = await Promise.all([
          supabase
            .from('invoices')
            .select('total_amount, status, created_at')
            .eq('user_id', normalizedUserId)
            .gte('created_at', `${todayStr}T00:00:00`)
            .lte('created_at', `${todayStr}T23:59:59`),
          supabase
            .from('expenses')
            .select('amount, expense_date, created_at')
            .eq('user_id', normalizedUserId)
            .eq('expense_date', todayStr),
        ]);

        // 8 slots: 0-3, 3-6, 6-9, 9-12, 12-15, 15-18, 18-21, 21-24
        const slots = [
          { start: 0, end: 3, label: '3am' },
          { start: 3, end: 6, label: '6am' },
          { start: 6, end: 9, label: '9am' },
          { start: 9, end: 12, label: '12pm' },
          { start: 12, end: 15, label: '3pm' },
          { start: 15, end: 18, label: '6pm' },
          { start: 18, end: 21, label: '9pm' },
          { start: 21, end: 24, label: '12am' },
        ];

        const points: CashflowDataPoint[] = slots.map(({ start, end, label }) => {
          const inflow =
            invoices
              ?.filter((inv) => {
                const h = new Date(inv.created_at).getHours();
                return h >= start && h < end;
              })
              .reduce((sum, inv) => sum + Number(inv.total_amount), 0) ?? 0;

          // Expenses don't have hour-level granularity, distribute evenly across the day
          const outflowTotal =
            expenses?.reduce((sum, exp) => sum + Number(exp.amount), 0) ?? 0;
          const outflow = outflowTotal / 8;

          return { label, inflow, outflow, net: inflow - outflow };
        });

        return { points, lastUpdated: now };
      } else {
        // Last 7 days
        const days = Array.from({ length: 7 }, (_, i) => {
          const d = new Date(now);
          d.setDate(d.getDate() - (6 - i));
          return d;
        });

        const startDateStr = days[0].toISOString().split('T')[0];

        const [{ data: invoices }, { data: expenses }] = await Promise.all([
          supabase
            .from('invoices')
            .select('total_amount, status, invoice_date')
            .eq('user_id', normalizedUserId)
            .gte('invoice_date', startDateStr),
          supabase
            .from('expenses')
            .select('amount, expense_date')
            .eq('user_id', normalizedUserId)
            .gte('expense_date', startDateStr),
        ]);

        const points: CashflowDataPoint[] = days.map((d) => {
          const dateStr = d.toISOString().split('T')[0];
          const label = d.toLocaleDateString('en-IN', { weekday: 'short' });

          const inflow =
            invoices
              ?.filter((inv) => inv.invoice_date === dateStr)
              .reduce((sum, inv) => sum + Number(inv.total_amount), 0) ?? 0;

          const outflow =
            expenses
              ?.filter((exp) => exp.expense_date === dateStr)
              .reduce((sum, exp) => sum + Number(exp.amount), 0) ?? 0;

          return { label, inflow, outflow, net: inflow - outflow };
        });

        return { points, lastUpdated: now };
      }
    },
    enabled: !!user && isValidUserId(user?.id),
    refetchInterval: 15000, // Refresh every 15 seconds for real-time updates
  });
};
