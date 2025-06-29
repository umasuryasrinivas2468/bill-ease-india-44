
import React, { useEffect } from 'react';
import { SignedIn, SignedOut, SignInButton, SignUpButton, UserButton, useUser } from '@clerk/clerk-react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileText, X } from 'lucide-react';

const ClerkLogin = () => {
  const { user, isLoaded } = useUser();
  const navigate = useNavigate();

  useEffect(() => {
    if (isLoaded && user) {
      if (user.unsafeMetadata?.onboardingCompleted) {
        navigate('/');
      } else {
        navigate('/onboarding');
      }
    }
  }, [user, isLoaded, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 bg-opacity-50 p-4">
      <SignedOut>
        <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-auto">
          {/* Close button */}
          <button 
            className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
            onClick={() => navigate('/')}
          >
            <X className="h-6 w-6" />
          </button>

          {/* Clerk branding sidebar */}
          <div className="absolute left-0 top-0 bottom-0 w-20 bg-blue-600 rounded-l-2xl flex flex-col items-center justify-center">
            <div className="text-white text-xs font-medium transform -rotate-90 whitespace-nowrap">
              Secretary Clerk
            </div>
          </div>

          <div className="pl-24 pr-8 py-8">
            <div className="mb-8">
              <h1 className="text-2xl font-semibold text-gray-900 mb-2">Sign in</h1>
              <p className="text-gray-600 text-sm">to continue to AczenX</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email address
                </label>
                <div className="flex justify-between items-center mb-4">
                  <span className="text-blue-600 text-sm cursor-pointer hover:underline">
                    Use phone
                  </span>
                </div>
              </div>

              <SignInButton 
                mode="modal"
                fallbackRedirectUrl="/"
              >
                <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-lg h-12 text-base font-medium">
                  CONTINUE
                </Button>
              </SignInButton>

              <div className="text-center mt-6">
                <span className="text-gray-600 text-sm">No account? </span>
                <SignUpButton 
                  mode="modal"
                  fallbackRedirectUrl="/onboarding"
                >
                  <button className="text-blue-600 text-sm hover:underline font-medium">
                    Sign up
                  </button>
                </SignUpButton>
              </div>
            </div>
          </div>
        </div>
      </SignedOut>
      
      <SignedIn>
        <div className="text-center text-white">
          <UserButton />
          <p className="mt-4">Redirecting...</p>
        </div>
      </SignedIn>
    </div>
  );
};

export default ClerkLogin;
