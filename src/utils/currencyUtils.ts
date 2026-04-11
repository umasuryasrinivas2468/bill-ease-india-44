export interface CurrencyInfo {
  code: string;
  symbol: string;
  name: string;
  rate: number;
}

export const SUPPORTED_CURRENCIES: CurrencyInfo[] = [
  { code: 'INR', symbol: '₹', name: 'Indian Rupee', rate: 1 },
  { code: 'USD', symbol: '$', name: 'US Dollar', rate: 83.5 },
  { code: 'EUR', symbol: '€', name: 'Euro', rate: 91.2 },
  { code: 'GBP', symbol: '£', name: 'British Pound', rate: 106.5 },
  { code: 'AED', symbol: 'د.إ', name: 'UAE Dirham', rate: 22.7 },
  { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar', rate: 62.3 },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar', rate: 54.8 },
  { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar', rate: 61.2 },
  { code: 'JPY', symbol: '¥', name: 'Japanese Yen', rate: 0.56 },
  { code: 'SAR', symbol: '﷼', name: 'Saudi Riyal', rate: 22.3 },
];

export const getCurrencyByCode = (code: string): CurrencyInfo | undefined =>
  SUPPORTED_CURRENCIES.find(c => c.code === code);

export const formatCurrencyAmount = (amount: number, currencyCode: string = 'INR'): string => {
  const currency = getCurrencyByCode(currencyCode);
  if (!currency) return `₹${amount.toLocaleString('en-IN')}`;
  if (currencyCode === 'INR') {
    return `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return `${currency.symbol}${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export const convertToINR = (amount: number, fromCurrency: string): number => {
  const currency = getCurrencyByCode(fromCurrency);
  if (!currency || fromCurrency === 'INR') return amount;
  return Math.round(amount * currency.rate * 100) / 100;
};

export const convertFromINR = (amountINR: number, toCurrency: string): number => {
  const currency = getCurrencyByCode(toCurrency);
  if (!currency || toCurrency === 'INR') return amountINR;
  return Math.round((amountINR / currency.rate) * 100) / 100;
};
