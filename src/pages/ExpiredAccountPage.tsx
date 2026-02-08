import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, ExternalLink, CheckCircle, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '@clerk/clerk-react';

export default function ExpiredAccountPage() {
  const { user } = useUser();
  const [showExtension, setShowExtension] = useState(false);
  const [extensionEmail, setExtensionEmail] = useState('');
  const [isExtending, setIsExtending] = useState(false);
  const [extensionResult, setExtensionResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  const handleActivateLicense = () => {
    window.open('https://www.aczen.in/pricing', '_blank');
  };

  const handleExtendLicense = async () => {
    if (!extensionEmail.trim()) {
      setExtensionResult({
        success: false,
        message: 'Please enter an email address'
      });
      return;
    }

    setIsExtending(true);
    setExtensionResult(null);

    try {
      // Check if the email exists in any plan
      const { data: existingLicense, error: fetchError } = await supabase
        .from('license')
        .select('*')
        .eq('email', extensionEmail.trim())
        .single();

      if (fetchError && fetchError.code !== 'PGRST116') {
        throw fetchError;
      }

      if (!existingLicense) {
        setExtensionResult({
          success: false,
          message: 'No license found for this email address'
        });
        return;
      }

      // Calculate new expiry date (current date + 1 month)
      const currentDate = new Date();
      const newExpiryDate = new Date(currentDate);
      newExpiryDate.setMonth(newExpiryDate.getMonth() + 1);

      // Update the license expiry date
      const { error: updateError } = await supabase
        .from('license')
        .update({
          due_date: newExpiryDate.toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('email', extensionEmail.trim());

      if (updateError) {
        throw updateError;
      }

      setExtensionResult({
        success: true,
        message: `License extended successfully! New expiry date: ${newExpiryDate.toLocaleDateString()}`
      });

      // If extending current user's license, refresh the page after a delay
      if (extensionEmail.trim() === user?.primaryEmailAddress?.emailAddress) {
        setTimeout(() => {
          window.location.reload();
        }, 2000);
      }

    } catch (error: any) {
      console.error('License extension error:', error);
      setExtensionResult({
        success: false,
        message: 'Failed to extend license. Please try again.'
      });
    } finally {
      setIsExtending(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full space-y-6">
        {/* Header */}
        <div className="text-center">
          <div className="mx-auto w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-4">
            <AlertTriangle className="h-6 w-6 text-red-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Account Expired</h1>
          <p className="text-gray-600">
            Your subscription has expired. Please renew to continue using Aczen.
          </p>
        </div>

        {/* Main Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-center text-red-600">Access Blocked</CardTitle>
            <CardDescription className="text-center">
              Your license has expired and access to the application has been suspended.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!showExtension ? (
              <>
                <Button 
                  onClick={handleActivateLicense}
                  className="w-full"
                  size="lg"
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Renew License
                </Button>
                
                <div className="text-center">
                  <button
                    onClick={() => setShowExtension(true)}
                    className="text-sm text-blue-600 hover:text-blue-800 underline"
                  >
                    Already have a valid license? Extend existing license
                  </button>
                </div>
              </>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="extension-email">Enter License Email</Label>
                  <Input
                    id="extension-email"
                    type="email"
                    placeholder="Enter your license email address"
                    value={extensionEmail}
                    onChange={(e) => setExtensionEmail(e.target.value)}
                    disabled={isExtending}
                  />
                  <p className="text-xs text-muted-foreground">
                    Enter the email address associated with any existing license (starter, growth, or scale)
                  </p>
                </div>

                {extensionResult && (
                  <Alert>
                    <div className="flex items-start gap-2">
                      {extensionResult.success ? (
                        <CheckCircle className="h-4 w-4 text-green-600 mt-0.5" />
                      ) : (
                        <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5" />
                      )}
                      <AlertDescription className={extensionResult.success ? 'text-green-700' : 'text-red-700'}>
                        {extensionResult.message}
                      </AlertDescription>
                    </div>
                  </Alert>
                )}

                <div className="flex gap-2">
                  <Button
                    onClick={() => setShowExtension(false)}
                    variant="outline"
                    className="flex-1"
                    disabled={isExtending}
                  >
                    Back
                  </Button>
                  <Button
                    onClick={handleExtendLicense}
                    className="flex-1"
                    disabled={isExtending}
                  >
                    {isExtending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Extending...
                      </>
                    ) : (
                      'Extend License'
                    )}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="text-center text-sm text-gray-500">
          Need help? Contact our support team for assistance.
        </div>
      </div>
    </div>
  );
}