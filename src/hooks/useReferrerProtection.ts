import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

interface AllowedReferrer {
  url: string;
  planType: 'starter' | 'growth' | 'scale';
  price: string;
}

const ALLOWED_REFERRERS: AllowedReferrer[] = [
  {
    url: 'https://payments.cashfree.com/forms/aczenbilz_rate_599',
    planType: 'starter',
    price: '₹599'
  },
  {
    url: 'https://payments.cashfree.com/forms/aczenbilz_rate_1799',
    planType: 'growth',
    price: '₹1,799'
  },
  {
    url: 'https://payments.cashfree.com/forms/aczenbilz_rate_2799',
    planType: 'scale',
    price: '₹2,799'
  }
];

export const useReferrerProtection = (expectedPlanType: 'starter' | 'growth' | 'scale') => {
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [paymentInfo, setPaymentInfo] = useState<{ price: string; referrer: string } | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const checkReferrer = () => {
      // Get the referrer URL
      const referrer = document.referrer;
      
      // For development, also check sessionStorage for manual testing
      const devReferrer = sessionStorage.getItem('dev_referrer');
      const effectiveReferrer = devReferrer || referrer;

      console.log('Checking referrer:', effectiveReferrer);
      console.log('Expected plan type:', expectedPlanType);

      // Check if the referrer is from an allowed Cashfree payment form
      const allowedReferrer = ALLOWED_REFERRERS.find(
        ref => effectiveReferrer.includes(ref.url) && ref.planType === expectedPlanType
      );

      if (allowedReferrer) {
        setIsAuthorized(true);
        setPaymentInfo({
          price: allowedReferrer.price,
          referrer: allowedReferrer.url
        });
        console.log('Access authorized from:', allowedReferrer.url);
      } else {
        console.log('Access denied. Invalid referrer or plan type mismatch.');
        setIsAuthorized(false);
        
        // Redirect to unauthorized page after a short delay
        setTimeout(() => {
          navigate('/unauthorized-access');
        }, 3000);
      }

      setIsLoading(false);
    };

    // Check referrer after component mounts
    checkReferrer();
  }, [expectedPlanType, navigate]);

  // Development helper function to simulate coming from Cashfree
  const simulateCashfreeReferrer = (planType: 'starter' | 'growth' | 'scale') => {
    const referrer = ALLOWED_REFERRERS.find(ref => ref.planType === planType);
    if (referrer) {
      sessionStorage.setItem('dev_referrer', referrer.url);
      window.location.reload();
    }
  };

  return {
    isAuthorized,
    isLoading,
    paymentInfo,
    simulateCashfreeReferrer
  };
};