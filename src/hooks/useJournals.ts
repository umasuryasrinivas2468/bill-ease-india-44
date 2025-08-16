
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useUser } from '@clerk/clerk-react';
import { normalizeUserId, isValidUserId } from '@/lib/userUtils';

export interface Journal {
  id: string;
  journal_date: string;
  journal_number: string;
  narration: string;
  user_id: string;
  status: 'draft' | 'posted' | 'void' | string;
  total_debit?: number;
  total_credit?: number;
}

export interface JournalLine {
  id: string;
  journal_id: string;
  account_id?: string;
  debit?: number;
  credit?: number;
  line_narration?: string;
}

export interface Account {
  id: string;
  user_id: string;
  account_code: string;
  account_name: string;
  account_type: string; // e.g., 'cash', 'bank', ...
}

export const useJournalsWithLines = () => {
  const { user } = useUser();

  return useQuery({
    queryKey: ['journals-with-lines', user?.id],
    queryFn: async () => {
      if (!user || !isValidUserId(user.id)) {
        throw new Error('User not authenticated or invalid user ID');
      }
      const normalizedUserId = normalizeUserId(user.id);

      const { data: journals, error: jErr } = await supabase
        .from('journals')
        .select('*')
        .eq('user_id', normalizedUserId)
        .order('journal_date', { ascending: true });

      if (jErr) {
        console.error('Error fetching journals:', jErr);
        throw jErr;
      }

      const journalIds = (journals || []).map(j => j.id);
      if (journalIds.length === 0) {
        return { journals: [], lines: [], accounts: [] as Account[] };
      }

      const { data: lines, error: lErr } = await supabase
        .from('journal_lines')
        .select('*')
        .in('journal_id', journalIds);

      if (lErr) {
        console.error('Error fetching journal lines:', lErr);
        throw lErr;
      }

      const { data: accounts, error: aErr } = await supabase
        .from('accounts')
        .select('*')
        .eq('user_id', normalizedUserId);

      if (aErr) {
        console.error('Error fetching accounts:', aErr);
        throw aErr;
      }

      return { journals: journals as Journal[], lines: (lines || []) as JournalLine[], accounts: (accounts || []) as Account[] };
    },
    enabled: !!user && isValidUserId(user?.id),
  });
};
