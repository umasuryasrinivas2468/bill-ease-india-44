import React, { useState } from 'react';
import { Dialog, DialogDescription, DialogHeader, DialogTitle, DialogPortal, DialogOverlay } from '@/components/ui/dialog';
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Calendar, AlertTriangle, CheckCircle, ExternalLink, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '@clerk/clerk-react';
import { cn } from "@/lib/utils";

// Custom DialogContent without close button
const DialogContentNoClose = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg",
        className
      )}
      {...props}
    >
      {children}
      {/* No close button here */}
    </DialogPrimitive.Content>
  </DialogPortal>
));
DialogContentNoClose.displayName = "DialogContentNoClose";

interface LicenseExpiryPopupProps {
  isOpen: boolean;
  onClose: () => void;
  userLicense: {
    plan_type: string;
    due_date: string;
    license_key: string;
  } | null;
  isExpired: boolean;
  isExpiringSoon: boolean;
}

export default function LicenseExpiryPopup({ 
  isOpen, 
  onClose, 
  userLicense, 
  isExpired, 
  isExpiringSoon 
}: LicenseExpiryPopupProps) {
  const { user } = useUser();
  const [showExtension, setShowExtension] = useState(false);
  const [extensionEmail, setExtensionEmail] = useState('');
  const [isExtending, setIsExtending] = useState(false);
  const [isCheckingLicense, setIsCheckingLicense] = useState(false);
  const [extensionResult, setExtensionResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  const handleActivateLicense = () => {
    window.open('https://www.aczen.in/pricing', '_blank');
  };

  const handleCheckLicenseStatus = async () => {
    if (!user?.primaryEmailAddress?.emailAddress) return;

    setIsCheckingLicense(true);
    try {
      // Check current license status
      const { data, error } = await supabase
        .from('license')
        .select('due_date')
        .eq('email', user.primaryEmailAddress.emailAddress)
        .single();

      if (error) {
        setExtensionResult({
          success: false,
          message: 'Could not check license status. Please try again.'
        });
        return;
      }

      // Check if license is now valid
      const dueDate = new Date(data.due_date);
      const now = new Date();
      const nowStartOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const dueDateStartOfDay = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());

      if (dueDateStartOfDay > nowStartOfDay) {
        // License is now valid, refresh the page
        setExtensionResult({
          success: true,
          message: 'License updated! Refreshing application...'
        });
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      } else {
        setExtensionResult({
          success: false,
          message: 'License is still expired. Please renew or extend your license.'
        });
      }
    } catch (error) {
      setExtensionResult({
        success: false,
        message: 'Error checking license status. Please try again.'
      });
    } finally {
      setIsCheckingLicense(false);
    }
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

      // If extending current user's license, refresh immediately to hide popup
      if (extensionEmail.trim() === user?.primaryEmailAddress?.emailAddress) {
        setTimeout(() => {
          window.location.reload();
        }, 1500);
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

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  };

  const getDaysUntilExpiry = () => {
    if (!userLicense) return 0;
    const dueDate = new Date(userLicense.due_date);
    const now = new Date();
    const diffTime = dueDate.getTime() - now.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  const daysLeft = getDaysUntilExpiry();

  return (
    <Dialog open={isOpen}>
      <DialogContentNoClose 
        className="sm:max-w-md" 
        onPointerDownOutside={(e) => e.preventDefault()} 
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isExpired ? (
              <>
                <AlertTriangle className="h-5 w-5 text-red-600" />
                Plan Expired
              </>
            ) : (
              <>
                <Calendar className="h-5 w-5 text-orange-600" />
                Plan Expires Today
              </>
            )}
          </DialogTitle>
          <DialogDescription>
            {isExpired 
              ? 'Your subscription has expired. Please renew to continue using the application.'
              : 'Your subscription expires today! Renew now to avoid losing access to your account.'
            }
          </DialogDescription>
        </DialogHeader>

        {userLicense && (
          <Card className="mb-4">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center justify-between">
                Current Plan
                <Badge variant={userLicense.plan_type === 'starter' ? 'secondary' : 'default'}>
                  {userLicense.plan_type.toUpperCase()}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">License Key:</span>
                  <span className="font-mono">{userLicense.license_key}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Expiry Date:</span>
                  <span className={isExpired ? 'text-red-600 font-medium' : isExpiringSoon ? 'text-orange-600 font-medium' : ''}>
                    {formatDate(userLicense.due_date)}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {!showExtension ? (
          <div className="space-y-3">
            <Button 
              onClick={handleActivateLicense}
              className="w-full"
              size="lg"
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              Activate License
            </Button>
            
            <div className="text-center space-y-2">
              <button
                onClick={() => setShowExtension(true)}
                className="text-sm text-blue-600 hover:text-blue-800 underline block w-full"
              >
                Already have a license? Extend existing license
              </button>
              <button
                onClick={handleCheckLicenseStatus}
                disabled={isCheckingLicense}
                className="text-xs text-gray-600 hover:text-gray-800 underline disabled:opacity-50"
              >
                {isCheckingLicense ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin inline mr-1" />
                    Checking...
                  </>
                ) : (
                  'I renewed externally - Check license status'
                )}
              </button>
            </div>
          </div>
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
      </DialogContentNoClose>
    </Dialog>
  );
}