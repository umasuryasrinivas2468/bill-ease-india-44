import React from 'react';

interface PaymentsFormProps {
  onSubmit: (data: any) => Promise<void> | void;
  isSubmitting?: boolean;
}

// This is a mock component for testing purposes
const PaymentsForm: React.FC<PaymentsFormProps> = ({ onSubmit, isSubmitting = false }) => {
  return (
    <form>
      <div>
        <label htmlFor="amount">Amount</label>
        <input 
          id="amount" 
          type="number" 
          required
          aria-required="true"
          disabled={isSubmitting}
        />
      </div>
      
      <div>
        <label htmlFor="description">Description</label>
        <textarea 
          id="description" 
          required
          aria-required="true"
          disabled={isSubmitting}
        />
      </div>
      
      <div>
        <button type="button">Select Vendor</button>
      </div>
      
      <button 
        type="submit"
        disabled={isSubmitting}
      >
        {isSubmitting ? 'Creating Payment Link...' : 'Submit'}
      </button>
    </form>
  );
};

export default PaymentsForm;