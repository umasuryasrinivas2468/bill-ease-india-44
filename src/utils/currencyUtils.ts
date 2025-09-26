/**
 * Format number as Indian currency (INR)
 * @param amount - The amount to format
 * @param showSymbol - Whether to show ₹ symbol (default: true)
 * @returns Formatted string in Indian currency format
 */
export const formatIndianCurrency = (amount: number, showSymbol = true): string => {
  if (isNaN(amount)) return showSymbol ? '₹0.00' : '0.00';
  
  // Convert to absolute value for formatting, handle negative separately
  const isNegative = amount < 0;
  const absoluteAmount = Math.abs(amount);
  
  // Format to 2 decimal places
  const formatted = absoluteAmount.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  
  const symbol = showSymbol ? '₹' : '';
  const sign = isNegative ? '-' : '';
  
  return `${sign}${symbol}${formatted}`;
};

/**
 * Format number as compact Indian currency (with K, L, Cr notation)
 * @param amount - The amount to format
 * @param showSymbol - Whether to show ₹ symbol (default: true)
 * @returns Formatted string in compact format
 */
export const formatCompactIndianCurrency = (amount: number, showSymbol = true): string => {
  if (isNaN(amount)) return showSymbol ? '₹0' : '0';
  
  const isNegative = amount < 0;
  const absoluteAmount = Math.abs(amount);
  const symbol = showSymbol ? '₹' : '';
  const sign = isNegative ? '-' : '';
  
  if (absoluteAmount >= 10000000) { // 1 Crore
    return `${sign}${symbol}${(absoluteAmount / 10000000).toFixed(1)}Cr`;
  } else if (absoluteAmount >= 100000) { // 1 Lakh
    return `${sign}${symbol}${(absoluteAmount / 100000).toFixed(1)}L`;
  } else if (absoluteAmount >= 1000) { // 1 Thousand
    return `${sign}${symbol}${(absoluteAmount / 1000).toFixed(1)}K`;
  } else {
    return `${sign}${symbol}${absoluteAmount.toFixed(0)}`;
  }
};

/**
 * Calculate percentage of one amount relative to another
 * @param part - The partial amount
 * @param total - The total amount
 * @returns Percentage as number (0-100)
 */
export const calculatePercentage = (part: number, total: number): number => {
  if (total === 0) return 0;
  return (part / total) * 100;
};

/**
 * Calculate outstanding amount from total and paid amounts
 * @param totalAmount - Total amount due
 * @param paidAmount - Amount already paid
 * @returns Outstanding amount
 */
export const calculateOutstanding = (totalAmount: number, paidAmount: number): number => {
  return Math.max(0, totalAmount - paidAmount);
};

/**
 * Determine payment status based on amounts
 * @param totalAmount - Total amount due
 * @param paidAmount - Amount already paid
 * @returns Payment status
 */
export const determinePaymentStatus = (totalAmount: number, paidAmount: number): 'paid' | 'unpaid' | 'partial' => {
  if (paidAmount === 0) return 'unpaid';
  if (paidAmount >= totalAmount) return 'paid';
  return 'partial';
};

/**
 * Calculate days overdue from due date
 * @param dueDate - Due date string
 * @returns Number of days overdue (0 if not overdue)
 */
export const calculateOverdueDays = (dueDate: string): number => {
  const today = new Date();
  const due = new Date(dueDate);
  const diffTime = today.getTime() - due.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays > 0 ? diffDays : 0;
};

/**
 * Get aging bucket for overdue amounts
 * @param overdueDays - Number of days overdue
 * @returns Aging bucket string
 */
export const getAgingBucket = (overdueDays: number): string => {
  if (overdueDays === 0) return 'Current';
  if (overdueDays <= 30) return '1-30 days';
  if (overdueDays <= 60) return '31-60 days';
  if (overdueDays <= 90) return '61-90 days';
  return '90+ days';
};