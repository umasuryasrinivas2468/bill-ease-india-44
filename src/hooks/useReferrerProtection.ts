import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

interface AllowedDomain {
  domain: string;
  name: string;
}

const ALLOWED_DOMAINS: AllowedDomain[] = [
  { domain: 'razorpay.com', name: 'Razorpay' },
  { domain: 'rzp.io', name: 'Razorpay Short URL' },
  { domain: 'www.razorpay.com', name: 'Razorpay WWW' },
  { domain: 'checkout.razorpay.com', name: 'Razorpay Checkout' },
  { domain: 'dashboard.razorpay.com', name: 'Razorpay Dashboard' },
  { domain: 'pages.razorpay.com', name: 'Razorpay Payment Pages' }
];

const PLAN_PRICES = {
  starter: '₹599',
  growth: '₹1,799',
  scale: '₹2,799'
};

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

      // Check if the referrer is from an allowed Razorpay domain
      const isValidReferrer = ALLOWED_DOMAINS.some(domain => 
        effectiveReferrer.includes(domain.domain)
      );

      // For development/testing, also allow localhost
      const isLocalhost = effectiveReferrer.includes('localhost') || effectiveReferrer.includes('127.0.0.1');

      if (isValidReferrer || isLocalhost) {
        setIsAuthorized(true);
        setPaymentInfo({
          price: PLAN_PRICES[expectedPlanType],
          referrer: effectiveReferrer
        });
        console.log('Access authorized from:', effectiveReferrer);
      } else {
        console.log('Access denied. Invalid referrer:', effectiveReferrer);
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

  // Development helper function to simulate coming from Razorpay
  const simulateRazorpayReferrer = (planType: 'starter' | 'growth' | 'scale') => {
    const simulatedReferrer = `https://checkout.razorpay.com/v1/checkout.js?plan=${planType}`;
    sessionStorage.setItem('dev_referrer', simulatedReferrer);
    window.location.reload();
  };

  return {
    isAuthorized,
    isLoading,
    paymentInfo,
    simulateRazorpayReferrer
  };
};