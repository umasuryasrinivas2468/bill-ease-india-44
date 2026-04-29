import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Copy,
  Check,
  Mail,
  MessageCircle,
  Link2,
  Loader2,
  AlertCircle,
  ShieldCheck,
  ExternalLink,
  Receipt,
  User as UserIcon,
  IndianRupee,
  CalendarDays,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';
import { useQueryClient } from '@tanstack/react-query';
import { usePaymentSettings } from '@/hooks/usePaymentSettings';

interface SharePaymentLinkDialogProps {
  isOpen: boolean;
  onClose: () => void;
  invoice: {
    id: string;
    invoice_number: string;
    client_name: string;
    client_email?: string;
    total_amount: number;
    paid_amount?: number;
    due_date: string;
    payment_token?: string | null;
    user_id?: string;
  };
}

const SharePaymentLinkDialog: React.FC<SharePaymentLinkDialogProps> = ({
  isOpen,
  onClose,
  invoice,
}) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: paymentSettings } = usePaymentSettings();
  const [generating, setGenerating] = useState(false);
  const [paymentToken, setPaymentToken] = useState<string | null>(invoice.payment_token || null);
  const [copied, setCopied] = useState(false);

  const balance = Number(invoice.total_amount) - Number(invoice.paid_amount || 0);
  const isPaymentsActive =
    paymentSettings?.razorpay_account_status === 'activated' &&
    !!paymentSettings?.razorpay_access_token;

  const paymentUrl = paymentToken
    ? `${window.location.origin}/pay?id=${invoice.id}&token=${paymentToken}`
    : '';

  const generateToken = async () => {
    setGenerating(true);
    try {
      const token = crypto.randomUUID();

      const { error } = await supabase
        .from('invoices')
        .update({ payment_token: token })
        .eq('id', invoice.id);

      if (error) throw error;

      setPaymentToken(token);
      await queryClient.invalidateQueries({ queryKey: ['invoices'] });

      toast({
        title: 'Payment link generated',
        description: isPaymentsActive
          ? 'Payments will settle directly to your bank account.'
          : 'Link generated. Activate online payments in Settings to receive money.',
      });
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err.message || 'Failed to generate payment link',
        variant: 'destructive',
      });
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = () => {
    if (!paymentUrl) return;
    navigator.clipboard.writeText(paymentUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: 'Copied!', description: 'Payment link copied to clipboard.' });
  };

  const handleOpen = () => {
    if (!paymentUrl) return;
    window.open(paymentUrl, '_blank');
  };

  const handleEmail = () => {
    const subject = encodeURIComponent(
      `Payment for Invoice ${invoice.invoice_number} — ₹${balance.toLocaleString('en-IN')}`
    );
    const body = encodeURIComponent(
      `Dear ${invoice.client_name},\n\nPlease find below the payment link for Invoice ${invoice.invoice_number}.\n\nAmount Due: ₹${balance.toLocaleString('en-IN')}\nDue Date: ${new Date(invoice.due_date).toLocaleDateString('en-IN')}\n\nPay Now: ${paymentUrl}\n\nThank you for your business!\n\nBest regards`
    );
    const email = invoice.client_email || '';
    window.open(`mailto:${email}?subject=${subject}&body=${body}`, '_blank');
  };

  const handleWhatsApp = () => {
    const message = encodeURIComponent(
      `Hello ${invoice.client_name}! 🙏\n\nYour invoice *${invoice.invoice_number}* is ready for payment.\n\n💰 Amount Due: *₹${balance.toLocaleString('en-IN')}*\n📅 Due: ${new Date(invoice.due_date).toLocaleDateString('en-IN')}\n\n👉 Pay Now: ${paymentUrl}\n\nThank you!`
    );
    window.open(`https://wa.me/?text=${message}`, '_blank');
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md p-0 overflow-hidden gap-0 [&>button]:text-white [&>button]:opacity-80 [&>button]:hover:opacity-100 [&>button]:focus:ring-white/40">
        {/* Branded gradient header */}
        <div className="relative bg-gradient-to-br from-[#528FF0] to-[#3b6fd1] text-white px-6 pt-6 pb-8">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg bg-white/15 backdrop-blur-sm flex items-center justify-center">
              <Link2 className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold leading-tight">Payment Link</h2>
              <p className="text-xs text-white/80">Share securely with your client</p>
            </div>
          </div>
        </div>

        {/* Floating invoice summary card */}
        <div className="px-6 -mt-5">
          <div className="rounded-xl bg-white border border-gray-200 shadow-md p-4 space-y-2.5">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 text-gray-500">
                <Receipt className="h-3.5 w-3.5" />
                Invoice
              </span>
              <span className="font-medium text-gray-900">{invoice.invoice_number}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 text-gray-500">
                <UserIcon className="h-3.5 w-3.5" />
                Client
              </span>
              <span className="text-gray-700 truncate max-w-[180px]">{invoice.client_name}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 text-gray-500">
                <CalendarDays className="h-3.5 w-3.5" />
                Due
              </span>
              <span className="text-gray-700">
                {new Date(invoice.due_date).toLocaleDateString('en-IN')}
              </span>
            </div>
            <div className="border-t border-dashed border-gray-200 pt-2.5 flex items-center justify-between">
              <span className="flex items-center gap-2 text-gray-500 text-sm">
                <IndianRupee className="h-3.5 w-3.5" />
                Amount Due
              </span>
              <span className="text-xl font-bold text-[#528FF0] tabular-nums">
                ₹{balance.toLocaleString('en-IN')}
              </span>
            </div>
          </div>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Activation hint */}
          {!paymentToken && !isPaymentsActive && paymentSettings !== undefined && (
            <div className="flex items-start gap-2 bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-xs text-yellow-800">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                Online payments not activated yet. Go to <strong>Settings → Payments</strong> and
                click "Activate Online Payments". Clients can't pay this link until activation is
                complete.
              </span>
            </div>
          )}

          {!paymentToken ? (
            <Button
              onClick={generateToken}
              disabled={generating}
              className="w-full h-11"
              variant="brand"
            >
              {generating ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generating...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Link2 className="h-4 w-4" />
                  Generate Payment Link
                </span>
              )}
            </Button>
          ) : (
            <div className="space-y-4">
              {/* Link display + copy/open */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">
                  Secure Payment URL
                </label>
                <div className="flex gap-2">
                  <Input
                    value={paymentUrl}
                    readOnly
                    className="text-xs font-mono bg-gray-50 border-gray-200 focus-visible:ring-[#528FF0]"
                    onFocus={(e) => e.currentTarget.select()}
                  />
                  <Button
                    size="icon"
                    onClick={handleCopy}
                    className={`shrink-0 h-10 w-10 ${
                      copied
                        ? 'bg-green-50 text-green-600 hover:bg-green-50 border border-green-200'
                        : 'bg-[#528FF0] text-white hover:bg-[#3b6fd1]'
                    }`}
                    aria-label={copied ? 'Copied' : 'Copy link'}
                  >
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={handleOpen}
                    className="shrink-0 h-10 w-10 border-gray-200"
                    aria-label="Open link"
                    title="Open in new tab"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Share options */}
              <div>
                <p className="text-xs font-medium text-gray-600 uppercase tracking-wide mb-2">
                  Share with client
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    onClick={handleEmail}
                    className="gap-2 h-11 border-[#528FF0]/30 text-[#1e4fa8] hover:bg-[#528FF0]/5 hover:border-[#528FF0]/50"
                  >
                    <Mail className="h-4 w-4" />
                    Email
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleWhatsApp}
                    className="gap-2 h-11 border-green-300 text-green-700 hover:bg-green-50"
                  >
                    <MessageCircle className="h-4 w-4" />
                    WhatsApp
                  </Button>
                </div>
              </div>

              {/* Trust footer */}
              <div className="flex items-start gap-2 pt-1">
                <ShieldCheck className="h-3.5 w-3.5 text-[#528FF0] shrink-0 mt-0.5" />
                <p className="text-xs text-gray-500 leading-relaxed">
                  This link stays active until the invoice is fully paid. Payments are processed
                  securely via Razorpay.
                </p>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SharePaymentLinkDialog;
