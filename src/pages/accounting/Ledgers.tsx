
import React, { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/ClerkAuthProvider";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Upload } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import ImportDialog from "@/components/ImportDialog";

type Account = {
  id: string;
  account_code: string;
  account_name: string;
  opening_balance: number;
};

type Line = {
  id: string;
  journal_id: string;
  debit: number | null;
  credit: number | null;
  created_at: string;
};

type Journal = {
  id: string;
  journal_date: string;
  narration: string;
};

export default function Ledgers() {
  const { user } = useAuth();
  const userId = user?.id as string | undefined;
  const [accountId, setAccountId] = useState<string>("");
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: accounts } = useQuery({
    queryKey: ["accounts", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("accounts")
        .select("id, account_code, account_name, opening_balance")
        .eq("user_id", userId as string)
        .order("account_code", { ascending: true });
      if (error) throw error;
      return data as Account[];
    },
    enabled: !!userId,
    staleTime: 60_000,
  });

  const { data: lines } = useQuery({
    queryKey: ["ledger-lines", userId, accountId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("journal_lines")
        .select("id, journal_id, debit, credit, created_at")
        .eq("account_id", accountId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as Line[];
    },
    enabled: !!userId && !!accountId,
  });

  const journalIds = useMemo(() => (lines || []).map((l) => l.journal_id), [lines]);

  const { data: journalsMap } = useQuery({
    queryKey: ["ledger-journals", userId, journalIds],
    queryFn: async () => {
      if (!journalIds.length) return {} as Record<string, Journal>;
      const { data, error } = await supabase
        .from("journals")
        .select("id, journal_date, narration")
        .in("id", journalIds);
      if (error) throw error;
      const map: Record<string, Journal> = {};
      (data as Journal[]).forEach((j) => (map[j.id] = j));
      return map;
    },
    enabled: !!userId && journalIds.length > 0,
  });

  const selectedAccount = (accounts || []).find((a) => a.id === accountId);
  const opening = Number(selectedAccount?.opening_balance || 0);

  const handleImportLedgers = async (validRows: any[]) => {
    try {
      if (!userId) {
        throw new Error('User not authenticated');
      }

      // Import as accounts (ledger accounts)
      const accountsToInsert = validRows.map((row, index) => ({
        user_id: userId,
        account_name: row.ledger_name,
        account_code: `ACC${String(Date.now() + index).slice(-6)}`,
        account_type: 'Asset', // Default type
        opening_balance: parseFloat(row.opening_balance || 0),
        is_active: true,
      }));

      const { error } = await supabase.from('accounts').insert(accountsToInsert);
      if (error) throw error;

      // Refetch accounts data
      await queryClient.invalidateQueries({ queryKey: ['accounts'] });

      setIsImportDialogOpen(false);
      toast({
        title: 'Import Successful',
        description: `${validRows.length} ledger accounts imported successfully.`,
      });
    } catch (err) {
      console.error('Import error:', err);
      toast({
        title: 'Import Failed',
        description: 'Failed to import ledger accounts. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const rows = useMemo(() => {
    const sorted = (lines || []).slice().sort((a, b) => {
      const ja = journalsMap?.[a.journal_id]?.journal_date || a.created_at;
      const jb = journalsMap?.[b.journal_id]?.journal_date || b.created_at;
      return ja.localeCompare(jb) || a.created_at.localeCompare(b.created_at);
    });
    let running = opening;
    return sorted.map((l) => {
      const debit = Number(l.debit || 0);
      const credit = Number(l.credit || 0);
      running = running + debit - credit;
      const j = journalsMap?.[l.journal_id];
      return {
        id: l.id,
        date: j?.journal_date || l.created_at.slice(0, 10),
        narration: j?.narration || "",
        debit: debit,
        credit: credit,
        running,
      };
    });
  }, [lines, journalsMap, opening]);

  return (
    <div className="p-4 space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Ledgers</h1>
          <p className="text-muted-foreground text-sm mt-1">View account ledgers and transaction history</p>
        </div>
        <Button variant="outline" onClick={() => setIsImportDialogOpen(true)}>
          <Upload className="h-4 w-4 mr-2" />
          Import
        </Button>
      </div>

      <ImportDialog
        open={isImportDialogOpen}
        onOpenChange={setIsImportDialogOpen}
        moduleKey="ledgers"
        onConfirmImport={handleImportLedgers}
      />

      <Card className="p-4 space-y-4">
        <div className="max-w-sm">
          <label className="text-sm font-medium">Account</label>
          <Select value={accountId} onValueChange={setAccountId}>
            <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
            <SelectContent>
              {(accounts || []).map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.account_code} - {a.account_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {accountId && (
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Narration</TableHead>
                  <TableHead className="text-right">Debit</TableHead>
                  <TableHead className="text-right">Credit</TableHead>
                  <TableHead className="text-right">Running Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="whitespace-nowrap">—</TableCell>
                  <TableCell className="whitespace-nowrap">Opening Balance</TableCell>
                  <TableCell className="text-right">—</TableCell>
                  <TableCell className="text-right">—</TableCell>
                  <TableCell className="text-right">{opening.toFixed(2)}</TableCell>
                </TableRow>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap">{r.date}</TableCell>
                    <TableCell className="min-w-[200px]">{r.narration}</TableCell>
                    <TableCell className="text-right">{r.debit ? r.debit.toFixed(2) : ""}</TableCell>
                    <TableCell className="text-right">{r.credit ? r.credit.toFixed(2) : ""}</TableCell>
                    <TableCell className="text-right">{r.running.toFixed(2)}</TableCell>
                  </TableRow>
                ))}
                {rows.length === 0 && (
                  <TableRow><TableCell colSpan={5}>No transactions for this account.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}

