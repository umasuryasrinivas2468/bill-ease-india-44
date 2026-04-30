import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { createClient } from '@supabase/supabase-js';
import { useRazorpay } from '@/hooks/useRazorpay';
import FeeBreakdown from '@/components/FeeBreakdown';
import {
  CheckCircle2,
  AlertCircle,
  Loader2,
  FileText,
  Calendar,
  Shield,
  ShieldCheck,
  Lock,
  Mail,
  Sparkles,
  Zap,
} from 'lucide-react';

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

const BRAND = '#528FF0';
const BRAND_DARK = '#3b6fd1';
const BRAND_LIGHT = '#7eaaf5';

const Logo: React.FC<{ className?: string }> = ({ className = '' }) => (
  <img
    src="/aczen-logo.png"
    alt="Aczen"
    className={`object-contain ${className}`}
    onError={(e) => {
      (e.currentTarget as HTMLImageElement).style.display = 'none';
    }}
  />
);

const PageShell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="relative min-h-screen flex items-center justify-center p-4 overflow-hidden bg-gradient-to-br from-[#eef4ff] via-white to-[#dde9fb]">
    {/* Animated gradient blobs */}
    <div
      aria-hidden
      className="pointer-events-none absolute -top-32 -left-24 w-[28rem] h-[28rem] rounded-full opacity-40 blur-3xl animate-brand-blob"
      style={{ background: `radial-gradient(circle, ${BRAND_LIGHT}, transparent 70%)` }}
    />
    <div
      aria-hidden
      className="pointer-events-none absolute -bottom-40 -right-24 w-[32rem] h-[32rem] rounded-full opacity-30 blur-3xl animate-brand-blob"
      style={{
        background: `radial-gradient(circle, ${BRAND}, transparent 70%)`,
        animationDelay: '4s',
      }}
    />
    <div
      aria-hidden
      className="pointer-events-none absolute top-1/3 left-1/2 w-[20rem] h-[20rem] rounded-full opacity-20 blur-3xl animate-brand-blob"
      style={{
        background: `radial-gradient(circle, ${BRAND_DARK}, transparent 70%)`,
        animationDelay: '8s',
      }}
    />

    {/* Subtle dot grid overlay */}
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 opacity-[0.04]"
      style={{
        backgroundImage: `radial-gradient(${BRAND_DARK} 1px, transparent 1px)`,
        backgroundSize: '24px 24px',
      }}
    />

    <div className="relative z-10 w-full flex items-center justify-center">{children}</div>
  </div>
);

