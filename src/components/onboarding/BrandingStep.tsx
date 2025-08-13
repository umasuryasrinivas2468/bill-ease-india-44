
import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { FileImage, Link } from 'lucide-react';

interface BrandingStepProps {
  logoUrl: string;
  signatureUrl: string;
  onLogoUrlChange: (url: string) => void;
  onSignatureUrlChange: (url: string) => void;
  onComplete: () => void;
  isCompleting: boolean;
}

export const BrandingStep: React.FC<BrandingStepProps> = ({
  logoUrl,
  signatureUrl,
  onLogoUrlChange,
  onSignatureUrlChange,
  onComplete,
  isCompleting,
}) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Business Branding</CardTitle>
        <CardDescription>Provide links to your logo and signature images (Both are mandatory)</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          <div>
            <Label className="text-base font-medium">Business Logo URL *</Label>
            <div className="flex items-center gap-4 mt-2">
              <div className="w-24 h-24 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center">
                {logoUrl ? (
                  <img 
                    src={logoUrl} 
                    alt="Logo preview" 
                    className="w-full h-full object-contain rounded-lg" 
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                      e.currentTarget.parentElement!.innerHTML = '<div class="text-red-500 text-xs">Invalid URL</div>';
                    }}
                  />
                ) : (
                  <FileImage className="h-8 w-8 text-gray-400" />
                )}
              </div>
              <div className="flex-1">
                <Input
                  type="url"
                  placeholder="https://example.com/logo.png"
                  value={logoUrl}
                  onChange={(e) => onLogoUrlChange(e.target.value)}
                  className="mb-2"
                />
                <p className="text-sm text-muted-foreground">
                  <Link className="h-3 w-3 mr-1 inline" />
                  Provide a direct link to your logo image (Required)
                </p>
              </div>
            </div>
          </div>

          <div>
            <Label className="text-base font-medium">Digital Signature URL *</Label>
            <div className="flex items-center gap-4 mt-2">
              <div className="w-24 h-24 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center">
                {signatureUrl ? (
                  <img 
                    src={signatureUrl} 
                    alt="Signature preview" 
                    className="w-full h-full object-contain rounded-lg" 
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                      e.currentTarget.parentElement!.innerHTML = '<div class="text-red-500 text-xs">Invalid URL</div>';
                    }}
                  />
                ) : (
                  <Link className="h-8 w-8 text-gray-400" />
                )}
              </div>
              <div className="flex-1">
                <Input
                  type="url"
                  placeholder="https://example.com/signature.png"
                  value={signatureUrl}
                  onChange={(e) => onSignatureUrlChange(e.target.value)}
                  className="mb-2"
                />
                <p className="text-sm text-muted-foreground">
                  <Link className="h-3 w-3 mr-1 inline" />
                  Provide a direct link to your signature image (Required)
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
