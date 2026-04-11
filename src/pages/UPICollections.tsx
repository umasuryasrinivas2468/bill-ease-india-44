
import React from 'react';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertCircle, Phone } from 'lucide-react';

const UPICollections = () => {
  const handleCallCFO = () => {
    window.open(
      'https://forms.fillout.com/t/4LpuZL29Fgus',
      '_blank',
      'width=800,height=600,scrollbars=yes,resizable=yes'
    );
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center gap-4">
        <SidebarTrigger className="md:hidden" />
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">UPI Collections</h1>
          <p className="text-muted-foreground">
            Send instant payment requests via UPI and track collections
          </p>
        </div>
      </div>

      <Card className="border-orange-200 bg-orange-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-orange-800">
            <AlertCircle className="h-5 w-5" />
            Service Temporarily Unavailable
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-orange-700 mb-4">
            Dear User, Sorry for the inconvenience, this service will not currently operating in your region, 
            will be starting the service from July 9th 2025.
          </p>
          <Button 
            onClick={handleCallCFO}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Phone className="h-4 w-4 mr-2" />
            Call CFO
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default UPICollections;
