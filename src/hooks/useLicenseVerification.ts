import { useState, useEffect } from 'react';
import { useUser } from '@clerk/clerk-react';

export const useLicenseVerification = () => {
  const { user, isSignedIn } = useUser();
  const [showLicenseModal, setShowLicenseModal] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [hasCheckedUser, setHasCheckedUser] = useState(false);

  useEffect(() => {
    // Only check once when user first signs in
    if (isSignedIn && user && !hasCheckedUser) {
      const userId = user.id;
      const sessionKey = `license_verified_${userId}`;
      
      // Check if license verification already happened in this session
      const alreadyVerified = sessionStorage.getItem(sessionKey);
      
      if (!alreadyVerified) {
        // Check if this is a new user (just signed up) or existing user (just signed in)
        const isNewUser = checkIfNewUser(user);
        
        // Show license verification modal
        setIsSignUp(isNewUser);
        setShowLicenseModal(true);
      }
      
      setHasCheckedUser(true);
    }
  }, [isSignedIn, user, hasCheckedUser]);

  const checkIfNewUser = (user: any): boolean => {
    // You can implement logic to check if user is new
    // For now, we'll check if the user was created recently (within last 5 minutes)
    const userCreatedAt = new Date(user.createdAt);
    const now = new Date();
    const timeDiff = now.getTime() - userCreatedAt.getTime();
    const fiveMinutes = 5 * 60 * 1000; // 5 minutes in milliseconds
    
    return timeDiff < fiveMinutes;
  };

  const handleLicenseVerification = (isNewUser: boolean, onNavigate: (path: string) => void) => {
    const userId = user?.id;
    if (userId) {
      // Mark this user as verified in this session
      sessionStorage.setItem(`license_verified_${userId}`, 'true');
    }
    
    setShowLicenseModal(false);
    
    if (isNewUser) {
      // New user - redirect to onboarding
      onNavigate('/onboarding');
    } else {
      // Existing user - redirect to dashboard
      onNavigate('/dashboard');
    }
  };

  const closeLicenseModal = (onNavigate: (path: string) => void) => {
    const userId = user?.id;
    if (userId) {
      // Mark this user as verified (even if they closed without verifying)
      sessionStorage.setItem(`license_verified_${userId}`, 'true');
    }
    
    setShowLicenseModal(false);
    // Optionally redirect to home or sign out
    onNavigate('/');
  };

  return {
    showLicenseModal,
    isSignUp,
    userEmail: user?.emailAddresses?.[0]?.emailAddress || '',
    handleLicenseVerification,
    closeLicenseModal
  };
};