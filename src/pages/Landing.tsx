import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  FileText,
  Users,
  BarChart3,
  Calculator,
  Shield,
  Clock,
  ArrowRight,
  Check,
  Sparkles,
  Star,
} from 'lucide-react';

const features = [
  {
    icon: FileText,
    title: 'Smart Invoicing',
    description:
      'GST-compliant invoices with automated tax calculations, recurring billing, and branded PDFs.',
  },
  {
    icon: Users,
    title: 'Client Management',
    description:
      'A single view of every customer — contact details, balances, and complete payment history.',
  },
  {
    icon: BarChart3,
    title: 'GST & Reports',
    description:
      'Generate GSTR-ready reports, P&L, and trial balance in seconds — no spreadsheets required.',
  },
  {
    icon: Calculator,
    title: 'CA Tools',
    description:
      'Ledgers, journals, chart of accounts and financial statements built for chartered accountants.',
  },
  {
    icon: Shield,
    title: 'Bank-grade Security',
    description:
      'Encrypted at rest and in transit. Role-based access and audit logs on every action.',
  },
  {
    icon: Clock,
    title: 'Save Hours Weekly',
    description:
      'Automate reminders, reconciliations and filings so you can focus on growing the business.',
  },
];

const stats = [
  { value: '10,000+', label: 'Businesses' },
  { value: '₹500 Cr+', label: 'Invoiced yearly' },
  { value: '99.9%', label: 'Uptime' },
  { value: '4.9/5', label: 'User rating' },
];

const testimonials = [
  {
    name: 'Rajesh Kumar',
    business: 'Kumar Enterprises',
    text: 'Aczen has simplified our entire invoicing and GST flow. What used to take a day now takes minutes.',
  },
  {
    name: 'Priya Sharma',
    business: 'Sharma Consultancy',
    text: 'The CA toolkit is brilliant — ledgers, P&L and filing reports all in one place. Exactly what we needed.',
  },
  {
    name: 'Mohammed Ali',
    business: 'Ali Trading Co.',
    text: 'Client management and payment tracking have never been easier. Customer support is also top-notch.',
  },
];

const monogram = (name: string) =>
  name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