const BrandHeader: React.FC = () => (
  <div className="flex flex-col items-center gap-3 animate-brand-fade-up">
    <div className="relative animate-brand-float">
      <div
        className="absolute inset-0 blur-xl opacity-50 rounded-2xl"
        style={{ background: `linear-gradient(135deg, ${BRAND}, ${BRAND_DARK})` }}
      />
      <div className="relative bg-white rounded-2xl shadow-xl border border-white/60 p-3">
        <Logo className="h-10 w-10" />
      </div>
    </div>
    <div className="text-center">
      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-semibold uppercase tracking-widest bg-white/70 backdrop-blur border border-white/80 text-[#3b6fd1] shadow-sm">
        <Lock className="h-3 w-3" />
        Secure Payment
      </div>
    </div>
  </div>
);

const PayLink: React.FC = () => {
  const [params] = useSearchParams();
  const invoiceId = params.get('id') || '';
  const token = params.get('token') || '';

  const [state, setState] = useState<PageState>('loading');
  const [invoice, setInvoice] = useState<InvoiceData | null>(null);
  const [error, setError] = useState('');
  const [paymentId, setPaymentId] = useState('');
  const [serviceFees, setServiceFees] = useState(0);
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
    const totalWithFees = balance + serviceFees;

    let orderId: string;
    let checkoutKey: string;
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
          amount: totalWithFees, // Use total with fees
        }),
      });
      const orderData = await resp.json();
      if (!resp.ok || !orderData.order_id) {
        throw new Error(orderData.error || 'Failed to create payment order');
      }
      orderId = orderData.order_id;
      checkoutKey = orderData.public_token;
      if (!checkoutKey) {
        throw new Error('Vendor has not finished activating online payments yet.');
      }
    } catch (err: any) {
      setError(err.message || 'Unable to initialize payment. Please try again.');
      setState('ready');
      return;
    }

    openCheckout({
      amount: totalWithFees,
      orderId,
      checkoutKey,
      businessName: 'Aczen',
      description: `Invoice ${invoice.invoice_number}`,
      invoiceId: invoice.id,
      prefill: {
        name: invoice.client_name,
        email: invoice.client_email || '',
      },
      onSuccess: async (response) => {
        try {
          const verifyResp = await fetch(
            `${SUPABASE_URL}/functions/v1/verify-razorpay-payment`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
              },
              body: JSON.stringify({
                invoice_id: invoiceId,
                token,
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              }),
            },
          );
          const verifyData = await verifyResp.json();
          if (!verifyResp.ok || !verifyData.success) {
            throw new Error(verifyData.error || 'Payment verification failed');
          }
          setPaymentId(response.razorpay_payment_id);
          setState('success');
        } catch (err: any) {
          setError(
            `Payment received but could not be confirmed instantly. Reference: ${response.razorpay_payment_id}. ` +
              `Your invoice will update shortly — please do not pay again.`,
          );
          setState('error');
        }
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
      <PageShell>
        <div className="text-center space-y-4 animate-brand-fade-up">
          <div className="relative h-16 w-16 mx-auto">
            <div
              className="absolute inset-0 rounded-full blur-xl opacity-60"
              style={{ background: BRAND }}
            />
            <div className="relative h-16 w-16 rounded-2xl bg-white shadow-xl border border-white/60 flex items-center justify-center">
              <Logo className="h-8 w-8 animate-brand-float" />
            </div>
          </div>
          <div className="flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" style={{ color: BRAND }} />
            <p className="text-gray-700 font-medium">Loading invoice...</p>
          </div>
        </div>
      </PageShell>
    );
  }

  // ── Error ──
  if (state === 'error') {
    return (
      <PageShell>
        <div className="max-w-md w-full bg-white/80 backdrop-blur-xl rounded-3xl shadow-2xl p-8 text-center space-y-4 border border-white/60 animate-brand-fade-up">
          <div className="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center mx-auto">
            <AlertCircle className="h-8 w-8 text-red-500" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">Payment Link Invalid</h1>
          <p className="text-gray-500 text-sm leading-relaxed">{error}</p>
          <div className="pt-3 flex items-center justify-center gap-1.5 text-xs text-gray-400 border-t border-gray-100">
            <Logo className="h-4 w-4" />
            <span className="pt-3">Aczen · Secured by Razorpay</span>
          </div>
        </div>
      </PageShell>
    );
  }

  // ── Success ──
  if (state === 'success') {
    return (
      <PageShell>
        <div className="max-w-md w-full bg-white/80 backdrop-blur-xl rounded-3xl shadow-2xl p-8 text-center space-y-5 border border-white/60 animate-brand-fade-up">
          <div className="relative w-24 h-24 mx-auto">
            <div className="absolute inset-0 bg-green-200 rounded-full animate-ping opacity-40" />
            <div className="absolute inset-2 bg-green-100 rounded-full animate-ping opacity-50" style={{ animationDelay: '0.3s' }} />
            <div className="relative w-24 h-24 bg-gradient-to-br from-green-400 to-emerald-500 rounded-full flex items-center justify-center shadow-lg shadow-green-500/40">
              <CheckCircle2 className="h-12 w-12 text-white" strokeWidth={2.5} />
            </div>
          </div>
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-semibold uppercase tracking-widest bg-green-50 text-green-700 mb-2">
              <Sparkles className="h-3 w-3" />
              Payment Received
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Thank you!</h1>
            <p className="text-sm text-gray-500 mt-1">Your payment has been processed successfully.</p>
          </div>
          <div
            className="rounded-2xl p-5 space-y-1 border border-[#528FF0]/15"
            style={{ background: `linear-gradient(135deg, #eef4ff, #ffffff)` }}
          >
            <p className="text-xs uppercase tracking-wider text-gray-500">Amount Paid</p>
            <p className="text-4xl font-bold tabular-nums" style={{ color: BRAND }}>
              {formatCurrency(Number(invoice!.total_amount) - Number(invoice!.paid_amount || 0))}
            </p>
            <p className="text-sm text-gray-600 pt-1">
              for Invoice <span className="font-semibold text-gray-900">{invoice!.invoice_number}</span>
            </p>
          </div>
          <div className="bg-gray-50 rounded-xl px-4 py-3 text-xs text-left">
            <p className="text-gray-500 mb-0.5">Payment Reference</p>
            <p className="font-mono text-gray-800 break-all">{paymentId}</p>
          </div>
          <p className="text-xs text-gray-400">A confirmation has been sent. You can close this page.</p>
          <div className="pt-2 flex items-center justify-center gap-2 text-xs text-gray-500 border-t border-gray-100">
            <Logo className="h-4 w-4 mt-3" />
            <span className="pt-3">Aczen · Secured by Razorpay</span>
          </div>
        </div>
      </PageShell>
    );
  }

  // ── Already Paid ──
  if (state === 'already_paid' && invoice) {
    return (
      <PageShell>
        <div className="max-w-md w-full bg-white/80 backdrop-blur-xl rounded-3xl shadow-2xl p-8 text-center space-y-4 border border-white/60 animate-brand-fade-up">
          <div className="w-16 h-16 bg-gradient-to-br from-green-400 to-emerald-500 rounded-2xl flex items-center justify-center mx-auto shadow-lg shadow-green-500/30">
            <CheckCircle2 className="h-8 w-8 text-white" strokeWidth={2.5} />
          </div>
          <h1 className="text-xl font-bold text-gray-900">Invoice Already Paid</h1>
          <p className="text-gray-500 text-sm">
            Invoice <span className="font-semibold text-gray-900">{invoice.invoice_number}</span> for{' '}
            <span className="font-semibold text-gray-900">{formatCurrency(invoice.total_amount)}</span> has
            already been paid.
          </p>
          <div className="pt-3 flex items-center justify-center gap-1.5 text-xs text-gray-400 border-t border-gray-100">
            <Logo className="h-4 w-4 mt-3" />
            <span className="pt-3">Aczen · Secured by Razorpay</span>
          </div>
        </div>
      </PageShell>
    );
  }

  // ── Ready ──
  if (!invoice) return null;

  const balance = Number(invoice.total_amount) - Number(invoice.paid_amount || 0);
  const totalWithFees = balance + serviceFees;
  const items = Array.isArray(invoice.items) ? invoice.items : [];

  return (
    <PageShell>
      <div className="max-w-lg w-full space-y-5 animate-brand-fade-up">
        <BrandHeader />

        {/* Glass card */}
        <div className="relative bg-white/80 backdrop-blur-xl rounded-3xl shadow-2xl overflow-hidden border border-white/60">
          {/* Top gradient header */}
          <div
            className="relative px-6 py-5 text-white overflow-hidden"
            style={{ background: `linear-gradient(135deg, ${BRAND} 0%, ${BRAND_DARK} 100%)` }}
          >
            {/* Decorative orbs */}
            <div className="absolute -top-16 -right-16 w-44 h-44 rounded-full bg-white/20 blur-2xl" />
            <div className="absolute -bottom-20 -left-12 w-36 h-36 rounded-full bg-white/10 blur-xl" />
            {/* Diagonal sheen */}
            <div className="absolute inset-0 opacity-20 bg-gradient-to-tr from-transparent via-white/30 to-transparent" />

            <div className="relative flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center">
                  <FileText className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-[10px] font-semibold tracking-widest uppercase text-white/80">
                    Invoice
                  </p>
                  <p className="font-bold text-lg leading-tight">{invoice.invoice_number}</p>
                </div>
              </div>
              {invoice.paid_amount > 0 && (
                <span className="bg-white/20 backdrop-blur-md text-white text-[10px] font-semibold tracking-wider uppercase px-3 py-1.5 rounded-full border border-white/20">
                  {formatCurrency(invoice.paid_amount)} paid
                </span>
              )}
            </div>
          </div>

          {/* Hero amount */}
          <div className="px-6 pt-7 pb-5 text-center relative">
            <div
              aria-hidden
              className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-32 rounded-full blur-3xl opacity-30"
              style={{ background: BRAND }}
            />
            <div className="relative">
              <p className="text-[10px] font-semibold tracking-widest uppercase text-gray-500">
                Amount Due
              </p>
              <p
                className="text-5xl font-extrabold mt-1.5 tabular-nums bg-clip-text text-transparent leading-none"
                style={{ backgroundImage: `linear-gradient(135deg, ${BRAND}, ${BRAND_DARK})` }}
              >
                {formatCurrency(balance)}
              </p>
              <p className="text-xs text-gray-500 mt-2 inline-flex items-center gap-1.5">
                <Calendar className="h-3 w-3" />
                Due by {formatDate(invoice.due_date)}
              </p>
            </div>
          </div>

          <div className="px-6 pb-6 space-y-5">
            {/* Client */}
            <div className="grid grid-cols-2 gap-4 text-sm bg-gray-50/70 rounded-2xl p-4 border border-gray-100">
              <div>
                <p className="text-gray-400 text-[10px] uppercase font-semibold tracking-widest">
                  Bill To
                </p>
                <p className="font-semibold text-gray-900 mt-1">{invoice.client_name}</p>
                {invoice.client_email && (
                  <p className="text-gray-500 text-xs flex items-center gap-1 mt-0.5 truncate">
                    <Mail className="h-3 w-3 shrink-0" />
                    <span className="truncate">{invoice.client_email}</span>
                  </p>
                )}
              </div>
              <div className="text-right">
                <p className="text-gray-400 text-[10px] uppercase font-semibold tracking-widest">
                  Issued
                </p>
                <p className="font-semibold text-gray-900 mt-1">{formatDate(invoice.invoice_date)}</p>
              </div>
            </div>

            {/* Line items */}
            {items.length > 0 && (
              <div className="border border-gray-200 rounded-2xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr
                      className="text-white text-[10px] uppercase tracking-widest"
                      style={{ background: `linear-gradient(90deg, ${BRAND}, ${BRAND_DARK})` }}
                    >
                      <th className="text-left px-4 py-2.5 font-semibold">Item</th>
                      <th className="text-center px-2 py-2.5 font-semibold">Qty</th>
                      <th className="text-right px-4 py-2.5 font-semibold">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white">
                    {items.map((item: any, idx: number) => (
                      <tr key={idx} className="border-t border-gray-100 hover:bg-gray-50/50 transition-colors">
                        <td className="px-4 py-3 text-gray-800">
                          {item.description || item.product_name || item.name || 'Item'}
                          {item.hsn_sac && (
                            <span className="text-xs text-gray-400 ml-1">({item.hsn_sac})</span>
                          )}
                        </td>
                        <td className="text-center px-2 py-3 text-gray-600">
                          {item.quantity || 1}
                        </td>
                        <td className="text-right px-4 py-3 text-gray-800 tabular-nums font-medium">
                          {formatCurrency(item.amount || (item.quantity || 1) * (item.rate || 0))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Totals */}
            <div className="space-y-2 text-sm bg-gradient-to-br from-gray-50 to-white rounded-2xl p-4 border border-gray-100">
              <div className="flex justify-between text-gray-600">
                <span>Subtotal</span>
                <span className="tabular-nums">{formatCurrency(invoice.amount)}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>GST ({invoice.gst_rate}%)</span>
                <span className="tabular-nums">{formatCurrency(invoice.gst_amount)}</span>
              </div>
              {invoice.paid_amount > 0 && (
                <div className="flex justify-between text-green-600 font-medium">
                  <span>Already Paid</span>
                  <span className="tabular-nums">- {formatCurrency(invoice.paid_amount)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-base border-t border-dashed border-gray-300 pt-2 mt-1 text-gray-900">
                <span>Total Due</span>
                <span className="tabular-nums" style={{ color: BRAND }}>
                  {formatCurrency(balance)}
                </span>
              </div>
            </div>

            {/* Fee Breakdown */}
            <FeeBreakdown 
              totalAmount={balance} 
              userId={invoice.id} 
              className="mt-4"
              onFeesCalculated={(fees) => setServiceFees(fees)}
            />

            {/* Notes */}
            {invoice.notes && (
              <div className="rounded-2xl p-4 text-sm text-gray-700 border border-[#528FF0]/20 bg-gradient-to-br from-[#eef4ff]/80 to-white">
                <p className="text-[10px] uppercase tracking-widest font-semibold mb-1.5" style={{ color: BRAND_DARK }}>
                  Notes from sender
                </p>
                {invoice.notes}
              </div>
            )}

            {/* Pay Now Button — with shine */}
            <button
              onClick={handlePay}
              disabled={state === 'processing'}
              className="relative w-full py-4 rounded-2xl font-bold text-white text-lg transition-all
                active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed
                overflow-hidden animate-brand-shine group hover:scale-[1.01]"
              style={{
                background: `linear-gradient(135deg, ${BRAND} 0%, ${BRAND_DARK} 100%)`,
                boxShadow: `0 12px 32px -8px ${BRAND}99, 0 0 0 1px ${BRAND_DARK}33 inset`,
              }}
            >
              <span className="relative z-10 flex items-center justify-center gap-2">
                {state === 'processing' ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Zap className="h-5 w-5 fill-white" />
                    Pay {formatCurrency(totalWithFees > 0 ? totalWithFees : balance)}
                  </>
                )}
              </span>
            </button>

            {/* Payment methods strip */}
            <div className="flex items-center justify-center gap-3 text-[10px] font-semibold text-gray-400 uppercase tracking-widest">
              <span>UPI</span>
              <span className="h-1 w-1 rounded-full bg-gray-300" />
              <span>Cards</span>
              <span className="h-1 w-1 rounded-full bg-gray-300" />
              <span>Netbanking</span>
              <span className="h-1 w-1 rounded-full bg-gray-300" />
              <span>Wallets</span>
            </div>

            {/* Trust footer */}
            <div className="flex items-center justify-between gap-2 text-xs pt-3 border-t border-gray-100">
              <div className="flex items-center gap-1.5 text-gray-500">
                <ShieldCheck className="h-3.5 w-3.5" style={{ color: BRAND }} />
                <span>256-bit SSL Encrypted</span>
              </div>
              <div className="flex items-center gap-1.5 text-gray-500">
                <Logo className="h-3.5 w-3.5" />
                <span>Powered by Aczen</span>
              </div>
            </div>
          </div>
        </div>

        {/* Outer footer */}
        <p className="text-center text-[10px] text-gray-400">
          © {new Date().getFullYear()} Aczen Technologies Pvt. Ltd. · Payments processed by Razorpay
        </p>
      </div>
    </PageShell>
  );
};

export default PayLink;
