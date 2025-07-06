
import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Building, CreditCard, FileImage, CheckCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useOnboardingState } from '@/hooks/useOnboardingState';
import { BusinessInfoStep } from '@/components/onboarding/BusinessInfoStep';
import { BankingDetailsStep } from '@/components/onboarding/BankingDetailsStep';
import { BrandingStep } from '@/components/onboarding/BrandingStep';

const Onboarding = () => {
  const { toast } = useToast();
  const {
    currentStep,
    setCurrentStep,
    completedSteps,
    setCompletedSteps,
    businessInfo,
    setBusinessInfo,
    bankDetails,
    setBankDetails,
    logoFile,
    setLogoFile,
    signatureFile,
    setSignatureFile,
    isCompleting,
    handleComplete,
  } = useOnboardingState();

  const handleBusinessNext = () => {
    setCompletedSteps([...completedSteps, 'business']);
    setCurrentStep('banking');
    toast({
      title: "Business Information Saved",
      description: "Moving to banking details.",
    });
  };

  const handleBankingNext = () => {
    setCompletedSteps([...completedSteps, 'banking']);
    setCurrentStep('branding');
    toast({
      title: "Banking Details Saved",
      description: "Moving to branding setup.",
    });
  };

  const handleLogoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setLogoFile(file);
      toast({
        title: "Logo Uploaded",
        description: "Your business logo has been uploaded successfully.",
      });
    }
  };

  const handleSignatureUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSignatureFile(file);
      toast({
        title: "Signature Uploaded",
        description: "Your signature has been uploaded successfully.",
      });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-2xl mx-auto pt-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold">Welcome to Aczen Bilz!</h1>
          <p className="text-muted-foreground mt-2">Let's set up your business profile</p>
          <div className="mt-4 text-sm text-muted-foreground bg-white/50 rounded-lg p-2 inline-block">
            🔐 Secured By Aczen Auth 3.0
          </div>
        </div>

        <Tabs value={currentStep} onValueChange={setCurrentStep} className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="business" className="relative">
              <Building className="h-4 w-4 mr-2" />
              Business
              {completedSteps.includes('business') && (
                <CheckCircle className="h-4 w-4 ml-2 text-green-500" />
              )}
            </TabsTrigger>
            <TabsTrigger value="banking" disabled={!completedSteps.includes('business')}>
              <CreditCard className="h-4 w-4 mr-2" />
              Banking
              {completedSteps.includes('banking') && (
                <CheckCircle className="h-4 w-4 ml-2 text-green-500" />
              )}
            </TabsTrigger>
            <TabsTrigger value="branding" disabled={!completedSteps.includes('banking')}>
              <FileImage className="h-4 w-4 mr-2" />
              Branding
            </TabsTrigger>
          </TabsList>

          <TabsContent value="business">
            <BusinessInfoStep
              businessInfo={businessInfo}
              setBusinessInfo={setBusinessInfo}
              onNext={handleBusinessNext}
              toast={toast}
            />
          </TabsContent>

          <TabsContent value="banking">
            <BankingDetailsStep
              bankDetails={bankDetails}
              setBankDetails={setBankDetails}
              onNext={handleBankingNext}
              toast={toast}
            />
          </TabsContent>

          <TabsContent value="branding">
            <BrandingStep
              logoFile={logoFile}
              signatureFile={signatureFile}
              onLogoUpload={handleLogoUpload}
              onSignatureUpload={handleSignatureUpload}
              onComplete={handleComplete}
              isCompleting={isCompleting}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Onboarding;
