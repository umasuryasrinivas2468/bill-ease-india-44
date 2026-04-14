import React, { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/ClerkAuthProvider";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Upload, Bot, CheckCircle2, XCircle, AlertTriangle, Loader2,
  Plus, FileText, Sparkles, ArrowUpRight, ArrowDownRight,
  Landmark, ScanText, GitMerge, History, Save,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import * as pdfjsLib from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

// ── Types ─────────────────────────────────────────────────────────────────────
type BankTx = { date: string; description: string; deposits: number; withdrawals: number; balance: number; reference?: string };
type DetectedColumns = { date: string; description: string; deposit: string; withdrawal: string; balance: string | null; reference: string | null };
type ReconciliationResult = {
  matched: any[];
  unmatchedBank: any[];
  unmatchedLedger: any[];
  summary: { totalBankTransactions: number; totalLedgerEntries: number; matchedCount: number; unmatchedBankCount: number; unmatchedLedgerCount: number; bankBalance: number; ledgerBalance: number; difference: number };
};
type HistoryEntry = { fileName: string; importDate: string; total: number; matched: number; unmatched: number };

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtCurrency = (n: number) =>
  n != null && n !== 0 ? `₹${Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : "—";

const parseDateToISO = (dateStr: string): string => {
  if (!dateStr) return new Date().toISOString().split("T")[0];
  if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) return dateStr.slice(0, 10);
  const dmy = dateStr.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  const months: Record<string, string> = {
    jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
    jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
  };
  const dmy2 = dateStr.match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})/);
  if (dmy2) {
    const mon = months[dmy2[2].toLowerCase()];
    if (mon) return `${dmy2[3]}-${mon}-${dmy2[1].padStart(2, "0")}`;
  }
  try {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
  } catch {}
  return new Date().toISOString().split("T")[0];
};

const generateJournalNumber = () => {
  const now = new Date();
  return `JV-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}-${Date.now().toString().slice(-6)}`;
};

const extractPDFText = async (file: File): Promise<string> => {
  if (file.size > 20 * 1024 * 1024) throw new Error("PDF is too large (max 20 MB).");
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
  const pageTexts: string[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const rows: Map<number, string[]> = new Map();
    for (const item of content.items as any[]) {
      if (!item.str?.trim()) continue;
      const y = Math.round(item.transform[5]);
      if (!rows.has(y)) rows.set(y, []);
      rows.get(y)!.push(item.str.trim());
    }
    const lines = [...rows.keys()].sort((a, b) => b - a).map(y => rows.get(y)!.join("  "));
    pageTexts.push(lines.join("\n"));
  }
  return pageTexts.join("\n\n--- Page Break ---\n\n");
};

const readTextFile = (file: File): Promise<string> =>
  new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = e => res(e.target?.result as string);
    r.onerror = rej;
    r.readAsText(file);
  });

// ── Sub-components ────────────────────────────────────────────────────────────
const Step = ({ label, icon: Icon, active, done }: { label: string; icon: any; active: boolean; done: boolean }) => (
  <div className="flex items-center gap-2">
    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all ${
      done ? "bg-emerald-500 text-white" : active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
    }`}>
      {done ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
    </div>
    <span className={`text-sm font-medium hidden sm:block ${active ? "text-foreground" : done ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}>
      {label}
    </span>
  </div>
);

const StepDivider = ({ done }: { done: boolean }) => (
  <div className={`hidden sm:block h-px w-8 mx-1 ${done ? "bg-emerald-400" : "bg-border"}`} />
);

const StatCard = ({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color: "blue" | "emerald" | "rose" | "amber" }) => {
  const colors = {
    blue:    "from-blue-50 to-blue-100/50 dark:from-blue-950/40 dark:to-blue-900/20 border-blue-200 dark:border-blue-800",
    emerald: "from-emerald-50 to-emerald-100/50 dark:from-emerald-950/40 dark:to-emerald-900/20 border-emerald-200 dark:border-emerald-800",
    rose:    "from-rose-50 to-rose-100/50 dark:from-rose-950/40 dark:to-rose-900/20 border-rose-200 dark:border-rose-800",
    amber:   "from-amber-50 to-amber-100/50 dark:from-amber-950/40 dark:to-amber-900/20 border-amber-200 dark:border-amber-800",
  };
  const textColors = {
    blue: "text-blue-700 dark:text-blue-300",
    emerald: "text-emerald-700 dark:text-emerald-300",
    rose: "text-rose-700 dark:text-rose-300",
    amber: "text-amber-700 dark:text-amber-300",
  };
  return (
    <div className={`rounded-xl border p-4 ${colors[color]}`}>
      <p className="text-xs font-medium text-muted-foreground mb-1">{label}</p>
      <p className={`text-2xl font-bold ${textColors[color]}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  );
};

