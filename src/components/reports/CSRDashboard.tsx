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
  Heart, Plus, Trash2, Loader2, RefreshCw, CheckCircle2, AlertTriangle, XCircle, Wallet, ArrowDownToLine,
} from 'lucide-react';
import {
  fetchCSRObligation, fetchCSRAnnualReport,
  listCSRProjects, upsertCSRProject, deleteCSRProject,
  addCSRExpense, addCSRUnspentTransfer,
  CSRObligation, CSRAnnualReport, CSRProject, ScheduleVIIItem, CSRImplementationMode,
} from '@/services/financialStatementsService';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface Props { financialYear: string; companyName?: string; }

const SCHEDULE_VII_LABELS: Record<ScheduleVIIItem, string> = {
  i_eradication_hunger_poverty:     '(i) Eradicating hunger, poverty & malnutrition',
  ii_promoting_education:           '(ii) Promoting education',
  iii_gender_equality:              '(iii) Gender equality & empowering women',
  iv_environmental_sustainability:  '(iv) Environmental sustainability',
  v_national_heritage_art_culture:  '(v) National heritage, art & culture',
  vi_armed_forces_veterans:         '(vi) Benefit of armed forces veterans',
  vii_training_sports:              '(vii) Training to promote sports',
  viii_pm_relief_fund:              '(viii) PM National Relief Fund / Schedule VII funds',
  ix_technology_incubators:         '(ix) Technology incubators',
  x_rural_development:              '(x) Rural development projects',
  xi_slum_area_development:         '(xi) Slum area development',
  xii_disaster_management:          '(xii) Disaster management',
};

const IMPL_MODE_LABELS: Record<CSRImplementationMode, string> = {
  direct: 'Direct (by Company)',
  implementing_agency_sec8: 'Section 8 Company',
  implementing_agency_trust: 'Registered Trust',
  implementing_agency_society: 'Registered Society',
  implementing_agency_govt: 'Govt / PSU Agency',
};

const formatINR = (n: number | null | undefined): string => {
  if (n === null || n === undefined) return '';
  if (n === 0) return '-';
  const abs = Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 0 });
  return n < 0 ? `(${abs})` : abs;
};

const formatCrore = (n: number): string => {
  const cr = n / 10000000;
  return cr >= 1 ? `${cr.toFixed(2)} Cr` : (n / 100000).toFixed(2) + ' L';
};

const STATUS_TONE: Record<CSRObligation['compliance_status'], { tone: string; Icon: React.ComponentType<{ className?: string }>; label: string }> = {
  compliant:     { tone: 'border-emerald-500 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100', Icon: CheckCircle2, label: 'Compliant' },
  marginal:      { tone: 'border-amber-500 bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-100', Icon: AlertTriangle, label: 'Marginal' },
  non_compliant: { tone: 'border-red-500 bg-red-50 text-red-900 dark:bg-red-950/30 dark:text-red-100', Icon: XCircle, label: 'Non-Compliant' },
};

