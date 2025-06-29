
import React, { useEffect, useState } from 'react';
import { SignedIn, SignedOut, SignInButton, SignUpButton, UserButton, useUser } from '@clerk/clerk-react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const ClerkLogin = () => {
  const { user, isLoaded } = useUser();
  const navigate = useNavigate();
  const [showModal, setShowModal] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isLoaded && user) {
      if (user.unsafeMetadata?.onboardingCompleted) {
        navigate('/');
      } else {
        navigate('/onboarding');
      }
    }
  }, [user, isLoaded, navigate]);

  const handleClose = () => {
    setShowModal(false);
    navigate('/');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    // Integrated API authentication logic would go here
    // For now, we'll use Clerk's programmatic sign in/up
    try {
      if (isSignUp) {
        // Sign up logic
        console.log('Signing up with:', email);
      } else {
        // Sign in logic
        console.log('Signing in with:', email);
      }
    } catch (error) {
      console.error('Authentication error:', error);
    } finally {
      setLoading(false);
    }
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
                  {isSignUp ? 'Sign up' : 'Sign in'}
                </DialogTitle>
                <p className="text-gray-600 text-sm text-left">to continue to AczenX</p>
              </DialogHeader>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-sm font-medium text-gray-700">
                    Email address
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full"
                    placeholder="Enter your email"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password" className="text-sm font-medium text-gray-700">
                    Password
                  </Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full"
                    placeholder="Enter your password"
                    required
                  />
                </div>

                <Button 
                  type="submit"
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-lg h-12 text-base font-medium"
                  disabled={loading}
                >
                  {loading ? 'Loading...' : (isSignUp ? 'CREATE ACCOUNT' : 'CONTINUE')}
                </Button>

                <div className="text-center mt-6">
                  <span className="text-gray-600 text-sm">
                    {isSignUp ? 'Already have an account? ' : 'No account? '}
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsSignUp(!isSignUp)}
                    className="text-blue-600 text-sm hover:underline font-medium"
                  >
                    {isSignUp ? 'Sign in' : 'Sign up'}
                  </button>
                </div>
              </form>

              {/* Development mode fallback with Clerk buttons */}
              <div className="mt-8 p-4 bg-blue-50 rounded-lg border border-blue-200">
                <p className="text-xs text-blue-700 mb-3 font-medium">Development Mode - Clerk Integration</p>
                <div className="space-y-2">
                  <SignInButton 
                    mode="modal"
                    fallbackRedirectUrl="/"
                  >
                    <Button variant="outline" size="sm" className="w-full text-xs border-blue-300 text-blue-700 hover:bg-blue-100">
                      Clerk Sign In
                    </Button>
                  </SignInButton>
                  <SignUpButton 
                    mode="modal"
                    fallbackRedirectUrl="/onboarding"
                  >
                    <Button variant="outline" size="sm" className="w-full text-xs border-blue-300 text-blue-700 hover:bg-blue-100">
                      Clerk Sign Up
                    </Button>
                  </SignUpButton>
                </div>
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
