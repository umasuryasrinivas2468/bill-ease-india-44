
import React from 'react';
import { Navigate } from 'react-router-dom';
import { SignIn, useUser } from '@clerk/clerk-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FileText } from 'lucide-react';

const Login = () => {
  const { user, isLoaded } = useUser();

  // Show loading while Clerk is initializing
  if (!isLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // Redirect if already authenticated
  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
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
          <SignIn 
            routing="hash"
            signUpUrl="/clerk-login#/sign-up"
            afterSignInUrl="/dashboard"
            appearance={{
              elements: {
                formButtonPrimary: "bg-blue-600 hover:bg-blue-700",
                card: "shadow-none border-0",
                headerTitle: "hidden",
                headerSubtitle: "hidden",
                socialButtonsBlockButton: "border border-gray-200 hover:bg-gray-50",
                formFieldInput: "border border-gray-300 focus:border-blue-500 focus:ring-blue-500"
              }
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
};

export default Login;
