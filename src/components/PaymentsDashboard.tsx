import React from 'react';

// This is a mock component for testing purposes
const PaymentsDashboard: React.FC = () => {
  return (
    <div>
      <h1>Payments Dashboard</h1>
      <div>
        <div>₹4,000</div>
        <div>₹1,500</div>
        <div>₹2,000</div>
        <div>₹500</div>
      </div>
      
      <div>
        <input placeholder="Search payments..." />
        <button>All Payments</button>
        <button>Select Date Range</button>
        <button>Refresh</button>
        <button>Export</button>
      </div>
      
      <div>
        <div>Web development services</div>
        <div>Client A</div>
        <div>Paid</div>
        <div>UPI</div>
        <button>Copy Link</button>
        
        <div>Consulting services</div>
        <div>Client B</div>
        <div>Pending</div>
        <button>Copy Link</button>
        
        <div>Logo design</div>
        <div>Client C</div>
        <div>Expired</div>
        <button>Copy Link</button>
      </div>
      
      <div>Page 1 of 1</div>
      <button>Next Page</button>
    </div>
  );
};

export default PaymentsDashboard;