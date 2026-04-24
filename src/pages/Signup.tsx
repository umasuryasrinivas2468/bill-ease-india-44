
import React from 'react';
import { Navigate } from 'react-router-dom';
import { SignedIn, SignedOut, SignUp } from '@clerk/clerk-react';
import { FileText } from 'lucide-react';
import { useAuth } from '@/components/ClerkAuthProvider';

const Signup = () => {
  const { user } = useAuth();

  if (user) return <Navigate to="/dashboard" replace />;

  return (
    <>
      <SignedIn>
        <Navigate to="/dashboard" replace />
      </SignedIn>

      <SignedOut>
        <div className="grid min-h-screen w-full grid-cols-1 bg-slate-50 dark:bg-slate-950 lg:grid-cols-2">
          {/* Left — Clerk signup */}
          <div className="flex items-center justify-center px-4 py-10 sm:px-6 lg:px-10">
            <div className="w-full max-w-xl">
              <div className="mb-8 flex flex-col items-center text-center">
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-600">
                  <FileText className="h-5 w-5 text-white" />
                </div>
                <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
                  Create your account
                </h1>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Start your 14-day free trial. No credit card required.
                </p>
              </div>

              <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-xl shadow-slate-200/60 dark:border-slate-800 dark:bg-slate-950 dark:shadow-none sm:p-6">
                <SignUp
                  routing="path"
                  path="/signup"
                  signInUrl="/login"
                  fallbackRedirectUrl="/onboarding"
                  appearance={{
                    elements: {
                      rootBox: 'w-full',
                      card: 'mx-auto w-full max-w-[28rem] border-none bg-transparent p-0 shadow-none',
                      header: 'hidden',
                      main: 'gap-4',
                      socialButtonsBlockButton:
                        'h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-800 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800 normal-case',
                      socialButtonsBlockButtonText: 'text-sm font-medium',
                      socialButtonsProviderIcon: 'h-4 w-4',
                      dividerRow: 'my-5',
                      dividerLine: 'bg-slate-200 dark:bg-slate-800',
                      dividerText: 'text-xs font-medium uppercase tracking-[0.18em] text-slate-400',
                      formFieldLabel: 'mb-1.5 text-sm font-medium text-slate-700 dark:text-slate-300',
                      formFieldInput:
                        'h-11 rounded-xl border-slate-200 px-3 dark:border-slate-800 dark:bg-slate-900',
                      formFieldRow: 'gap-4',
                      formFieldAction: 'font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400',
                      formButtonPrimary:
                        'mt-2 h-11 rounded-xl bg-slate-900 text-sm font-medium text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 normal-case shadow-none',
                      footer: 'bg-transparent pt-4',
                      footerAction: 'text-center text-sm text-slate-500 dark:text-slate-400',
                      footerActionText: 'text-sm text-slate-500 dark:text-slate-400',
                      footerActionLink:
                        'font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400',
                      identityPreviewText: 'text-sm',
                      formResendCodeLink:
                        'font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400',
                      otpCodeFieldInput:
                        'h-11 w-11 rounded-xl border border-slate-200 dark:border-slate-800 dark:bg-slate-900',
                      alert:
                        'rounded-xl border border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-300',
                    },
                  }}
                />
              </div>
            </div>
          </div>

          {/* Right — image */}
          <div className="relative hidden items-center justify-center overflow-hidden bg-gradient-to-br from-indigo-600 via-indigo-700 to-slate-900 p-10 lg:flex">
            <img
              src="/logup-illustration.webp.webp"
              alt=""
              className="max-h-[80vh] w-auto max-w-full rounded-2xl object-contain shadow-2xl"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = 'none';
              }}
            />
          </div>
        </div>
      </SignedOut>
    </>
  );
};

export default Signup;
