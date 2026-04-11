import { useState, useEffect } from 'react';

export interface Payment {
  id: string;
  amount: number;
  description: string;
  vendorName: string;
  vendorEmail: string;
  status: 'paid' | 'pending' | 'expired';
  createdAt: string;
  paidAt?: string;
  expiredAt?: string;
  paymentMethod?: string;
  razorpayLink: string;
}

export const usePayments = () => {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshPayments = async () => {
    setIsLoading(true);
    try {
      // Mock implementation
      setPayments([]);
      setError(null);
    } catch (err) {
      setError('Failed to load payments');
    } finally {
      setIsLoading(false);
    }
  };

  const totalAmount = payments.reduce((sum, payment) => sum + payment.amount, 0);
  const paidAmount = payments.filter(p => p.status === 'paid').reduce((sum, payment) => sum + payment.amount, 0);
  const pendingAmount = payments.filter(p => p.status === 'pending').reduce((sum, payment) => sum + payment.amount, 0);
  const expiredAmount = payments.filter(p => p.status === 'expired').reduce((sum, payment) => sum + payment.amount, 0);

  return {
    payments,
    isLoading,
    error,
    refreshPayments,
    totalAmount,
    paidAmount,
    pendingAmount,
    expiredAmount
  };
};