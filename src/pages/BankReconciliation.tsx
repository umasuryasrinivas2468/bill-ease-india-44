import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/ClerkAuthProvider";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Upload, Bot, CheckCircle2, XCircle, AlertTriangle, FileText, Loader2, ArrowRight, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

type BankTx = { date: string; description: string; deposits: number; withdrawals: number; balance: number; transactionId?: string };
type ReconciliationResult = {
  matched: any[];
  unmatchedBank: any[];
  unmatchedLedger: any[];
  summary: { totalBankTransactions: number; totalLedgerEntries: number; matchedCount: number; unmatchedBankCount: number; unmatchedLedgerCount: number; bankBalance: number; ledgerBalance: number; difference: number };
};

const parseCSV = (text: string): BankTx[] => {
  const lines = text.replace(/^\uFEFF/, '').split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/["']/g, ''));

  const findCol = (keywords: string[]) => headers.findIndex(h => keywords.some(k => h.includes(k)));
  const dateIdx = findCol(['date', 'txn date', 'transaction date', 'value date']);
  const descIdx = findCol(['description', 'narration', 'particulars', 'details', 'remark']);
  const debitIdx = findCol(['debit', 'withdrawal', 'dr']);
  const creditIdx = findCol(['credit', 'deposit', 'cr']);
  const balIdx = findCol(['balance', 'closing']);
  const txnIdx = findCol(['transaction id', 'ref', 'chq', 'utr']);

  return lines.slice(1).map(line => {
    const cols = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g)?.map(c => c.replace(/"/g, '').trim()) || line.split(',').map(c => c.trim());
    const parseNum = (v: string) => parseFloat((v || '0').replace(/[₹,\s]/g, '')) || 0;
    return {
      date: cols[dateIdx] || '',
      description: cols[descIdx] || '',
      withdrawals: parseNum(cols[debitIdx]),
      deposits: parseNum(cols[creditIdx]),
      balance: parseNum(cols[balIdx]),
      transactionId: cols[txnIdx] || undefined,
    };
  }).filter(t => t.date && (t.deposits || t.withdrawals));
};

const fmtCurrency = (n: number) => n ? `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—';

export default function BankReconciliation() {
  const { user } = useAuth();
  const userId = user?.id;
  const { toast } = useToast();
  const [bankTxns, setBankTxns] = useState<BankTx[]>([]);
  const [result, setResult] = useState<ReconciliationResult | null>(null);
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

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const txns = parseCSV(text);
      setBankTxns(txns);
      setResult(null);
      toast({ title: `Uploaded ${file.name}`, description: `${txns.length} transactions parsed.` });
    };
    reader.readAsText(file);
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
        body: { bankTransactions: bankData, ledgerEntries },
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
        <p className="text-muted-foreground text-sm mt-1">AI-powered bank statement reconciliation with ledger matching</p>
      </div>

      {/* Upload & Actions */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
            <label className="flex items-center gap-2 cursor-pointer border border-dashed border-primary/40 rounded-lg px-4 py-3 hover:bg-accent/50 transition-colors">
              <Upload className="h-5 w-5 text-primary" />
              <span className="text-sm font-medium">{fileName || 'Upload Bank Statement CSV'}</span>
              <input type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
            </label>
            {bankTxns.length > 0 && (
              <Badge variant="secondary">{bankTxns.length} transactions</Badge>
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

      {/* Summary Cards */}
      {result?.summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card><CardContent className="pt-4 text-center">
            <p className="text-xs text-muted-foreground">Bank Txns</p>
            <p className="text-2xl font-bold">{result.summary.totalBankTransactions}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4 text-center">
            <p className="text-xs text-muted-foreground">Matched</p>
            <p className="text-2xl font-bold text-green-600">{result.summary.matchedCount}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4 text-center">
            <p className="text-xs text-muted-foreground">Unmatched (Bank)</p>
            <p className="text-2xl font-bold text-amber-600">{result.summary.unmatchedBankCount}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4 text-center">
            <p className="text-xs text-muted-foreground">Difference</p>
            <p className="text-2xl font-bold text-red-600">{fmtCurrency(Math.abs(result.summary.difference || 0))}</p>
          </CardContent></Card>
        </div>
      )}

      {/* Bank Transactions Table (before reconciliation) */}
      {bankTxns.length > 0 && !result && (
        <Card>
          <CardHeader><CardTitle className="text-lg">Uploaded Bank Transactions</CardTitle></CardHeader>
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
                      <TableCell className="text-right text-green-600">{t.deposits ? fmtCurrency(t.deposits) : ''}</TableCell>
                      <TableCell className="text-right text-red-600">{t.withdrawals ? fmtCurrency(t.withdrawals) : ''}</TableCell>
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

          {/* Matched */}
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
                            <TableCell><Badge className="bg-green-100 text-green-700 border-green-200">Matched</Badge></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : <p className="text-muted-foreground text-center py-8">No matched transactions found.</p>}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Unmatched Bank */}
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

          {/* Unmatched Ledger */}
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