const Landing = () => {
  return (
    <div className="min-h-screen bg-white text-slate-900">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-slate-200/60 bg-white/80 backdrop-blur-md">
        <div className="container mx-auto flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600">
              <span className="text-sm font-bold text-white">A</span>
            </div>
            <span className="text-lg font-semibold tracking-tight">Aczen</span>
          </Link>

          <nav className="hidden items-center gap-8 text-sm text-slate-600 md:flex">
            <a href="#features" className="hover:text-slate-900">Features</a>
            <a href="#testimonials" className="hover:text-slate-900">Customers</a>
            <a href="#pricing" className="hover:text-slate-900">Pricing</a>
          </nav>

          <div className="flex items-center gap-2">
            <Button variant="ghost" asChild className="text-sm">
              <Link to="/login">Sign in</Link>
            </Button>
            <Button asChild className="h-9 rounded-md bg-slate-900 text-sm font-medium text-white hover:bg-slate-800">
              <Link to="/signup">
                Get started
                <ArrowRight className="ml-1.5 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_theme(colors.indigo.100),_transparent_60%)]" />
        <div className="absolute inset-x-0 top-0 -z-10 h-full bg-[linear-gradient(to_right,theme(colors.slate.100)_1px,transparent_1px),linear-gradient(to_bottom,theme(colors.slate.100)_1px,transparent_1px)] bg-[size:40px_40px] opacity-40 [mask-image:radial-gradient(ellipse_at_center,black_40%,transparent_75%)]" />

        <div className="container mx-auto px-4 pb-20 pt-20 sm:px-6 sm:pt-24 lg:px-8 lg:pt-28">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/70 px-3 py-1 text-xs font-medium text-slate-600 shadow-sm backdrop-blur">
              <Sparkles className="h-3.5 w-3.5 text-indigo-600" />
              Built for Indian businesses
            </div>

            <h1 className="text-balance text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl md:text-6xl">
              Run your business on{' '}
              <span className="bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">
                one clean platform.
              </span>
            </h1>

            <p className="mx-auto mt-6 max-w-2xl text-pretty text-lg text-slate-600">
              Invoicing, GST, banking, payroll and CA tools — built for the way Indian
              businesses actually work. No spreadsheets. No chaos.
            </p>

            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button
                size="lg"
                asChild
                className="h-11 rounded-md bg-slate-900 px-6 text-sm font-medium text-white hover:bg-slate-800"
              >
                <Link to="/signup">
                  Start free trial
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button
                size="lg"
                variant="outline"
                asChild
                className="h-11 rounded-md border-slate-200 bg-white px-6 text-sm font-medium text-slate-800 hover:bg-slate-50"
              >
                <Link to="/login">Sign in</Link>
              </Button>
            </div>

            <p className="mt-4 text-xs text-slate-500">
              No credit card required · 14-day free trial · Cancel anytime
            </p>
          </div>

          {/* Preview card */}
          <div className="relative mx-auto mt-16 max-w-5xl">
            <div className="absolute -inset-x-8 -inset-y-4 -z-10 rounded-3xl bg-gradient-to-b from-indigo-100 to-transparent blur-2xl" />
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/10">
              <div className="flex items-center gap-1.5 border-b border-slate-200 bg-slate-50 px-4 py-3">
                <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
                <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                <span className="ml-3 text-xs text-slate-500">app.aczen.in / dashboard</span>
              </div>
              <div className="grid gap-4 p-6 sm:grid-cols-3">
                {[
                  { label: 'Invoiced this month', value: '₹ 12,48,900' },
                  { label: 'Outstanding', value: '₹ 2,14,500' },
                  { label: 'Pending GST filings', value: '3' },
                ].map((m) => (
                  <div key={m.label} className="rounded-lg border border-slate-200 bg-slate-50/60 p-4">
                    <p className="text-xs text-slate-500">{m.label}</p>
                    <p className="mt-1 text-xl font-semibold text-slate-900">{m.value}</p>
                  </div>
                ))}
                <div className="sm:col-span-3 rounded-lg border border-slate-200 bg-white p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-sm font-medium text-slate-700">Recent invoices</p>
                    <span className="text-xs text-slate-400">Last 7 days</span>
                  </div>
                  <div className="space-y-2">
                    {[
                      ['INV-1042', 'Kumar Enterprises', '₹ 48,200', 'Paid'],
                      ['INV-1041', 'Sharma Consultancy', '₹ 1,12,000', 'Sent'],
                      ['INV-1040', 'Ali Trading Co.', '₹ 22,500', 'Overdue'],
                    ].map(([id, client, amt, status]) => (
                      <div
                        key={id}
                        className="flex items-center justify-between rounded-md px-2 py-2 text-sm hover:bg-slate-50"
                      >
                        <span className="font-mono text-slate-500">{id}</span>
                        <span className="flex-1 px-4 text-slate-700">{client}</span>
                        <span className="mr-4 font-medium text-slate-900">{amt}</span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            status === 'Paid'
                              ? 'bg-emerald-50 text-emerald-700'
                              : status === 'Sent'
                              ? 'bg-indigo-50 text-indigo-700'
                              : 'bg-rose-50 text-rose-700'
                          }`}
                        >
                          {status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="border-y border-slate-200 bg-slate-50/60">
        <div className="container mx-auto grid grid-cols-2 gap-8 px-4 py-10 sm:px-6 md:grid-cols-4 lg:px-8">
          {stats.map((s) => (
            <div key={s.label} className="text-center">
              <p className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
                {s.value}
              </p>
              <p className="mt-1 text-xs font-medium uppercase tracking-wider text-slate-500">
                {s.label}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold uppercase tracking-wider text-indigo-600">
              Everything you need
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
              One platform. Every workflow.
            </h2>
            <p className="mt-4 text-lg text-slate-600">
              From the first invoice to year-end filing, Aczen brings your finance stack together.
            </p>
          </div>

          <div className="mt-16 grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-slate-200 bg-slate-200 md:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="group relative bg-white p-8 transition-colors hover:bg-slate-50"
              >
                <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 ring-1 ring-inset ring-indigo-100">
                  <feature.icon className="h-5 w-5 text-indigo-600" />
                </div>
                <h3 className="text-base font-semibold text-slate-900">{feature.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section id="testimonials" className="bg-slate-50/60 py-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold uppercase tracking-wider text-indigo-600">
              Loved by founders
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
              Trusted by businesses across India
            </h2>
          </div>

          <div className="mt-16 grid grid-cols-1 gap-6 md:grid-cols-3">
            {testimonials.map((t) => (
              <figure
                key={t.name}
                className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
              >
                <div>
                  <div className="flex items-center gap-1 text-amber-400">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star key={i} className="h-4 w-4 fill-current" />
                    ))}
                  </div>
                  <blockquote className="mt-4 text-sm leading-relaxed text-slate-700">
                    "{t.text}"
                  </blockquote>
                </div>
                <figcaption className="mt-6 flex items-center gap-3 border-t border-slate-100 pt-4">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-600 text-xs font-semibold text-white">
                    {monogram(t.name)}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{t.name}</p>
                    <p className="text-xs text-slate-500">{t.business}</p>
                  </div>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section id="pricing" className="py-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-600 via-indigo-700 to-slate-900 px-8 py-16 text-center sm:px-16">
            <div className="absolute inset-0 opacity-[0.15] [background-image:radial-gradient(circle_at_1px_1px,white_1px,transparent_0)] [background-size:24px_24px]" />
            <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-orange-400/20 blur-3xl" />

            <div className="relative mx-auto max-w-2xl">
              <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                Ready to transform your business?
              </h2>
              <p className="mt-4 text-lg text-white/80">
                Start your 14-day free trial today. No credit card required.
              </p>

              <ul className="mx-auto mt-8 flex max-w-xl flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-white/80">
                {['Unlimited invoices', 'GST-ready reports', 'Priority support'].map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-emerald-300" />
                    {item}
                  </li>
                ))}
              </ul>

              <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Button
                  size="lg"
                  asChild
                  className="h-11 rounded-md bg-white px-6 text-sm font-medium text-slate-900 hover:bg-slate-100"
                >
                  <Link to="/signup">
                    Get started now
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <Button
                  size="lg"
                  asChild
                  variant="outline"
                  className="h-11 rounded-md border-white/30 bg-transparent px-6 text-sm font-medium text-white hover:bg-white/10 hover:text-white"
                >
                  <Link to="/login">Sign in</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white">
        <div className="container mx-auto px-4 py-12 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
            <div className="col-span-2 md:col-span-1">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600">
                  <span className="text-sm font-bold text-white">A</span>
                </div>
                <span className="text-lg font-semibold tracking-tight text-slate-900">Aczen</span>
              </div>
              <p className="mt-4 text-sm text-slate-600">
                Smart business solutions for the modern Indian entrepreneur.
              </p>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-slate-900">Product</h4>
              <ul className="mt-4 space-y-2 text-sm text-slate-600">
                <li><a href="#features" className="hover:text-slate-900">Invoicing</a></li>
                <li><a href="#features" className="hover:text-slate-900">GST Reports</a></li>
                <li><a href="#features" className="hover:text-slate-900">Clients</a></li>
                <li><a href="#features" className="hover:text-slate-900">CA Tools</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-slate-900">Support</h4>
              <ul className="mt-4 space-y-2 text-sm text-slate-600">
                <li><span className="hover:text-slate-900">Help Center</span></li>
                <li><span className="hover:text-slate-900">Contact</span></li>
                <li><span className="hover:text-slate-900">Docs</span></li>
                <li><span className="hover:text-slate-900">Community</span></li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-slate-900">Company</h4>
              <ul className="mt-4 space-y-2 text-sm text-slate-600">
                <li><span className="hover:text-slate-900">About</span></li>
                <li><span className="hover:text-slate-900">Privacy</span></li>
                <li><span className="hover:text-slate-900">Terms</span></li>
                <li><span className="hover:text-slate-900">Blog</span></li>
              </ul>
            </div>
          </div>
          <div className="mt-12 border-t border-slate-200 pt-6 text-center text-xs text-slate-500">
            © {new Date().getFullYear()} Aczen. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
