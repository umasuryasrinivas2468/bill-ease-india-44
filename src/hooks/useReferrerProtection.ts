import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

interface PlanInfo {
  planType: 'starter' | 'growth' | 'scale';
  price: string;
}

const PLAN_INFO: Record<string, PlanInfo> = {
  'starter': {
    planType: 'starter',
    price: '₹599'
  },
  'growth': {
    planType: 'growth',
    price: '₹1,799'
  },
  'scale': {
    planType: 'scale',
    price: '₹2,799'
  }
};

// Razorpay domains that are allowed to redirect to these pages
const ALLOWED_RAZORPAY_DOMAINS = [
  'razorpay.com',
  'dashboard.razorpay.com',
  'payments.razorpay.com',
  'www.razorpay.com',
  'api.razorpay.com'
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

      // Check if the referrer is from any Razorpay domain
      const isFromRazorpay = ALLOWED_RAZORPAY_DOMAINS.some(domain => {
        try {
          const referrerUrl = new URL(effectiveReferrer);
          return referrerUrl.hostname === domain || referrerUrl.hostname.endsWith('.' + domain);
        } catch (error) {
          // If referrer is not a valid URL, check if it contains the domain
          return effectiveReferrer.includes(domain);
        }
      });

      if (isFromRazorpay && effectiveReferrer.trim() !== '') {
        const planInfo = PLAN_INFO[expectedPlanType];
        setIsAuthorized(true);
        setPaymentInfo({
          price: planInfo.price,
          referrer: effectiveReferrer
        });
        console.log('Access authorized from Razorpay:', effectiveReferrer);
      } else {
        console.log('Access denied. Not from Razorpay domain or empty referrer.');
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
    // Simulate different Razorpay pages for testing
    const mockRazorpayUrls = {
      starter: 'https://dashboard.razorpay.com/app/payments',
      growth: 'https://razorpay.com/payment-gateway/',
      scale: 'https://dashboard.razorpay.com/app/subscriptions'
    };
    
    const mockUrl = mockRazorpayUrls[planType];
    sessionStorage.setItem('dev_referrer', mockUrl);
    window.location.reload();
  };

  return {
    isAuthorized,
    isLoading,
    paymentInfo,
    simulateRazorpayReferrer
  };
};