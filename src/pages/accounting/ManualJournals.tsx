import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useUser } from '@clerk/clerk-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { Plus, Trash2, AlertTriangle, Upload, FileText, Paperclip, RotateCcw, CheckCircle2 } from 'lucide-react';
import { postManualJournal, fetchJournalsList, type ManualJournalLineInput, type JournalListItem } from '@/services/financialStatementsService';

interface AccountOption {
  id: string;
  account_code: string;
  account_name: string;
  account_type: string;
  is_group: boolean;
  is_active: boolean;
  allow_manual_journals: boolean | null;
}

interface PartyOption { id: string; name: string; }
interface CostCenterOption { id: string; cost_center_code: string; cost_center_name: string; }
interface ProjectOption { id: string; project_name: string; }
interface BranchOption { id: string; branch_name: string; }

interface LineState {
  uid: string;
  accountId: string;
  debit: string;
  credit: string;
  lineNarration: string;
  vendorId: string | null;
  customerId: string | null;
  taxType: string | null;
  notes: string;
}

const VOUCHER_TYPES = [
  'Journal', 'Payment', 'Receipt', 'Contra',
  'Sales', 'Purchase', 'Credit Note', 'Debit Note',
  'Stock Journal', 'Adjustment', 'Opening Balance',
  'Depreciation', 'Provision', 'Reversal',
];
const TAX_TYPES = ['', 'cgst', 'sgst', 'igst', 'cess', 'itc', 'output_gst', 'rcm_input', 'rcm_output', 'tds', 'tcs'];

const newLine = (): LineState => ({
  uid: Math.random().toString(36).slice(2),
  accountId: '',
  debit: '',
  credit: '',
  lineNarration: '',
  vendorId: null,
  customerId: null,
  taxType: null,
  notes: '',
});

