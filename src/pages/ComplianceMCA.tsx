import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeftRight,
  Bell,
  Building2,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  FileCheck,
  FileText,
  FolderOpen,
  ShieldCheck,
  Sparkles,
  Star,
  Upload,
  Users,
  Zap,
  AlertTriangle,
  BadgeCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

/* ─────────────────────────── types ─────────────────────────── */

type FilingStatus = 'pending' | 'in_progress' | 'completed' | 'overdue';

interface Filing {
  id: number;
  form: string;
  description: string;
  dueDate: string;
  status: FilingStatus;
  progress: number;
  documentsUploaded: number;
  documentsRequired: number;
}

/* ─────────────────────────── mock data ─────────────────────────── */

const initialFilings: Filing[] = [
  { id: 1, form: 'AOC-4', description: 'Annual Financial Statements', dueDate: '30 Oct 2025', status: 'in_progress', progress: 55, documentsUploaded: 3, documentsRequired: 5 },
  { id: 2, form: 'MGT-7', description: 'Annual Return (FY 2024-25)', dueDate: '30 Nov 2025', status: 'pending', progress: 0, documentsUploaded: 0, documentsRequired: 4 },
  { id: 3, form: 'DIR-3 KYC', description: 'Director KYC (Web) – FY 2024-25', dueDate: '30 Sep 2025', status: 'completed', progress: 100, documentsUploaded: 2, documentsRequired: 2 },
  { id: 4, form: 'MGT-14', description: 'Filing of Board Resolutions', dueDate: '15 Aug 2025', status: 'overdue', progress: 30, documentsUploaded: 1, documentsRequired: 3 },
  { id: 5, form: 'DPT-3', description: 'Return of Deposits / Loan details', dueDate: '30 Jun 2026', status: 'pending', progress: 0, documentsUploaded: 0, documentsRequired: 3 },
];

const services = [
  {
    id: 'incorporation',
    title: 'Company Incorporation',
    subtitle: 'Start your company the right way',
    icon: Building2,
    color: 'text-violet-600',
    bg: 'bg-violet-50 dark:bg-violet-900/20',
    border: 'border-violet-200 dark:border-violet-800',
    forms: ['SPICe+', 'e-MOA', 'e-AOA', 'AGILE-Pro'],
    timeline: '15–20 working days',
    price: '₹9,999',
    features: ['Name reservation', 'DSC for 2 directors', 'DIN allotment', 'Certificate of Incorporation', 'PAN + TAN + GSTIN'],
  },
  {
    id: 'annual',
    title: 'Annual Filings',
    subtitle: 'AOC-4 & MGT-7 / MGT-7A',
    icon: FileCheck,
    color: 'text-blue-600',
    bg: 'bg-blue-50 dark:bg-blue-900/20',
    border: 'border-blue-200 dark:border-blue-800',
    forms: ['AOC-4', 'MGT-7', 'MGT-7A'],
    timeline: '7–10 working days',
    price: '₹4,999/yr',
    features: ['Financial statements filing', 'Annual return filing', 'Penalty check & guidance', 'Board/AGM compliance', 'Confirmation copy'],
  },
  {
    id: 'kyc',
    title: 'Director KYC',
    subtitle: 'DIR-3 KYC & Web KYC',
    icon: BadgeCheck,
    color: 'text-emerald-600',
    bg: 'bg-emerald-50 dark:bg-emerald-900/20',
    border: 'border-emerald-200 dark:border-emerald-800',
    forms: ['DIR-3 KYC', 'DIR-3 KYC Web'],
    timeline: '2–3 working days',
    price: '₹999/director',
    features: ['Annual DIR-3 KYC filing', 'OTP-based web KYC option', 'DIN status check', 'Reminder before deadline', 'Acknowledgement copy'],
  },
  {
    id: 'event',
    title: 'Event-Based Filings',
    subtitle: 'ROC forms triggered by company events',
    icon: Zap,
    color: 'text-orange-600',
    bg: 'bg-orange-50 dark:bg-orange-900/20',
    border: 'border-orange-200 dark:border-orange-800',
    forms: ['DIR-12', 'INC-22', 'MGT-14', 'PAS-3', 'SH-7', 'ADT-1'],
    timeline: '5–7 working days',
    price: '₹1,999+/event',
    features: ['Director appointment/resignation', 'Registered office change', 'Share allotment & capital change', 'Auditor appointment', 'Charge creation/modification'],
  },
];

