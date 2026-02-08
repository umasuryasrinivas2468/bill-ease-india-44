
import React from 'react';
import { Navigate } from 'react-router-dom';
import { SignedIn, SignedOut, SignInButton, SignUpButton } from '@clerk/clerk-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileText } from 'lucide-react';
import { useAuth } from '@/components/ClerkAuthProvider';

const Login = () => {
  const { user } = useAuth();

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <>
      <SignedIn>
        <Navigate to="/dashboard" replace />
      </SignedIn>
      
      <SignedOut>
        <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
          <Card className="w-full max-w-md">
            <CardHeader className="text-center">
              <div className="flex justify-center mb-4">
                <div className="h-12 w-12 bg-blue-600 rounded-lg flex items-center justify-center">
                  <FileText className="h-7 w-7 text-white" />
                </div>
              </div>
              <CardTitle className="text-2xl font-bold">BillEase</CardTitle>
              <CardDescription>
                Smart invoicing for Indian businesses
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="signin" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="signin">Sign In</TabsTrigger>
                  <TabsTrigger value="signup">Sign Up</TabsTrigger>
                </TabsList>
                
                <TabsContent value="signin" className="space-y-4">
                  <SignInButton 
                    mode="modal"
                    fallbackRedirectUrl="/dashboard"
                  >
                    <Button className="w-full">
                      Sign In
                    </Button>
                  </SignInButton>
                </TabsContent>
                
                <TabsContent value="signup" className="space-y-4">
                  <SignUpButton 
                    mode="modal"
                    fallbackRedirectUrl="/onboarding"
                  >
                    <Button variant="outline" className="w-full">
                      Create Account
                    </Button>
                  </SignUpButton>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </SignedOut>
    </>
  );
};

export default Login;
