
import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { FileImage, Upload } from 'lucide-react';

interface BrandingStepProps {
  logoFile: File | null;
  signatureFile: File | null;
  onLogoUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onSignatureUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onComplete: () => void;
  isCompleting: boolean;
}

export const BrandingStep: React.FC<BrandingStepProps> = ({
  logoFile,
  signatureFile,
  onLogoUpload,
  onSignatureUpload,
  onComplete,
  isCompleting,
}) => {
  return (
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
                  onChange={onLogoUpload}
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
                  PNG, JPG up to 10MB. Recommended: 200x200px (Required)
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
                  onChange={onSignatureUpload}
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
                  PNG, JPG up to 5MB. Transparent background recommended (Required)
                </p>
              </div>
            </div>
          </div>
        </div>
        
        <Button 
          onClick={onComplete} 
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
  );
};
