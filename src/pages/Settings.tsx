
import React, { useState, useEffect, useRef } from 'react';
import { useUser } from '@clerk/clerk-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Save, Building, CreditCard, FileImage, Upload, Link, Globe, Loader2 } from 'lucide-react';
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

  const [logoUrl, setLogoUrl] = useState('');
  const [signatureUrl, setSignatureUrl] = useState('');
  const [isLoadingLogo, setIsLoadingLogo] = useState(false);
  const [isLoadingSignature, setIsLoadingSignature] = useState(false);

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
          // Create image to compress it
          const img = new Image();
          img.onload = () => {
            try {
              const compressedBase64 = compressImage(img, 400, 300, 0.8);
              resolve(compressedBase64);
            } catch (error) {
              // Fallback to original if compression fails
              const base64 = (reader.result as string).split(',')[1];
              resolve(base64);
            }
          };
          img.onerror = () => {
            // Fallback to original if image load fails
            const base64 = (reader.result as string).split(',')[1];
            resolve(base64);
          };
          img.src = reader.result as string;
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

  const compressImage = (img: HTMLImageElement, maxWidth: number = 400, maxHeight: number = 300, quality: number = 0.8): string => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      throw new Error('Unable to create canvas context');
    }
    
    // Calculate new dimensions while maintaining aspect ratio
    let { width, height } = img;
    
    if (width > maxWidth || height > maxHeight) {
      const ratio = Math.min(maxWidth / width, maxHeight / height);
      width = Math.floor(width * ratio);
      height = Math.floor(height * ratio);
    }
    
    canvas.width = width;
    canvas.height = height;
    
    // Draw and compress
    ctx.drawImage(img, 0, 0, width, height);
    return canvas.toDataURL('image/jpeg', quality).split(',')[1];
  };

  const convertImageUrlToBase64 = async (imageUrl: string): Promise<string> => {
    return new Promise(async (resolve, reject) => {
      // First try to validate if it's a proper image URL
      if (!imageUrl.match(/\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?.*)?$/i)) {
        reject(new Error('URL does not appear to be an image file. Please use a direct link to an image file.'));
        return;
      }

      // Method 1: Try fetch first (works better with CORS-enabled URLs)
      try {
        console.log('Attempting to fetch image from URL:', imageUrl);
        const response = await fetch(imageUrl, {
          mode: 'cors',
          headers: {
            'Accept': 'image/*',
          },
        });
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const blob = await response.blob();
        const reader = new FileReader();
        
        reader.onload = () => {
          const result = reader.result as string;
          
          // Create image to compress it
          const img = new Image();
          img.onload = () => {
            try {
              const compressedBase64 = compressImage(img, 400, 300, 0.8);
              resolve(compressedBase64);
            } catch (error) {
              const base64 = result.split(',')[1];
              resolve(base64);
            }
          };
          img.onerror = () => {
            const base64 = result.split(',')[1];
            resolve(base64);
          };
          img.src = result;
        };
        
        reader.onerror = () => {
          reject(new Error('Failed to convert blob to base64'));
        };
        
        reader.readAsDataURL(blob);
        return;
        
      } catch (fetchError) {
        console.log('Fetch method failed, trying Image element approach:', fetchError);
      }

      // Method 2: Fallback to Image element approach
      const img = new Image();
      
      img.onload = () => {
        try {
          const compressedBase64 = compressImage(img, 400, 300, 0.8);
          resolve(compressedBase64);
        } catch (error) {
          reject(new Error('Failed to convert image to base64. This might be due to CORS restrictions.'));
        }
      };
      
      img.onerror = () => {
        // Method 3: Try without CORS
        const imgNoCors = new Image();
        imgNoCors.onload = () => {
          try {
            const compressedBase64 = compressImage(imgNoCors, 400, 300, 0.8);
            resolve(compressedBase64);
          } catch (error) {
            reject(new Error('Image loaded but could not be processed due to security restrictions. Try using a different image hosting service or upload the file directly.'));
          }
        };
        
        imgNoCors.onerror = () => {
          reject(new Error('Failed to load image from URL. Please check if the URL is accessible and points to a valid image file.'));
        };
        
        imgNoCors.src = imageUrl;
      };
      
      // Try with crossOrigin first
      img.crossOrigin = 'anonymous';
      img.src = imageUrl;
    });
  };

  const handleLogoUrlUpload = async () => {
    if (!logoUrl.trim()) {
      toast({
        title: "Invalid URL",
        description: "Please enter a valid image URL.",
        variant: "destructive",
      });
      return;
    }

    setIsLoadingLogo(true);
    try {
      const base64 = await convertImageUrlToBase64(logoUrl);
      setBusinessAssets(prev => ({ ...prev, logoBase64: base64 }));
      setLogoUrl(''); // Clear the URL input after successful upload
      toast({
        title: "Logo Loaded Successfully",
        description: "Logo has been loaded from URL successfully. Click 'Save Branding Assets' to save it.",
      });
    } catch (error: any) {
      console.error('Logo URL upload error:', error);
      toast({
        title: "Upload Failed",
        description: error.message || "Failed to load image from URL. Please check the URL and try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoadingLogo(false);
    }
  };

  const handleSignatureUrlUpload = async () => {
    if (!signatureUrl.trim()) {
      toast({
        title: "Invalid URL",
        description: "Please enter a valid image URL.",
        variant: "destructive",
      });
      return;
    }

    setIsLoadingSignature(true);
    try {
      const base64 = await convertImageUrlToBase64(signatureUrl);
      setBusinessAssets(prev => ({ ...prev, signatureBase64: base64 }));
      setSignatureUrl(''); // Clear the URL input after successful upload
      toast({
        title: "Signature Loaded Successfully",
        description: "Signature has been loaded from URL successfully. Click 'Save Branding Assets' to save it.",
      });
    } catch (error: any) {
      console.error('Signature URL upload error:', error);
      toast({
        title: "Upload Failed",
        description: error.message || "Failed to load image from URL. Please check the URL and try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoadingSignature(false);
    }
  };

  const handleSaveBusinessAssets = async () => {
    if (!user) {
      toast({
        title: "Error",
        description: "User not authenticated. Please refresh and try again.",
        variant: "destructive",
      });
      return;
    }

    try {
      // Convert base64 back to URLs for storing
      const logoUrlValue = businessAssets.logoBase64 ? `data:image/png;base64,${businessAssets.logoBase64}` : logoUrl;
      const signatureUrlValue = businessAssets.signatureBase64 ? `data:image/png;base64,${businessAssets.signatureBase64}` : signatureUrl;

      await user.update({
        unsafeMetadata: {
          ...user.unsafeMetadata,
          logoBase64: businessAssets.logoBase64,
          signatureBase64: businessAssets.signatureBase64,
          logoUrl: logoUrlValue,
          signatureUrl: signatureUrlValue,
        }
      });
      
      toast({
        title: "Business Assets Updated",
        description: "Your logo and signature have been saved successfully.",
      });
    } catch (error: any) {
      console.error('Error saving business assets:', error);
      
      let errorMessage = "Failed to save business assets. Please try again.";
      
      if (error?.message?.includes('metadata')) {
        errorMessage = "Image data is too large. Please use smaller images.";
      } else if (error?.message?.includes('network')) {
        errorMessage = "Network error. Please check your connection and try again.";
      }
      
      toast({
        title: "Save Failed",
        description: errorMessage,
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
                    <div className="flex-1 space-y-4">
                      <div className="space-y-3">
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">Upload from URL:</Label>
                          <div className="flex gap-2">
                            <Input
                              value={logoUrl}
                              onChange={(e) => setLogoUrl(e.target.value)}
                              placeholder="https://example.com/logo.png"
                              className="flex-1"
                            />
                            <Button
                              type="button"
                              variant="outline"
                              onClick={handleLogoUrlUpload}
                              disabled={!logoUrl.trim() || isLoadingLogo}
                            >
                              {isLoadingLogo ? (
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              ) : (
                                <Globe className="h-4 w-4 mr-2" />
                              )}
                              {isLoadingLogo ? 'Loading...' : 'Load'}
                            </Button>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            💡 <strong>Tip:</strong> For best results, use direct image links (ending in .jpg, .png, etc.) from services like GitHub, Imgur, or your own website. 
                            If you get CORS errors, try uploading the image to a public cloud storage service first.
                          </p>
                        </div>
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
                    <div className="flex-1 space-y-4">
                      <div className="space-y-3">
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">Upload from URL:</Label>
                          <div className="flex gap-2">
                            <Input
                              value={signatureUrl}
                              onChange={(e) => setSignatureUrl(e.target.value)}
                              placeholder="https://example.com/signature.png"
                              className="flex-1"
                            />
                            <Button
                              type="button"
                              variant="outline"
                              onClick={handleSignatureUrlUpload}
                              disabled={!signatureUrl.trim() || isLoadingSignature}
                            >
                              {isLoadingSignature ? (
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              ) : (
                                <Globe className="h-4 w-4 mr-2" />
                              )}
                              {isLoadingSignature ? 'Loading...' : 'Load'}
                            </Button>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            💡 <strong>Tip:</strong> For best results, use direct image links (ending in .jpg, .png, etc.) from services like GitHub, Imgur, or your own website. 
                            If you get CORS errors, try uploading the image to a public cloud storage service first.
                          </p>
                        </div>
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
