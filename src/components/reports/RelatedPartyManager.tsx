import React, { useEffect, useState } from 'react';
import { useUser } from '@clerk/clerk-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  Users, Plus, Trash2, Loader2, RefreshCw, AlertTriangle, CheckCircle2, FileText,
} from 'lucide-react';
import {
  listRelatedParties, upsertRelatedParty, deleteRelatedParty,
  listRPTransactions, addRPTransaction, deleteRPTransaction,
  fetchRPTDisclosure,
  RelatedParty, RPRelationship, RPTransaction, RPTType, RPTDisclosureSchedule,
} from '@/services/financialStatementsService';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface Props { financialYear: string; }

const RELATIONSHIP_LABELS: Record<RPRelationship, string> = {
  holding_company: 'Holding Company',
  subsidiary_company: 'Subsidiary',
  fellow_subsidiary: 'Fellow Subsidiary',
  associate: 'Associate',
  joint_venture: 'Joint Venture',
  kmp: 'Key Managerial Personnel',
  kmp_relative: "Relative of KMP",
  director: 'Director',
  director_relative: "Director's Relative",
  enterprise_with_common_kmp: 'Enterprise with Common KMP',
  post_employment_benefit_plan: 'Post-Employment Benefit Plan',
  controlled_other: 'Other Controlled Entity',
};

const TXN_TYPE_LABELS: Record<RPTType, string> = {
  sale_goods: 'Sale of Goods', sale_services: 'Sale of Services',
  purchase_goods: 'Purchase of Goods', purchase_services: 'Purchase of Services',
  loan_given: 'Loan Given', loan_taken: 'Loan Taken',
  interest_received: 'Interest Received', interest_paid: 'Interest Paid',
  rent_received: 'Rent Received', rent_paid: 'Rent Paid',
  royalty_received: 'Royalty Received', royalty_paid: 'Royalty Paid',
  dividend_received: 'Dividend Received', dividend_paid: 'Dividend Paid',
  guarantee_given: 'Guarantee Given', guarantee_taken: 'Guarantee Taken',
  deposit_placed: 'Deposit Placed', deposit_received: 'Deposit Received',
  advance_given: 'Advance Given', advance_received: 'Advance Received',
  remuneration: 'Remuneration', sitting_fees: 'Sitting Fees',
  reimbursement: 'Reimbursement',
  sale_fixed_asset: 'Sale of Fixed Asset', purchase_fixed_asset: 'Purchase of Fixed Asset',
  investment: 'Investment', divestment: 'Divestment',
  other: 'Other',
};

const formatINR = (n: number | null | undefined): string => {
  if (n === null || n === undefined) return '';
  if (n === 0) return '-';
  const abs = Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 0 });
  return n < 0 ? `(${abs})` : abs;
};

