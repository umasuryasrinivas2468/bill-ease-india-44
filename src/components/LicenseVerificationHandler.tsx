import React from 'react';
import { useNavigate } from 'react-router-dom';
import { LicenseVerificationModal } from './LicenseVerificationModal';
import { useLicenseVerification } from '@/hooks/useLicenseVerification';

export const LicenseVerificationHandler: React.FC = () => {
  const navigate = useNavigate();
  const {
    showLicenseModal,
    isSignUp,
    userEmail,
    handleLicenseVerification,
    closeLicenseModal
  } = useLicenseVerification();

  const onVerificationSuccess = (isNewUser: boolean) => {
    handleLicenseVerification(isNewUser, navigate);
  };

  const onClose = () => {
    closeLicenseModal(navigate);
  };

  return (
    <LicenseVerificationModal
      isOpen={showLicenseModal}
      onClose={onClose}
      userEmail={userEmail}
      isSignUp={isSignUp}
      onVerificationSuccess={onVerificationSuccess}
    />
  );
};