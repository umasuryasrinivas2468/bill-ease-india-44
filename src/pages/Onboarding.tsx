
import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Building, CreditCard, FileImage, CheckCircle } from 'lucide-react';
import { useOnboardingState } from '@/hooks/useOnboardingState';
import { BusinessInfoStep } from '@/components/onboarding/BusinessInfoStep';
import { BankingDetailsStep } from '@/components/onboarding/BankingDetailsStep';
import { BrandingStep } from '@/components/onboarding/BrandingStep';

const Onboarding = () => {
  const {
    currentStep,
    setCurrentStep,
    completedSteps,
    businessInfo,
    setBusinessInfo,
    bankDetails,
    setBankDetails,
    businessAssets,
    setBusinessAssets,
    isCompleting,
    handleBusinessNext,
    handleBankingNext,
    handleComplete,
    sessionId,
  } = useOnboardingState();

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-2xl mx-auto pt-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold">Welcome to Aczen Bilz!</h1>
          <p className="text-muted-foreground mt-2">Let's set up your business profile</p>
          <div className="mt-4 text-sm text-muted-foreground bg-white/50 rounded-lg p-2 inline-block">
            🔐 Secured By Aczen Auth 3.0 | Session: {sessionId}
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
              isLoading={isCompleting}
            />
          </TabsContent>

          <TabsContent value="banking">
            <BankingDetailsStep
              bankDetails={bankDetails}
              setBankDetails={setBankDetails}
              onNext={handleBankingNext}
              isLoading={isCompleting}
            />
          </TabsContent>

          <TabsContent value="branding">
            <BrandingStep
              businessAssets={businessAssets}
              setBusinessAssets={setBusinessAssets}
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
