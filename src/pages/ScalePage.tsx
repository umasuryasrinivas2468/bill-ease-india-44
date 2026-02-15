import React from 'react';
import LicenseGenerator from '@/components/LicenseGenerator';
import { ProtectedLicensePage } from '@/components/ProtectedLicensePage';

const ScalePage: React.FC = () => {
  return (
    <ProtectedLicensePage planType="scale">
      <LicenseGenerator
        planType="scale"
        planTitle="Scale"
        keyLength={14}
      />
    </ProtectedLicensePage>
  );
};

export default ScalePage;