const CSRDashboard: React.FC<Props> = ({ financialYear, companyName }) => {
  const { user } = useUser();
  const [obligation, setObligation] = useState<CSRObligation | null>(null);
  const [report, setReport] = useState<CSRAnnualReport | null>(null);
  const [projects, setProjects] = useState<CSRProject[]>([]);
  const [loading, setLoading] = useState(false);

  // Project dialog state
  const [openProjectDialog, setOpenProjectDialog] = useState(false);
  const [projectCode, setProjectCode] = useState('');
  const [projectName, setProjectName] = useState('');
  const [scheduleVII, setScheduleVII] = useState<ScheduleVIIItem>('iv_environmental_sustainability');
  const [isOngoing, setIsOngoing] = useState(false);
  const [implMode, setImplMode] = useState<CSRImplementationMode>('direct');
  const [implAgency, setImplAgency] = useState('');
  const [csrRegNo, setCsrRegNo] = useState('');
  const [locationState, setLocationState] = useState('');
  const [isLocalArea, setIsLocalArea] = useState(true);
  const [budgeted, setBudgeted] = useState<number>(0);

  // Expense dialog
  const [openExpenseDialog, setOpenExpenseDialog] = useState(false);
  const [expProjectId, setExpProjectId] = useState('');
  const [expDate, setExpDate] = useState(new Date().toISOString().slice(0, 10));
  const [expAmount, setExpAmount] = useState<number>(0);
  const [expDesc, setExpDesc] = useState('');
  const [expCapex, setExpCapex] = useState(false);

  // Transfer dialog
  const [openTransferDialog, setOpenTransferDialog] = useState(false);
  const [trfType, setTrfType] = useState<'unspent_csr_account' | 'schedule_vii_fund'>('unspent_csr_account');
  const [trfDate, setTrfDate] = useState(new Date().toISOString().slice(0, 10));
  const [trfAmount, setTrfAmount] = useState<number>(0);
  const [trfDest, setTrfDest] = useState('');
  const [trfRef, setTrfRef] = useState('');

  const load = async () => {
    if (!user?.id) return;
    setLoading(true);
    const [obl, rep, pr] = await Promise.all([
      fetchCSRObligation(user.id, financialYear),
      fetchCSRAnnualReport(user.id, financialYear),
      listCSRProjects(user.id, financialYear),
    ]);
    setObligation(obl); setReport(rep); setProjects(pr);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user?.id, financialYear]);

  const resetProjectForm = () => {
    setProjectCode(''); setProjectName(''); setBudgeted(0);
    setImplAgency(''); setCsrRegNo(''); setLocationState('');
  };

  const handleSaveProject = async () => {
    if (!user?.id || !projectCode.trim() || !projectName.trim()) {
      toast.error('Project code and name are required');
      return;
    }
    try {
      await upsertCSRProject(user.id, {
        fiscal_year: financialYear,
        project_code: projectCode.trim(),
        project_name: projectName.trim(),
        schedule_vii_item: scheduleVII,
        is_ongoing: isOngoing,
        implementation_mode: implMode,
        implementing_agency_name: implAgency.trim() || null,
        implementing_agency_csr_reg_no: csrRegNo.trim() || null,
        location_state: locationState.trim() || null,
        is_local_area: isLocalArea,
        budgeted_amount: budgeted,
        status: 'planned',
      });
      toast.success('CSR project saved');
      setOpenProjectDialog(false);
      resetProjectForm();
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to save project');
    }
  };

  const handleDeleteProject = async (id?: string) => {
    if (!id) return;
    if (!confirm('Delete this project? Linked expenses will also be removed.')) return;
    try {
      await deleteCSRProject(id); toast.success('Project removed'); await load();
    } catch { toast.error('Failed to delete'); }
  };

  const handleAddExpense = async () => {
    if (!user?.id || !expProjectId || expAmount <= 0 || !expDesc.trim()) {
      toast.error('Project, amount > 0, and description required');
      return;
    }
    try {
      await addCSRExpense(user.id, expProjectId, financialYear, expDate, expAmount, expDesc.trim(), expCapex);
      toast.success('Expense recorded');
      setOpenExpenseDialog(false);
      setExpAmount(0); setExpDesc(''); setExpCapex(false); setExpProjectId('');
      await load();
    } catch (e: any) { toast.error(e?.message ?? 'Failed to record expense'); }
  };

  const handleAddTransfer = async () => {
    if (!user?.id || trfAmount <= 0 || !trfDest.trim()) {
      toast.error('Amount > 0 and destination required'); return;
    }
    try {
      await addCSRUnspentTransfer(user.id, {
        fiscal_year: financialYear,
        transfer_date: trfDate,
        amount: trfAmount,
        transfer_type: trfType,
        destination: trfDest.trim(),
        reference_number: trfRef.trim() || null,
      });
      toast.success('Transfer recorded');
      setOpenTransferDialog(false);
      setTrfAmount(0); setTrfDest(''); setTrfRef('');
      await load();
    } catch (e: any) { toast.error(e?.message ?? 'Failed to record transfer'); }
  };

  const handlePDF = () => {
    if (!report) return;
    const doc = new jsPDF('p', 'mm', 'a4');
    const w = doc.internal.pageSize.getWidth();
    doc.setFontSize(14); doc.setFont('helvetica', 'bold');
    doc.text('ANNUAL CSR REPORT', w / 2, 15, { align: 'center' });
    doc.setFontSize(10); doc.setFont('helvetica', 'normal');
    if (companyName) doc.text(companyName, w / 2, 22, { align: 'center' });
    doc.text(`Fiscal Year ${financialYear} · Annexure to Board's Report (Form CSR-2)`, w / 2, 28, { align: 'center' });

    const o = report.obligation;
    autoTable(doc, {
      startY: 36,
      head: [['CSR Obligation Computation', 'Amount (₹)']],
      body: [
        ['PAT — Preceding FY 1', formatINR(o.pat_preceding_fy_1)],
        ['PAT — Preceding FY 2', formatINR(o.pat_preceding_fy_2)],
        ['PAT — Preceding FY 3', formatINR(o.pat_preceding_fy_3)],
        ['Sum of 3 FYs', formatINR(o.sum_3yr)],
        ['Average net profit (3 yr)', formatINR(o.average_net_profit_3yr)],
        ['CSR obligation @ 2%', formatINR(o.obligation_2pct)],
        ['Amount spent during the year', formatINR(o.amount_spent)],
        ['Transferred to Unspent CSR A/c / Sch VII Funds', formatINR(o.amount_transferred_to_funds)],
        ['Unspent balance', formatINR(o.unspent_balance)],
        ['Compliance status', o.compliance_status.replace(/_/g, ' ').toUpperCase()],
      ],
      styles: { fontSize: 9, cellPadding: 1.5 },
      headStyles: { fillColor: [40, 40, 40], textColor: 255 },
      columnStyles: { 0: { cellWidth: 110 }, 1: { halign: 'right' } },
    });

    let y = (doc as any).lastAutoTable.finalY + 8;
    if (report.projects.length > 0) {
      autoTable(doc, {
        startY: y,
        head: [['Project Code', 'Project Name', 'Sch VII', 'Budgeted', 'Spent', 'Status']],
        body: report.projects.map(p => [
          p.project_code, p.project_name,
          p.schedule_vii_item.split('_')[0],
          formatINR(p.budgeted_amount), formatINR(p.amount_spent), p.status,
        ]),
        styles: { fontSize: 8, cellPadding: 1.3 },
        headStyles: { fillColor: [40, 40, 40], textColor: 255 },
        columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' } },
      });
    }

    doc.save(`CSR_Annual_Report_${financialYear}.pdf`);
    toast.success('CSR Annual Report PDF downloaded');
  };

  if (loading && !obligation) {
    return (
      <Card><CardContent className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Computing CSR obligation…
      </CardContent></Card>
    );
  }
  if (!obligation) return null;

  const status = STATUS_TONE[obligation.compliance_status];

  return (
    <div className="space-y-4">
      {/* Obligation status banner */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <Heart className="h-4 w-4 text-red-500" /> Corporate Social Responsibility (§135)
            </CardTitle>
            <CardDescription>
              FY {financialYear} · 2% obligation on avg net profit of preceding 3 FYs · Companies Act 2013
            </CardDescription>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <Button size="sm" variant="outline" onClick={load} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              <span className="ml-1.5 hidden sm:inline">Refresh</span>
            </Button>
            <Button size="sm" variant="outline" onClick={handlePDF} disabled={!report}>
              <ArrowDownToLine className="h-4 w-4" />
              <span className="ml-1.5 hidden sm:inline">Annual Report PDF</span>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {!obligation.applicability_threshold_met && (
            <div className="rounded-md border border-sky-300 bg-sky-50 p-3 mb-3 text-sm dark:bg-sky-950/30 dark:border-sky-800">
              <strong>Applicability:</strong> Based on declared PAT, §135 may not apply this year.
              Net-profit threshold is ₹5 Cr. Other thresholds (Net Worth ≥ ₹500 Cr / Turnover ≥ ₹1000 Cr)
              also trigger applicability — confirm with your CFO if those apply.
            </div>
          )}

          <div className={cn('rounded-lg border-l-4 border p-3 mb-3', status.tone)}>
            <div className="flex items-center gap-2">
              <status.Icon className="h-5 w-5" />
              <span className="font-semibold">{status.label}</span>
              <Badge variant="outline" className="ml-2 text-[10px]">
                Spent ₹ {formatCrore(obligation.amount_spent)} of ₹ {formatCrore(obligation.obligation_2pct)} obligation
              </Badge>
            </div>
            {obligation.unspent_balance > 0 && (
              <p className="text-xs mt-2">
                <strong>Unspent: ₹ {formatINR(obligation.unspent_balance)}.</strong>
                {' '}For ongoing projects, transfer to <em>Unspent CSR Account</em> within 30 days of FY-end (§135(6)).
                For other unspent amounts, transfer to a Schedule VII fund within 6 months (§135(5) proviso).
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <div className="rounded-lg border bg-muted/20 p-3">
              <div className="text-[10px] uppercase text-muted-foreground">Avg Net Profit (3 yr)</div>
              <div className="text-base font-semibold tabular-nums">₹ {formatCrore(obligation.average_net_profit_3yr)}</div>
              <div className="text-[10px] text-muted-foreground">PAT-based · ₹ {formatINR(obligation.average_net_profit_3yr)}</div>
            </div>
            <div className="rounded-lg border bg-muted/20 p-3">
              <div className="text-[10px] uppercase text-muted-foreground">CSR Obligation (2%)</div>
              <div className="text-base font-semibold tabular-nums">₹ {formatINR(obligation.obligation_2pct)}</div>
            </div>
            <div className="rounded-lg border bg-muted/20 p-3">
              <div className="text-[10px] uppercase text-muted-foreground">Amount Spent</div>
              <div className="text-base font-semibold tabular-nums text-emerald-600">₹ {formatINR(obligation.amount_spent)}</div>
            </div>
            <div className="rounded-lg border bg-muted/20 p-3">
              <div className="text-[10px] uppercase text-muted-foreground">Unspent Balance</div>
              <div className={cn('text-base font-semibold tabular-nums',
                obligation.unspent_balance > 0 ? 'text-red-600' : 'text-emerald-600')}>
                ₹ {formatINR(obligation.unspent_balance)}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">CSR Projects · Expenses · Transfers</CardTitle>
          <CardDescription>Project-wise spending tracker. Form CSR-2 Annexure data.</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="projects">
            <TabsList>
              <TabsTrigger value="projects">Projects ({projects.length})</TabsTrigger>
              <TabsTrigger value="transfers">Unspent Transfers ({report?.unspent_transfers.length ?? 0})</TabsTrigger>
            </TabsList>

            <TabsContent value="projects" className="space-y-3 pt-3">
              <div className="flex flex-wrap justify-end gap-2">
                <Dialog open={openExpenseDialog} onOpenChange={setOpenExpenseDialog}>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="outline" disabled={projects.length === 0}>
                      <Wallet className="h-4 w-4 mr-1.5" />Record Expense
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                      <DialogTitle>Record CSR expense</DialogTitle>
                      <DialogDescription>Disbursement against a CSR project</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3 py-2">
                      <div className="space-y-1.5">
                        <Label>Project *</Label>
                        <Select value={expProjectId} onValueChange={setExpProjectId}>
                          <SelectTrigger><SelectValue placeholder="Choose project" /></SelectTrigger>
                          <SelectContent>
                            {projects.map(p => <SelectItem key={p.id} value={p.id!}>{p.project_name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label htmlFor="e-date">Date *</Label>
                          <Input id="e-date" type="date" value={expDate} onChange={(e) => setExpDate(e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="e-amt">Amount (₹) *</Label>
                          <Input id="e-amt" type="number" min={0} step="0.01" value={expAmount}
                                 onChange={(e) => setExpAmount(parseFloat(e.target.value) || 0)} />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="e-desc">Description *</Label>
                        <Textarea id="e-desc" rows={2} value={expDesc} onChange={(e) => setExpDesc(e.target.value)} />
                      </div>
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={expCapex} onChange={(e) => setExpCapex(e.target.checked)} />
                        Capital expenditure (creates an asset)
                      </label>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setOpenExpenseDialog(false)}>Cancel</Button>
                      <Button onClick={handleAddExpense}>Record</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>

                <Dialog open={openProjectDialog} onOpenChange={(o) => { setOpenProjectDialog(o); if (!o) resetProjectForm(); }}>
                  <DialogTrigger asChild>
                    <Button size="sm"><Plus className="h-4 w-4 mr-1.5" />New Project</Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                      <DialogTitle>New CSR project</DialogTitle>
                      <DialogDescription>Per Schedule VII, Companies Act 2013</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3 py-2">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label htmlFor="p-code">Project code *</Label>
                          <Input id="p-code" placeholder="CSR-2025-01" value={projectCode}
                                 onChange={(e) => setProjectCode(e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="p-budget">Budgeted Amount (₹)</Label>
                          <Input id="p-budget" type="number" min={0} step="0.01" value={budgeted}
                                 onChange={(e) => setBudgeted(parseFloat(e.target.value) || 0)} />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="p-name">Project name *</Label>
                        <Input id="p-name" value={projectName} onChange={(e) => setProjectName(e.target.value)} />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Schedule VII focus area *</Label>
                        <Select value={scheduleVII} onValueChange={(v) => setScheduleVII(v as ScheduleVIIItem)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent className="max-h-72">
                            {Object.entries(SCHEDULE_VII_LABELS).map(([v, label]) => (
                              <SelectItem key={v} value={v}>{label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label>Implementation Mode</Label>
                          <Select value={implMode} onValueChange={(v) => setImplMode(v as CSRImplementationMode)}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {Object.entries(IMPL_MODE_LABELS).map(([v, label]) => (
                                <SelectItem key={v} value={v}>{label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="p-state">State</Label>
                          <Input id="p-state" value={locationState} onChange={(e) => setLocationState(e.target.value)} />
                        </div>
                      </div>
                      {implMode !== 'direct' && (
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <Label htmlFor="p-agency">Implementing Agency</Label>
                            <Input id="p-agency" value={implAgency} onChange={(e) => setImplAgency(e.target.value)} />
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor="p-reg">CSR Reg. No.</Label>
                            <Input id="p-reg" placeholder="CSR000XXXXX" value={csrRegNo}
                                   onChange={(e) => setCsrRegNo(e.target.value)} />
                          </div>
                        </div>
                      )}
                      <div className="flex flex-col gap-2">
                        <label className="flex items-center gap-2 text-sm">
                          <input type="checkbox" checked={isOngoing} onChange={(e) => setIsOngoing(e.target.checked)} />
                          Ongoing project (multi-year per Rule 2(1)(i))
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                          <input type="checkbox" checked={isLocalArea} onChange={(e) => setIsLocalArea(e.target.checked)} />
                          Local area preference (§135(5))
                        </label>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setOpenProjectDialog(false)}>Cancel</Button>
                      <Button onClick={handleSaveProject}>Save</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>

              {projects.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  No CSR projects yet for FY {financialYear}.
                </div>
              ) : (
                <div className="rounded-md border overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Code</th>
                        <th className="px-3 py-2 text-left font-medium">Project Name</th>
                        <th className="px-3 py-2 text-left font-medium">Sch VII</th>
                        <th className="px-3 py-2 text-center font-medium">Type</th>
                        <th className="px-3 py-2 text-right font-medium">Budgeted</th>
                        <th className="px-3 py-2 text-right font-medium">Spent</th>
                        <th className="px-3 py-2 text-center font-medium">Status</th>
                        <th className="px-3 py-2 text-right font-medium">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report?.projects.map(p => (
                        <tr key={p.project_id} className="border-t hover:bg-muted/20">
                          <td className="px-3 py-1.5 font-mono text-xs">{p.project_code}</td>
                          <td className="px-3 py-1.5">{p.project_name}</td>
                          <td className="px-3 py-1.5 text-xs">{SCHEDULE_VII_LABELS[p.schedule_vii_item]}</td>
                          <td className="px-3 py-1.5 text-center">
                            {p.is_ongoing
                              ? <Badge variant="default" className="text-[10px]">Ongoing</Badge>
                              : <Badge variant="secondary" className="text-[10px]">One-time</Badge>}
                          </td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{formatINR(p.budgeted_amount)}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums font-medium">{formatINR(p.amount_spent)}</td>
                          <td className="px-3 py-1.5 text-center">
                            <Badge variant="outline" className="text-[10px]">{p.status}</Badge>
                          </td>
                          <td className="px-3 py-1.5 text-right">
                            <Button size="sm" variant="ghost" onClick={() => handleDeleteProject(p.project_id)}>
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

            <TabsContent value="transfers" className="space-y-3 pt-3">
              <div className="flex justify-end">
                <Dialog open={openTransferDialog} onOpenChange={setOpenTransferDialog}>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="outline">
                      <Wallet className="h-4 w-4 mr-1.5" />Record Transfer
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                      <DialogTitle>Record unspent CSR transfer</DialogTitle>
                      <DialogDescription>§135(5) Schedule VII fund or §135(6) Unspent CSR Account</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3 py-2">
                      <div className="space-y-1.5">
                        <Label>Transfer type</Label>
                        <Select value={trfType} onValueChange={(v) => setTrfType(v as any)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="unspent_csr_account">Unspent CSR Account (ongoing projects, §135(6))</SelectItem>
                            <SelectItem value="schedule_vii_fund">Schedule VII Fund (§135(5) proviso)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label htmlFor="t-date">Transfer date *</Label>
                          <Input id="t-date" type="date" value={trfDate} onChange={(e) => setTrfDate(e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="t-amt">Amount (₹) *</Label>
                          <Input id="t-amt" type="number" min={0} step="0.01" value={trfAmount}
                                 onChange={(e) => setTrfAmount(parseFloat(e.target.value) || 0)} />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="t-dest">Destination *</Label>
                        <Input id="t-dest" placeholder="e.g. PM National Relief Fund / Unspent CSR A/c No. XXXXX"
                               value={trfDest} onChange={(e) => setTrfDest(e.target.value)} />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="t-ref">Reference #</Label>
                        <Input id="t-ref" value={trfRef} onChange={(e) => setTrfRef(e.target.value)} />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setOpenTransferDialog(false)}>Cancel</Button>
                      <Button onClick={handleAddTransfer}>Record</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>

              {(!report?.unspent_transfers || report.unspent_transfers.length === 0) ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  No transfers recorded for FY {financialYear}.
                </div>
              ) : (
                <div className="rounded-md border overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Date</th>
                        <th className="px-3 py-2 text-left font-medium">Type</th>
                        <th className="px-3 py-2 text-left font-medium">Destination</th>
                        <th className="px-3 py-2 text-left font-medium">Reference</th>
                        <th className="px-3 py-2 text-right font-medium">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.unspent_transfers.map((t, i) => (
                        <tr key={i} className="border-t">
                          <td className="px-3 py-1.5 text-xs">{new Date(t.transfer_date).toLocaleDateString('en-IN')}</td>
                          <td className="px-3 py-1.5">
                            <Badge variant="outline" className="text-[10px]">
                              {t.transfer_type === 'unspent_csr_account' ? '§135(6) Unspent A/c' : '§135(5) Sch VII Fund'}
                            </Badge>
                          </td>
                          <td className="px-3 py-1.5 text-xs">{t.destination}</td>
                          <td className="px-3 py-1.5 font-mono text-[11px] text-muted-foreground">{t.reference ?? '—'}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{formatINR(t.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default CSRDashboard;
