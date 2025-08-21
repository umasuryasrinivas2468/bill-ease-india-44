
import React, { useState, useEffect, useRef } from 'react';
import { useUser } from '@clerk/clerk-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Save, Building, CreditCard, FileImage, Upload } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const Settings = () => {
  const { user } = useUser();
  const { toast } = useToast();
  
  const [businessInfo, setBusinessInfo] = useState({
    businessName: '',
    ownerName: '',
    email: '',
    phone: '',
    gstNumber: '',
    address: '',
    city: '',
    state: '',
    pincode: '',
  });

  const [bankDetails, setBankDetails] = useState({
    accountNumber: '',
    ifscCode: '',
    bankName: '',
    branchName: '',
    accountHolderName: '',
  });

  const [businessAssets, setBusinessAssets] = useState({
    logoBase64: '',
    signatureBase64: '',
  });

  const logoInputRef = useRef<HTMLInputElement>(null);
  const signatureInputRef = useRef<HTMLInputElement>(null);

  // Load data from user metadata on component mount
  useEffect(() => {
    if (user?.unsafeMetadata) {
      const metadata = user.unsafeMetadata as any;
      
      if (metadata.businessInfo) {
        setBusinessInfo(metadata.businessInfo);
      }
      
      if (metadata.bankDetails) {
        setBankDetails(metadata.bankDetails);
      }
      
      if (metadata.logoBase64) {
        setBusinessAssets(prev => ({ ...prev, logoBase64: metadata.logoBase64 }));
      }
      
      if (metadata.signatureBase64) {
        setBusinessAssets(prev => ({ ...prev, signatureBase64: metadata.signatureBase64 }));
      }
    }
  }, [user]);

  const validateAccountNumber = (accountNumber: string) => {
    return /^\d{9,18}$/.test(accountNumber);
  };

  const validateIFSCCode = (ifsc: string) => {
    return /^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc);
  };

  const handleSaveBusinessInfo = async () => {
    try {
      await user?.update({
        unsafeMetadata: {
          ...user.unsafeMetadata,
          businessInfo,
        }
      });
      
      toast({
        title: "Business Information Updated",
        description: "Your business information has been saved successfully.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save business information.",
        variant: "destructive",
      });
    }
  };

  const handleSaveBankDetails = async () => {
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

    try {
      await user?.update({
        unsafeMetadata: {
          ...user.unsafeMetadata,
          bankDetails,
        }
      });
      
      toast({
        title: "Bank Details Updated",
        description: "Your bank details have been saved successfully.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save bank details.",
        variant: "destructive",
      });
    }
  };

  const convertFileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          // Remove the data URL prefix and return only the base64 string
          const base64 = reader.result.split(',')[1];
          resolve(base64);
        } else {
          reject(new Error('Failed to read file'));
        }
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
    });
  };

  const handleLogoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast({
        title: "Invalid File Type",
        description: "Please upload an image file (PNG, JPG, JPEG, GIF).",
        variant: "destructive",
      });
      return;
    }

    if (file.size > 5 * 1024 * 1024) { // 5MB limit
      toast({
        title: "File Too Large",
        description: "Please upload an image smaller than 5MB.",
        variant: "destructive",
      });
      return;
    }

    try {
      const base64 = await convertFileToBase64(file);
      setBusinessAssets(prev => ({ ...prev, logoBase64: base64 }));
      toast({
        title: "Logo Uploaded",
        description: "Logo has been uploaded successfully. Don't forget to save!",
      });
    } catch (error) {
      toast({
        title: "Upload Failed",
        description: "Failed to upload logo. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleSignatureUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast({
        title: "Invalid File Type",
        description: "Please upload an image file (PNG, JPG, JPEG, GIF).",
        variant: "destructive",
      });
      return;
    }

    if (file.size > 5 * 1024 * 1024) { // 5MB limit
      toast({
        title: "File Too Large",
        description: "Please upload an image smaller than 5MB.",
        variant: "destructive",
      });
      return;
    }

    try {
      const base64 = await convertFileToBase64(file);
      setBusinessAssets(prev => ({ ...prev, signatureBase64: base64 }));
      toast({
        title: "Signature Uploaded",
        description: "Signature has been uploaded successfully. Don't forget to save!",
      });
    } catch (error) {
      toast({
        title: "Upload Failed",
        description: "Failed to upload signature. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleSaveBusinessAssets = async () => {
    try {
      await user?.update({
        unsafeMetadata: {
          ...user.unsafeMetadata,
          logoBase64: businessAssets.logoBase64,
          signatureBase64: businessAssets.signatureBase64,
        }
      });
      
      toast({
        title: "Business Assets Updated",
        description: "Your logo and signature have been saved successfully.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save business assets.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center gap-4">
        <SidebarTrigger className="md:hidden" />
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Settings</h1>
          <p className="text-muted-foreground">Manage your business information and preferences</p>
          <div className="mt-2 text-sm text-muted-foreground bg-blue-50 rounded-lg p-2 inline-block">
            🔐 Secured By Aczen Auth 3.0
          </div>
        </div>
      </div>

      <Tabs defaultValue="business" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="business">Business</TabsTrigger>
          <TabsTrigger value="banking">Banking</TabsTrigger>
          <TabsTrigger value="branding">Branding</TabsTrigger>
        </TabsList>

        <TabsContent value="business">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building className="h-5 w-5" />
                Business Information
              </CardTitle>
              <CardDescription>
                Update your business details for invoices and GST filing
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="businessName">Business Name *</Label>
                  <Input
                    id="businessName"
                    value={businessInfo.businessName}
                    onChange={(e) => setBusinessInfo({...businessInfo, businessName: e.target.value})}
                    placeholder="Enter business name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ownerName">Owner Name *</Label>
                  <Input
                    id="ownerName"
                    value={businessInfo.ownerName}
                    onChange={(e) => setBusinessInfo({...businessInfo, ownerName: e.target.value})}
                    placeholder="Enter owner name"
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
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone *</Label>
                  <Input
                    id="phone"
                    value={businessInfo.phone}
                    onChange={(e) => setBusinessInfo({...businessInfo, phone: e.target.value})}
                    placeholder="+91 98765 43210"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="gstNumber">GST Number</Label>
                  <Input
                    id="gstNumber"
                    value={businessInfo.gstNumber}
                    onChange={(e) => setBusinessInfo({...businessInfo, gstNumber: e.target.value})}
                    placeholder="22AAAAA0000A1Z5"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pincode">PIN Code</Label>
                  <Input
                    id="pincode"
                    value={businessInfo.pincode}
                    onChange={(e) => setBusinessInfo({...businessInfo, pincode: e.target.value})}
                    placeholder="400001"
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
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="state">State *</Label>
                  <Input
                    id="state"
                    value={businessInfo.state}
                    onChange={(e) => setBusinessInfo({...businessInfo, state: e.target.value})}
                    placeholder="Maharashtra"
                  />
                </div>
              </div>
              
              <Button onClick={handleSaveBusinessInfo} className="w-full sm:w-auto">
                <Save className="h-4 w-4 mr-2" />
                Save Business Information
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="banking">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Bank Details
              </CardTitle>
              <CardDescription>
                Add your bank account details for payment information on invoices
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
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
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="branchName">Branch Name</Label>
                  <Input
                    id="branchName"
                    value={bankDetails.branchName}
                    onChange={(e) => setBankDetails({...bankDetails, branchName: e.target.value})}
                    placeholder="Mumbai Main Branch"
                  />
                </div>
                <div className="md:col-span-2 space-y-2">
                  <Label htmlFor="accountHolderName">Account Holder Name *</Label>
                  <Input
                    id="accountHolderName"
                    value={bankDetails.accountHolderName}
                    onChange={(e) => setBankDetails({...bankDetails, accountHolderName: e.target.value})}
                    placeholder="As per bank records"
                  />
                </div>
              </div>
              
              <Button onClick={handleSaveBankDetails} className="w-full sm:w-auto">
                <Save className="h-4 w-4 mr-2" />
                Save Bank Details
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="branding">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileImage className="h-5 w-5" />
                Business Branding
              </CardTitle>
              <CardDescription>
                Upload your business logo and signature files for professional invoices
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-6">
                <div className="space-y-2">
                  <Label>Business Logo</Label>
                  <div className="flex items-start gap-6">
                    <div className="w-32 h-24 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center bg-gray-50">
                      {businessAssets.logoBase64 ? (
                        <img 
                          src={`data:image/png;base64,${businessAssets.logoBase64}`}
                          alt="Logo preview" 
                          className="w-full h-full object-contain rounded-lg" 
                        />
                      ) : (
                        <FileImage className="h-8 w-8 text-gray-400" />
                      )}
                    </div>
                    <div className="flex-1 space-y-3">
                      <div>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => logoInputRef.current?.click()}
                          className="w-full sm:w-auto"
                        >
                          <Upload className="h-4 w-4 mr-2" />
                          Upload Logo
                        </Button>
                        <input
                          ref={logoInputRef}
                          type="file"
                          accept="image/*"
                          onChange={handleLogoUpload}
                          className="hidden"
                        />
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Recommended: PNG or JPG format, max 5MB. Optimal size: 200x80 pixels.
                      </p>
                      {businessAssets.logoBase64 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setBusinessAssets(prev => ({ ...prev, logoBase64: '' }))}
                          className="text-red-600 hover:text-red-800"
                        >
                          Remove Logo
                        </Button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Digital Signature</Label>
                  <div className="flex items-start gap-6">
                    <div className="w-32 h-24 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center bg-gray-50">
                      {businessAssets.signatureBase64 ? (
                        <img 
                          src={`data:image/png;base64,${businessAssets.signatureBase64}`}
                          alt="Signature preview" 
                          className="w-full h-full object-contain rounded-lg" 
                        />
                      ) : (
                        <FileImage className="h-8 w-8 text-gray-400" />
                      )}
                    </div>
                    <div className="flex-1 space-y-3">
                      <div>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => signatureInputRef.current?.click()}
                          className="w-full sm:w-auto"
                        >
                          <Upload className="h-4 w-4 mr-2" />
                          Upload Signature
                        </Button>
                        <input
                          ref={signatureInputRef}
                          type="file"
                          accept="image/*"
                          onChange={handleSignatureUpload}
                          className="hidden"
                        />
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Recommended: PNG with transparent background, max 5MB. Optimal size: 150x60 pixels.
                      </p>
                      {businessAssets.signatureBase64 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setBusinessAssets(prev => ({ ...prev, signatureBase64: '' }))}
                          className="text-red-600 hover:text-red-800"
                        >
                          Remove Signature
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              
              <Button onClick={handleSaveBusinessAssets} className="w-full sm:w-auto">
                <Save className="h-4 w-4 mr-2" />
                Save Branding Assets
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Settings;