const packages = [
  {
    name: 'Starter',
    price: '₹2,999',
    period: '/year',
    description: 'For newly incorporated companies',
    icon: Star,
    highlight: false,
    color: 'border-border',
    badge: null,
    features: [
      'Director KYC (1 director)',
      'Deadline reminders',
      'Document storage (500 MB)',
      'Email support',
    ],
  },
  {
    name: 'Professional',
    price: '₹7,999',
    period: '/year',
    description: 'Most popular for small Pvt Ltd companies',
    icon: ShieldCheck,
    highlight: true,
    color: 'border-primary',
    badge: 'Most Popular',
    features: [
      'Director KYC (up to 3 directors)',
      'Annual Filings – AOC-4 + MGT-7',
      'Compliance dashboard & tracking',
      'Document storage (2 GB)',
      'Compliance reminders',
      'Priority email support',
    ],
  },
  {
    name: 'Business',
    price: '₹14,999',
    period: '/year',
    description: 'For growing companies with frequent events',
    icon: Sparkles,
    highlight: false,
    color: 'border-border',
    badge: 'Best Value',
    features: [
      'Everything in Professional',
      '3 event-based filings (any form)',
      'Director KYC (unlimited)',
      'MGT-7A for small/OPC',
      'DPT-3 + MSME-1',
      'Document storage (10 GB)',
      'Dedicated compliance manager',
    ],
  },
  {
    name: 'Enterprise',
    price: '₹24,999',
    period: '/year',
    description: 'Full-service for multi-director companies',
    icon: Building2,
    highlight: false,
    color: 'border-border',
    badge: null,
    features: [
      'Everything in Business',
      'Company Incorporation (new entity)',
      'Unlimited event-based filings',
      'Document storage (unlimited)',
      'Dedicated CA support',
      'Legal advisory calls (2/month)',
      'MCA portal management',
    ],
  },
];

const reminders = [
  { form: 'DIR-3 KYC', description: 'Annual Director KYC', due: '30 Sep 2025', daysLeft: 173, urgent: false },
  { form: 'AOC-4', description: 'Annual Financial Statements', due: '30 Oct 2025', daysLeft: 203, urgent: false },
  { form: 'MGT-7', description: 'Annual Return', due: '30 Nov 2025', daysLeft: 234, urgent: false },
  { form: 'MGT-14', description: 'Board Resolution – Overdue!', due: '15 Aug 2025', daysLeft: -5, urgent: true },
  { form: 'DPT-3', description: 'Return of Deposits', due: '30 Jun 2026', daysLeft: 446, urgent: false },
];

/* ─────────────────────────── helpers ─────────────────────────── */

const statusConfig: Record<FilingStatus, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  pending:     { label: 'Pending',     color: 'text-muted-foreground', bg: 'bg-muted/60',          icon: Clock },
  in_progress: { label: 'In Progress', color: 'text-blue-700',         bg: 'bg-blue-100 dark:bg-blue-900/30', icon: FileText },
  completed:   { label: 'Completed',   color: 'text-emerald-700',      bg: 'bg-emerald-100 dark:bg-emerald-900/30', icon: CheckCircle2 },
  overdue:     { label: 'Overdue',     color: 'text-red-700',          bg: 'bg-red-100 dark:bg-red-900/30',   icon: AlertTriangle },
};

/* ─────────────────────────── component ─────────────────────────── */

