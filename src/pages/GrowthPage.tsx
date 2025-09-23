import React from 'react';
import LicenseGenerator from '@/components/LicenseGenerator';
import { ProtectedLicensePage } from '@/components/ProtectedLicensePage';

const GrowthPage: React.FC = () => {
  return (
    <ProtectedLicensePage planType="growth">
      <LicenseGenerator
        planType="growth"
        planTitle="Growth"
        keyLength={16}
      />
    </ProtectedLicensePage>
  );
};

export default GrowthPage;