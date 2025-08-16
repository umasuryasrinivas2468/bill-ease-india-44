import React, { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/ClerkAuthProvider";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { PlusCircle, Trash2 } from "lucide-react";

type Account = {
  id: string;
  account_code: string;
  account_name: string;
  account_type: "Asset" | "Liability" | "Equity" | "Income" | "Expense";
};

type Journal = {
  id: string;
  journal_number: string;
  journal_date: string;
  narration: string;
  total_debit: number | null;
  total_credit: number | null;
};

type LineInput = {
  account_id: string;
  debit: string;
  credit: string;
};

function generateJournalNumber(date: string) {
  const d = date ? date.replaceAll("-", "") : "NA";
  const random = Math.floor(Math.random() * 9000 + 1000);
  return `JRN-${d}-${random}`;
}

export default function ManualJournals() {
  const { user } = useAuth();
  const userId = user?.id as string | undefined;
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [narration, setNarration] = useState("");
  const [lines, setLines] = useState<LineInput[]>([
    { account_id: "", debit: "", credit: "" },
    { account_id: "", debit: "", credit: "" },
  ]);

  const { data: accounts } = useQuery({
    queryKey: ["accounts", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("accounts")
        .select("id, account_code, account_name, account_type")
        .eq("user_id", userId as string)
        .order("account_code", { ascending: true });
      if (error) throw error;
      return data as Account[];
    },
    enabled: !!userId,
    staleTime: 60_000,
  });

  const { data: recentJournals } = useQuery({
    queryKey: ["journals", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("journals")
        .select("id, journal_number, journal_date, narration, total_debit, total_credit")
        .eq("user_id", userId as string)
        .order("journal_date", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as Journal[];
    },
    enabled: !!userId,
    staleTime: 30_000,
  });

  const totals = useMemo(() => {
    const debit = lines.reduce((sum, l) => sum + Number(l.debit || 0), 0);
    const credit = lines.reduce((sum, l) => sum + Number(l.credit || 0), 0);
    return { debit, credit, balanced: Math.abs(debit - credit) < 0.005 };
  }, [lines]);

  const addLine = () => setLines((ls) => [...ls, { account_id: "", debit: "", credit: "" }]);
  const removeLine = (idx: number) => setLines((ls) => ls.filter((_, i) => i !== idx));
  const setLine = (idx: number, patch: Partial<LineInput>) =>
    setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, ...patch } : l)));

  const createJournal = useMutation({
    mutationFn: async () => {
      // Validate
      const nonZeroLines = lines.filter((l) => Number(l.debit || 0) > 0 || Number(l.credit || 0) > 0);
      if (!date || !narration.trim() || nonZeroLines.length < 2) {
        throw new Error("Please provide Date, Narration and at least 2 lines.");
      }
      const anyBoth = nonZeroLines.some((l) => Number(l.debit || 0) > 0 && Number(l.credit || 0) > 0);
      if (anyBoth) throw new Error("Each line must have either Debit or Credit, not both.");
      const { debit, credit, balanced } = totals;
      if (!balanced || debit === 0) throw new Error("Debits and Credits must balance and be greater than 0.");

      const journal_number = generateJournalNumber(date);
      const insertJournal = await supabase
        .from("journals")
        .insert([
          {
            user_id: userId,
            journal_number,
            journal_date: date,
            narration: narration.trim(),
            status: "posted",
          },
        ])
        .select("id")
        .single();
      if (insertJournal.error) throw insertJournal.error;

      const journalId = insertJournal.data.id as string;
      const payload = nonZeroLines.map((l) => ({
        journal_id: journalId,
        account_id: l.account_id,
        debit: Number(l.debit || 0),
        credit: Number(l.credit || 0),
        line_narration: "",
      }));

      const insertLines = await supabase.from("journal_lines").insert(payload);
      if (insertLines.error) throw insertLines.error;

      return journal_number;
    },
    onSuccess: (jn) => {
      toast({ title: "Journal posted", description: `Journal ${jn} created successfully.` });
      setNarration("");
      setLines([
        { account_id: "", debit: "", credit: "" },
        { account_id: "", debit: "", credit: "" },
      ]);
      // Keep date; invalidate lists
      queryClient.invalidateQueries({ queryKey: ["journals", userId] });
    },
    meta: {
      onError: (err: any) => {
        console.error("Create journal error", err);
      },
    },
  });

  return (
    <div className="p-4 space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Manual Journals</h1>

      <Card className="p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-sm font-medium">Date</label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <label className="text-sm font-medium">Narration</label>
            <Input
              placeholder="Describe the journal"
              value={narration}
              onChange={(e) => setNarration(e.target.value)}
            />
          </div>
        </div>

        <div className="overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead className="text-right">Debit</TableHead>
                <TableHead className="text-right">Credit</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((l, idx) => (
                <TableRow key={idx}>
                  <TableCell className="min-w-[220px]">
                    <Select
                      value={l.account_id}
                      onValueChange={(v) => setLine(idx, { account_id: v })}
                    >
                      <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                      <SelectContent>
                        {(accounts || []).map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.account_code} - {a.account_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-right">
                    <Input
                      className="text-right"
                      type="number"
                      step="0.01"
                      value={l.debit}
                      onChange={(e) =>
                        setLine(idx, { debit: e.target.value, credit: e.target.value ? "" : l.credit })
                      }
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Input
                      className="text-right"
                      type="number"
                      step="0.01"
                      value={l.credit}
                      onChange={(e) =>
                        setLine(idx, { credit: e.target.value, debit: e.target.value ? "" : l.debit })
                      }
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeLine(idx)}
                      disabled={lines.length <= 2}
                      title="Remove line"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell>
                  <Button variant="secondary" onClick={addLine}>
                    <PlusCircle className="h-4 w-4 mr-2" />
                    Add line
                  </Button>
                </TableCell>
                <TableCell className="text-right font-medium">{totals.debit.toFixed(2)}</TableCell>
                <TableCell className="text-right font-medium">{totals.credit.toFixed(2)}</TableCell>
                <TableCell className="text-right font-medium">
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

        <div className="flex justify-end">
          <Button onClick={() => createJournal.mutate()} disabled={createJournal.isPending}>
            Post Journal
          </Button>
        </div>
      </Card>

      <Card className="p-4">
        <h2 className="text-lg font-medium mb-3">Recent Journals</h2>
        <div className="overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Journal No.</TableHead>
                <TableHead>Narration</TableHead>
                <TableHead className="text-right">Debit</TableHead>
                <TableHead className="text-right">Credit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(recentJournals || []).map((j) => (
                <TableRow key={j.id}>
                  <TableCell className="whitespace-nowrap">{j.journal_date}</TableCell>
                  <TableCell className="whitespace-nowrap">{j.journal_number}</TableCell>
                  <TableCell className="min-w-[200px]">{j.narration}</TableCell>
                  <TableCell className="text-right">{Number(j.total_debit || 0).toFixed(2)}</TableCell>
                  <TableCell className="text-right">{Number(j.total_credit || 0).toFixed(2)}</TableCell>
                </TableRow>
              ))}
              {(recentJournals || []).length === 0 && (
                <TableRow><TableCell colSpan={5}>No journals yet.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
