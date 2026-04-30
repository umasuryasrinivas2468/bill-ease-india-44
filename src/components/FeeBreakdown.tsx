import React, { useEffect, useState } from 'react';
import { Loader2, TrendingDown, Building2, CreditCard, User } from 'lucide-react';

interface FeeBreakdownProps {
  totalAmount: number;
  userId: string;
  className?: string;
  onFeesCalculated?: (totalFees: number) => void;
}

interface FeeCalculation {
  platform_fee: number;
  gateway_fee: number;
  other_fees: number;
  total_fees: number;
  vendor_amount: number;
  breakdown: Array<{
    type: string;
    name: string;
    amount: number;
    calculation: string;
  }>;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://vhntnkvtzmerpdhousfr.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const FeeBreakdown: React.FC<FeeBreakdownProps> = ({ totalAmount, userId, className = '', onFeesCalculated }) => {
  const [loading, setLoading] = useState(true);
  const [fees, setFees] = useState<FeeCalculation | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchFeeBreakdown();
  }, [totalAmount, userId]);

  const fetchFeeBreakdown = async () => {
    try {
      setLoading(true);
      setError('');

      console.log('[FeeBreakdown] Fetching fees for:', {
        totalAmount,
        userId,
        url: `${SUPABASE_URL}/functions/v1/calculate-transaction-fees`
      });

      const response = await fetch(`${SUPABASE_URL}/functions/v1/calculate-transaction-fees`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          invoiceId: 'preview', // Preview mode
          userId: userId,
          totalAmount: totalAmount,
        }),
      });

      const data = await response.json();
      console.log('[FeeBreakdown] Response:', data);

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to calculate fees');
      }

      const feeData = {
        platform_fee: data.fees.platform,
        gateway_fee: data.fees.gateway,
        other_fees: data.fees.other,
        total_fees: data.fees.total,
        vendor_amount: data.vendor_amount,
        breakdown: data.breakdown || [],
      };

      console.log('[FeeBreakdown] Calculated fees:', feeData);
      setFees(feeData);
      
      // Notify parent component of total fees
      if (onFeesCalculated) {
        onFeesCalculated(feeData.total_fees);
      }
    } catch (err: any) {
      console.error('[FeeBreakdown] Error:', err);
      setError(err.message || 'Could not calculate fees');
      if (onFeesCalculated) {
        onFeesCalculated(0);
      }
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) =>
    `₹${Number(amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const getIcon = (type: string) => {
    switch (type) {
      case 'platform':
        return <Building2 className="h-4 w-4" />;
      case 'gateway':
        return <CreditCard className="h-4 w-4" />;
      case 'vendor':
        return <User className="h-4 w-4" />;
      default:
        return <TrendingDown className="h-4 w-4" />;
    }
  };

  if (loading) {
    return (
      <div className={`flex items-center justify-center gap-2 text-sm text-gray-500 py-4 ${className}`}>
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Calculating fees...</span>
      </div>
    );
  }

  if (error || !fees) {
    // Show error for debugging
    return (
      <div className={`space-y-2 ${className}`}>
        <div className="flex items-center gap-2 text-xs text-red-500">
          <TrendingDown className="h-3.5 w-3.5" />
          <span className="font-semibold">Fee Calculation Issue</span>
        </div>
        <div className="text-xs text-red-600 bg-red-50 p-3 rounded-lg">
          {error || 'Could not load fee structure'}
          <div className="mt-2 text-[10px] text-gray-500">
            <div>URL: {SUPABASE_URL}</div>
            <div>User ID: {userId}</div>
            <div>Amount: ₹{totalAmount}</div>
          </div>
        </div>
      </div>
    );
  }

  const totalWithFees = totalAmount + fees.total_fees;

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="flex items-center gap-2 text-xs text-gray-500">
        <TrendingDown className="h-3.5 w-3.5" />
        <span className="font-semibold uppercase tracking-wider">Service Charges</span>
      </div>

      <div className="space-y-2 text-sm bg-gradient-to-br from-amber-50/50 to-white rounded-xl p-4 border border-amber-100/50">
        {/* Invoice Amount */}
        <div className="flex justify-between items-center text-gray-700 font-medium">
          <span>Invoice Amount</span>
          <span className="tabular-nums">{formatCurrency(totalAmount)}</span>
        </div>

        <div className="border-t border-gray-200 my-2" />

        {/* Platform Fee */}
        {fees.platform_fee > 0 && (
          <div className="flex justify-between items-center text-gray-600">
            <div className="flex items-center gap-2">
              {getIcon('platform')}
              <span>Platform Fee</span>
            </div>
            <span className="tabular-nums font-medium">+ {formatCurrency(fees.platform_fee)}</span>
          </div>
        )}

        {/* Gateway Fee */}
        {fees.gateway_fee > 0 && (
          <div className="flex justify-between items-center text-gray-600">
            <div className="flex items-center gap-2">
              {getIcon('gateway')}
              <span>Payment Gateway</span>
            </div>
            <span className="tabular-nums font-medium">+ {formatCurrency(fees.gateway_fee)}</span>
          </div>
        )}

        {/* Other Fees */}
        {fees.other_fees > 0 && (
          <div className="flex justify-between items-center text-gray-600">
            <div className="flex items-center gap-2">
              {getIcon('other')}
              <span>Other Fees</span>
            </div>
            <span className="tabular-nums font-medium">+ {formatCurrency(fees.other_fees)}</span>
          </div>
        )}

        {/* Total Service Charges */}
        <div className="flex justify-between items-center font-semibold text-gray-700 pt-2 border-t border-gray-200">
          <span>Service Charges</span>
          <span className="tabular-nums text-amber-600">+ {formatCurrency(fees.total_fees)}</span>
        </div>

        {/* Total to Pay */}
        <div className="flex justify-between items-center font-bold text-lg text-gray-900 pt-2 border-t-2 border-gray-300">
          <span>Total to Pay</span>
          <span className="tabular-nums text-blue-600">{formatCurrency(totalWithFees)}</span>
        </div>
      </div>

      <p className="text-[10px] text-gray-400 text-center">
        Service charges are added to the invoice amount
      </p>
    </div>
  );
};

export default FeeBreakdown;