const ComplianceMCA: React.FC = () => {
  const [filings, setFilings] = useState<Filing[]>(initialFilings);
  const [selectedPackage, setSelectedPackage] = useState<string | null>(null);

  const stats = {
    active: filings.filter(f => f.status === 'in_progress').length,
    pending: filings.filter(f => f.status === 'pending').length,
    overdue: filings.filter(f => f.status === 'overdue').length,
    completed: filings.filter(f => f.status === 'completed').length,
  };

  const handleUpload = (id: number) => {
    setFilings(prev =>
      prev.map(f =>
        f.id === id && f.documentsUploaded < f.documentsRequired
          ? { ...f, documentsUploaded: f.documentsUploaded + 1, status: 'in_progress' as FilingStatus, progress: Math.min(100, f.progress + 20) }
          : f
      )
    );
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,hsl(var(--primary)/0.08),transparent_30%)] p-4 md:p-6 pb-24">
      <div className="mx-auto max-w-6xl space-y-6">

        {/* ── Header ── */}
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs text-primary">
              <Building2 className="h-3.5 w-3.5" />
              Compliance / MCA Filing
            </div>
            <h1 className="mt-3 bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-3xl font-bold text-transparent md:text-4xl">
              MCA Filing Module
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              End-to-end MCA / ROC compliance — incorporation, annual filings, Director KYC, and event-based forms — with real-time status tracking and document management.
            </p>
          </div>
          <Button asChild variant="outline" className="rounded-full">
            <Link to="/compliance">
              <ArrowLeftRight className="mr-2 h-4 w-4" />
              All Compliance
            </Link>
          </Button>
        </div>

        {/* ── Stats ── */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: 'In Progress', value: stats.active,    icon: FileText,     color: 'text-blue-600',    bg: 'bg-blue-50 dark:bg-blue-900/20' },
            { label: 'Pending',     value: stats.pending,   icon: Clock,        color: 'text-amber-600',   bg: 'bg-amber-50 dark:bg-amber-900/20' },
            { label: 'Overdue',     value: stats.overdue,   icon: AlertTriangle,color: 'text-red-600',     bg: 'bg-red-50 dark:bg-red-900/20' },
            { label: 'Completed',   value: stats.completed, icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-900/20' },
          ].map((s) => (
            <Card key={s.label} className="rounded-[12px] border-white/60 bg-card/80 shadow-sm backdrop-blur">
              <CardContent className="p-4">
                <div className={cn('mb-2 inline-flex rounded-lg p-2', s.bg)}>
                  <s.icon className={cn('h-4 w-4', s.color)} />
                </div>
                <div className="text-2xl font-bold">{s.value}</div>
                <div className="text-xs text-muted-foreground">{s.label}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* ── Tabs ── */}
        <Tabs defaultValue="dashboard">
          <TabsList className="mb-2 h-11 rounded-xl border border-border/50 bg-card/80 p-1 backdrop-blur">
            <TabsTrigger value="dashboard"  className="rounded-lg text-xs sm:text-sm">Dashboard</TabsTrigger>
            <TabsTrigger value="services"   className="rounded-lg text-xs sm:text-sm">Services</TabsTrigger>
            <TabsTrigger value="filings"    className="rounded-lg text-xs sm:text-sm">My Filings</TabsTrigger>
            <TabsTrigger value="packages"   className="rounded-lg text-xs sm:text-sm">Packages</TabsTrigger>
            <TabsTrigger value="reminders"  className="rounded-lg text-xs sm:text-sm">Reminders</TabsTrigger>
          </TabsList>

          {/* ── Dashboard Tab ── */}
          <TabsContent value="dashboard" className="space-y-5">
            <div className="grid gap-5 lg:grid-cols-2">
              {/* Recent filings */}
              <Card className="rounded-[12px] border-white/60 bg-card/80 backdrop-blur">
                <CardHeader className="border-b border-border/50 px-5 py-4">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <FolderOpen className="h-4 w-4 text-primary" /> Recent Filings
                  </CardTitle>
                </CardHeader>
                <CardContent className="divide-y divide-border/50 p-0">
                  {filings.slice(0, 4).map((f) => {
                    const cfg = statusConfig[f.status];
                    const Icon = cfg.icon;
                    return (
                      <div key={f.id} className="flex items-center justify-between gap-3 px-5 py-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{f.form}</p>
                          <p className="truncate text-xs text-muted-foreground">{f.description}</p>
                          <Progress value={f.progress} className="mt-1.5 h-1.5" />
                        </div>
                        <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold whitespace-nowrap', cfg.bg, cfg.color)}>
                          <Icon className="h-3 w-3" /> {cfg.label}
                        </span>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>

              {/* Quick actions */}
              <div className="space-y-3">
                <Card className="rounded-[12px] border-white/60 bg-gradient-to-br from-primary/5 to-primary/10 backdrop-blur">
                  <CardContent className="p-5">
                    <div className="flex items-start gap-4">
                      <div className="rounded-xl bg-primary/10 p-3 text-primary">
                        <Building2 className="h-6 w-6" />
                      </div>
                      <div className="flex-1">
                        <p className="font-semibold">Start Company Incorporation</p>
                        <p className="mt-0.5 text-sm text-muted-foreground">Register your Pvt Ltd / LLP / OPC on MCA in 15 days.</p>
                        <Button size="sm" className="mt-3 rounded-full px-4" onClick={() => {}}>
                          Get Started <ChevronRight className="ml-1 h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card className="rounded-[12px] border-white/60 bg-card/80 backdrop-blur">
                  <CardContent className="p-5">
                    <div className="flex items-start gap-4">
                      <div className="rounded-xl bg-emerald-500/10 p-3 text-emerald-600">
                        <BadgeCheck className="h-6 w-6" />
                      </div>
                      <div className="flex-1">
                        <p className="font-semibold">File Director KYC</p>
                        <p className="mt-0.5 text-sm text-muted-foreground">DIR-3 KYC due 30 Sep every year. File now to avoid ₹5,000 penalty.</p>
                        <Button size="sm" variant="outline" className="mt-3 rounded-full px-4" onClick={() => {}}>
                          File KYC <ChevronRight className="ml-1 h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* Upcoming deadlines strip */}
            <Card className="rounded-[12px] border-white/60 bg-card/80 backdrop-blur">
              <CardHeader className="border-b border-border/50 px-5 py-4">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Bell className="h-4 w-4 text-primary" /> Upcoming Deadlines
                </CardTitle>
              </CardHeader>
              <CardContent className="p-5">
                <div className="flex flex-wrap gap-3">
                  {reminders.filter(r => r.daysLeft > 0).slice(0, 3).map((r) => (
                    <div key={r.form} className="flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-2 text-sm">
                      <CalendarDays className="h-3.5 w-3.5 text-primary" />
                      <span className="font-medium">{r.form}</span>
                      <span className="text-muted-foreground">— {r.due}</span>
                      <Badge variant="secondary" className="ml-1 text-[10px]">{r.daysLeft}d left</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Services Tab ── */}
          <TabsContent value="services">
            <div className="grid gap-5 sm:grid-cols-2">
              {services.map((svc) => (
                <Card key={svc.id} className={cn('rounded-[12px] border bg-card/80 backdrop-blur transition-shadow hover:shadow-lg', svc.border)}>
                  <CardContent className="p-5">
                    <div className={cn('mb-4 inline-flex rounded-xl p-3', svc.bg)}>
                      <svc.icon className={cn('h-6 w-6', svc.color)} />
                    </div>
                    <h3 className="text-lg font-semibold">{svc.title}</h3>
                    <p className="mt-0.5 text-sm text-muted-foreground">{svc.subtitle}</p>

                    <div className="mt-4 flex flex-wrap gap-1.5">
                      {svc.forms.map(f => (
                        <span key={f} className="rounded-full border border-border/60 bg-muted/50 px-2.5 py-0.5 text-[11px] font-medium">{f}</span>
                      ))}
                    </div>

                    <ul className="mt-4 space-y-1.5">
                      {svc.features.map(feat => (
                        <li key={feat} className="flex items-start gap-2 text-sm text-muted-foreground">
                          <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                          {feat}
                        </li>
                      ))}
                    </ul>

                    <div className="mt-5 flex items-center justify-between">
                      <div>
                        <span className="text-xl font-bold">{svc.price}</span>
                        <span className="ml-1 text-xs text-muted-foreground">onwards</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Clock className="h-3.5 w-3.5" /> {svc.timeline}
                      </div>
                    </div>

                    <Button className="mt-4 w-full rounded-full" variant="outline" onClick={() => {}}>
                      Initiate Filing <ChevronRight className="ml-1 h-4 w-4" />
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* ── My Filings Tab ── */}
          <TabsContent value="filings" className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">{filings.length} active filings tracked</p>
              <Button size="sm" className="rounded-full px-4" onClick={() => {}}>
                <Upload className="mr-2 h-3.5 w-3.5" /> New Filing
              </Button>
            </div>

            <div className="space-y-3">
              {filings.map((f) => {
                const cfg = statusConfig[f.status];
                const Icon = cfg.icon;
                return (
                  <Card key={f.id} className="rounded-[12px] border-white/60 bg-card/80 backdrop-blur">
                    <CardContent className="p-4 sm:p-5">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                        {/* Form info */}
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold">{f.form}</span>
                            <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-semibold', cfg.bg, cfg.color)}>
                              <Icon className="h-3 w-3" /> {cfg.label}
                            </span>
                          </div>
                          <p className="mt-0.5 text-sm text-muted-foreground">{f.description}</p>
                          <div className="mt-2 flex items-center gap-3">
                            <div className="flex-1">
                              <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                                <span>Progress</span>
                                <span>{f.progress}%</span>
                              </div>
                              <Progress value={f.progress} className="h-2" />
                            </div>
                          </div>
                        </div>

                        {/* Meta + actions */}
                        <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <CalendarDays className="h-3.5 w-3.5" />
                            Due: {f.dueDate}
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <FolderOpen className="h-3.5 w-3.5" />
                            Docs: {f.documentsUploaded}/{f.documentsRequired} uploaded
                          </div>
                          {f.status !== 'completed' && (
                            <Button size="sm" variant="outline" className="mt-1 rounded-full px-3 text-xs" onClick={() => handleUpload(f.id)}>
                              <Upload className="mr-1.5 h-3 w-3" /> Upload Doc
                            </Button>
                          )}
                          {f.status === 'completed' && (
                            <span className="flex items-center gap-1 text-xs text-emerald-600">
                              <CheckCircle2 className="h-3.5 w-3.5" /> Filing complete
                            </span>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </TabsContent>

          {/* ── Packages Tab ── */}
          <TabsContent value="packages">
            <div className="mb-4 text-sm text-muted-foreground">Choose a plan that fits your company's compliance needs.</div>
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
              {packages.map((pkg) => (
                <Card
                  key={pkg.name}
                  className={cn(
                    'relative rounded-[12px] border-2 bg-card/80 backdrop-blur transition-all hover:shadow-lg cursor-pointer',
                    pkg.highlight ? 'border-primary shadow-[0_8px_32px_-12px_hsl(var(--primary)/0.4)]' : 'border-border/50',
                    selectedPackage === pkg.name && 'ring-2 ring-primary ring-offset-2'
                  )}
                  onClick={() => setSelectedPackage(pkg.name)}
                >
                  {pkg.badge && (
                    <div className={cn(
                      'absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-0.5 text-[10px] font-bold uppercase tracking-wide',
                      pkg.highlight ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground border border-border'
                    )}>
                      {pkg.badge}
                    </div>
                  )}
                  <CardContent className="p-5">
                    <div className={cn('mb-3 inline-flex rounded-xl p-2.5', pkg.highlight ? 'bg-primary/10 text-primary' : 'bg-muted/60 text-muted-foreground')}>
                      <pkg.icon className="h-5 w-5" />
                    </div>
                    <h3 className="text-lg font-bold">{pkg.name}</h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">{pkg.description}</p>
                    <div className="mt-3 flex items-baseline gap-1">
                      <span className="text-2xl font-bold">{pkg.price}</span>
                      <span className="text-xs text-muted-foreground">{pkg.period}</span>
                    </div>
                    <ul className="mt-4 space-y-2">
                      {pkg.features.map(feat => (
                        <li key={feat} className="flex items-start gap-2 text-xs text-muted-foreground">
                          <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                          {feat}
                        </li>
                      ))}
                    </ul>
                    <Button
                      className={cn('mt-5 w-full rounded-full', pkg.highlight ? '' : 'variant-outline')}
                      variant={pkg.highlight ? 'default' : 'outline'}
                      onClick={(e) => { e.stopPropagation(); setSelectedPackage(pkg.name); }}
                    >
                      {selectedPackage === pkg.name ? (
                        <><CheckCircle2 className="mr-1.5 h-4 w-4" /> Selected</>
                      ) : 'Select Plan'}
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
            {selectedPackage && (
              <div className="mt-5 flex items-center justify-between rounded-[12px] border border-primary/30 bg-primary/5 px-5 py-4">
                <div>
                  <p className="font-semibold text-primary">Plan selected: {selectedPackage}</p>
                  <p className="text-sm text-muted-foreground">Proceed to checkout to activate your compliance plan.</p>
                </div>
                <Button className="rounded-full px-6">Proceed to Pay</Button>
              </div>
            )}
          </TabsContent>

          {/* ── Reminders Tab ── */}
          <TabsContent value="reminders" className="space-y-4">
            <div className="flex items-center gap-2 rounded-[12px] border border-amber-200 bg-amber-50 px-5 py-3 dark:border-amber-800 dark:bg-amber-900/20">
              <Bell className="h-4 w-4 text-amber-600" />
              <p className="text-sm text-amber-700 dark:text-amber-400">
                Compliance reminders are sent 30, 15, and 7 days before each due date.
              </p>
            </div>

            <div className="space-y-3">
              {reminders.map((r) => (
                <Card key={r.form} className={cn(
                  'rounded-[12px] border-white/60 bg-card/80 backdrop-blur',
                  r.urgent && 'border-red-300 dark:border-red-800'
                )}>
                  <CardContent className="flex items-center justify-between gap-4 p-4 sm:p-5">
                    <div className="flex items-center gap-4">
                      <div className={cn(
                        'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                        r.urgent ? 'bg-red-100 text-red-600 dark:bg-red-900/30' : 'bg-primary/10 text-primary'
                      )}>
                        {r.urgent ? <AlertTriangle className="h-5 w-5" /> : <CalendarDays className="h-5 w-5" />}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-semibold">{r.form}</p>
                          {r.urgent && (
                            <Badge variant="destructive" className="text-[10px]">Overdue</Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">{r.description}</p>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-medium">{r.due}</p>
                      {r.daysLeft > 0 ? (
                        <p className="text-xs text-muted-foreground">{r.daysLeft} days left</p>
                      ) : (
                        <p className="text-xs text-red-600 font-medium">{Math.abs(r.daysLeft)} days overdue</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Entity guidance */}
            <Card className="rounded-[12px] border-white/60 bg-card/80 backdrop-blur">
              <CardHeader className="border-b border-border/50 px-5 py-4">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Users className="h-4 w-4 text-primary" /> Entity-wise Checklist
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 p-5 sm:grid-cols-3">
                {[
                  { entity: 'Private Limited / Section 8', forms: ['AOC-4', 'MGT-7', 'DIR-3 KYC', 'DPT-3'] },
                  { entity: 'OPC / Small Company', forms: ['AOC-4', 'MGT-7A', 'DIR-3 KYC'] },
                  { entity: 'LLP', forms: ['LLP Form 11', 'LLP Form 8', 'Partner KYC'] },
                ].map(e => (
                  <div key={e.entity} className="rounded-xl border border-border/50 bg-muted/30 p-4">
                    <p className="mb-2 text-sm font-semibold">{e.entity}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {e.forms.map(f => (
                        <span key={f} className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary">{f}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default ComplianceMCA;
