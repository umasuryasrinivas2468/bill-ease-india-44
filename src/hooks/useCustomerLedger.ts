import { useQuery } from '@tanstack/react-query';
import { useUser } from '@clerk/clerk-react';
import { supabase } from '@/lib/supabase';
import { normalizeUserId, isValidUserId } from '@/lib/userUtils';

export type CustomerLedgerTxnType =
  | 'invoice'
  | 'payment_received'
  | 'credit_note'
  | 'customer_advance'
  | 'customer_advance_adjustment';

export interface CustomerLedgerRow {
  user_id: string;
  customer_id: string | null;
  customer_name: string;
  txn_date: string;
  txn_type: CustomerLedgerTxnType;
  source_id: string;
  reference: string | null;
  debit: number;
  credit: number;
  receivable_delta: number;
  status: string | null;
  due_date: string | null;
  notes: string | null;
  running_balance?: number;
}

export const useCustomerLedger = (customerId?: string, customerName?: string) => {
  const { user } = useUser();
  return useQuery({
    queryKey: ['customer-ledger', user?.id, customerId, customerName],
    queryFn: async () => {
      if (!user || !isValidUserId(user.id)) return [];
      const uid = normalizeUserId(user.id);
      let q = supabase
        .from('v_customer_ledger')
        .select('*')
        .eq('user_id', uid)
        .order('txn_date', { ascending: true });
      if (customerId)        q = q.eq('customer_id', customerId);
      else if (customerName) q = q.eq('customer_name', customerName);
      const { data, error } = await q;
      if (error) throw error;

      let bal = 0;
      const rows = (data || []).map((r: CustomerLedgerRow) => {
        bal += Number(r.debit || 0) - Number(r.credit || 0);
        return { ...r, running_balance: Math.round(bal * 100) / 100 };
      });
      return rows as CustomerLedgerRow[];
    },
    enabled: !!user && isValidUserId(user?.id) && (!!customerId || !!customerName),
  });
};

export interface CustomerBalanceRow {
  user_id: string;
  customer_id: string;
  customer_name: string;
  opening_balance: number;
  total_invoiced: number;
  total_received: number;
  total_credit_notes: number;
  total_advance_adjusted: number;
  closing_balance?: number;
}

/** All customers' balances — for the customer-balances grid. */
export const useCustomerBalances = () => {
  const { user } = useUser();
  return useQuery({
    queryKey: ['customer-balances', user?.id],
    queryFn: async () => {
      if (!user || !isValidUserId(user.id)) return [];
      const uid = normalizeUserId(user.id);
      const { data, error } = await supabase
        .from('v_customer_balance')
        .select('*')
        .eq('user_id', uid);
      if (error) throw error;
      return (data || []).map((r: CustomerBalanceRow) => ({
        ...r,
        closing_balance:
          Number(r.opening_balance || 0) +
          Number(r.total_invoiced || 0) -
          Number(r.total_received || 0) -
          Number(r.total_credit_notes || 0) -
          Number(r.total_advance_adjusted || 0),
      })) as CustomerBalanceRow[];
    },
    enabled: !!user && isValidUserId(user?.id),
  });
};
