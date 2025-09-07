import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Palette, Image, FileSignature } from 'lucide-react';
import SimpleBrandingManager from '@/components/SimpleBrandingManager';

const Branding = () => {
  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center gap-4">
        <SidebarTrigger className="md:hidden" />
        <div>
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-3">
            <Palette className="h-8 w-8 text-primary" />
            Business Branding
          </h1>
          <p className="text-muted-foreground">
            Manage your business logo and digital signature for professional documents
          </p>
          <div className="mt-2 text-sm text-muted-foreground bg-blue-50 rounded-lg p-2 inline-block">
            🎨 Enhance your brand presence across all invoices and documents
          </div>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* Info Cards */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Image className="h-5 w-5" />
              Business Logo
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Upload your business logo to appear on invoices, quotations, and other business documents.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <FileSignature className="h-5 w-5" />
              Digital Signature
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Add your digital signature to automatically sign invoices and official documents.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Palette className="h-5 w-5" />
              Brand Consistency
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Maintain consistent branding across all your business communications and documents.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Branding Manager */}
      <SimpleBrandingManager />
    </div>
  );
};

export default Branding;