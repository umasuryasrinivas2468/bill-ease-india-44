import React from 'react';
import AppLayout from '@/components/AppLayout';
import ITR6Form from '@/components/ITR6Form';

export default function ITR6Filing() {
  return (
    <AppLayout>
      <div className="container mx-auto py-6 px-4 max-w-6xl">
        <ITR6Form />
      </div>
    </AppLayout>
  );
}
