
import React, { useEffect, useState } from 'react';
import { SignedIn, SignedOut, SignInButton, SignUpButton, UserButton, useUser } from '@clerk/clerk-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

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
    // Hide Clerk branding and development mode indicators
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

    // Apply immediately and after a short delay to catch dynamically loaded content
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
          <DialogContent className="sm:max-w-md p-0 bg-white border-0 shadow-2xl">
            {/* Close button */}
            <button 
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors z-10"
              onClick={handleClose}
            >
              <X className="h-6 w-6" />
            </button>

            {/* Blue sidebar */}
            <div className="absolute left-0 top-0 bottom-0 w-20 bg-blue-600 rounded-l-lg flex flex-col items-center justify-center">
              <div className="text-white text-xs font-medium transform -rotate-90 whitespace-nowrap">
                AczenX Auth
              </div>
            </div>

            <div className="pl-24 pr-8 py-8">
              <DialogHeader className="mb-8">
                <DialogTitle className="text-2xl font-semibold text-gray-900 text-left">
                  Welcome to AczenX
                </DialogTitle>
                <p className="text-gray-600 text-sm text-left">Sign in or create an account to continue</p>
              </DialogHeader>

              <div className="space-y-4">
                <SignInButton 
                  mode="modal"
                  fallbackRedirectUrl="/"
                >
                  <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-lg h-12 text-base font-medium">
                    SIGN IN
                  </Button>
                </SignInButton>

                <SignUpButton 
                  mode="modal"
                  fallbackRedirectUrl="/onboarding"
                >
                  <Button 
                    variant="outline"
                    className="w-full border-2 border-blue-600 text-blue-600 hover:bg-blue-50 rounded-lg h-12 text-base font-medium"
                  >
                    SIGN UP
                  </Button>
                </SignUpButton>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </SignedOut>
      
      <SignedIn>
        <div className="min-h-screen flex items-center justify-center bg-gray-900 bg-opacity-50">
          <div className="text-center text-white">
            <UserButton />
            <p className="mt-4">Redirecting...</p>
          </div>
        </div>
      </SignedIn>
    </>
  );
};

export default ClerkLogin;
