import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/ClerkAuthProvider";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Upload, Bot, CheckCircle2, XCircle, AlertTriangle, Loader2, ArrowRight, Plus, FileText, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

type BankTx = { date: string; description: string; deposits: number; withdrawals: number; balance: number; reference?: string };
type DetectedColumns = { date: string; description: string; deposit: string; withdrawal: string; balance: string | null; reference: string | null };
type ReconciliationResult = {
  matched: any[];
  unmatchedBank: any[];
  unmatchedLedger: any[];
  summary: { totalBankTransactions: number; totalLedgerEntries: number; matchedCount: number; unmatchedBankCount: number; unmatchedLedgerCount: number; bankBalance: number; ledgerBalance: number; difference: number };
};

const fmtCurrency = (n: number) => n ? `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—';

// Extract text from PDF using basic approach (sends raw to AI)
const readFileAsText = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    if (file.type === 'application/pdf') {
      // Read PDF as base64 for AI to process
      reader.onload = (ev) => {
        const arrayBuffer = ev.target?.result as ArrayBuffer;
        const bytes = new Uint8Array(arrayBuffer);
        // Try to extract readable text from PDF bytes
        let text = '';
        const decoder = new TextDecoder('utf-8', { fatal: false });
        text = decoder.decode(bytes);
        // Extract text between stream markers or just send raw
        const streamTexts: string[] = [];
        const streamRegex = /stream\s*\n([\s\S]*?)\nendstream/g;
        let match;
        while ((match = streamRegex.exec(text)) !== null) {
          const decoded = match[1].replace(/[^\x20-\x7E\n\r\t]/g, ' ').trim();
          if (decoded.length > 10) streamTexts.push(decoded);
        }
        // Also try to find text in parentheses (PDF text objects)
        const textObjects: string[] = [];
        const textRegex = /\(([^)]+)\)/g;
        while ((match = textRegex.exec(text)) !== null) {
          if (match[1].length > 2) textObjects.push(match[1]);
        }
        const extracted = streamTexts.length > 0 
          ? streamTexts.join('\n') 
          : textObjects.length > 5 
            ? textObjects.join(' | ')
            : text.replace(/[^\x20-\x7E\n\r\t]/g, ' ').substring(0, 50000);
        resolve(extracted);
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    } else {
      reader.onload = (ev) => resolve(ev.target?.result as string);
      reader.onerror = reject;
      reader.readAsText(file);
    }
  });
};

export default function BankReconciliation() {
  const { user } = useAuth();
  const userId = user?.id;
  const { toast } = useToast();
  const [bankTxns, setBankTxns] = useState<BankTx[]>([]);
  const [detectedBank, setDetectedBank] = useState<string>('');
  const [detectedColumns, setDetectedColumns] = useState<DetectedColumns | null>(null);
  const [result, setResult] = useState<ReconciliationResult | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isReconciling, setIsReconciling] = useState(false);
  const [fileName, setFileName] = useState('');
  const [showSuggestDialog, setShowSuggestDialog] = useState(false);
  const [selectedSuggestion, setSelectedSuggestion] = useState<any>(null);

  // Fetch ledger data
  const { data: accounts } = useQuery({
    queryKey: ["recon-accounts", userId],
    queryFn: async () => {
      const { data, error } = await supabase.from("accounts").select("id, account_code, account_name, opening_balance").eq("user_id", userId!).order("account_code");
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
  });

  const { data: journals } = useQuery({
    queryKey: ["recon-journals", userId],
    queryFn: async () => {
      const { data, error } = await supabase.from("journals").select("id, journal_date, narration, total_debit, total_credit, status").eq("user_id", userId!).eq("status", "posted").order("journal_date", { ascending: false });
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
      const { data, error } = await supabase.from("journal_lines").select("id, journal_id, account_id, debit, credit, line_narration").in("journal_id", ids);
      if (error) throw error;
      return data;
    },
    enabled: !!userId && !!journals?.length,
  });

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
          accountName: accounts?.find(a => a.id === l.account_id)?.account_name || 'Unknown',
          debit: Number(l.debit || 0),
          credit: Number(l.credit || 0),
        })),
      };
    });
  }, [journals, journalLines, accounts]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const allowedTypes = ['text/csv', 'application/pdf', 'application/vnd.ms-excel', 'text/plain'];
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!allowedTypes.includes(file.type) && !['csv', 'pdf', 'txt'].includes(ext || '')) {
      toast({ title: "Unsupported file", description: "Please upload a CSV or PDF bank statement.", variant: "destructive" });
      return;
    }

    setFileName(file.name);
    setIsParsing(true);
    setResult(null);
    setBankTxns([]);
    setDetectedBank('');
    setDetectedColumns(null);

    try {
      const fileType = ext === 'pdf' || file.type === 'application/pdf' ? 'pdf' : 'csv';
      const rawContent = await readFileAsText(file);

      if (!rawContent || rawContent.trim().length < 20) {
        throw new Error("Could not extract text from file. For PDFs, try a text-based PDF (not scanned images).");
      }

      // Send raw content to AI for intelligent parsing
      const { data, error } = await supabase.functions.invoke('bank-reconciliation', {
        body: { rawContent: rawContent.substring(0, 30000), fileType, action: 'parse' },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const txns: BankTx[] = (data.transactions || []).map((t: any) => ({
        date: t.date || '',
        description: t.description || '',
        deposits: Number(t.deposits) || 0,
        withdrawals: Number(t.withdrawals) || 0,
        balance: Number(t.balance) || 0,
        reference: t.reference || undefined,
      })).filter((t: BankTx) => t.date && (t.deposits || t.withdrawals));

      setBankTxns(txns);
      setDetectedBank(data.bankName || 'Unknown');
      setDetectedColumns(data.detectedColumns || null);

      toast({
        title: `Parsed ${file.name}`,
        description: `${txns.length} transactions found${data.bankName ? ` (${data.bankName})` : ''}. AI detected columns automatically.`,
      });
    } catch (err: any) {
      console.error("Parse error:", err);
      toast({ title: "Failed to parse statement", description: err.message, variant: "destructive" });
    } finally {
      setIsParsing(false);
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
        type: t.deposits > 0 ? 'deposit' : 'withdrawal',
      }));

      const { data, error } = await supabase.functions.invoke('bank-reconciliation', {
        body: { bankTransactions: bankData, ledgerEntries, action: 'reconcile' },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setResult(data);
      toast({ title: "Reconciliation complete", description: `${data.summary?.matchedCount || 0} matched, ${data.summary?.unmatchedBankCount || 0} unmatched bank items.` });
    } catch (err: any) {
      console.error(err);
      toast({ title: "Reconciliation failed", description: err.message, variant: "destructive" });
    } finally {
      setIsReconciling(false);
    }
  };

  const handleSuggestEntry = (item: any) => {
    setSelectedSuggestion(item);
    setShowSuggestDialog(true);
  };

  const handleCreateEntry = async () => {
    if (!selectedSuggestion?.suggestedLedgerEntry || !userId) return;
    const s = selectedSuggestion.suggestedLedgerEntry;
    toast({ title: "Ledger entry suggestion noted", description: `${s.narration} — Debit: ₹${s.debit}, Credit: ₹${s.credit}. Go to Manual Journals to create.` });
    setShowSuggestDialog(false);
  };

  return (
    <div className="p-4 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Bank Reconciliation</h1>
        <p className="text-muted-foreground text-sm mt-1">AI-powered bank statement reconciliation — supports any bank format (CSV & PDF)</p>
      </div>

      {/* Upload & Actions */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
            <label className="flex items-center gap-2 cursor-pointer border border-dashed border-primary/40 rounded-lg px-4 py-3 hover:bg-accent/50 transition-colors">
              {isParsing ? <Loader2 className="h-5 w-5 text-primary animate-spin" /> : <Upload className="h-5 w-5 text-primary" />}
              <div className="text-sm">
                <span className="font-medium">{isParsing ? 'AI is parsing...' : fileName || 'Upload Bank Statement'}</span>
                <span className="block text-xs text-muted-foreground">CSV or PDF — any bank format</span>
              </div>
              <input type="file" accept=".csv,.pdf,.txt" className="hidden" onChange={handleFileUpload} disabled={isParsing} />
            </label>

            {bankTxns.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="secondary">{bankTxns.length} transactions</Badge>
                {detectedBank && detectedBank !== 'Unknown' && (
                  <Badge variant="outline" className="gap-1">
                    <Sparkles className="h-3 w-3" /> {detectedBank}
                  </Badge>
                )}
              </div>
            )}

            <div className="flex gap-2 ml-auto">
              <Button onClick={handleReconcile} disabled={!bankTxns.length || isReconciling}>
                {isReconciling ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Bot className="h-4 w-4 mr-2" />}
                {isReconciling ? 'Reconciling...' : 'AI Reconcile'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Detected Column Mapping */}
      {detectedColumns && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">AI Detected Column Mapping</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
              {Object.entries(detectedColumns).map(([key, value]) => value && (
                <div key={key} className="bg-background rounded-md px-3 py-2 border">
                  <span className="text-muted-foreground capitalize">{key}</span>
                  <p className="font-medium truncate mt-0.5">{String(value)}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary Cards */}
      {result?.summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card><CardContent className="pt-4 text-center">
            <p className="text-xs text-muted-foreground">Bank Txns</p>
            <p className="text-2xl font-bold">{result.summary.totalBankTransactions}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4 text-center">
            <p className="text-xs text-muted-foreground">Matched</p>
            <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{result.summary.matchedCount}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4 text-center">
            <p className="text-xs text-muted-foreground">Unmatched (Bank)</p>
            <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{result.summary.unmatchedBankCount}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4 text-center">
            <p className="text-xs text-muted-foreground">Difference</p>
            <p className="text-2xl font-bold text-destructive">{fmtCurrency(Math.abs(result.summary.difference || 0))}</p>
          </CardContent></Card>
        </div>
      )}

      {/* Bank Transactions Table (before reconciliation) */}
      {bankTxns.length > 0 && !result && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Uploaded Bank Transactions</CardTitle>
            <CardDescription>
              {detectedBank && detectedBank !== 'Unknown' ? `${detectedBank} format detected` : 'AI-parsed from uploaded file'} — {bankTxns.length} transactions
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-auto max-h-[400px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Statement Details</TableHead>
                    <TableHead className="text-right">Deposits</TableHead>
                    <TableHead className="text-right">Withdrawals</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bankTxns.map((t, i) => (
                    <TableRow key={i}>
                      <TableCell className="whitespace-nowrap">{t.date}</TableCell>
                      <TableCell className="min-w-[200px]">{t.description}</TableCell>
                      <TableCell className="text-right text-emerald-600 dark:text-emerald-400">{t.deposits ? fmtCurrency(t.deposits) : ''}</TableCell>
                      <TableCell className="text-right text-destructive">{t.withdrawals ? fmtCurrency(t.withdrawals) : ''}</TableCell>
                      <TableCell className="text-right">{fmtCurrency(t.balance)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Reconciliation Results */}
      {result && (
        <Tabs defaultValue="matched" className="space-y-4">
          <TabsList>
            <TabsTrigger value="matched" className="gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" /> Matched ({result.matched?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="unmatched-bank" className="gap-1">
              <XCircle className="h-3.5 w-3.5" /> Unmatched Bank ({result.unmatchedBank?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="unmatched-ledger" className="gap-1">
              <AlertTriangle className="h-3.5 w-3.5" /> Unmatched Ledger ({result.unmatchedLedger?.length || 0})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="matched">
            <Card>
              <CardHeader><CardTitle className="text-lg">Matched Transactions</CardTitle><CardDescription>Transactions with exact matches in the ledger</CardDescription></CardHeader>
              <CardContent>
                {result.matched?.length ? (
                  <div className="overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Bank Description</TableHead>
                          <TableHead>Ledger Narration</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {result.matched.map((m: any, i: number) => (
                          <TableRow key={i}>
                            <TableCell>{m.bankTransaction?.date}</TableCell>
                            <TableCell>{m.bankTransaction?.description}</TableCell>
                            <TableCell>{m.ledgerEntry?.narration}</TableCell>
                            <TableCell className="text-right">{fmtCurrency(m.bankTransaction?.amount || 0)}</TableCell>
                            <TableCell><Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200">Matched</Badge></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : <p className="text-muted-foreground text-center py-8">No matched transactions found.</p>}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="unmatched-bank">
            <Card>
              <CardHeader><CardTitle className="text-lg">Unmatched Bank Transactions</CardTitle><CardDescription>Bank items with no ledger match — classified by reason</CardDescription></CardHeader>
              <CardContent>
                {result.unmatchedBank?.length ? (
                  <div className="overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Reason</TableHead>
                          <TableHead>Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {result.unmatchedBank.map((u: any, i: number) => (
                          <TableRow key={i}>
                            <TableCell>{u.date}</TableCell>
                            <TableCell>{u.description}</TableCell>
                            <TableCell className="text-right">{fmtCurrency(u.amount || 0)}</TableCell>
                            <TableCell><Badge variant="outline">{u.type}</Badge></TableCell>
                            <TableCell><Badge variant="secondary">{u.reason}</Badge></TableCell>
                            <TableCell>
                              {u.suggestedLedgerEntry && (
                                <Button size="sm" variant="outline" onClick={() => handleSuggestEntry(u)}>
                                  <Plus className="h-3 w-3 mr-1" /> Create Entry
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : <p className="text-muted-foreground text-center py-8">No unmatched bank transactions.</p>}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="unmatched-ledger">
            <Card>
              <CardHeader><CardTitle className="text-lg">Unmatched Ledger Entries</CardTitle><CardDescription>Ledger entries with no corresponding bank transaction</CardDescription></CardHeader>
              <CardContent>
                {result.unmatchedLedger?.length ? (
                  <div className="overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Narration</TableHead>
                          <TableHead className="text-right">Debit</TableHead>
                          <TableHead className="text-right">Credit</TableHead>
                          <TableHead>Reason</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {result.unmatchedLedger.map((u: any, i: number) => (
                          <TableRow key={i}>
                            <TableCell>{u.date}</TableCell>
                            <TableCell>{u.narration}</TableCell>
                            <TableCell className="text-right">{u.debit ? fmtCurrency(u.debit) : ''}</TableCell>
                            <TableCell className="text-right">{u.credit ? fmtCurrency(u.credit) : ''}</TableCell>
                            <TableCell><Badge variant="secondary">{u.reason}</Badge></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : <p className="text-muted-foreground text-center py-8">No unmatched ledger entries.</p>}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      {/* Suggest Entry Dialog */}
      <Dialog open={showSuggestDialog} onOpenChange={setShowSuggestDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Suggested Ledger Entry</DialogTitle>
          </DialogHeader>
          {selectedSuggestion?.suggestedLedgerEntry && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Account:</span> <span className="font-medium">{selectedSuggestion.suggestedLedgerEntry.accountName}</span></div>
                <div><span className="text-muted-foreground">Narration:</span> <span className="font-medium">{selectedSuggestion.suggestedLedgerEntry.narration}</span></div>
                <div><span className="text-muted-foreground">Debit:</span> <span className="font-medium">{fmtCurrency(selectedSuggestion.suggestedLedgerEntry.debit || 0)}</span></div>
                <div><span className="text-muted-foreground">Credit:</span> <span className="font-medium">{fmtCurrency(selectedSuggestion.suggestedLedgerEntry.credit || 0)}</span></div>
              </div>
              <p className="text-xs text-muted-foreground">This will guide you to create a journal entry in Manual Journals.</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSuggestDialog(false)}>Cancel</Button>
            <Button onClick={handleCreateEntry}>
              <ArrowRight className="h-4 w-4 mr-1" /> Acknowledge & Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