const RelatedPartyManager: React.FC<Props> = ({ financialYear }) => {
  const { user } = useUser();
  const [parties, setParties] = useState<RelatedParty[]>([]);
  const [txns, setTxns] = useState<RPTransaction[]>([]);
  const [disclosure, setDisclosure] = useState<RPTDisclosureSchedule | null>(null);
  const [loading, setLoading] = useState(false);

  // Party dialog state
  const [openPartyDialog, setOpenPartyDialog] = useState(false);
  const [partyName, setPartyName] = useState('');
  const [relationship, setRelationship] = useState<RPRelationship>('associate');
  const [kmpPosition, setKmpPosition] = useState('');
  const [pan, setPan] = useState('');
  const [partyId, setPartyId] = useState<string | undefined>(undefined);

  // Transaction dialog
  const [openTxnDialog, setOpenTxnDialog] = useState(false);
  const [txnPartyId, setTxnPartyId] = useState<string>('');
  const [txnDate, setTxnDate] = useState(new Date().toISOString().slice(0, 10));
  const [txnType, setTxnType] = useState<RPTType>('sale_goods');
  const [txnDesc, setTxnDesc] = useState('');
  const [txnAmount, setTxnAmount] = useState<number>(0);
  const [txnArmsLength, setTxnArmsLength] = useState(true);
  const [txnApprovalRequired, setTxnApprovalRequired] = useState(false);
  const [txnApprovalObtained, setTxnApprovalObtained] = useState(false);

  const load = async () => {
    if (!user?.id) return;
    setLoading(true);
    const [p, t, d] = await Promise.all([
      listRelatedParties(user.id),
      listRPTransactions(user.id, financialYear),
      fetchRPTDisclosure(user.id, financialYear),
    ]);
    setParties(p); setTxns(t); setDisclosure(d);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user?.id, financialYear]);

  const resetPartyForm = () => {
    setPartyId(undefined); setPartyName(''); setRelationship('associate');
    setKmpPosition(''); setPan('');
  };

  const handleSaveParty = async () => {
    if (!user?.id || !partyName.trim()) return;
    try {
      await upsertRelatedParty(user.id, {
        id: partyId,
        party_name: partyName.trim(),
        relationship,
        kmp_position: kmpPosition.trim() || null,
        pan: pan.trim() || null,
      });
      toast.success('Related party saved');
      setOpenPartyDialog(false);
      resetPartyForm();
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to save party');
    }
  };

  const handleDeleteParty = async (id?: string) => {
    if (!id) return;
    if (!confirm('Delete this related party? All linked transactions will also be removed.')) return;
    try {
      await deleteRelatedParty(id);
      toast.success('Party removed');
      await load();
    } catch {
      toast.error('Failed to delete');
    }
  };

  const handleAddTxn = async () => {
    if (!user?.id || !txnPartyId || !txnDesc.trim() || txnAmount <= 0) {
      toast.error('Fill party, description, and amount > 0');
      return;
    }
    try {
      await addRPTransaction(user.id, {
        related_party_id: txnPartyId,
        transaction_date: txnDate,
        transaction_type: txnType,
        description: txnDesc.trim(),
        amount: txnAmount,
        is_arms_length: txnArmsLength,
        approval_required: txnApprovalRequired,
        approval_obtained: txnApprovalObtained,
        fiscal_year: financialYear,
      });
      toast.success('Transaction recorded');
      setOpenTxnDialog(false);
      setTxnDesc(''); setTxnAmount(0); setTxnPartyId('');
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to record transaction');
    }
  };

  const handleDeleteTxn = async (id?: string) => {
    if (!id) return;
    try {
      await deleteRPTransaction(id);
      toast.success('Transaction removed');
      await load();
    } catch {
      toast.error('Failed to delete');
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4" /> Related Party Transactions (AS 18 / Ind AS 24)
          </CardTitle>
          <CardDescription>
            Disclosure required under Section 188 Companies Act 2013 + Note 32 Schedule III ·
            FY {financialYear}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {disclosure && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
              <div className="rounded-lg border bg-muted/20 p-3">
                <div className="text-[10px] uppercase text-muted-foreground">Total Transactions</div>
                <div className="text-base font-semibold tabular-nums">₹ {formatINR(disclosure.grand_total)}</div>
                <div className="text-[10px] text-muted-foreground">{disclosure.total_txn_count} entry(s)</div>
              </div>
              <div className="rounded-lg border bg-muted/20 p-3">
                <div className="text-[10px] uppercase text-muted-foreground">Arm's-length</div>
                <div className="text-base font-semibold tabular-nums text-emerald-600">₹ {formatINR(disclosure.arms_length_total)}</div>
              </div>
              <div className="rounded-lg border bg-muted/20 p-3">
                <div className="text-[10px] uppercase text-muted-foreground">Non-arm's-length</div>
                <div className="text-base font-semibold tabular-nums text-amber-600">₹ {formatINR(disclosure.non_arms_length_total)}</div>
              </div>
              <div className={cn('rounded-lg border p-3',
                disclosure.total_pending_approvals > 0
                  ? 'border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/30'
                  : 'bg-muted/20')}>
                <div className="text-[10px] uppercase text-muted-foreground">Pending Approvals</div>
                <div className={cn('text-base font-semibold tabular-nums',
                  disclosure.total_pending_approvals > 0 ? 'text-red-600' : '')}>
                  {disclosure.total_pending_approvals}
                </div>
                {disclosure.total_pending_approvals > 0 && (
                  <div className="text-[10px] text-red-600 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" /> Audit risk
                  </div>
                )}
              </div>
            </div>
          )}

          <Tabs defaultValue="parties">
            <TabsList>
              <TabsTrigger value="parties"><Users className="h-3.5 w-3.5 mr-1.5" />Parties ({parties.length})</TabsTrigger>
              <TabsTrigger value="txns"><FileText className="h-3.5 w-3.5 mr-1.5" />Transactions ({txns.length})</TabsTrigger>
              <TabsTrigger value="schedule"><RefreshCw className="h-3.5 w-3.5 mr-1.5" />Disclosure Schedule</TabsTrigger>
            </TabsList>

            <TabsContent value="parties" className="space-y-3 pt-3">
              <div className="flex justify-end">
                <Dialog open={openPartyDialog} onOpenChange={(o) => { setOpenPartyDialog(o); if (!o) resetPartyForm(); }}>
                  <DialogTrigger asChild>
                    <Button size="sm"><Plus className="h-4 w-4 mr-1.5" />Add Party</Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                      <DialogTitle>{partyId ? 'Edit related party' : 'Add related party'}</DialogTitle>
                      <DialogDescription>As required by AS 18 / Ind AS 24 / Companies Act §2(76)</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3 py-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="p-name">Party Name *</Label>
                        <Input id="p-name" value={partyName} onChange={(e) => setPartyName(e.target.value)} />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Relationship *</Label>
                        <Select value={relationship} onValueChange={(v) => setRelationship(v as RPRelationship)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {Object.entries(RELATIONSHIP_LABELS).map(([v, label]) => (
                              <SelectItem key={v} value={v}>{label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label htmlFor="p-kmp">KMP Position</Label>
                          <Input id="p-kmp" placeholder="MD / CFO / CS" value={kmpPosition}
                                 onChange={(e) => setKmpPosition(e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="p-pan">PAN</Label>
                          <Input id="p-pan" value={pan} onChange={(e) => setPan(e.target.value.toUpperCase())} maxLength={10} />
                        </div>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setOpenPartyDialog(false)}>Cancel</Button>
                      <Button onClick={handleSaveParty} disabled={!partyName.trim()}>Save</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>

              {parties.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">No related parties yet.</div>
              ) : (
                <div className="rounded-md border overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Party</th>
                        <th className="px-3 py-2 text-left font-medium">Relationship</th>
                        <th className="px-3 py-2 text-left font-medium">KMP Position</th>
                        <th className="px-3 py-2 text-left font-medium">PAN</th>
                        <th className="px-3 py-2 text-right font-medium">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parties.map(p => (
                        <tr key={p.id} className="border-t">
                          <td className="px-3 py-1.5 font-medium">{p.party_name}</td>
                          <td className="px-3 py-1.5">
                            <Badge variant="outline" className="text-[10px]">{RELATIONSHIP_LABELS[p.relationship]}</Badge>
                          </td>
                          <td className="px-3 py-1.5 text-xs text-muted-foreground">{p.kmp_position ?? '—'}</td>
                          <td className="px-3 py-1.5 font-mono text-[11px]">{p.pan ?? '—'}</td>
                          <td className="px-3 py-1.5 text-right">
                            <Button size="sm" variant="ghost" onClick={() => handleDeleteParty(p.id)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </TabsContent>

            <TabsContent value="txns" className="space-y-3 pt-3">
              <div className="flex justify-end">
                <Dialog open={openTxnDialog} onOpenChange={setOpenTxnDialog}>
                  <DialogTrigger asChild>
                    <Button size="sm" disabled={parties.length === 0}>
                      <Plus className="h-4 w-4 mr-1.5" />Record Transaction
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                      <DialogTitle>Record RPT transaction</DialogTitle>
                      <DialogDescription>FY {financialYear}</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3 py-2">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label>Related Party *</Label>
                          <Select value={txnPartyId} onValueChange={setTxnPartyId}>
                            <SelectTrigger><SelectValue placeholder="Choose party" /></SelectTrigger>
                            <SelectContent>
                              {parties.map(p => (
                                <SelectItem key={p.id} value={p.id!}>{p.party_name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="t-date">Date *</Label>
                          <Input id="t-date" type="date" value={txnDate} onChange={(e) => setTxnDate(e.target.value)} />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label>Transaction Type</Label>
                          <Select value={txnType} onValueChange={(v) => setTxnType(v as RPTType)}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent className="max-h-72">
                              {Object.entries(TXN_TYPE_LABELS).map(([v, label]) => (
                                <SelectItem key={v} value={v}>{label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="t-amt">Amount (₹) *</Label>
                          <Input id="t-amt" type="number" min={0} step="0.01" value={txnAmount}
                                 onChange={(e) => setTxnAmount(parseFloat(e.target.value) || 0)} />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="t-desc">Description *</Label>
                        <Textarea id="t-desc" rows={2} value={txnDesc} onChange={(e) => setTxnDesc(e.target.value)} />
                      </div>
                      <div className="flex flex-col gap-2 pt-1">
                        <label className="flex items-center gap-2 text-sm">
                          <input type="checkbox" checked={txnArmsLength} onChange={(e) => setTxnArmsLength(e.target.checked)} />
                          Arm's-length transaction
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                          <input type="checkbox" checked={txnApprovalRequired}
                                 onChange={(e) => setTxnApprovalRequired(e.target.checked)} />
                          Board / Audit-committee approval required (§188)
                        </label>
                        {txnApprovalRequired && (
                          <label className="flex items-center gap-2 text-sm ml-6">
                            <input type="checkbox" checked={txnApprovalObtained}
                                   onChange={(e) => setTxnApprovalObtained(e.target.checked)} />
                            Approval obtained
                          </label>
                        )}
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setOpenTxnDialog(false)}>Cancel</Button>
                      <Button onClick={handleAddTxn} disabled={!txnPartyId || !txnDesc.trim() || txnAmount <= 0}>Record</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>

              {txns.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  {parties.length === 0
                    ? 'Add a related party first to record transactions.'
                    : 'No transactions recorded for this FY.'}
                </div>
              ) : (
                <div className="rounded-md border overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Date</th>
                        <th className="px-3 py-2 text-left font-medium">Party</th>
                        <th className="px-3 py-2 text-left font-medium">Type</th>
                        <th className="px-3 py-2 text-left font-medium">Description</th>
                        <th className="px-3 py-2 text-right font-medium">Amount</th>
                        <th className="px-3 py-2 text-center font-medium">Arm's</th>
                        <th className="px-3 py-2 text-center font-medium">Approval</th>
                        <th className="px-3 py-2 text-right font-medium">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {txns.map(t => {
                        const party = parties.find(p => p.id === t.related_party_id);
                        return (
                          <tr key={t.id} className="border-t hover:bg-muted/20">
                            <td className="px-3 py-1.5 whitespace-nowrap text-xs">{new Date(t.transaction_date).toLocaleDateString('en-IN')}</td>
                            <td className="px-3 py-1.5">{party?.party_name ?? '—'}</td>
                            <td className="px-3 py-1.5 text-xs">{TXN_TYPE_LABELS[t.transaction_type]}</td>
                            <td className="px-3 py-1.5 text-xs max-w-[200px] truncate" title={t.description}>{t.description}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums">{formatINR(t.amount)}</td>
                            <td className="px-3 py-1.5 text-center">
                              {t.is_arms_length
                                ? <CheckCircle2 className="h-4 w-4 text-emerald-600 inline" />
                                : <AlertTriangle className="h-4 w-4 text-amber-600 inline" />}
                            </td>
                            <td className="px-3 py-1.5 text-center">
                              {t.approval_required
                                ? (t.approval_obtained
                                    ? <Badge variant="default" className="text-[10px]">Approved</Badge>
                                    : <Badge variant="destructive" className="text-[10px]">Pending</Badge>)
                                : <span className="text-[10px] text-muted-foreground">N/R</span>}
                            </td>
                            <td className="px-3 py-1.5 text-right">
                              <Button size="sm" variant="ghost" onClick={() => handleDeleteTxn(t.id)}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </TabsContent>

            <TabsContent value="schedule" className="pt-3">
              {loading && !disclosure ? (
                <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Building disclosure schedule…
                </div>
              ) : !disclosure || disclosure.relationships.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  No transactions to disclose for FY {financialYear}.
                </div>
              ) : (
                <div className="space-y-3">
                  {disclosure.relationships.map(rel => (
                    <div key={rel.relationship} className="rounded-lg border">
                      <div className="flex items-center justify-between bg-muted/40 px-3 py-2 border-b">
                        <div className="flex items-center gap-2">
                          <Badge>{RELATIONSHIP_LABELS[rel.relationship]}</Badge>
                          <span className="text-xs text-muted-foreground">
                            {rel.txn_count} transaction{rel.txn_count === 1 ? '' : 's'}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-sm">
                          <span>Total: <strong className="tabular-nums">₹ {formatINR(rel.total_amount)}</strong></span>
                          {rel.pending_approvals > 0 && (
                            <Badge variant="destructive" className="text-[10px]">{rel.pending_approvals} pending</Badge>
                          )}
                        </div>
                      </div>
                      <table className="w-full text-sm">
                        <thead className="bg-muted/20">
                          <tr>
                            <th className="px-3 py-1.5 text-left font-medium text-xs">Party</th>
                            <th className="px-3 py-1.5 text-left font-medium text-xs">Transaction Type</th>
                            <th className="px-3 py-1.5 text-right font-medium text-xs">Arm's-length</th>
                            <th className="px-3 py-1.5 text-right font-medium text-xs">Non Arm's</th>
                            <th className="px-3 py-1.5 text-right font-medium text-xs">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rel.rows.map((r, i) => (
                            <tr key={i} className="border-t">
                              <td className="px-3 py-1 text-xs">{r.party_name}</td>
                              <td className="px-3 py-1 text-xs">{TXN_TYPE_LABELS[r.transaction_type]}</td>
                              <td className="px-3 py-1 text-right tabular-nums text-xs">{formatINR(r.arms_length_amount)}</td>
                              <td className="px-3 py-1 text-right tabular-nums text-xs text-amber-600">{formatINR(r.non_arms_length_amount)}</td>
                              <td className="px-3 py-1 text-right tabular-nums text-xs font-medium">{formatINR(r.total_amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default RelatedPartyManager;
