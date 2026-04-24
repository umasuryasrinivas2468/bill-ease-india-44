declare global {
  interface Window {
    Razorpay: any;
  }
}

export interface RazorpayCheckoutOptions {
  amount: number; // in INR (converted to paise internally)
  currency?: string;
  orderId?: string;        // Razorpay order_id (required)
  checkoutKey: string;     // vendor's public_token (Partner OAuth) OR rzp_live_xxx fallback
  businessName: string;
  description: string;
  invoiceId: string;
  prefill?: {
    name?: string;
    email?: string;
    contact?: string;
  };
  onSuccess: (response: {
    razorpay_payment_id: string;
    razorpay_order_id?: string;
    razorpay_signature?: string;
  }) => void;
  onError?: (error: { code: string; description: string; reason: string }) => void;
  onDismiss?: () => void;
}

export const useRazorpay = () => {
  const isReady = typeof window !== 'undefined' && !!window.Razorpay;

  const openCheckout = (options: RazorpayCheckoutOptions) => {
    const key = options.checkoutKey;
    if (!key) {
      options.onError?.({
        code: 'CONFIG_ERROR',
        description: 'Missing Razorpay checkout key (vendor has not activated online payments).',
        reason: 'missing_key',
      });
      return;
    }

    if (!window.Razorpay) {
      options.onError?.({
        code: 'SDK_ERROR',
        description: 'Razorpay SDK not loaded. Please refresh the page.',
        reason: 'sdk_missing',
      });
      return;
    }

    const rzpOptions: Record<string, any> = {
      key,
      amount: Math.round(options.amount * 100), // INR -> paise
      currency: options.currency || 'INR',
      name: options.businessName,
      description: options.description,
      prefill: options.prefill || {},
      notes: {
        invoice_id: options.invoiceId,
      },
      handler: (response: any) => {
        options.onSuccess({
          razorpay_payment_id: response.razorpay_payment_id,
          razorpay_order_id: response.razorpay_order_id,
          razorpay_signature: response.razorpay_signature,
        });
      },
      modal: {
        ondismiss: () => {
          options.onDismiss?.();
        },
      },
      theme: {
        color: '#F97316',
      },
    };

    // Attach order_id for Razorpay Route transfers
    if (options.orderId) {
      rzpOptions.order_id = options.orderId;
    }

    const rzp = new window.Razorpay(rzpOptions);

    rzp.on('payment.failed', (resp: any) => {
      options.onError?.({
        code: resp.error?.code || 'PAYMENT_FAILED',
        description: resp.error?.description || 'Payment failed',
        reason: resp.error?.reason || 'unknown',
      });
    });

    rzp.open();
  };

  return { openCheckout, isReady };
};
