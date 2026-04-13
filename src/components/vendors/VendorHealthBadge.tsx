import React from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export interface VendorScore {
  score: number;
  label: 'Excellent' | 'Good' | 'Fair' | 'Poor' | 'New';
  breakdown: {
    payment: number;      // max 40
    outstanding: number;  // max 30
    profile: number;      // max 20
    activity: number;     // max 10
  };
  stats: {
    totalBills: number;
    paidBills: number;
    overdueBills: number;
    outstandingAmount: number;
    totalAmount: number;
  };
}

const LABEL_CONFIG = {
  Excellent: { badge: 'bg-green-100 text-green-800 border-green-200', dot: 'bg-green-500', bar: 'bg-green-500' },
  Good:      { badge: 'bg-blue-100 text-blue-800 border-blue-200',    dot: 'bg-blue-500',  bar: 'bg-blue-500' },
  Fair:      { badge: 'bg-amber-100 text-amber-800 border-amber-200', dot: 'bg-amber-400', bar: 'bg-amber-400' },
  Poor:      { badge: 'bg-red-100 text-red-800 border-red-200',       dot: 'bg-red-500',   bar: 'bg-red-500' },
  New:       { badge: 'bg-gray-100 text-gray-500 border-gray-200',    dot: 'bg-gray-400',  bar: 'bg-gray-400' },
};

interface Props {
  score: VendorScore;
}

function ScoreBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-medium w-8 text-right">{value}/{max}</span>
    </div>
  );
}

export default function VendorHealthBadge({ score }: Props) {
  const cfg = LABEL_CONFIG[score.label];

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold cursor-help select-none ${cfg.badge}`}
          >
            <div className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
            {score.label}
            {score.label !== 'New' && (
              <span className="opacity-50 font-normal">· {score.score}</span>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="right" className="w-56 p-3">
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-sm">Vendor Health</span>
              {score.label !== 'New' && (
                <span className={`text-sm font-bold ${score.score >= 80 ? 'text-green-600' : score.score >= 60 ? 'text-blue-600' : score.score >= 40 ? 'text-amber-600' : 'text-red-600'}`}>
                  {score.score}/100
                </span>
              )}
            </div>

            {score.label === 'New' ? (
              <p className="text-xs text-muted-foreground">No bills recorded yet. Score will be calculated once transactions begin.</p>
            ) : (
              <>
                <div className="space-y-1.5">
                  <div className="space-y-0.5">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Payment behavior</span>
                    </div>
                    <ScoreBar value={score.breakdown.payment} max={40} color={cfg.bar} />
                  </div>
                  <div className="space-y-0.5">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Low outstanding</span>
                    </div>
                    <ScoreBar value={score.breakdown.outstanding} max={30} color={cfg.bar} />
                  </div>
                  <div className="space-y-0.5">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Profile completeness</span>
                    </div>
                    <ScoreBar value={score.breakdown.profile} max={20} color={cfg.bar} />
                  </div>
                  <div className="space-y-0.5">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Recent activity</span>
                    </div>
                    <ScoreBar value={score.breakdown.activity} max={10} color={cfg.bar} />
                  </div>
                </div>

                <div className="border-t pt-2 text-xs text-muted-foreground space-y-0.5">
                  <div>{score.stats.paidBills}/{score.stats.totalBills} bills paid</div>
                  {score.stats.overdueBills > 0 && (
                    <div className="text-red-600">{score.stats.overdueBills} overdue</div>
                  )}
                  {score.stats.outstandingAmount > 0 && (
                    <div>₹{score.stats.outstandingAmount.toLocaleString()} outstanding</div>
                  )}
                </div>
              </>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ── Score computation ────────────────────────────────────────────────────────

interface BillLike {
  status?: string | null;
  total_amount?: number | null;
  bill_date?: string | null;
  due_date?: string | null;
}

interface VendorLike {
  gst_number?: string | null;
  pan?: string | null;
  bank_ifsc?: string | null;
  bank_account_number?: string | null;
  email?: string | null;
  phone?: string | null;
}

export function computeVendorScore(bills: BillLike[], vendor: VendorLike): VendorScore {
  const totalBills = bills.length;

  if (totalBills === 0) {
    // Profile-only score for new vendors
    let profile = 0;
    if (vendor.gst_number) profile += 5;
    if (vendor.pan) profile += 5;
    if (vendor.bank_ifsc && vendor.bank_account_number) profile += 5;
    if (vendor.email && vendor.phone) profile += 5;

    return {
      score: profile,
      label: 'New',
      breakdown: { payment: 0, outstanding: 0, profile, activity: 0 },
      stats: { totalBills: 0, paidBills: 0, overdueBills: 0, outstandingAmount: 0, totalAmount: 0 },
    };
  }

  const paidBills = bills.filter(b => b.status === 'paid').length;
  const overdueBills = bills.filter(b => b.status === 'overdue').length;
  const totalAmount = bills.reduce((s, b) => s + Number(b.total_amount || 0), 0);
  const outstandingAmount = bills
    .filter(b => b.status !== 'paid')
    .reduce((s, b) => s + Number(b.total_amount || 0), 0);

  // 1. Payment Score (max 40)
  const paymentRate = paidBills / totalBills;
  const basePayment = Math.round(paymentRate * 30);
  const overdueDeduct = Math.min(10, overdueBills * 3);
  const payment = Math.max(0, basePayment + (overdueBills === 0 ? 10 : 10 - overdueDeduct));

  // 2. Outstanding Score (max 30)
  const outstandingRatio = totalAmount > 0 ? outstandingAmount / totalAmount : 0;
  const outstanding = Math.round((1 - outstandingRatio) * 30);

  // 3. Profile Completeness (max 20)
  let profile = 0;
  if (vendor.gst_number) profile += 5;
  if (vendor.pan) profile += 5;
  if (vendor.bank_ifsc && vendor.bank_account_number) profile += 5;
  if (vendor.email && vendor.phone) profile += 5;

  // 4. Activity Score (max 10)
  let activity = 5; // has bills
  const hasRecentBill = bills.some(b => {
    if (!b.bill_date) return false;
    const days = (Date.now() - new Date(b.bill_date).getTime()) / 86_400_000;
    return days <= 90;
  });
  if (hasRecentBill) activity = 10;

  const score = Math.min(100, payment + outstanding + profile + activity);

  const label: VendorScore['label'] =
    score >= 80 ? 'Excellent' :
    score >= 60 ? 'Good' :
    score >= 40 ? 'Fair' : 'Poor';

  return {
    score,
    label,
    breakdown: { payment, outstanding, profile, activity },
    stats: { totalBills, paidBills, overdueBills, outstandingAmount, totalAmount },
  };
}
