
import React, { useEffect, useState } from 'react';
import {
  SignedIn,
  SignedOut,
  SignInButton,
  SignUpButton,
  UserButton,
  useUser,
} from '@clerk/clerk-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  X,
  Sparkles,
  ShieldCheck,
  Zap,
  ArrowRight,
  CheckCircle2,
} from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';

const perks = [
  { icon: Zap, label: 'Fast onboarding' },
  { icon: ShieldCheck, label: 'Bank-grade security' },
  { icon: Sparkles, label: 'AI-powered insights' },
];

const ClerkLogin = () => {
  const { user, isLoaded } = useUser();
  const navigate = useNavigate();
  const [showModal, setShowModal] = useState(true);

  useEffect(() => {
    if (isLoaded && user) {
      if (user.unsafeMetadata?.onboardingCompleted) {
        navigate('/');
      } else {
        navigate('/onboarding');
      }
    }
  }, [user, isLoaded, navigate]);

  useEffect(() => {
    const hideClerkBranding = () => {
      const style = document.createElement('style');
      style.textContent = `
        .cl-footerAction,
        .cl-footer,
        .cl-formFooter,
        .cl-card .cl-footer,
        .cl-modal .cl-footer,
        .cl-modalContent .cl-footer,
        [data-localization-key="signIn.start.subtitle"],
        [data-localization-key="signUp.start.subtitle"],
        .cl-internal-b3fm6y,
        .cl-internal-1w8pvrk,
        .cl-dividerRow,
        .cl-alternativeMethods__dividerRow,
        .cl-divider,
        .cl-card__footer,
        .cl-modal__footer,
        .cl-formFooter__poweredBy,
        .cl-poweredBy,
        .cl-internal-vfes3t {
          display: none !important;
        }

        .cl-card,
        .cl-modal,
        .cl-modalContent {
          box-shadow: none !important;
          border: none !important;
        }
      `;
      document.head.appendChild(style);
    };

    hideClerkBranding();
    const timer = setTimeout(hideClerkBranding, 500);

    return () => {
      clearTimeout(timer);
    };
  }, []);

  const handleClose = () => {
    setShowModal(false);
    navigate('/');
  };

  return (
    <>
      <SignedOut>
        <Dialog open={showModal} onOpenChange={setShowModal}>
          <DialogContent className="overflow-hidden rounded-2xl border-0 bg-white p-0 shadow-2xl sm:max-w-[880px]">
            <button
              aria-label="Close"
              className="absolute right-4 top-4 z-20 flex h-8 w-8 items-center justify-center rounded-full bg-white/70 text-slate-500 backdrop-blur transition hover:bg-white hover:text-slate-900"
              onClick={handleClose}
            >
              <X className="h-4 w-4" />
            </button>

            <div className="grid grid-cols-1 md:grid-cols-[340px_1fr]">
              {/* Left – branded panel */}
              <div className="relative hidden flex-col justify-between overflow-hidden p-8 text-white md:flex">
                <div className="absolute inset-0 bg-gradient-to-br from-indigo-600 via-indigo-700 to-slate-900" />
                <div className="absolute inset-0 opacity-[0.18] [background-image:radial-gradient(circle_at_1px_1px,white_1px,transparent_0)] [background-size:22px_22px]" />
                <div className="absolute -top-20 -right-20 h-52 w-52 rounded-full bg-orange-400/30 blur-3xl" />

                <div className="relative z-10 flex items-center gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 ring-1 ring-inset ring-white/20 backdrop-blur">
                    <Sparkles className="h-4 w-4" />
                  </div>
                  <span className="text-sm font-semibold tracking-tight">
                    AczenX Auth
                  </span>
                </div>

                <div className="relative z-10 space-y-6">
                  <h3 className="text-2xl font-semibold leading-tight tracking-tight">
                    Welcome to{' '}
                    <span className="bg-gradient-to-r from-orange-300 to-amber-200 bg-clip-text text-transparent">
                      AczenX
                    </span>
                  </h3>
                  <p className="text-sm leading-relaxed text-white/70">
                    One account to access invoicing, payments, payroll and
                    compliance — all in one place.
                  </p>
                  <ul className="space-y-3">
                    {perks.map(({ icon: Icon, label }) => (
                      <li
                        key={label}
                        className="flex items-center gap-3 text-sm text-white/85"
                      >
                        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-white/10 ring-1 ring-inset ring-white/15">
                          <Icon className="h-3.5 w-3.5" />
                        </span>
                        {label}
                      </li>
                    ))}
                  </ul>
                </div>

                <p className="relative z-10 text-xs text-white/50">
                  © {new Date().getFullYear()} Aczen Bilz
                </p>
              </div>

              {/* Right – auth actions */}
              <div className="relative flex flex-col justify-center p-8 sm:p-10">
                <div className="mb-8 space-y-1.5">
                  <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
                    Get started
                  </h2>
                  <p className="text-sm text-slate-500">
                    Sign in or create an account to continue.
                  </p>
                </div>

                <div className="space-y-3">
                  <SignInButton mode="modal" fallbackRedirectUrl="/">
                    <Button className="group h-11 w-full rounded-lg bg-indigo-600 text-sm font-medium text-white shadow-lg shadow-indigo-600/20 transition-all hover:bg-indigo-700 hover:shadow-indigo-600/30">
                      Sign in
                      <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                    </Button>
                  </SignInButton>

                  <SignUpButton mode="modal" fallbackRedirectUrl="/onboarding">
                    <Button
                      variant="outline"
                      className="h-11 w-full rounded-lg border-slate-200 bg-white text-sm font-medium text-slate-900 hover:bg-slate-50"
                    >
                      Create an account
                    </Button>
                  </SignUpButton>
                </div>

                <div className="my-6 flex items-center gap-3 text-xs text-slate-400">
                  <span className="h-px flex-1 bg-slate-200" />
                  What you get
                  <span className="h-px flex-1 bg-slate-200" />
                </div>

                <ul className="space-y-2 text-xs text-slate-600">
                  {[
                    'Single sign-on across Aczen products',
                    '2FA & passwordless login',
                    'Encrypted, compliant by default',
                  ].map((item) => (
                    <li key={item} className="flex items-center gap-2">
                      <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0 text-emerald-500" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>

                <p className="mt-8 text-center text-xs text-slate-400">
                  By continuing you agree to our{' '}
                  <a
                    href="#"
                    className="font-medium text-slate-600 underline-offset-4 hover:underline"
                  >
                    Terms
                  </a>{' '}
                  &{' '}
                  <a
                    href="#"
                    className="font-medium text-slate-600 underline-offset-4 hover:underline"
                  >
                    Privacy
                  </a>
                  .
                </p>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </SignedOut>

      <SignedIn>
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900">
          <div className="text-center text-white">
            <UserButton />
            <p className="mt-4 text-sm text-white/70">Redirecting...</p>
          </div>
        </div>
      </SignedIn>
    </>
  );
};

export default ClerkLogin;