const ManualJournals: React.FC = () => {
  const { user } = useUser();
  const userId = user?.id;
  const queryClient = useQueryClient();

  // ── Header state ───────────────────────────────────────────────
  const today = new Date().toISOString().slice(0, 10);
  const [journalNumber, setJournalNumber] = useState('');
  const [journalDate, setJournalDate] = useState(today);
  const [postingDate, setPostingDate] = useState(today);
  const [voucherType, setVoucherType] = useState('Journal');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [narration, setNarration] = useState('');
  const [costCenterId, setCostCenterId] = useState<string>('');
  const [branchId, setBranchId] = useState<string>('');
  const [projectId, setProjectId] = useState<string>('');
  const [headerNotes, setHeaderNotes] = useState('');

  // ── Lines state ────────────────────────────────────────────────
  const [lines, setLines] = useState<LineState[]>([newLine(), newLine()]);

  // ── Attachments staged for upload (file objects) ──────────────
  const [stagedAttachments, setStagedAttachments] = useState<File[]>([]);

  // ── Lookup data ────────────────────────────────────────────────
  const { data: accounts = [] } = useQuery<AccountOption[]>({
    queryKey: ['accounts-for-je', userId],
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from('accounts')
        .select('id, account_code, account_name, account_type, is_group, is_active, allow_manual_journals')
        .eq('user_id', userId)
        .order('account_code');
      if (error) throw error;
      return data as AccountOption[];
    },
    enabled: !!userId,
  });

  const { data: vendors = [] } = useQuery<PartyOption[]>({
    queryKey: ['vendors-for-je', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vendors').select('id, name').eq('user_id', userId).order('name');
      if (error) throw error; return (data ?? []) as PartyOption[];
    },
    enabled: !!userId,
  });
  const { data: customers = [] } = useQuery<PartyOption[]>({
    queryKey: ['customers-for-je', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients').select('id, name').eq('user_id', userId).order('name');
      if (error) throw error; return (data ?? []) as PartyOption[];
    },
    enabled: !!userId,
  });
  const { data: costCenters = [] } = useQuery<CostCenterOption[]>({
    queryKey: ['cost-centers-for-je', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cost_centers').select('id, cost_center_code, cost_center_name').eq('user_id', userId).order('cost_center_code');
      if (error) return [];
      return (data ?? []) as CostCenterOption[];
    },
    enabled: !!userId,
  });
  const { data: projects = [] } = useQuery<ProjectOption[]>({
    queryKey: ['projects-for-je', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects').select('id, project_name').eq('user_id', userId).order('project_name');
      if (error) return [];
      return (data ?? []) as ProjectOption[];
    },
    enabled: !!userId,
  });
  const { data: branches = [] } = useQuery<BranchOption[]>({
    queryKey: ['branches-for-je', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('branches').select('id, branch_name').eq('user_id', userId).order('branch_name');
      if (error) return [];
      return (data ?? []) as BranchOption[];
    },
    enabled: !!userId,
  });

  // ── Journals list ──────────────────────────────────────────────
  const [listFromDate, setListFromDate] = useState(
    new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1).toISOString().slice(0, 10),
  );
  const [listToDate, setListToDate] = useState(today);
  const [listVoucherFilter, setListVoucherFilter] = useState<string>('');
  const [listSearch, setListSearch] = useState('');

  const { data: journalsListResp } = useQuery({
    queryKey: ['journals-list', userId, listFromDate, listToDate, listVoucherFilter, listSearch],
    queryFn: () => userId
      ? fetchJournalsList(userId, listFromDate, listToDate, listVoucherFilter || null, listSearch || null)
      : Promise.resolve(null),
    enabled: !!userId,
  });
  const journalsList: JournalListItem[] = journalsListResp?.journals ?? [];

  // ── Derived totals + validation ────────────────────────────────
  const totals = useMemo(() => {
    let totalDebit = 0, totalCredit = 0;
    for (const l of lines) {
      totalDebit  += parseFloat(l.debit)  || 0;
      totalCredit += parseFloat(l.credit) || 0;
    }
    const diff = totalDebit - totalCredit;
    return { totalDebit, totalCredit, diff };
  }, [lines]);

  const accountIssues = useMemo(() => {
    const issues: string[] = [];
    const seenInactive: string[] = [];
    const seenGroup: string[] = [];
    const seenDisallow: string[] = [];
    for (const l of lines) {
      if (!l.accountId) continue;
      const a = accounts.find(x => x.id === l.accountId);
      if (!a) continue;
      if (!a.is_active) seenInactive.push(a.account_name);
      if (a.is_group)   seenGroup.push(a.account_name);
      if (a.allow_manual_journals === false) seenDisallow.push(a.account_name);
    }
    if (seenInactive.length) issues.push(`Inactive: ${seenInactive.join(', ')}`);
    if (seenGroup.length)    issues.push(`Group/control: ${seenGroup.join(', ')}`);
    if (seenDisallow.length) issues.push(`Manual posting disabled: ${seenDisallow.join(', ')}`);
    return issues;
  }, [lines, accounts]);

  const validLineCount = lines.filter(l => l.accountId && ((parseFloat(l.debit) || 0) > 0 || (parseFloat(l.credit) || 0) > 0)).length;
  const hasDebit  = lines.some(l => (parseFloat(l.debit)  || 0) > 0);
  const hasCredit = lines.some(l => (parseFloat(l.credit) || 0) > 0);
  const isBalanced = Math.abs(totals.diff) < 0.01 && totals.totalDebit > 0;
  const canSubmit =
    isBalanced && validLineCount >= 2 && hasDebit && hasCredit
    && narration.trim().length > 0 && accountIssues.length === 0;

  // ── Line ops ──────────────────────────────────────────────────
  const updateLine = (uid: string, patch: Partial<LineState>) =>
    setLines(prev => prev.map(l => l.uid === uid ? { ...l, ...patch } : l));

  const handleAmount = (uid: string, field: 'debit' | 'credit', value: string) => {
    setLines(prev => prev.map(l => {
      if (l.uid !== uid) return l;
      const numeric = parseFloat(value) || 0;
      const other = field === 'debit' ? 'credit' : 'debit';
      return { ...l, [field]: value, [other]: numeric > 0 ? '' : l[other] } as LineState;
    }));
  };

  const addLine = () => setLines(prev => [...prev, newLine()]);
  const removeLine = (uid: string) =>
    setLines(prev => prev.length > 2 ? prev.filter(l => l.uid !== uid) : prev);

  const resetForm = () => {
    setJournalNumber('');
    setJournalDate(today); setPostingDate(today);
    setVoucherType('Journal'); setReferenceNumber('');
    setNarration(''); setHeaderNotes('');
    setCostCenterId(''); setBranchId(''); setProjectId('');
    setLines([newLine(), newLine()]);
    setStagedAttachments([]);
  };

  // ── Submit mutation ───────────────────────────────────────────
  const postMutation = useMutation({
    mutationFn: async () => {
      if (!userId) throw new Error('Not signed in');
      const linesPayload: ManualJournalLineInput[] = lines
        .filter(l => l.accountId && ((parseFloat(l.debit) || 0) > 0 || (parseFloat(l.credit) || 0) > 0))
        .map(l => ({
          account_id: l.accountId,
          debit:  parseFloat(l.debit)  || 0,
          credit: parseFloat(l.credit) || 0,
          line_narration: l.lineNarration || l.notes || null as any,
          vendor_id:   l.vendorId   || null,
          customer_id: l.customerId || null,
          tax_type:    l.taxType    || null,
        }));
      const journalId = await postManualJournal(userId, {
        journalNumber: journalNumber.trim() || null,
        journalDate, postingDate,
        voucherType, referenceNumber: referenceNumber.trim() || null,
        narration, notes: headerNotes.trim() || null,
        costCenterId: costCenterId || null,
        branchId:     branchId     || null,
        projectId:    projectId    || null,
        lines: linesPayload,
        status: 'posted',
      }, user?.fullName || user?.primaryEmailAddress?.emailAddress || null);

      if (stagedAttachments.length && userId) {
        const records: any[] = [];
        for (const f of stagedAttachments) {
          const path = `${userId}/${journalId}/${Date.now()}-${f.name}`;
          const { error: upErr } = await supabase.storage
            .from('journal-attachments')
            .upload(path, f, { upsert: false });
          let publicUrl = '';
          if (!upErr) {
            const { data: pub } = supabase.storage.from('journal-attachments').getPublicUrl(path);
            publicUrl = pub?.publicUrl ?? '';
          }
          records.push({
            journal_id: journalId,
            user_id: userId,
            file_name: f.name,
            file_url: publicUrl || path,
            mime_type: f.type || null,
            size_bytes: f.size,
            uploaded_by: user?.id ?? null,
          });
        }
        await supabase.from('journal_attachments').insert(records);
      }
      return journalId;
    },
    onSuccess: () => {
      toast.success('Journal posted');
      queryClient.invalidateQueries({ queryKey: ['journals-list'] });
      resetForm();
    },
    onError: (e: any) => {
      const msg = e?.message ?? 'Failed to post journal';
      toast.error(msg);
    },
  });

  const reverseMutation = useMutation({
    mutationFn: async (journalId: string) => {
      const { error } = await supabase.rpc('reverse_journal', {
        p_journal_id: journalId,
        p_reversal_date: today,
        p_reason: 'Manual reversal from journal entry screen',
        p_reversed_by: user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Journal reversed');
      queryClient.invalidateQueries({ queryKey: ['journals-list'] });
    },
    onError: (e: any) => toast.error(e?.message ?? 'Reversal failed'),
  });

  return (
    <TooltipProvider>
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex justify-between items-end">
          <div>
            <h1 className="text-3xl font-bold">Journal Entries</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Post manual journals; every line flows into the General Ledger, sub-ledgers, trial balance and reports in real time.
            </p>
          </div>
        </div>

        <Tabs defaultValue="new">
          <TabsList>
            <TabsTrigger value="new">New Entry</TabsTrigger>
            <TabsTrigger value="list">Recent Journals</TabsTrigger>
          </TabsList>

          {/* ───────── New entry tab ───────── */}
          <TabsContent value="new" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Header</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label>Journal Number</Label>
                    <Input
                      placeholder="Auto-generated if blank"
                      value={journalNumber}
                      onChange={e => setJournalNumber(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>Journal Date</Label>
                    <Input type="date" value={journalDate} onChange={e => setJournalDate(e.target.value)} />
                  </div>
                  <div>
                    <Label>Posting Date</Label>
                    <Input type="date" value={postingDate} onChange={e => setPostingDate(e.target.value)} />
                  </div>
                  <div>
                    <Label>Voucher Type</Label>
                    <Select value={voucherType} onValueChange={setVoucherType}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {VOUCHER_TYPES.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Reference Number</Label>
                    <Input
                      placeholder="Cheque #, Bill #, Ack #…"
                      value={referenceNumber}
                      onChange={e => setReferenceNumber(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>Cost Center</Label>
                    <Select value={costCenterId || 'none'} onValueChange={v => setCostCenterId(v === 'none' ? '' : v)}>
                      <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {costCenters.map(c => (
                          <SelectItem key={c.id} value={c.id}>{c.cost_center_code} — {c.cost_center_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Branch</Label>
                    <Select value={branchId || 'none'} onValueChange={v => setBranchId(v === 'none' ? '' : v)}>
                      <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.branch_name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Project (optional)</Label>
                    <Select value={projectId || 'none'} onValueChange={v => setProjectId(v === 'none' ? '' : v)}>
                      <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.project_name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label>Narration</Label>
                  <Textarea
                    rows={2}
                    placeholder="Required — describes the business event this journal records."
                    value={narration}
                    onChange={e => setNarration(e.target.value)}
                  />
                </div>

                <div>
                  <Label>Notes (internal)</Label>
                  <Textarea
                    rows={2}
                    placeholder="Optional — visible to auditors only."
                    value={headerNotes}
                    onChange={e => setHeaderNotes(e.target.value)}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle>Lines</CardTitle>
                  <Button onClick={addLine} size="sm">
                    <Plus className="h-4 w-4 mr-1" /> Add Line
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-[200px]">Ledger Account</TableHead>
                        <TableHead className="min-w-[160px]">Sub-Ledger</TableHead>
                        <TableHead className="w-[120px]">Debit</TableHead>
                        <TableHead className="w-[120px]">Credit</TableHead>
                        <TableHead className="w-[110px]">GST Tag</TableHead>
                        <TableHead className="min-w-[180px]">Notes</TableHead>
                        <TableHead className="w-[40px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lines.map((line, idx) => {
                        const acc = accounts.find(a => a.id === line.accountId);
                        const issueTooltip = (() => {
                          if (!acc) return null;
                          if (!acc.is_active) return 'Inactive ledger — cannot post';
                          if (acc.is_group)   return 'Group/control account — pick a leaf';
                          if (acc.allow_manual_journals === false) return 'Manual postings disabled on this ledger';
                          return null;
                        })();
                        return (
                          <TableRow key={line.uid} className={issueTooltip ? 'bg-destructive/5' : undefined}>
                            <TableCell>
                              <Select
                                value={line.accountId}
                                onValueChange={v => updateLine(line.uid, { accountId: v })}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Select account" />
                                </SelectTrigger>
                                <SelectContent>
                                  {accounts.map(a => (
                                    <SelectItem key={a.id} value={a.id} disabled={a.is_group || !a.is_active || a.allow_manual_journals === false}>
                                      {a.account_code} — {a.account_name}
                                      {a.is_group ? ' (group)' : ''}
                                      {!a.is_active ? ' (inactive)' : ''}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              {issueTooltip && (
                                <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                                  <AlertTriangle className="h-3 w-3" /> {issueTooltip}
                                </p>
                              )}
                            </TableCell>
                            <TableCell>
                              <Select
                                value={line.vendorId ? `v:${line.vendorId}` : line.customerId ? `c:${line.customerId}` : 'none'}
                                onValueChange={v => {
                                  if (v === 'none') updateLine(line.uid, { vendorId: null, customerId: null });
                                  else if (v.startsWith('v:')) updateLine(line.uid, { vendorId: v.slice(2), customerId: null });
                                  else updateLine(line.uid, { customerId: v.slice(2), vendorId: null });
                                }}
                              >
                                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">None</SelectItem>
                                  {vendors.length > 0 && (
                                    <div className="px-2 py-1 text-xs text-muted-foreground">Vendors</div>
                                  )}
                                  {vendors.map(v => <SelectItem key={`v:${v.id}`} value={`v:${v.id}`}>{v.name}</SelectItem>)}
                                  {customers.length > 0 && (
                                    <div className="px-2 py-1 text-xs text-muted-foreground">Customers</div>
                                  )}
                                  {customers.map(c => <SelectItem key={`c:${c.id}`} value={`c:${c.id}`}>{c.name}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number" step="0.01" min="0" placeholder="0.00"
                                value={line.debit}
                                onChange={e => handleAmount(line.uid, 'debit', e.target.value)}
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number" step="0.01" min="0" placeholder="0.00"
                                value={line.credit}
                                onChange={e => handleAmount(line.uid, 'credit', e.target.value)}
                              />
                            </TableCell>
                            <TableCell>
                              <Select
                                value={line.taxType || 'none'}
                                onValueChange={v => updateLine(line.uid, { taxType: v === 'none' ? null : v })}
                              >
                                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                                <SelectContent>
                                  {TAX_TYPES.map(t => (
                                    <SelectItem key={t || 'none'} value={t || 'none'}>{t || 'None'}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell>
                              <Input
                                placeholder="Line note"
                                value={line.lineNarration}
                                onChange={e => updateLine(line.uid, { lineNarration: e.target.value })}
                              />
                            </TableCell>
                            <TableCell>
                              {lines.length > 2 && (
                                <Button variant="ghost" size="icon" onClick={() => removeLine(line.uid)}>
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                {/* Totals + balance check */}
                <div className={`flex flex-wrap items-center gap-4 p-3 rounded border ${
                  isBalanced ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'
                }`}>
                  <div><span className="font-medium">Total Debit:</span> ₹{totals.totalDebit.toFixed(2)}</div>
                  <div><span className="font-medium">Total Credit:</span> ₹{totals.totalCredit.toFixed(2)}</div>
                  {Math.abs(totals.diff) > 0.01 ? (
                    <div className="flex items-center gap-1 text-amber-700 font-semibold">
                      <AlertTriangle className="h-4 w-4" /> Difference ₹{Math.abs(totals.diff).toFixed(2)}
                      {totals.diff > 0 ? ' (Debit excess)' : ' (Credit excess)'}
                    </div>
                  ) : isBalanced ? (
                    <div className="flex items-center gap-1 text-emerald-700 font-semibold">
                      <CheckCircle2 className="h-4 w-4" /> Balanced
                    </div>
                  ) : null}
                </div>

                {accountIssues.length > 0 && (
                  <div className="bg-destructive/10 border border-destructive/30 rounded p-3 text-sm space-y-1">
                    {accountIssues.map(i => <div key={i} className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-destructive" />{i}</div>)}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Attachments */}
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle className="flex items-center gap-2"><Paperclip className="h-4 w-4" /> Attachments</CardTitle>
                  <label className="cursor-pointer">
                    <Input
                      type="file" multiple className="hidden"
                      onChange={e => {
                        const fs = Array.from(e.target.files ?? []);
                        if (fs.length) setStagedAttachments(prev => [...prev, ...fs]);
                      }}
                    />
                    <Button asChild variant="outline" size="sm"><span><Upload className="h-4 w-4 mr-1" /> Upload</span></Button>
                  </label>
                </div>
              </CardHeader>
              <CardContent>
                {stagedAttachments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No documents staged. Attachments are saved after the journal is posted.</p>
                ) : (
                  <ul className="space-y-2">
                    {stagedAttachments.map((f, idx) => (
                      <li key={idx} className="flex items-center justify-between border rounded px-3 py-2">
                        <span className="flex items-center gap-2 text-sm"><FileText className="h-4 w-4" /> {f.name} <span className="text-muted-foreground text-xs">({Math.round(f.size / 1024)} KB)</span></span>
                        <Button variant="ghost" size="icon" onClick={() => setStagedAttachments(prev => prev.filter((_, i) => i !== idx))}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            {/* Action bar */}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={resetForm}>Reset</Button>
              <Button
                onClick={() => postMutation.mutate()}
                disabled={!canSubmit || postMutation.isPending}
              >
                {postMutation.isPending ? 'Posting…' : 'Post Journal'}
              </Button>
            </div>
          </TabsContent>

          {/* ───────── List tab ───────── */}
          <TabsContent value="list" className="space-y-4">
            <Card>
              <CardContent className="p-4">
                <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                  <div>
                    <Label>From</Label>
                    <Input type="date" value={listFromDate} onChange={e => setListFromDate(e.target.value)} />
                  </div>
                  <div>
                    <Label>To</Label>
                    <Input type="date" value={listToDate} onChange={e => setListToDate(e.target.value)} />
                  </div>
                  <div>
                    <Label>Voucher</Label>
                    <Select value={listVoucherFilter || 'all'} onValueChange={v => setListVoucherFilter(v === 'all' ? '' : v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All voucher types</SelectItem>
                        {VOUCHER_TYPES.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="md:col-span-2">
                    <Label>Search</Label>
                    <Input
                      placeholder="Journal #, ref #, narration…"
                      value={listSearch}
                      onChange={e => setListSearch(e.target.value)}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Journals ({journalsList.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Journal #</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Voucher</TableHead>
                        <TableHead>Reference</TableHead>
                        <TableHead>Narration</TableHead>
                        <TableHead>Source</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {journalsList.map(j => (
                        <TableRow key={j.id}>
                          <TableCell className="font-medium">{j.journal_number}</TableCell>
                          <TableCell>{new Date(j.journal_date).toLocaleDateString()}</TableCell>
                          <TableCell>{j.voucher_type ?? '—'}</TableCell>
                          <TableCell>{j.reference_number ?? '—'}</TableCell>
                          <TableCell className="max-w-[280px] truncate">{j.narration}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{j.source_type ?? 'manual'}</Badge>
                          </TableCell>
                          <TableCell className="text-right">₹{Number(j.total_debit ?? 0).toFixed(2)}</TableCell>
                          <TableCell>
                            {j.is_reversed
                              ? <Badge variant="secondary">Reversed</Badge>
                              : <Badge>{j.status}</Badge>}
                            {j.attachment_count > 0 && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="ml-1 inline-flex items-center text-xs text-muted-foreground"><Paperclip className="h-3 w-3" />{j.attachment_count}</span>
                                </TooltipTrigger>
                                <TooltipContent>{j.attachment_count} attachment(s)</TooltipContent>
                              </Tooltip>
                            )}
                          </TableCell>
                          <TableCell>
                            {j.status === 'posted' && !j.is_reversed && (
                              <Button
                                variant="ghost" size="sm"
                                onClick={() => {
                                  if (window.confirm(`Reverse journal ${j.journal_number}? This creates a swap-sign reversal entry.`)) {
                                    reverseMutation.mutate(j.id);
                                  }
                                }}
                              >
                                <RotateCcw className="h-3 w-3 mr-1" /> Reverse
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                      {journalsList.length === 0 && (
                        <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">No journals in this range.</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </TooltipProvider>
  );
};

export default ManualJournals;
