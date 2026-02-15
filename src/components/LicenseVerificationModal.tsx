import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface LicenseVerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  userEmail: string;
  isSignUp: boolean; // true for sign up, false for sign in
  onVerificationSuccess: (isNewUser: boolean) => void;
}

export const LicenseVerificationModal: React.FC<LicenseVerificationModalProps> = ({
  isOpen,
  onClose,
  userEmail,
  isSignUp,
  onVerificationSuccess
}) => {
  const [licenseKey, setLicenseKey] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const verifyLicenseKey = async () => {
    if (!licenseKey.trim()) {
      setError('Please enter a license key');
      return;
    }

    setIsVerifying(true);
    setError('');

    try {
      // Check if license key exists in the database
      const { data: licenseData, error: licenseError } = await supabase
        .from('license')
        .select('*')
        .eq('license_key', licenseKey.trim())
        .single();

      if (licenseError || !licenseData) {
        setError('Invalid license key. Please check and try again.');
        setIsVerifying(false);
        return;
      }

      // Check if license is expired
      const currentDate = new Date();
      const expiryDate = new Date(licenseData.due_date);
      
      if (currentDate > expiryDate) {
        setError('This license key has expired. Please contact support or generate a new license.');
        setIsVerifying(false);
        return;
      }

      // Check if license email matches user email (optional validation)
      if (licenseData.email !== userEmail) {
        setError('This license key is registered to a different email address.');
        setIsVerifying(false);
        return;
      }

      // License is valid - show success
      setSuccess(true);
      setError('');

      // Wait a moment to show success, then proceed
      setTimeout(() => {
        setIsVerifying(false);
        onVerificationSuccess(isSignUp);
      }, 1500);

    } catch (error) {
      console.error('License verification error:', error);
      setError('An error occurred while verifying the license. Please try again.');
      setIsVerifying(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isVerifying) {
      verifyLicenseKey();
    }
  };

  const resetModal = () => {
    setLicenseKey('');
    setError('');
    setSuccess(false);
    setIsVerifying(false);
  };

  const handleClose = () => {
    resetModal();
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-center text-xl font-bold">
            🔐 License Verification
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 pt-4">
          <div className="text-center">
            <p className="text-gray-600 mb-4">
              {isSignUp 
                ? "Welcome! Please enter your license key to complete your account setup."
                : "Please enter your license key to access your dashboard."
              }
            </p>
            <p className="text-sm text-gray-500">
              Email: <span className="font-medium">{userEmail}</span>
            </p>
          </div>

          {!success && (
            <>
              <div className="space-y-2">
                <Label htmlFor="license-key">License Key</Label>
                <Input
                  id="license-key"
                  type="text"
                  placeholder="Enter your license key (e.g., ACZ12345...)"
                  value={licenseKey}
                  onChange={(e) => setLicenseKey(e.target.value.toUpperCase())}
                  onKeyPress={handleKeyPress}
                  className="font-mono text-center tracking-wider"
                  disabled={isVerifying}
                />
              </div>

              {error && (
                <Alert variant="destructive">
                  <XCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  onClick={handleClose}
                  disabled={isVerifying}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button 
                  onClick={verifyLicenseKey}
                  disabled={isVerifying || !licenseKey.trim()}
                  className="flex-1"
                >
                  {isVerifying ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Verifying...
                    </>
                  ) : (
                    'Verify License'
                  )}
                </Button>
              </div>
            </>
          )}

          {success && (
            <div className="text-center py-6">
              <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-green-700 mb-2">
                License Verified Successfully!
              </h3>
              <p className="text-gray-600">
                {isSignUp 
                  ? "Redirecting to onboarding..."
                  : "Redirecting to dashboard..."
                }
              </p>
            </div>
          )}

          <div className="text-center text-sm text-gray-500">
            <p>Don't have a license key?</p>
            <a 
              href="/starter.202512a" 
              className="text-blue-600 hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              Generate a new license key here
            </a>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};