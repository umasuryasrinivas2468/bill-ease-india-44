import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { CheckCircle2, AlertCircle, Loader2, Shield } from 'lucide-react';

const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ||
  'https://vhntnkvtzmerpdhousfr.supabase.co';
const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZobnRua3Z0em1lcnBkaG91c2ZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDgxMTEyMTEsImV4cCI6MjA2MzY4NzIxMX0.sQ5Xz5RrCrDJoJHpNC9RzqFNb05Qi4gsFL5PrntlV4k';

type State = 'loading' | 'success' | 'error';

const RazorpayCallback: React.FC = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [state, setState] = useState<State>('loading');
  const [message, setMessage] = useState('');

  const code = params.get('code');
  const stateParam = params.get('state');
  const errorParam = params.get('error');
  const errorDesc = params.get('error_description');

  useEffect(() => {
    // Razorpay returned an error
    if (errorParam) {
      setState('error');
      setMessage(errorDesc || errorParam);
      return;
    }

    if (!code || !stateParam) {
      setState('error');
      setMessage('Missing authorization code or state. Please retry.');
      return;
    }

    (async () => {
      try {
        const resp = await fetch(
          `${SUPABASE_URL}/functions/v1/razorpay-oauth-callback`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
            },
            body: JSON.stringify({ code, state: stateParam }),
          },
        );
        const data = await resp.json();
        if (!resp.ok || !data.success) {
          console.error('[RazorpayCallback] Edge function error response:', data);
          const raw = data?.error;
          const errMsg =
            typeof raw === 'string'
              ? raw
              : raw?.description ||
                raw?.message ||
                raw?.code ||
                (raw ? JSON.stringify(raw) : 'Failed to complete onboarding');
          throw new Error(errMsg);
        }
        setState('success');
        setMessage(`Linked account: ${data.razorpay_account_id}`);
      } catch (err: any) {
        console.error('[RazorpayCallback] Onboarding failed:', err);
        setState('error');
        const msg =
          typeof err === 'string'
            ? err
            : err?.message ||
              (err ? JSON.stringify(err) : 'Unknown error');
        setMessage(msg);
      }
    })();
  }, [code, stateParam, errorParam, errorDesc]);

  if (state === 'loading') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-blue-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center space-y-4">
          <Loader2 className="h-10 w-10 animate-spin text-orange-500 mx-auto" />
          <h1 className="text-xl font-bold text-gray-900">
            Finalising your Razorpay setup...
          </h1>
          <p className="text-gray-500 text-sm">
            This takes a few seconds. Please don't close this window.
          </p>
        </div>
      </div>
    );
  }

  if (state === 'success') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-emerald-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center space-y-5">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle2 className="h-10 w-10 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">
            Payments Activated!
          </h1>
          <p className="text-gray-600">
            Your invoices can now accept online payments. Money will settle
            directly into your bank account.
          </p>
          <div className="bg-gray-50 rounded-lg p-3 text-xs font-mono text-gray-600">
            {message}
          </div>
          <button
            onClick={() => navigate('/settings?tab=payments')}
            className="w-full py-3 rounded-xl font-semibold text-white
                       bg-gradient-to-r from-orange-500 to-orange-600
                       hover:from-orange-600 hover:to-orange-700
                       shadow-lg shadow-orange-500/25"
          >
            Go to Settings
          </button>
          <div className="flex items-center justify-center gap-1.5 text-xs text-gray-400">
            <Shield className="h-3.5 w-3.5" />
            Secured by Razorpay
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-blue-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center space-y-4">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto">
          <AlertCircle className="h-8 w-8 text-red-500" />
        </div>
        <h1 className="text-xl font-bold text-gray-900">Onboarding Failed</h1>
        <p className="text-gray-500">{message}</p>
        <button
          onClick={() => navigate('/settings?tab=payments')}
          className="w-full py-3 rounded-xl font-semibold text-white
                     bg-gradient-to-r from-orange-500 to-orange-600
                     hover:from-orange-600 hover:to-orange-700"
        >
          Back to Settings
        </button>
      </div>
    </div>
  );
};

export default RazorpayCallback;
