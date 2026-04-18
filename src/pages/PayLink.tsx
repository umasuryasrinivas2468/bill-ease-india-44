import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { createClient } from '@supabase/supabase-js';
import { useRazorpay } from '@/hooks/useRazorpay';
import { CheckCircle2, AlertCircle, Loader2, FileText, Calendar, Shield } from 'lucide-react';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://vhntnkvtzmerpdhousfr.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZobnRua3Z0em1lcnBkaG91c2ZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDgxMTEyMTEsImV4cCI6MjA2MzY4NzIxMX0.sQ5Xz5RrCrDJoJHpNC9RzqFNb05Qi4gsFL5PrntlV4k';

const publicSupabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

interface InvoiceData {
  id: string;
  invoice_number: string;
  client_name: string;
  client_email: string;
  amount: number;
  gst_amount: number;
  total_amount: number;
  paid_amount: number;
  status: string;
  invoice_date: string;
  due_date: string;
  items: any[];
  gst_rate: number;
  notes: string;
}

type PageState = 'loading' | 'error' | 'ready' | 'processing' | 'success' | 'already_paid';

const PayLink: React.FC = () => {
  const [params] = useSearchParams();
  const invoiceId = params.get('id') || '';
  const token = params.get('token') || '';

  const [state, setState] = useState<PageState>('loading');
  const [invoice, setInvoice] = useState<InvoiceData | null>(null);
  const [error, setError] = useState('');
  const [paymentId, setPaymentId] = useState('');
  const { openCheckout } = useRazorpay();

  useEffect(() => {
    if (!invoiceId || !token) {
      setError('Invalid payment link. Please check the URL and try again.');
      setState('error');
      return;
    }
    fetchInvoice();
  }, [invoiceId, token]);

  const fetchInvoice = async () => {
    try {
      const { data, error: rpcError } = await publicSupabase.rpc('get_invoice_for_payment', {
        p_invoice_id: invoiceId,
        p_token: token,
      });

      if (rpcError) throw rpcError;

      if (data?.error) {
        setError(data.error);
        setState('error');
        return;
      }

      if (data?.status === 'paid') {
        setInvoice(data);
        setState('already_paid');
        return;
      }

      setInvoice(data);
      setState('ready');
    } catch (err: any) {
      setError(err.message || 'Failed to load invoice. The link may be invalid or expired.');
      setState('error');
    }
  };

  const handlePay = async () => {
    if (!invoice) return;
    setState('processing');

    const balance = Number(invoice.total_amount) - Number(invoice.paid_amount || 0);

    // Try to create a Razorpay Order via Edge Function (enables Route transfers to vendor)
    let orderId: string | undefined;
    try {
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/create-razorpay-order`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          invoice_id: invoiceId,
          token,
          amount: balance,
        }),
      });
      if (resp.ok) {
        const orderData = await resp.json();
        if (orderData.order_id) orderId = orderData.order_id;
      }
    } catch {
      // Edge Function not deployed — falls back to direct checkout
    }

    openCheckout({
      amount: balance,
      ...(orderId && { orderId }),
      businessName: 'Aczen Bilz',
      description: `Invoice ${invoice.invoice_number}`,
      invoiceId: invoice.id,
      prefill: {
        name: invoice.client_name,
        email: invoice.client_email || '',
      },
      onSuccess: async (response) => {
        try {
          await publicSupabase.rpc('confirm_invoice_payment', {
            p_invoice_id: invoiceId,
            p_token: token,
            p_razorpay_payment_id: response.razorpay_payment_id,
            p_amount: balance,
          });
        } catch {
          // Payment succeeded in Razorpay even if DB update fails
        }
        setPaymentId(response.razorpay_payment_id);
        setState('success');
      },
      onError: (err) => {
        setError(err.description || 'Payment failed. Please try again.');
        setState('ready');
      },
      onDismiss: () => {
        setState('ready');
      },
    });
  };

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  const formatCurrency = (amount: number) =>
    `₹${Number(amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // ── Loading ──
  if (state === 'loading') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-blue-50 flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <Loader2 className="h-10 w-10 animate-spin text-orange-500 mx-auto" />
          <p className="text-gray-600">Loading invoice...</p>
        </div>
      </div>
    );
  }

  // ── Error ──
  if (state === 'error') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-blue-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center space-y-4">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto">
            <AlertCircle className="h-8 w-8 text-red-500" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">Payment Link Invalid</h1>
          <p className="text-gray-500">{error}</p>
        </div>
      </div>
    );
  }

  // ── Success ──
  if (state === 'success') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-emerald-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center space-y-5">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle2 className="h-10 w-10 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Payment Successful!</h1>
          <div className="space-y-2">
            <p className="text-gray-600">
              {formatCurrency(Number(invoice!.total_amount) - Number(invoice!.paid_amount || 0))} paid for
            </p>
            <p className="font-semibold text-lg text-gray-900">Invoice {invoice!.invoice_number}</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-3 text-sm">
            <span className="text-gray-500">Payment ID: </span>
            <span className="font-mono text-gray-700">{paymentId}</span>
          </div>
          <p className="text-sm text-gray-400">
            A confirmation has been sent. You can close this page.
          </p>
          <div className="pt-2 flex items-center justify-center gap-1.5 text-xs text-gray-400">
            <Shield className="h-3.5 w-3.5" />
            Secured by Razorpay
          </div>
        </div>
      </div>
    );
  }

  // ── Already Paid ──
  if (state === 'already_paid' && invoice) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-emerald-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center space-y-4">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle2 className="h-8 w-8 text-green-600" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">Invoice Already Paid</h1>
          <p className="text-gray-500">
            Invoice <span className="font-semibold">{invoice.invoice_number}</span> for{' '}
            {formatCurrency(invoice.total_amount)} has already been paid.
          </p>
        </div>
      </div>
    );
  }

  // ── Ready — Invoice Summary + Pay Now ──
  if (!invoice) return null;

  const balance = Number(invoice.total_amount) - Number(invoice.paid_amount || 0);
  const items = Array.isArray(invoice.items) ? invoice.items : [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-blue-50 flex items-center justify-center p-4">
      <div className="max-w-lg w-full space-y-4">
        {/* Header */}
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold text-gray-900">Aczen Bilz</h1>
          <p className="text-sm text-gray-500">Secure Payment</p>
        </div>

        {/* Invoice Card */}
        <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
          {/* Invoice header bar */}
          <div className="bg-gradient-to-r from-orange-500 to-orange-600 px-6 py-4 text-white">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                <span className="font-semibold text-lg">{invoice.invoice_number}</span>
              </div>
              {invoice.paid_amount > 0 && (
                <span className="bg-white/20 text-white text-xs px-2.5 py-1 rounded-full">
                  Partial: {formatCurrency(invoice.paid_amount)} paid
                </span>
              )}
            </div>
          </div>

          <div className="p-6 space-y-5">
            {/* Client & dates */}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-gray-400 text-xs uppercase tracking-wide">Bill To</p>
                <p className="font-medium text-gray-900 mt-0.5">{invoice.client_name}</p>
                {invoice.client_email && (
                  <p className="text-gray-500 text-xs">{invoice.client_email}</p>
                )}
              </div>
              <div className="text-right">
                <div className="flex items-center justify-end gap-1 text-gray-400 text-xs uppercase tracking-wide">
                  <Calendar className="h-3 w-3" />
                  Dates
                </div>
                <p className="text-gray-700 mt-0.5">Issued: {formatDate(invoice.invoice_date)}</p>
                <p className="text-gray-700">Due: {formatDate(invoice.due_date)}</p>
              </div>
            </div>

            {/* Line items */}
            {items.length > 0 && (
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                      <th className="text-left px-4 py-2 font-medium">Item</th>
                      <th className="text-center px-2 py-2 font-medium">Qty</th>
                      <th className="text-right px-4 py-2 font-medium">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item: any, idx: number) => (
                      <tr key={idx} className="border-t">
                        <td className="px-4 py-2.5 text-gray-800">
                          {item.description || item.product_name || item.name || 'Item'}
                          {item.hsn_sac && (
                            <span className="text-xs text-gray-400 ml-1">({item.hsn_sac})</span>
                          )}
                        </td>
                        <td className="text-center px-2 py-2.5 text-gray-600">
                          {item.quantity || 1}
                        </td>
                        <td className="text-right px-4 py-2.5 text-gray-800">
                          {formatCurrency(item.amount || (item.quantity || 1) * (item.rate || 0))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Totals */}
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-gray-600">
                <span>Subtotal</span>
                <span>{formatCurrency(invoice.amount)}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>GST ({invoice.gst_rate}%)</span>
                <span>{formatCurrency(invoice.gst_amount)}</span>
              </div>
              {invoice.paid_amount > 0 && (
                <div className="flex justify-between text-green-600">
                  <span>Already Paid</span>
                  <span>- {formatCurrency(invoice.paid_amount)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-lg border-t pt-3 text-gray-900">
                <span>Amount Due</span>
                <span>{formatCurrency(balance)}</span>
              </div>
            </div>

            {/* Notes */}
            {invoice.notes && (
              <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-600">
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Notes</p>
                {invoice.notes}
              </div>
            )}

            {/* Pay Now Button */}
            <button
              onClick={handlePay}
              disabled={state === 'processing'}
              className="w-full py-4 rounded-xl font-semibold text-white text-lg transition-all
                bg-gradient-to-r from-orange-500 to-orange-600
                hover:from-orange-600 hover:to-orange-700
                active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed
                shadow-lg shadow-orange-500/25 hover:shadow-orange-500/40"
            >
              {state === 'processing' ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Processing...
                </span>
              ) : (
                `Pay Now ${formatCurrency(balance)}`
              )}
            </button>

            {/* Footer */}
            <div className="flex items-center justify-center gap-1.5 text-xs text-gray-400 pt-1">
              <Shield className="h-3.5 w-3.5" />
              Payments secured by Razorpay | Aczen Technologies Pvt. Ltd.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PayLink;
