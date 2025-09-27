import React, { useState, useEffect } from 'react';
import { useUserPlan } from '@/hooks/useUserPlan';
import LicenseExpiryPopup from './LicenseExpiryPopup';

export default function LicenseExpiryManager() {
  const { userLicense, isExpired, isExpiringSoon, isLoading } = useUserPlan();
  const [showPopup, setShowPopup] = useState(false);
  const [hasShownPopup, setHasShownPopup] = useState(false);

  useEffect(() => {
    // Don't show popup while loading
    if (isLoading) return;

    // Show popup on expiry day and keep showing until license is renewed
    if (isExpiringSoon && userLicense) {
      setShowPopup(true);
    } else {
      setShowPopup(false);
    }
  }, [isExpiringSoon, userLicense, isLoading]);

  // Don't render anything if not needed
  if (!showPopup || !userLicense) {
    return null;
  }

  return (
    <LicenseExpiryPopup
      isOpen={showPopup}
      onClose={() => {}} // Empty function - no closing allowed
      userLicense={userLicense}
      isExpired={isExpired}
      isExpiringSoon={isExpiringSoon}
    />
  );
}