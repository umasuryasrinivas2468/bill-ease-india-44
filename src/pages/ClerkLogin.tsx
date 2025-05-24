
import React, { useEffect } from 'react';
import { SignedIn, SignedOut, SignInButton, SignUpButton, UserButton, useUser } from '@clerk/clerk-react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileText } from 'lucide-react';

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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <SignedOut>
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <div className="h-12 w-12 bg-blue-600 rounded-lg flex items-center justify-center">
                <FileText className="h-7 w-7 text-white" />
              </div>
            </div>
            <CardTitle className="text-2xl font-bold">Aczen Bilz</CardTitle>
            <CardDescription>
              Smart invoicing for Indian businesses
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <SignInButton fallbackRedirectUrl="/">
              <Button className="w-full">Sign In</Button>
            </SignInButton>
            <SignUpButton fallbackRedirectUrl="/onboarding">
              <Button variant="outline" className="w-full">Sign Up</Button>
            </SignUpButton>
          </CardContent>
        </Card>
      </SignedOut>
      <SignedIn>
        <div className="text-center">
          <UserButton />
          <p className="mt-4">Redirecting...</p>
        </div>
      </SignedIn>
    </div>
  );
};

export default ClerkLogin;
