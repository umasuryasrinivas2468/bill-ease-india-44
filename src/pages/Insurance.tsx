import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { SidebarTrigger } from '@/components/ui/sidebar';
import {
  Umbrella,
  HeartPulse,
  UserCheck,
  ShieldAlert,
  ArrowRight,
  CheckCircle,
} from 'lucide-react';

type InsuranceProduct = {
  id: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  highlights: string[];
};

const products: InsuranceProduct[] = [
  {
    id: 'group-health',
    title: 'Group Health',
    description: 'Health cover for your team — including spouse, kids, and parents.',
    icon: HeartPulse,
    highlights: [
      'Sum insured starting at ₹3 Lakhs per employee',
      'No medical tests for enrolment',
      'Cashless network of 7,000+ hospitals',
    ],
  },
  {
    id: 'directors-cover',
    title: "Director's Cover",
    description: 'D&O liability cover that protects directors and officers from personal claims.',
    icon: UserCheck,
    highlights: [
      'Defence costs covered',
      'Cover for past and future directors',
      'Tailored limits up to ₹50 Crores',
    ],
  },
  {
    id: 'business-liability',
    title: 'Business Liability',
    description: 'Third-party liability protection for property damage and bodily injury claims.',
    icon: ShieldAlert,
    highlights: [
      'Public + product liability bundled',
      'Worldwide jurisdiction options',
      'Legal defence and settlement costs included',
    ],
  },
];

const handleEnquire = () => {
  window.open('mailto:insurance@aczen.com?subject=Insurance%20Enquiry', '_blank', 'noopener,noreferrer');
};

const Insurance: React.FC = () => {
  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center gap-3">
        <SidebarTrigger className="md:hidden" />
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.28em] text-muted-foreground">Insurance</p>
          <h1 className="mt-1 text-2xl md:text-3xl font-semibold tracking-tight">Business Insurance</h1>
        </div>
      </div>

      {/* Banner */}
      <div
        className="relative overflow-hidden rounded-[18px] border border-border bg-[linear-gradient(120deg,#3aa1ff_0%,#5b67f4_50%,#8d62c9_100%)]"
        style={{ aspectRatio: '5 / 1', minHeight: 160 }}
      >
        <img
          src="/insurance-banner.png"
          alt="Insurance"
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
                <Button onClick={handleEnquire} className="w-full">
                  Get a Quote
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="rounded-[18px] border border-primary/15 bg-primary/5">
        <CardContent className="flex flex-col items-center gap-4 p-8 text-center md:flex-row md:text-left">
          <Umbrella className="h-12 w-12 text-primary" />
          <div className="flex-1">
            <h2 className="text-xl font-semibold">Need a custom policy?</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Tell us about your business and we'll structure a cover that's right for you.
            </p>
          </div>
          <Button onClick={handleEnquire} size="lg">Speak to an advisor</Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default Insurance;
