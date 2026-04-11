
import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/ClerkAuthProvider";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Account = {
  id: string;
  account_code: string;
  account_name: string;
};

type Line = {
  account_id: string;
  debit: number | null;
  credit: number | null;
};

export default function TrialBalance() {
  const { user } = useAuth();
  const userId = user?.id as string | undefined;

  const { data: accounts } = useQuery({
    queryKey: ["accounts", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("accounts")
        .select("id, account_code, account_name")
        .eq("user_id", userId as string)
        .order("account_code");
      if (error) throw error;
      return data as Account[];
    },
    enabled: !!userId,
  });

  const { data: lines } = useQuery({
    queryKey: ["trial-lines", userId],
    queryFn: async () => {
      // RLS ensures only current user's lines are returned
      const { data, error } = await supabase
        .from("journal_lines")
        .select("account_id, debit, credit");
      if (error) throw error;
      return data as Line[];
    },
    enabled: !!userId,
  });

  const rows = useMemo(() => {
    const sums = new Map<string, { debit: number; credit: number }>();
    (lines || []).forEach((l) => {
      const key = l.account_id;
      const prev = sums.get(key) || { debit: 0, credit: 0 };
      prev.debit += Number(l.debit || 0);
      prev.credit += Number(l.credit || 0);
      sums.set(key, prev);
    });
    const result = (accounts || []).map((a) => {
      const s = sums.get(a.id) || { debit: 0, credit: 0 };
      return {
        id: a.id,
        code: a.account_code,
        name: a.account_name,
        debit: s.debit,
        credit: s.credit,
      };
    });
    return result;
  }, [accounts, lines]);

  const totals = useMemo(() => {
    const debit = rows.reduce((sum, r) => sum + r.debit, 0);
    const credit = rows.reduce((sum, r) => sum + r.credit, 0);
    return { debit, credit, balanced: Math.abs(debit - credit) < 0.005 };
  }, [rows]);

  return (
    <div className="p-4 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Trial Balance</h1>
        <p className="text-muted-foreground text-sm mt-1">View trial balance and verify account balances</p>
      </div>

      <Card className="p-4">
        <div className="overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Account</TableHead>
                <TableHead className="text-right">Debit</TableHead>
                <TableHead className="text-right">Credit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap">{r.code}</TableCell>
                  <TableCell className="min-w-[200px]">{r.name}</TableCell>
                  <TableCell className="text-right">{r.debit ? r.debit.toFixed(2) : ""}</TableCell>
                  <TableCell className="text-right">{r.credit ? r.credit.toFixed(2) : ""}</TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell colSpan={2} className="text-right font-medium">Total</TableCell>
                <TableCell className="text-right font-medium">{totals.debit.toFixed(2)}</TableCell>
                <TableCell className="text-right font-medium">{totals.credit.toFixed(2)}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell colSpan={4} className="text-right">
                  {totals.balanced ? (
                    <span className="text-green-600 dark:text-green-500">Balanced</span>
                  ) : (
                    <span className="text-red-600 dark:text-red-500">Not balanced</span>
                  )}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}

