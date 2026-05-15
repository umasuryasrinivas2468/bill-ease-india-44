import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { SidebarTrigger } from '@/components/ui/sidebar';
import {
  HandCoins,
  Wallet,
  Building2,
  FileText,
  ArrowRight,
  CheckCircle,
} from 'lucide-react';

type CreditProduct = {
  id: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  highlights: string[];
};

const products: CreditProduct[] = [
  {
    id: 'working-capital',
    title: 'Working Capital Loan',
    description: 'Cover day-to-day operating expenses, payroll, and inventory cycles.',
    icon: Wallet,
    highlights: [
      'Credit limit up to ₹2 Crores',
      'Pay interest only on amount used',
      'Revolving access whenever you need it',
    ],
  },
  {
    id: 'term-loan',
    title: 'Term Loan',
    description: 'Lump-sum funding with predictable EMIs for growth, expansion, or capex.',
    icon: Building2,
    highlights: [
      'Loan amount up to ₹5 Crores',
      'Tenure up to 5 years',
      'Fixed EMI for easy planning',
    ],
  },
  {
    id: 'invoice-discounting',
    title: 'Invoice Discounting',
    description: 'Unlock cash tied up in unpaid invoices and shorten your receivables cycle.',
    icon: FileText,
    highlights: [
      'Advance up to 90% of invoice value',
      'Funds in as fast as 24 hours',
      'No fixed EMI — pays off when buyer pays',
    ],
  },
];

const handleApply = () => {
  window.open('https://aczenloan.vercel.app', '_blank', 'noopener,noreferrer');
};

const Credit: React.FC = () => {
  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center gap-3">
        <SidebarTrigger className="md:hidden" />
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.28em] text-muted-foreground">Credit</p>
          <h1 className="mt-1 text-2xl md:text-3xl font-semibold tracking-tight">Business Credit</h1>
        </div>
      </div>

      {/* Banner */}
      <div
        className="relative overflow-hidden rounded-[18px] border border-border bg-[linear-gradient(120deg,#5b67f4_0%,#8d62c9_45%,#ff7b55_100%)]"
        style={{ aspectRatio: '5 / 1', minHeight: 160 }}
      >
        <img
          src="/credit-banner.png"
          alt="Credit"
          className="absolute inset-0 h-full w-full object-cover"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = 'none';
          }}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {products.map((product) => {
          const Icon = product.icon;
          return (
            <Card key={product.id} className="rounded-[18px] border-2 border-border/70 transition-shadow hover:shadow-lg">
              <CardHeader>
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                <CardTitle className="mt-3 text-lg">{product.title}</CardTitle>
                <CardDescription>{product.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-2 text-sm">
                  {product.highlights.map((point) => (
                    <li key={point} className="flex items-start gap-2 text-muted-foreground">
                      <CheckCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-600" />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
                <Button onClick={handleApply} className="w-full">
                  Apply Now
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="rounded-[18px] border border-primary/15 bg-primary/5">
        <CardContent className="flex flex-col items-center gap-4 p-8 text-center md:flex-row md:text-left">
          <HandCoins className="h-12 w-12 text-primary" />
          <div className="flex-1">
            <h2 className="text-xl font-semibold">Not sure which product fits?</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Share a quick brief and our credit team will recommend the right option for your business.
            </p>
          </div>
          <Button onClick={handleApply} size="lg">Talk to us</Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default Credit;
