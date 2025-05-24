
import React from 'react';
import { SidebarTrigger } from '@/components/ui/sidebar';
import UPICollectionForm from '@/components/UPICollectionForm';
import UPICollectionHistory from '@/components/UPICollectionHistory';

const UPICollections = () => {
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <UPICollectionForm />
        <div className="lg:col-span-2">
          <UPICollectionHistory />
        </div>
      </div>
    </div>
  );
};

export default UPICollections;
