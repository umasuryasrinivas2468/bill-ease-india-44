import React from 'react';
import LicenseGenerator from '@/components/LicenseGenerator';
import { ProtectedLicensePage } from '@/components/ProtectedLicensePage';

const StarterPage: React.FC = () => {
  return (
    <ProtectedLicensePage planType="starter">
      <LicenseGenerator
        planType="starter"
        planTitle="Starter"
        keyLength={12}
      />
    </ProtectedLicensePage>
  );
};

export default StarterPage;