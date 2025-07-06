import React, { useState, useEffect } from 'react';
import { useUser } from '@clerk/clerk-react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Building, CreditCard, FileImage, Upload, CheckCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useGSTVerification } from '@/hooks/useGSTVerification';

const Onboarding = () => {
  const { user } = useUser();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { verifyGST, isVerifying } = useGSTVerification();
  const [currentStep, setCurrentStep] = useState('business');
  const [completedSteps, setCompletedSteps] = useState<string[]>([]);
  const [isCompleting, setIsCompleting] = useState(false);

  const [businessInfo, setBusinessInfo] = useState({
    businessName: '',
    ownerName: '',
    email: user?.primaryEmailAddress?.emailAddress || '',
    phone: user?.primaryPhoneNumber?.phoneNumber || '',
    gstNumber: '',
    address: '',
    city: '',
    state: '',
    pincode: '',
    gstRate: '18', // Default GST rate
    isImportExportApplicable: 'no',
    iecNumber: '',
    lutNumber: '',
  });

  const [bankDetails, setBankDetails] = useState({
    accountNumber: '',
    ifscCode: '',
    bankName: '',
    branchName: '',
    accountHolderName: '',
  });

  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [signatureFile, setSignatureFile] = useState<File | null>(null);

  useEffect(() => {
    if (user) {
      setBusinessInfo(prev => ({
        ...prev,
        email: user.primaryEmailAddress?.emailAddress || prev.email,
        phone: user.primaryPhoneNumber?.phoneNumber || prev.phone,
      }));
    }
  }, [user]);

  useEffect(() => {
    const verifyGSTNumber = async () => {
      if (businessInfo.gstNumber && businessInfo.gstNumber.length === 15) {
        try {
          const result = await verifyGST(businessInfo.gstNumber);
          
          if (result.success && result.data) {
            setBusinessInfo(prev => ({
              ...prev,
              businessName: result.data.tradeNam || result.data.lgnm || prev.businessName,
              address: result.data.pradr?.addr?.bno && result.data.pradr?.addr?.st 
                ? `${result.data.pradr.addr.bno}, ${result.data.pradr.addr.st}, ${result.data.pradr.addr.loc}`
                : prev.address,
              city: result.data.pradr?.addr?.dst || prev.city,
              state: result.data.pradr?.addr?.stcd || prev.state,
              pincode: result.data.pradr?.addr?.pncd || prev.pincode,
            }));

            toast({
              title: "GST Verified Successfully",
              description: "Business information has been auto-filled.",
            });
          }
        } catch (error) {
        }
      }
    };

    const timeoutId = setTimeout(verifyGSTNumber, 500);
    return () => clearTimeout(timeoutId);
  }, [businessInfo.gstNumber, verifyGST, toast]);

  const validateGSTNumber = (gstNumber: string) => {
    const gstRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}[Z]{1}[0-9A-Z]{1}$/;
    return gstRegex.test(gstNumber);
  };

  const validateIECNumber = (iecNumber: string) => {
    return /^\d{10}$/.test(iecNumber);
  };

  const validateAccountNumber = (accountNumber: string) => {
    return /^\d{9,18}$/.test(accountNumber);
  };

  const validateIFSCCode = (ifsc: string) => {
    return /^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc);
  };

  const handleBusinessSubmit = () => {
    if (!businessInfo.businessName || !businessInfo.ownerName || !businessInfo.phone || 
        !businessInfo.email || !businessInfo.gstNumber || !businessInfo.address || 
        !businessInfo.city || !businessInfo.state || !businessInfo.pincode) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }

    if (!validateGSTNumber(businessInfo.gstNumber)) {
      toast({
        title: "Invalid GST Number",
        description: "GST number format is invalid. Example: 36AAFCL5374E1ZG",
        variant: "destructive",
      });
      return;
    }

    if (businessInfo.isImportExportApplicable === 'yes') {
      if (!businessInfo.iecNumber || !businessInfo.lutNumber) {
        toast({
          title: "Missing Import/Export Information",
          description: "Please fill in both IEC Number and LUT Number.",
          variant: "destructive",
        });
        return;
      }

      if (!validateIECNumber(businessInfo.iecNumber)) {
        toast({
          title: "Invalid IEC Number",
          description: "IEC number must be exactly 10 digits.",
          variant: "destructive",
        });
        return;
      }
    }

    setCompletedSteps([...completedSteps, 'business']);
    setCurrentStep('banking');
    toast({
      title: "Business Information Saved",
      description: "Moving to banking details.",
    });
  };

  const handleBankingSubmit = () => {
    if (!bankDetails.accountNumber || !bankDetails.ifscCode || !bankDetails.bankName || 
        !bankDetails.branchName || !bankDetails.accountHolderName) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required banking fields.",
        variant: "destructive",
      });
      return;
    }

    if (!validateAccountNumber(bankDetails.accountNumber)) {
      toast({
        title: "Invalid Account Number",
        description: "Account number must be 9-18 digits long.",
        variant: "destructive",
      });
      return;
    }

    if (!validateIFSCCode(bankDetails.ifscCode)) {
      toast({
        title: "Invalid IFSC Code",
        description: "IFSC code format is invalid. Example: SBIN0001234",
        variant: "destructive",
      });
      return;
    }

    setCompletedSteps([...completedSteps, 'banking']);
    setCurrentStep('branding');
    toast({
      title: "Banking Details Saved",
      description: "Moving to branding setup.",
    });
  };

  const handleComplete = async () => {
    if (!logoFile || !signatureFile) {
      toast({
        title: "Missing Files",
        description: "Both business logo and digital signature are mandatory.",
        variant: "destructive",
      });
      return;
    }

    setIsCompleting(true);
    
    try {
      const logoBase64 = await fileToBase64(logoFile);
      const signatureBase64 = await fileToBase64(signatureFile);

      await user?.update({
        unsafeMetadata: {
          businessInfo,
          bankDetails,
          logoBase64,
          signatureBase64,
          onboardingCompleted: true,
        }
      });

      toast({
        title: "Setup Complete!",
        description: "Welcome to Aczen Bilz. You're ready to start creating invoices.",
      });

      navigate('/', { replace: true });
    } catch (error) {
      console.error('Error completing onboarding:', error);
      toast({
        title: "Error",
        description: "There was an issue completing your setup. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsCompleting(false);
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
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
            <Card>
              <CardHeader>
                <CardTitle>Business Information</CardTitle>
                <CardDescription>Tell us about your business (All fields are mandatory)</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="businessName">Business Name *</Label>
                    <Input
                      id="businessName"
                      value={businessInfo.businessName}
                      onChange={(e) => setBusinessInfo({...businessInfo, businessName: e.target.value})}
                      placeholder="Enter business name"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ownerName">Owner Name *</Label>
                    <Input
                      id="ownerName"
                      value={businessInfo.ownerName}
                      onChange={(e) => setBusinessInfo({...businessInfo, ownerName: e.target.value})}
                      placeholder="Enter owner name"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email *</Label>
                    <Input
                      id="email"
                      type="email"
                      value={businessInfo.email}
                      onChange={(e) => setBusinessInfo({...businessInfo, email: e.target.value})}
                      placeholder="business@example.com"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone *</Label>
                    <Input
                      id="phone"
                      value={businessInfo.phone}
                      onChange={(e) => setBusinessInfo({...businessInfo, phone: e.target.value})}
                      placeholder="+91 98765 43210"
                      required
                    />
                  </div>
                  <div className="md:col-span-2 space-y-2">
                    <Label htmlFor="gstNumber">GST Number *</Label>
                    <div className="relative">
                      <Input
                        id="gstNumber"
                        value={businessInfo.gstNumber}
                        onChange={(e) => setBusinessInfo({...businessInfo, gstNumber: e.target.value.toUpperCase()})}
                        placeholder="36AAFCL5374E1ZG"
                        maxLength={15}
                        required
                      />
                      {isVerifying && (
                        <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600" />
                        </div>
                      )}
                    </div>
                    {businessInfo.gstNumber && !validateGSTNumber(businessInfo.gstNumber) && (
                      <p className="text-sm text-red-500">Invalid GST format. Example: 36AAFCL5374E1ZG</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pincode">PIN Code *</Label>
                    <Input
                      id="pincode"
                      value={businessInfo.pincode}
                      onChange={(e) => setBusinessInfo({...businessInfo, pincode: e.target.value})}
                      placeholder="400001"
                      required
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="address">Business Address *</Label>
                  <Textarea
                    id="address"
                    value={businessInfo.address}
                    onChange={(e) => setBusinessInfo({...businessInfo, address: e.target.value})}
                    placeholder="Enter complete business address"
                    rows={3}
                    required
                  />
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="city">City *</Label>
                    <Input
                      id="city"
                      value={businessInfo.city}
                      onChange={(e) => setBusinessInfo({...businessInfo, city: e.target.value})}
                      placeholder="Mumbai"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="state">State *</Label>
                    <Input
                      id="state"
                      value={businessInfo.state}
                      onChange={(e) => setBusinessInfo({...businessInfo, state: e.target.value})}
                      placeholder="Maharashtra"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <Label className="text-base font-medium">Import/Export Applicable *</Label>
                  <RadioGroup 
                    value={businessInfo.isImportExportApplicable} 
                    onValueChange={(value) => setBusinessInfo({...businessInfo, isImportExportApplicable: value, iecNumber: value === 'no' ? '' : businessInfo.iecNumber, lutNumber: value === 'no' ? '' : businessInfo.lutNumber})}
                    className="flex flex-row space-x-6"
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="yes" id="importExportYes" />
                      <Label htmlFor="importExportYes">Yes</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="no" id="importExportNo" />
                      <Label htmlFor="importExportNo">No</Label>
                    </div>
                  </RadioGroup>
                </div>

                {businessInfo.isImportExportApplicable === 'yes' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="iecNumber">IEC Number *</Label>
                      <Input
                        id="iecNumber"
                        value={businessInfo.iecNumber}
                        onChange={(e) => setBusinessInfo({...businessInfo, iecNumber: e.target.value})}
                        placeholder="1234567890"
                        maxLength={10}
                        pattern="\d*"
                        required
                      />
                      {businessInfo.iecNumber && !validateIECNumber(businessInfo.iecNumber) && (
                        <p className="text-sm text-red-500">IEC number must be exactly 10 digits</p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="lutNumber">LUT Number *</Label>
                      <Input
                        id="lutNumber"
                        value={businessInfo.lutNumber}
                        onChange={(e) => setBusinessInfo({...businessInfo, lutNumber: e.target.value})}
                        placeholder="Enter LUT number"
                        required
                      />
                    </div>
                  </div>
                )}

                <div className="space-y-4">
                  <Label className="text-base font-medium">GST Rate Selection *</Label>
                  <RadioGroup 
                    value={businessInfo.gstRate} 
                    onValueChange={(value) => setBusinessInfo({...businessInfo, gstRate: value})}
                    className="flex flex-col space-y-2"
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="18" id="gst18" />
                      <Label htmlFor="gst18">18%</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="12" id="gst12" />
                      <Label htmlFor="gst12">12%</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="5" id="gst5" />
                      <Label htmlFor="gst5">5%</Label>
                    </div>
                  </RadioGroup>
                  <p className="text-sm text-muted-foreground">This will apply for the invoice</p>
                </div>
                
                <Button onClick={handleBusinessSubmit} className="w-full">
                  Continue to Banking
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="banking">
            <Card>
              <CardHeader>
                <CardTitle>Banking Details</CardTitle>
                <CardDescription>Add your bank account for payment information (All fields are mandatory)</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="accountNumber">Account Number *</Label>
                    <Input
                      id="accountNumber"
                      value={bankDetails.accountNumber}
                      onChange={(e) => setBankDetails({...bankDetails, accountNumber: e.target.value})}
                      placeholder="1234567890123456"
                      maxLength={18}
                      pattern="\d*"
                      title="Please enter a valid account number (9-18 digits)"
                      required
                    />
                    {bankDetails.accountNumber && !validateAccountNumber(bankDetails.accountNumber) && (
                      <p className="text-sm text-red-500">Account number must be 9-18 digits long</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ifscCode">IFSC Code *</Label>
                    <Input
                      id="ifscCode"
                      value={bankDetails.ifscCode}
                      onChange={(e) => setBankDetails({...bankDetails, ifscCode: e.target.value.toUpperCase()})}
                      placeholder="SBIN0001234"
                      maxLength={11}
                      style={{ textTransform: 'uppercase' }}
                      required
                    />
                    {bankDetails.ifscCode && !validateIFSCCode(bankDetails.ifscCode) && (
                      <p className="text-sm text-red-500">Invalid IFSC format. Example: SBIN0001234</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="bankName">Bank Name *</Label>
                    <Input
                      id="bankName"
                      value={bankDetails.bankName}
                      onChange={(e) => setBankDetails({...bankDetails, bankName: e.target.value})}
                      placeholder="State Bank of India"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="branchName">Branch Name *</Label>
                    <Input
                      id="branchName"
                      value={bankDetails.branchName}
                      onChange={(e) => setBankDetails({...bankDetails, branchName: e.target.value})}
                      placeholder="Mumbai Main Branch"
                      required
                    />
                  </div>
                  <div className="md:col-span-2 space-y-2">
                    <Label htmlFor="accountHolderName">Account Holder Name *</Label>
                    <Input
                      id="accountHolderName"
                      value={bankDetails.accountHolderName}
                      onChange={(e) => setBankDetails({...bankDetails, accountHolderName: e.target.value})}
                      placeholder="As per bank records"
                      required
                    />
                  </div>
                </div>
                
                <Button onClick={handleBankingSubmit} className="w-full">
                  Continue to Branding
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="branding">
            <Card>
              <CardHeader>
                <CardTitle>Business Branding</CardTitle>
                <CardDescription>Upload your logo and signature for invoices (Both are mandatory)</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div>
                    <Label className="text-base font-medium">Business Logo *</Label>
                    <div className="flex items-center gap-4 mt-2">
                      <div className="w-24 h-24 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center">
                        {logoFile ? (
                          <img 
                            src={URL.createObjectURL(logoFile)} 
                            alt="Logo preview" 
                            className="w-full h-full object-contain rounded-lg" 
                          />
                        ) : (
                          <FileImage className="h-8 w-8 text-gray-400" />
                        )}
                      </div>
                      <div className="flex-1">
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleLogoUpload}
                          className="hidden"
                          id="logo-upload"
                          required
                        />
                        <Label htmlFor="logo-upload" className="cursor-pointer">
                          <Button variant="outline" asChild>
                            <span>
                              <Upload className="h-4 w-4 mr-2" />
                              Upload Logo
                            </span>
                          </Button>
                        </Label>
                        <p className="text-sm text-muted-foreground mt-2">
                          PNG, JPG up to 2MB. Recommended: 200x200px (Required)
                        </p>
                      </div>
                    </div>
                  </div>

                  <div>
                    <Label className="text-base font-medium">Digital Signature *</Label>
                    <div className="flex items-center gap-4 mt-2">
                      <div className="w-24 h-24 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center">
                        {signatureFile ? (
                          <img 
                            src={URL.createObjectURL(signatureFile)} 
                            alt="Signature preview" 
                            className="w-full h-full object-contain rounded-lg" 
                          />
                        ) : (
                          <Upload className="h-8 w-8 text-gray-400" />
                        )}
                      </div>
                      <div className="flex-1">
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleSignatureUpload}
                          className="hidden"
                          id="signature-upload"
                          required
                        />
                        <Label htmlFor="signature-upload" className="cursor-pointer">
                          <Button variant="outline" asChild>
                            <span>
                              <Upload className="h-4 w-4 mr-2" />
                              Upload Signature
                            </span>
                          </Button>
                        </Label>
                        <p className="text-sm text-muted-foreground mt-2">
                          PNG, JPG up to 1MB. Transparent background recommended (Required)
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
                
                <Button 
                  onClick={handleComplete} 
                  className="w-full"
                  disabled={isCompleting}
                >
                  {isCompleting ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Completing Setup...
                    </>
                  ) : (
                    "Complete Setup & Go to Dashboard"
                  )}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Onboarding;
