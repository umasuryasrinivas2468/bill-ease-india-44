import React, { useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { SUPPORTED_CURRENCIES, formatCurrencyAmount, convertToINR, type CurrencyInfo } from '@/utils/currencyUtils';

interface CurrencySelectorProps {
  value: string;
  onChange: (code: string) => void;
  label?: string;
}

export const CurrencySelector: React.FC<CurrencySelectorProps> = ({ value, onChange, label }) => {
  return (
    <div>
      {label && <Label>{label}</Label>}
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder="Select currency" />
        </SelectTrigger>
        <SelectContent>
          {SUPPORTED_CURRENCIES.map(c => (
            <SelectItem key={c.code} value={c.code}>
              {c.symbol} {c.code} — {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};

interface CurrencyDisplayProps {
  amount: number;
  currency: string;
  showINREquivalent?: boolean;
  className?: string;
}

export const CurrencyDisplay: React.FC<CurrencyDisplayProps> = ({ amount, currency, showINREquivalent = false, className }) => {
  const formatted = formatCurrencyAmount(amount, currency);
  const inrEquivalent = currency !== 'INR' && showINREquivalent
    ? ` (≈ ${formatCurrencyAmount(convertToINR(amount, currency), 'INR')})`
    : '';

  return (
    <span className={className}>
      {formatted}{inrEquivalent}
    </span>
  );
};

export default CurrencySelector;
