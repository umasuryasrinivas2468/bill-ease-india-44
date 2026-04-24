import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Copy, Check, Mail, MessageCircle, Link2, Loader2, AlertCircle } from 'lucide-react';
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
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5 text-orange-500" />
            Payment Link
          </DialogTitle>
          <DialogDescription>
            Share a secure payment link for {invoice.invoice_number} ({' '}
            ₹{balance.toLocaleString('en-IN')} )
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Invoice summary */}
          <div className="bg-orange-50 rounded-lg p-3 text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-gray-500">Invoice</span>
              <span className="font-medium">{invoice.invoice_number}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Client</span>
              <span>{invoice.client_name}</span>
            </div>
            <div className="flex justify-between font-semibold">
              <span className="text-gray-500">Amount Due</span>
              <span className="text-orange-600">₹{balance.toLocaleString('en-IN')}</span>
            </div>
          </div>

          {/* Activation hint */}
          {!paymentToken && !isPaymentsActive && paymentSettings !== undefined && (
            <div className="flex items-start gap-2 bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-xs text-yellow-700">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                Online payments not activated yet. Go to <strong>Settings → Payments</strong> and
                click "Activate Online Payments". Clients can't pay this link until activation is
                complete.
              </span>
            </div>
          )}

          {!paymentToken ? (
            /* Generate link */
            <Button
              onClick={generateToken}
              disabled={generating}
              className="w-full"
              variant="orange"
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
            /* Link ready — show URL and share options */
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Payment Link</Label>
                <div className="flex gap-2">
                  <Input value={paymentUrl} readOnly className="text-xs font-mono bg-gray-50" />
                  <Button size="icon" variant="outline" onClick={handleCopy} className="shrink-0">
                    {copied ? (
                      <Check className="h-4 w-4 text-green-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={handleEmail} className="gap-2">
                  <Mail className="h-4 w-4" />
                  Email
                </Button>
                <Button
                  variant="outline"
                  onClick={handleWhatsApp}
                  className="gap-2 border-green-300 text-green-700 hover:bg-green-50"
                >
                  <MessageCircle className="h-4 w-4" />
                  WhatsApp
                </Button>
              </div>

              <p className="text-xs text-center text-gray-400">
                Anyone with this link can pay the invoice. The link stays active until the invoice is fully paid.
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SharePaymentLinkDialog;