// ── Main Component ────────────────────────────────────────────────────────────
export default function BankReconciliation() {
  const { user } = useAuth();
  const userId = user?.id;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Parse / reconcile state
  const [bankTxns, setBankTxns] = useState<BankTx[]>([]);
  const [detectedBank, setDetectedBank] = useState("");
  const [detectedColumns, setDetectedColumns] = useState<DetectedColumns | null>(null);
  const [result, setResult] = useState<ReconciliationResult | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isReconciling, setIsReconciling] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [savedCount, setSavedCount] = useState(0);
  const [fileName, setFileName] = useState("");

  // Create-journal dialog state
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedUnmatched, setSelectedUnmatched] = useState<any>(null);
  const [bankAccountId, setBankAccountId] = useState("");
  const [counterAccountId, setCounterAccountId] = useState("");
  const [entryNarration, setEntryNarration] = useState("");
  const [entryDate, setEntryDate] = useState("");
  const [isCreatingJournal, setIsCreatingJournal] = useState(false);

  // ── Queries ───────────────────────────────────────────────────────────────
  const { data: accounts } = useQuery({
    queryKey: ["recon-accounts", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("accounts")
        .select("id, account_code, account_name, account_type, opening_balance")
        .eq("user_id", userId!)
        .eq("is_active", true)
        .order("account_code");
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
  });

  const { data: journals } = useQuery({
    queryKey: ["recon-journals", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("journals")
        .select("id, journal_date, narration, total_debit, total_credit, status")
        .eq("user_id", userId!)
        .eq("status", "posted")
        .order("journal_date", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
  });

  const { data: journalLines } = useQuery({
    queryKey: ["recon-journal-lines", userId, journals],
    queryFn: async () => {
      if (!journals?.length) return [];
      const ids = journals.map(j => j.id);
      const { data, error } = await supabase
        .from("journal_lines")
        .select("id, journal_id, account_id, debit, credit, line_narration")
        .in("journal_id", ids);
      if (error) throw error;
      return data;
    },
    enabled: !!userId && !!journals?.length,
  });

  // Reconciliation history from bank_statements table
  const { data: history, refetch: refetchHistory } = useQuery({
    queryKey: ["bank-statement-history", userId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("bank_statements")
        .select("file_name, file_import_date, status, credit, debit")
        .eq("user_id", userId!)
        .order("file_import_date", { ascending: false })
        .limit(200);
      if (error) {
        console.warn("bank_statements history:", error.message);
        return [] as HistoryEntry[];
      }
      if (!data?.length) return [] as HistoryEntry[];
      const grouped: Record<string, HistoryEntry> = {};
      for (const row of data) {
        const key = row.file_name || "Unknown file";
        if (!grouped[key]) grouped[key] = { fileName: key, importDate: row.file_import_date, total: 0, matched: 0, unmatched: 0 };
        grouped[key].total++;
        if (row.status === "matched") grouped[key].matched++;
        else grouped[key].unmatched++;
      }
      return Object.values(grouped) as HistoryEntry[];
    },
    enabled: !!userId,
  });

  // Ledger entries derived from journals + lines
  const ledgerEntries = useMemo(() => {
    if (!journals || !journalLines) return [];
    return journals.map(j => {
      const lines = journalLines.filter(l => l.journal_id === j.id);
      return {
        date: j.journal_date,
        narration: j.narration,
        debit: Number(j.total_debit || 0),
        credit: Number(j.total_credit || 0),
        lines: lines.map(l => ({
          accountId: l.account_id,
          accountName: accounts?.find(a => a.id === l.account_id)?.account_name || "Unknown",
          debit: Number(l.debit || 0),
          credit: Number(l.credit || 0),
        })),
      };
    });
  }, [journals, journalLines, accounts]);

  // Bank / cash accounts for the journal dialog
  const bankAccounts = useMemo(() => {
    if (!accounts) return [];
    return accounts.filter(a =>
      /bank|cash|current|savings|hdfc|icici|sbi|axis|kotak|pnb/i.test(a.account_name) ||
      /bank|cash/i.test(a.account_type || "")
    );
  }, [accounts]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.split(".").pop()?.toLowerCase();
    const allowed = ["text/csv", "application/pdf", "application/vnd.ms-excel", "text/plain"];
    if (!allowed.includes(file.type) && !["csv", "pdf", "txt"].includes(ext || "")) {
      toast({ title: "Unsupported file", description: "Upload a CSV or PDF bank statement.", variant: "destructive" });
      return;
    }
    setFileName(file.name);
    setIsParsing(true);
    setResult(null);
    setBankTxns([]);
    setDetectedBank("");
    setDetectedColumns(null);
    setSavedCount(0);
    try {
      const isPDF = ext === "pdf" || file.type === "application/pdf";
      const rawContent = isPDF ? await extractPDFText(file) : await readTextFile(file);
      if (!rawContent || rawContent.trim().length < 20) {
        throw new Error(isPDF
          ? "Could not extract text from this PDF. It may be scanned/image-only. Try a text-based PDF or CSV export."
          : "File appears to be empty.");
      }
      const { data, error } = await supabase.functions.invoke("bank-reconciliation", {
        body: { rawContent: rawContent.substring(0, 40000), fileType: isPDF ? "pdf" : "csv", action: "parse" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const txns: BankTx[] = (data.transactions || []).map((t: any) => ({
        date: t.date || "",
        description: t.description || t.narration || t.particulars || "",
        deposits: Number(t.deposits) || Number(t.credit) || Number(t.deposit) || 0,
        withdrawals: Number(t.withdrawals) || Number(t.debit) || Number(t.withdrawal) || 0,
        balance: Number(t.balance) || Number(t.closingBalance) || 0,
        reference: t.reference || t.ref || t.utr || undefined,
      })).filter((t: BankTx) => t.date && t.description);
      setBankTxns(txns);
      setDetectedBank(data.bankName || "Unknown");
      setDetectedColumns(data.detectedColumns || null);
      toast({
        title: "Statement parsed",
        description: `${txns.length} transactions found${data.bankName && data.bankName !== "Unknown" ? ` · ${data.bankName}` : ""}`,
      });
    } catch (err: any) {
      toast({ title: "Failed to parse statement", description: err.message, variant: "destructive" });
    } finally {
      setIsParsing(false);
    }
  };

  // Persist bank transactions (and optionally matched results) to Supabase
  const saveToDatabase = async (txns: BankTx[], reconResult?: ReconciliationResult) => {
    if (!userId || !txns.length) return;
    setIsSaving(true);
    try {
      const records = txns.map((t, i) => ({
        user_id: userId,
        transaction_id: t.reference || `${fileName.replace(/\.[^.]+$/, "")}-${parseDateToISO(t.date)}-${i}`,
        transaction_date: parseDateToISO(t.date),
        description: t.description,
        debit: t.withdrawals || 0,
        credit: t.deposits || 0,
        balance: t.balance || null,
        status: "unmatched",
        file_name: fileName,
      }));

      const { data: saved, error } = await (supabase as any)
        .from("bank_statements")
        .upsert(records, { onConflict: "user_id,transaction_id,transaction_date" })
        .select();

      if (error) throw error;

      // Update matched transactions in DB
      if (reconResult?.matched?.length && saved?.length) {
        for (const match of reconResult.matched) {
          const bTx = match.bankTransaction;
          const lEntry = match.ledgerEntry;
          const matchedJournal = journals?.find(j =>
            j.journal_date === lEntry?.date && j.narration === lEntry?.narration
          );
          const savedStmt = saved.find((s: any) =>
            s.description === bTx?.description &&
            s.transaction_date === parseDateToISO(bTx?.date || "")
          );
          if (savedStmt && matchedJournal) {
            await (supabase as any)
              .from("bank_statements")
              .update({ status: "matched", matched_journal_id: matchedJournal.id })
              .eq("id", savedStmt.id);

            await (supabase as any)
              .from("bank_statement_reconciliation")
              .upsert(
                { user_id: userId, bank_statement_id: savedStmt.id, journal_id: matchedJournal.id, match_score: 1.0, match_type: "exact" },
                { onConflict: "bank_statement_id,journal_id" }
              );
          }
        }
      }

      setSavedCount(records.length);
      refetchHistory();
    } catch (err: any) {
      console.warn("DB save:", err.message);
      // Non-fatal — results still shown in UI
    } finally {
      setIsSaving(false);
    }
  };

  const handleReconcile = async () => {
    if (!bankTxns.length) return toast({ title: "No bank transactions", variant: "destructive" });
    if (!ledgerEntries.length) return toast({ title: "No ledger entries found", description: "Post some journal entries first.", variant: "destructive" });
    setIsReconciling(true);
    try {
      const bankData = bankTxns.map(t => ({
        date: t.date,
        description: t.description,
        amount: t.deposits || t.withdrawals,
        type: t.deposits > 0 ? "deposit" : "withdrawal",
      }));
      const { data, error } = await supabase.functions.invoke("bank-reconciliation", {
        body: { bankTransactions: bankData, ledgerEntries, action: "reconcile" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setResult(data);
      toast({
        title: "Reconciliation complete",
        description: `${data.summary?.matchedCount || 0} matched · ${data.summary?.unmatchedBankCount || 0} unmatched`,
      });
      // Persist results in background
      saveToDatabase(bankTxns, data);
    } catch (err: any) {
      toast({ title: "Reconciliation failed", description: err.message, variant: "destructive" });
    } finally {
      setIsReconciling(false);
    }
  };

  const openCreateDialog = (unmatched: any) => {
    setSelectedUnmatched(unmatched);
    setEntryNarration(unmatched.suggestedLedgerEntry?.narration || unmatched.description || "");
    setEntryDate(parseDateToISO(unmatched.date));
    setBankAccountId(bankAccounts[0]?.id || accounts?.[0]?.id || "");
    const suggestedName = (unmatched.suggestedLedgerEntry?.accountName || "").toLowerCase();
    const found = accounts?.find(a => suggestedName && a.account_name.toLowerCase().includes(suggestedName));
    setCounterAccountId(found?.id || "");
    setShowCreateDialog(true);
  };

  const handleCreateJournal = async () => {
    if (!userId || !selectedUnmatched || !bankAccountId || !counterAccountId) {
      toast({ title: "Select both accounts before creating", variant: "destructive" });
      return;
    }
    setIsCreatingJournal(true);
    try {
      const amount = selectedUnmatched.amount || 0;
      const isDeposit = selectedUnmatched.type === "deposit";

      const { data: journal, error: jErr } = await supabase
        .from("journals")
        .insert({
          user_id: userId,
          journal_number: generateJournalNumber(),
          journal_date: entryDate,
          narration: entryNarration,
          total_debit: amount,
          total_credit: amount,
          status: "posted",
        })
        .select()
        .single();
      if (jErr) throw jErr;

      // Deposit → Bank Dr, Counter Cr | Withdrawal → Counter Dr, Bank Cr
      const { error: lErr } = await supabase.from("journal_lines").insert([
        {
          journal_id: journal.id,
          account_id: bankAccountId,
          debit: isDeposit ? amount : 0,
          credit: isDeposit ? 0 : amount,
          line_narration: entryNarration,
        },
        {
          journal_id: journal.id,
          account_id: counterAccountId,
          debit: isDeposit ? 0 : amount,
          credit: isDeposit ? amount : 0,
          line_narration: entryNarration,
        },
      ]);
      if (lErr) throw lErr;

      // Try to mark bank statement as matched
      await (supabase as any)
        .from("bank_statements")
        .update({ status: "matched", matched_journal_id: journal.id })
        .eq("user_id", userId)
        .eq("description", selectedUnmatched.description)
        .eq("transaction_date", parseDateToISO(selectedUnmatched.date))
        .then(() => {/* non-fatal */});

      queryClient.invalidateQueries({ queryKey: ["recon-journals"] });
      refetchHistory();
      setShowCreateDialog(false);
      toast({ title: "Journal entry created", description: `${entryNarration} · ${fmtCurrency(amount)}` });
    } catch (err: any) {
      toast({ title: "Failed to create journal", description: err.message, variant: "destructive" });
    } finally {
      setIsCreatingJournal(false);
    }
  };

  const totalDeposits = bankTxns.reduce((s, t) => s + t.deposits, 0);
  const totalWithdrawals = bankTxns.reduce((s, t) => s + t.withdrawals, 0);
  const step = result ? 3 : bankTxns.length > 0 ? 2 : isParsing ? 1 : 0;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Landmark className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Bank Reconciliation</h1>
            <p className="text-muted-foreground text-xs mt-0.5">AI-powered statement matching against your ledger</p>
          </div>
        </div>
        <div className="flex items-center gap-1 sm:ml-auto">
          <Step label="Upload" icon={Upload} active={step === 0 || isParsing} done={step >= 1} />
          <StepDivider done={step >= 1} />
          <Step label="Parse" icon={ScanText} active={isParsing} done={step >= 2} />
          <StepDivider done={step >= 2} />
          <Step label="Reconcile" icon={GitMerge} active={step === 2} done={step === 3} />
        </div>
      </div>

      {/* Upload zone */}
      <Card className="overflow-hidden border-dashed border-2 hover:border-primary/50 transition-colors">
        <CardContent className="p-0">
          <div className="flex flex-col md:flex-row">
            <label className={`flex-1 flex flex-col items-center justify-center gap-3 cursor-pointer px-6 py-10 transition-colors ${isParsing ? "opacity-60 pointer-events-none" : "hover:bg-accent/30"}`}>
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${isParsing ? "bg-primary/10 animate-pulse" : "bg-primary/10"}`}>
                {isParsing ? <Loader2 className="h-7 w-7 text-primary animate-spin" /> : <Upload className="h-7 w-7 text-primary" />}
              </div>
              <div className="text-center">
                <p className="font-semibold text-sm">
                  {isParsing ? "Parsing with AI…" : fileName || "Drop your bank statement here"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {isParsing ? "Extracting transactions from your statement" : "Supports PDF and CSV — any Indian bank format"}
                </p>
              </div>
              {!isParsing && (
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary">
                  <Sparkles className="h-3 w-3" /> Aczen AI parsing
                </span>
              )}
              <input type="file" accept=".csv,.pdf,.txt" className="hidden" onChange={handleFileUpload} disabled={isParsing} />
            </label>

            <div className="md:w-64 border-t md:border-t-0 md:border-l bg-muted/30 flex flex-col justify-between p-5 gap-4">
              {bankTxns.length > 0 ? (
                <>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Transactions</span>
                      <Badge variant="secondary" className="gap-1 font-semibold"><FileText className="h-3 w-3" />{bankTxns.length}</Badge>
                    </div>
                    {detectedBank && detectedBank !== "Unknown" && (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Bank</span>
                        <Badge variant="outline" className="gap-1 text-xs"><Landmark className="h-2.5 w-2.5" />{detectedBank}</Badge>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Deposits</span>
                      <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">{fmtCurrency(totalDeposits)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Withdrawals</span>
                      <span className="text-xs font-semibold text-rose-600 dark:text-rose-400">{fmtCurrency(totalWithdrawals)}</span>
                    </div>
                    {savedCount > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Saved to DB</span>
                        <Badge variant="outline" className="text-xs gap-1 text-emerald-600 border-emerald-300">
                          <CheckCircle2 className="h-2.5 w-2.5" />{savedCount}
                        </Badge>
                      </div>
                    )}
                  </div>
                  <Button onClick={handleReconcile} disabled={isReconciling || isSaving} className="w-full gap-2">
                    {isReconciling
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : isSaving
                      ? <Save className="h-4 w-4 animate-pulse" />
                      : <Bot className="h-4 w-4" />}
                    {isReconciling ? "Reconciling…" : isSaving ? "Saving…" : "AI Reconcile"}
                  </Button>
                </>
              ) : (
                <div className="flex flex-col gap-3 justify-center h-full text-center">
                  <p className="text-xs text-muted-foreground">Supported formats</p>
                  <div className="flex flex-wrap gap-1.5 justify-center">
                    {["SBI", "HDFC", "ICICI", "Axis", "Kotak", "PNB", "BOB"].map(b => (
                      <span key={b} className="text-xs border rounded px-2 py-0.5 text-muted-foreground">{b}</span>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">+ any other bank</p>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* AI Column Mapping */}
      {detectedColumns && (
        <Card className="border-primary/20">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
              </div>
              <span className="text-sm font-semibold">AI Detected Column Mapping</span>
              {detectedBank && detectedBank !== "Unknown" && (
                <Badge variant="outline" className="ml-auto text-xs gap-1"><Landmark className="h-3 w-3" />{detectedBank}</Badge>
              )}
            </div>
            <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
              {Object.entries(detectedColumns).map(([key, val]) => val && (
                <div key={key} className="rounded-lg bg-muted/60 border px-3 py-2 text-center">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{key}</p>
                  <p className="text-xs font-semibold mt-0.5 truncate">{String(val)}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary stats */}
      {result?.summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Bank Transactions" value={result.summary.totalBankTransactions} color="blue" />
          <StatCard label="Matched" value={result.summary.matchedCount} sub={`of ${result.summary.totalBankTransactions}`} color="emerald" />
          <StatCard label="Unmatched (Bank)" value={result.summary.unmatchedBankCount} color="amber" />
          <StatCard
            label="Difference"
            value={fmtCurrency(Math.abs(result.summary.difference || 0))}
            sub={result.summary.difference === 0 ? "Fully reconciled ✓" : "Needs attention"}
            color={result.summary.difference === 0 ? "emerald" : "rose"}
          />
        </div>
      )}

      {/* Parsed transactions table */}
      {bankTxns.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <ScanText className="h-4 w-4 text-primary" /> Parsed Bank Transactions
                </CardTitle>
                <CardDescription className="mt-0.5 text-xs">
                  {bankTxns.length} transactions
                  {detectedBank && detectedBank !== "Unknown" ? ` · ${detectedBank}` : ""}
                  {" · "}
                  <span className="text-emerald-600 dark:text-emerald-400 font-medium">{fmtCurrency(totalDeposits)} deposits</span>
                  {" · "}
                  <span className="text-rose-600 dark:text-rose-400 font-medium">{fmtCurrency(totalWithdrawals)} withdrawals</span>
                </CardDescription>
              </div>
              {fileName && <Badge variant="outline" className="text-xs gap-1.5 shrink-0"><FileText className="h-3 w-3" />{fileName}</Badge>}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-auto max-h-[460px]">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm">
                  <TableRow className="border-b-2">
                    <TableHead className="w-10 text-center pl-4">#</TableHead>
                    <TableHead className="w-28">Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right w-36 text-emerald-700 dark:text-emerald-400">
                      <span className="flex items-center justify-end gap-1"><ArrowUpRight className="h-3.5 w-3.5" /> Deposit</span>
                    </TableHead>
                    <TableHead className="text-right w-36 text-rose-600 dark:text-rose-400">
                      <span className="flex items-center justify-end gap-1"><ArrowDownRight className="h-3.5 w-3.5" /> Withdrawal</span>
                    </TableHead>
                    <TableHead className="text-right w-36">Balance</TableHead>
                    <TableHead className="w-32">Ref</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bankTxns.map((t, i) => (
                    <TableRow key={i} className={`transition-colors ${t.withdrawals > 0 ? "hover:bg-rose-50/60 dark:hover:bg-rose-950/20" : t.deposits > 0 ? "hover:bg-emerald-50/60 dark:hover:bg-emerald-950/20" : "hover:bg-muted/40"}`}>
                      <TableCell className="text-center pl-4"><span className="text-[11px] text-muted-foreground font-mono">{i + 1}</span></TableCell>
                      <TableCell><span className="font-mono text-xs bg-muted/50 rounded px-1.5 py-0.5 whitespace-nowrap">{t.date}</span></TableCell>
                      <TableCell className="max-w-xs"><p className="text-sm leading-snug line-clamp-2">{t.description}</p></TableCell>
                      <TableCell className="text-right">
                        {t.deposits ? <span className="font-semibold text-emerald-600 dark:text-emerald-400 font-mono text-sm">{fmtCurrency(t.deposits)}</span> : <span className="text-muted-foreground/30">—</span>}
                      </TableCell>
                      <TableCell className="text-right">
                        {t.withdrawals ? <span className="font-semibold text-rose-600 dark:text-rose-400 font-mono text-sm">{fmtCurrency(t.withdrawals)}</span> : <span className="text-muted-foreground/30">—</span>}
                      </TableCell>
                      <TableCell className="text-right">
                        {t.balance ? <span className="font-mono text-sm">{fmtCurrency(t.balance)}</span> : <span className="text-muted-foreground/30">—</span>}
                      </TableCell>
                      <TableCell>
                        {t.reference ? <span className="font-mono text-[11px] text-muted-foreground bg-muted/50 rounded px-1.5 py-0.5">{t.reference}</span> : <span className="text-muted-foreground/30 text-xs">—</span>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="border-t px-4 py-3 bg-muted/20 flex items-center justify-end gap-6 text-sm">
              <span className="text-muted-foreground text-xs">Totals</span>
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">{fmtCurrency(totalDeposits)}</span>
              <span className="font-semibold text-rose-600 dark:text-rose-400">{fmtCurrency(totalWithdrawals)}</span>
              <span className="w-36" /><span className="w-32" />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Reconciliation results tabs */}
      {result && (
        <Tabs defaultValue="matched" className="space-y-4">
          <TabsList className="h-10 p-1 gap-1">
            <TabsTrigger value="matched" className="gap-1.5 data-[state=active]:bg-emerald-100 data-[state=active]:text-emerald-800 dark:data-[state=active]:bg-emerald-900/40 dark:data-[state=active]:text-emerald-300">
              <CheckCircle2 className="h-3.5 w-3.5" /> Matched
              <Badge variant="secondary" className="ml-1 text-[10px] h-4 px-1.5 bg-emerald-200 text-emerald-800 dark:bg-emerald-800 dark:text-emerald-200">{result.matched?.length || 0}</Badge>
            </TabsTrigger>
            <TabsTrigger value="unmatched-bank" className="gap-1.5 data-[state=active]:bg-amber-100 data-[state=active]:text-amber-800 dark:data-[state=active]:bg-amber-900/40 dark:data-[state=active]:text-amber-300">
              <XCircle className="h-3.5 w-3.5" /> Unmatched Bank
              <Badge variant="secondary" className="ml-1 text-[10px] h-4 px-1.5 bg-amber-200 text-amber-800 dark:bg-amber-800 dark:text-amber-200">{result.unmatchedBank?.length || 0}</Badge>
            </TabsTrigger>
            <TabsTrigger value="unmatched-ledger" className="gap-1.5 data-[state=active]:bg-rose-100 data-[state=active]:text-rose-800 dark:data-[state=active]:bg-rose-900/40 dark:data-[state=active]:text-rose-300">
              <AlertTriangle className="h-3.5 w-3.5" /> Unmatched Ledger
              <Badge variant="secondary" className="ml-1 text-[10px] h-4 px-1.5 bg-rose-200 text-rose-800 dark:bg-rose-800 dark:text-rose-200">{result.unmatchedLedger?.length || 0}</Badge>
            </TabsTrigger>
          </TabsList>

          {/* Matched */}
          <TabsContent value="matched">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-500" /> Matched Transactions</CardTitle>
                <CardDescription className="text-xs">Bank entries paired with a ledger journal</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {result.matched?.length ? (
                  <div className="overflow-auto">
                    <Table>
                      <TableHeader className="bg-muted/40">
                        <TableRow>
                          <TableHead className="pl-4">Date</TableHead>
                          <TableHead>Bank Description</TableHead>
                          <TableHead>Ledger Narration</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                          <TableHead className="text-center pr-4">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {result.matched.map((m: any, i: number) => (
                          <TableRow key={i} className="hover:bg-emerald-50/40 dark:hover:bg-emerald-950/20">
                            <TableCell className="pl-4"><span className="font-mono text-xs bg-muted/50 rounded px-1.5 py-0.5">{m.bankTransaction?.date}</span></TableCell>
                            <TableCell className="text-sm max-w-[200px]"><p className="line-clamp-2">{m.bankTransaction?.description}</p></TableCell>
                            <TableCell className="text-sm max-w-[200px] text-muted-foreground"><p className="line-clamp-2">{m.ledgerEntry?.narration}</p></TableCell>
                            <TableCell className="text-right font-mono font-semibold text-sm">{fmtCurrency(m.bankTransaction?.amount || 0)}</TableCell>
                            <TableCell className="text-center pr-4">
                              <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 gap-1">
                                <CheckCircle2 className="h-3 w-3" /> Matched
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-14 text-center">
                    <XCircle className="h-10 w-10 text-muted-foreground/30 mb-3" />
                    <p className="text-muted-foreground text-sm font-medium">No matched transactions</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Unmatched Bank */}
          <TabsContent value="unmatched-bank">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2"><XCircle className="h-4 w-4 text-amber-500" /> Unmatched Bank Transactions</CardTitle>
                <CardDescription className="text-xs">No ledger entry found — create journal entries to reconcile</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {result.unmatchedBank?.length ? (
                  <div className="overflow-auto">
                    <Table>
                      <TableHeader className="bg-muted/40">
                        <TableRow>
                          <TableHead className="pl-4">Date</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Reason</TableHead>
                          <TableHead className="text-right pr-4">Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {result.unmatchedBank.map((u: any, i: number) => (
                          <TableRow key={i} className="hover:bg-amber-50/40 dark:hover:bg-amber-950/20">
                            <TableCell className="pl-4"><span className="font-mono text-xs bg-muted/50 rounded px-1.5 py-0.5">{u.date}</span></TableCell>
                            <TableCell className="text-sm max-w-[200px]"><p className="line-clamp-2">{u.description}</p></TableCell>
                            <TableCell className="text-right font-mono font-semibold text-sm">
                              <span className={u.type === "withdrawal" ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"}>
                                {fmtCurrency(u.amount || 0)}
                              </span>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className={`text-xs gap-1 ${u.type === "withdrawal" ? "text-rose-600 border-rose-200" : "text-emerald-700 border-emerald-200"}`}>
                                {u.type === "withdrawal" ? <ArrowDownRight className="h-3 w-3" /> : <ArrowUpRight className="h-3 w-3" />}
                                {u.type}
                              </Badge>
                            </TableCell>
                            <TableCell><Badge variant="secondary" className="text-xs">{u.reason}</Badge></TableCell>
                            <TableCell className="text-right pr-4">
                              <Button size="sm" variant="outline" onClick={() => openCreateDialog(u)} className="h-7 text-xs gap-1">
                                <Plus className="h-3 w-3" /> Create Entry
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-14 text-center">
                    <CheckCircle2 className="h-10 w-10 text-emerald-400/60 mb-3" />
                    <p className="text-muted-foreground text-sm font-medium">All bank transactions matched!</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Unmatched Ledger */}
          <TabsContent value="unmatched-ledger">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-rose-500" /> Unmatched Ledger Entries</CardTitle>
                <CardDescription className="text-xs">Posted journals with no corresponding bank transaction</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {result.unmatchedLedger?.length ? (
                  <div className="overflow-auto">
                    <Table>
                      <TableHeader className="bg-muted/40">
                        <TableRow>
                          <TableHead className="pl-4">Date</TableHead>
                          <TableHead>Narration</TableHead>
                          <TableHead className="text-right">Debit</TableHead>
                          <TableHead className="text-right">Credit</TableHead>
                          <TableHead className="pr-4">Reason</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {result.unmatchedLedger.map((u: any, i: number) => (
                          <TableRow key={i} className="hover:bg-rose-50/40 dark:hover:bg-rose-950/20">
                            <TableCell className="pl-4"><span className="font-mono text-xs bg-muted/50 rounded px-1.5 py-0.5">{u.date}</span></TableCell>
                            <TableCell className="text-sm max-w-[240px]"><p className="line-clamp-2">{u.narration}</p></TableCell>
                            <TableCell className="text-right font-mono text-sm text-rose-600 dark:text-rose-400">{u.debit ? fmtCurrency(u.debit) : "—"}</TableCell>
                            <TableCell className="text-right font-mono text-sm text-emerald-600 dark:text-emerald-400">{u.credit ? fmtCurrency(u.credit) : "—"}</TableCell>
                            <TableCell className="pr-4"><Badge variant="secondary" className="text-xs">{u.reason}</Badge></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-14 text-center">
                    <CheckCircle2 className="h-10 w-10 text-emerald-400/60 mb-3" />
                    <p className="text-muted-foreground text-sm font-medium">All ledger entries matched!</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      {/* Reconciliation history */}
      {history && history.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><History className="h-4 w-4 text-primary" /> Reconciliation History</CardTitle>
            <CardDescription className="text-xs">Previously imported bank statement files</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-auto">
              <Table>
                <TableHeader className="bg-muted/40">
                  <TableRow>
                    <TableHead className="pl-4">File</TableHead>
                    <TableHead>Imported</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Matched</TableHead>
                    <TableHead className="text-right pr-4">Unmatched</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map((h, i) => (
                    <TableRow key={i} className="hover:bg-muted/30">
                      <TableCell className="pl-4">
                        <div className="flex items-center gap-2">
                          <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="text-sm font-medium truncate max-w-[220px]">{h.fileName}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(h.importDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                      </TableCell>
                      <TableCell className="text-right"><Badge variant="secondary" className="text-xs">{h.total}</Badge></TableCell>
                      <TableCell className="text-right">
                        <Badge variant="outline" className="text-xs gap-1 text-emerald-700 border-emerald-300 dark:text-emerald-400">
                          <CheckCircle2 className="h-2.5 w-2.5" />{h.matched}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right pr-4">
                        {h.unmatched > 0 ? (
                          <Badge variant="outline" className="text-xs gap-1 text-amber-700 border-amber-300 dark:text-amber-400">
                            <AlertTriangle className="h-2.5 w-2.5" />{h.unmatched}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs text-emerald-600 border-emerald-300">All matched</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Create Journal Entry dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" /> Create Journal Entry
            </DialogTitle>
          </DialogHeader>

          {selectedUnmatched && (
            <div className="space-y-4">
              {/* Bank transaction summary */}
              <div className="rounded-xl border bg-muted/30 p-4">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Bank Transaction</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                  <div>
                    <span className="text-xs text-muted-foreground">Date</span>
                    <p className="font-mono font-medium">{selectedUnmatched.date}</p>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">Amount</span>
                    <p className={`font-mono font-semibold ${selectedUnmatched.type === "deposit" ? "text-emerald-600" : "text-rose-600"}`}>
                      {fmtCurrency(selectedUnmatched.amount || 0)}
                      <span className="text-xs text-muted-foreground ml-1">({selectedUnmatched.type})</span>
                    </p>
                  </div>
                  <div className="col-span-2">
                    <span className="text-xs text-muted-foreground">Description</span>
                    <p className="font-medium line-clamp-2">{selectedUnmatched.description}</p>
                  </div>
                </div>
              </div>

              {/* Form fields */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Journal Date</Label>
                  <Input type="date" value={entryDate} onChange={e => setEntryDate(e.target.value)} className="h-8 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Amount</Label>
                  <Input value={fmtCurrency(selectedUnmatched.amount || 0)} readOnly className="h-8 text-sm bg-muted/50" />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Narration</Label>
                <Input value={entryNarration} onChange={e => setEntryNarration(e.target.value)} placeholder="Journal narration…" className="h-8 text-sm" />
              </div>

              {/* Double-entry lines */}
              <div className="rounded-lg border overflow-hidden">
                <div className="bg-muted/50 px-3 py-2 grid grid-cols-[1fr_72px_72px] text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <span>Account</span>
                  <span className="text-right">Debit</span>
                  <span className="text-right">Credit</span>
                </div>

                {/* Bank account row */}
                <div className="px-3 py-2.5 border-b grid grid-cols-[1fr_72px_72px] items-center gap-2">
                  <div className="space-y-1 min-w-0">
                    <p className="text-[10px] text-muted-foreground">Bank / Cash Account</p>
                    <Select value={bankAccountId} onValueChange={setBankAccountId}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Select bank account" />
                      </SelectTrigger>
                      <SelectContent>
                        {(bankAccounts.length > 0 ? bankAccounts : accounts || []).map(a => (
                          <SelectItem key={a.id} value={a.id} className="text-xs">
                            {a.account_code} · {a.account_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <p className={`text-right text-sm font-mono font-semibold ${selectedUnmatched.type === "deposit" ? "text-rose-600" : "text-muted-foreground/30"}`}>
                    {selectedUnmatched.type === "deposit" ? fmtCurrency(selectedUnmatched.amount) : "—"}
                  </p>
                  <p className={`text-right text-sm font-mono font-semibold ${selectedUnmatched.type === "withdrawal" ? "text-emerald-600" : "text-muted-foreground/30"}`}>
                    {selectedUnmatched.type === "withdrawal" ? fmtCurrency(selectedUnmatched.amount) : "—"}
                  </p>
                </div>

                {/* Counterpart account row */}
                <div className="px-3 py-2.5 grid grid-cols-[1fr_72px_72px] items-center gap-2">
                  <div className="space-y-1 min-w-0">
                    <p className="text-[10px] text-muted-foreground">
                      {selectedUnmatched.suggestedLedgerEntry?.accountName
                        ? `AI: ${selectedUnmatched.suggestedLedgerEntry.accountName}`
                        : "Counterpart Account"}
                    </p>
                    <Select value={counterAccountId} onValueChange={setCounterAccountId}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Select account" />
                      </SelectTrigger>
                      <SelectContent>
                        {(accounts || []).map(a => (
                          <SelectItem key={a.id} value={a.id} className="text-xs">
                            {a.account_code} · {a.account_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <p className={`text-right text-sm font-mono font-semibold ${selectedUnmatched.type === "withdrawal" ? "text-rose-600" : "text-muted-foreground/30"}`}>
                    {selectedUnmatched.type === "withdrawal" ? fmtCurrency(selectedUnmatched.amount) : "—"}
                  </p>
                  <p className={`text-right text-sm font-mono font-semibold ${selectedUnmatched.type === "deposit" ? "text-emerald-600" : "text-muted-foreground/30"}`}>
                    {selectedUnmatched.type === "deposit" ? fmtCurrency(selectedUnmatched.amount) : "—"}
                  </p>
                </div>
              </div>

              <div className="flex justify-end gap-6 pr-1 text-xs text-muted-foreground">
                <span>Total Dr: <span className="font-semibold text-foreground">{fmtCurrency(selectedUnmatched.amount || 0)}</span></span>
                <span>Total Cr: <span className="font-semibold text-foreground">{fmtCurrency(selectedUnmatched.amount || 0)}</span></span>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 mt-2">
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancel</Button>
            <Button onClick={handleCreateJournal} disabled={isCreatingJournal || !bankAccountId || !counterAccountId} className="gap-2">
              {isCreatingJournal ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {isCreatingJournal ? "Creating…" : "Create Journal Entry"}

            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
