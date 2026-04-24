import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertTriangle, Clock, Coins, Receipt } from 'lucide-react';
import {
  computePenalty,
  formatINR,
  INTEREST_RATE_PA,
  LATE_FEE_PER_DAY,
  LATE_FEE_PER_DAY_NIL,
  LATE_FEE_CAP,
} from '@/lib/gst';

interface Props {
  defaultTaxPayable?: number;
  defaultDueDate?: string;
}

// Default GSTR-3B due date: 20th of the month following the return period
function defaultDueDateForMonth(yyyyMm?: string): string {
  const now = new Date();
  const [y, m] = (yyyyMm ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`)
    .split('-')
    .map(Number);
  // Due 20th of next month
  const due = new Date(Date.UTC(y, m, 20));
  return due.toISOString().slice(0, 10);
}

const GSTPenaltyCalculator: React.FC<Props> = ({
  defaultTaxPayable = 0,
  defaultDueDate,
}) => {
  const [taxPayable, setTaxPayable] = useState<number>(defaultTaxPayable);
  const [dueDate, setDueDate] = useState<string>(
    defaultDueDate ?? defaultDueDateForMonth(),
  );
  const [filingDate, setFilingDate] = useState<string>(
    new Date().toISOString().slice(0, 10),
  );
  const [isNil, setIsNil] = useState(false);

  const result = computePenalty({
    tax_payable: taxPayable,
    due_date: dueDate,
    filing_date: filingDate,
    is_nil_return: isNil,
  });

  const isLate = result.days_late > 0;

  return (
    <Card className={isLate ? 'border-amber-300' : ''}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-amber-600" />
          Interest & Late Fee Calculator
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Estimate GSTR-3B penalty if you file past the due date. Interest at{' '}
          {INTEREST_RATE_PA}% p.a. on tax, late fee ₹{LATE_FEE_PER_DAY}/day (₹
          {LATE_FEE_PER_DAY_NIL}/day for nil), capped at {formatINR(LATE_FEE_CAP)}.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="space-y-1">
            <Label htmlFor="tax_payable" className="text-xs">
              Tax Payable (₹)
            </Label>
            <Input
              id="tax_payable"
              type="number"
              min={0}
              step="0.01"
              value={taxPayable}
              onChange={(e) => setTaxPayable(Number(e.target.value) || 0)}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="due_date" className="text-xs">
              Due Date
            </Label>
            <Input
              id="due_date"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="filing_date" className="text-xs">
              Filing Date
            </Label>
            <Input
              id="filing_date"
              type="date"
              value={filingDate}
              onChange={(e) => setFilingDate(e.target.value)}
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Checkbox
            id="is_nil"
            checked={isNil}
            onCheckedChange={(v) => setIsNil(Boolean(v))}
          />
          <Label htmlFor="is_nil" className="text-sm cursor-pointer">
            Nil return (no outward supplies)
          </Label>
        </div>

        {/* Result */}
        {!isLate ? (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-sm text-green-800">
            ✓ Filing on or before due date — no penalty.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <StatBox
                label="Days Late"
                value={`${result.days_late} day${result.days_late === 1 ? '' : 's'}`}
                icon={<Clock className="h-4 w-4" />}
                color="text-amber-800 bg-amber-50 border-amber-200"
              />
              <StatBox
                label="Interest (18% p.a.)"
                value={formatINR(result.interest)}
                icon={<Receipt className="h-4 w-4" />}
                color="text-red-800 bg-red-50 border-red-200"
              />
              <StatBox
                label="Late Fee"
                value={formatINR(result.late_fee)}
                icon={<Coins className="h-4 w-4" />}
                color="text-red-800 bg-red-50 border-red-200"
              />
            </div>

            <div className="bg-red-50 border border-red-300 rounded-lg p-4 flex items-center justify-between">
              <div>
                <div className="text-xs uppercase tracking-wide text-red-700">
                  Estimated Total Penalty
                </div>
                <div className="text-2xl font-bold text-red-800">
                  {formatINR(result.total_penalty)}
                </div>
              </div>
              <AlertTriangle className="h-8 w-8 text-red-600" />
            </div>
          </>
        )}

        <p className="text-xs text-muted-foreground">
          Estimate only. Final figures are computed by GSTN at the time of challan generation.
          Late fee shown is for one Act (CGST); SGST Act applies an equal amount separately under
          most state notifications.
        </p>
      </CardContent>
    </Card>
  );
};

const StatBox: React.FC<{
  label: string;
  value: string;
  icon: React.ReactNode;
  color: string;
}> = ({ label, value, icon, color }) => (
  <div className={`border rounded-lg p-4 ${color}`}>
    <div className="flex items-center gap-1.5 text-xs uppercase tracking-wide">
      {icon}
      {label}
    </div>
    <div className="text-xl font-bold mt-1">{value}</div>
  </div>
);

export default GSTPenaltyCalculator;
