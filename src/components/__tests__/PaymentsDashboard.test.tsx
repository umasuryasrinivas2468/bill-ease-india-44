import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import PaymentsDashboard from '../PaymentsDashboard';

// Mock hooks and services
vi.mock('@/hooks/usePayments', () => ({
  usePayments: vi.fn()
}));

vi.mock('@/services/paymentsService', () => ({
  paymentsService: {
    getPaymentHistory: vi.fn(),
    getPaymentStatus: vi.fn(),
    refreshPaymentStatus: vi.fn()
  }
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: vi.fn(() => ({
    toast: vi.fn()
  }))
}));

const mockPaymentHistory = [
  {
    id: 'plink_1',
    amount: 1500,
    description: 'Web development services',
    vendorName: 'Client A',
    vendorEmail: 'clienta@example.com',
    status: 'paid',
    createdAt: '2024-01-15T09:00:00.000Z',
    paidAt: '2024-01-15T10:30:00.000Z',
    paymentMethod: 'upi',
    razorpayLink: 'https://razorpay.me/test1'
  },
  {
    id: 'plink_2',
    amount: 2000,
    description: 'Consulting services',
    vendorName: 'Client B',
    vendorEmail: 'clientb@example.com',
    status: 'pending',
    createdAt: '2024-01-16T14:00:00.000Z',
    razorpayLink: 'https://razorpay.me/test2'
  },
  {
    id: 'plink_3',
    amount: 500,
    description: 'Logo design',
    vendorName: 'Client C',
    vendorEmail: 'clientc@example.com',
    status: 'expired',
    createdAt: '2024-01-10T08:00:00.000Z',
    expiredAt: '2024-01-17T08:00:00.000Z',
    razorpayLink: 'https://razorpay.me/test3'
  }
];

describe('PaymentsDashboard', () => {
  const mockToast = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    const { usePayments } = require('@/hooks/usePayments');
    const { useToast } = require('@/hooks/use-toast');
    
    usePayments.mockReturnValue({
      payments: mockPaymentHistory,
      isLoading: false,
      error: null,
      refreshPayments: vi.fn(),
      totalAmount: 4000,
      paidAmount: 1500,
      pendingAmount: 2000,
      expiredAmount: 500
    });

    useToast.mockReturnValue({
      toast: mockToast
    });
  });

  describe('Happy Path', () => {
    it('should render dashboard with payment statistics', () => {
      render(<PaymentsDashboard />);
      
      expect(screen.getByText(/payments dashboard/i)).toBeInTheDocument();
      expect(screen.getByText('₹4,000')).toBeInTheDocument(); // Total amount
      expect(screen.getByText('₹1,500')).toBeInTheDocument(); // Paid amount
      expect(screen.getByText('₹2,000')).toBeInTheDocument(); // Pending amount
      expect(screen.getByText('₹500')).toBeInTheDocument(); // Expired amount
    });

    it('should display all payment entries correctly', () => {
      render(<PaymentsDashboard />);
      
      // Check if all payments are displayed
      expect(screen.getByText('Web development services')).toBeInTheDocument();
      expect(screen.getByText('Consulting services')).toBeInTheDocument();
      expect(screen.getByText('Logo design')).toBeInTheDocument();
      
      // Check vendor names
      expect(screen.getByText('Client A')).toBeInTheDocument();
      expect(screen.getByText('Client B')).toBeInTheDocument();
      expect(screen.getByText('Client C')).toBeInTheDocument();
      
      // Check status badges
      expect(screen.getByText('Paid')).toBeInTheDocument();
      expect(screen.getByText('Pending')).toBeInTheDocument();
      expect(screen.getByText('Expired')).toBeInTheDocument();
    });

    it('should show payment method for paid transactions', () => {
      render(<PaymentsDashboard />);
      
      expect(screen.getByText(/UPI/i)).toBeInTheDocument();
    });
  });

  describe('Input Verification', () => {
    it('should filter payments by status', async () => {
      const user = userEvent.setup();
      render(<PaymentsDashboard />);
      
      // Click on filter dropdown
      const filterButton = screen.getByText(/all payments/i);
      await user.click(filterButton);
      
      // Select "Paid" filter
      await user.click(screen.getByText(/paid only/i));
      
      await waitFor(() => {
        expect(screen.getByText('Web development services')).toBeInTheDocument();
        expect(screen.queryByText('Consulting services')).not.toBeInTheDocument();
        expect(screen.queryByText('Logo design')).not.toBeInTheDocument();
      });
    });

    it('should filter payments by date range', async () => {
      const user = userEvent.setup();
      render(<PaymentsDashboard />);
      
      const dateRangeButton = screen.getByText(/select date range/i);
      await user.click(dateRangeButton);
      
      // Select last 7 days
      await user.click(screen.getByText(/last 7 days/i));
      
      await waitFor(() => {
        // Should only show payments from the last 7 days
        expect(screen.getByText('Web development services')).toBeInTheDocument();
        expect(screen.getByText('Consulting services')).toBeInTheDocument();
        expect(screen.queryByText('Logo design')).not.toBeInTheDocument(); // Too old
      });
    });

    it('should search payments by description or vendor', async () => {
      const user = userEvent.setup();
      render(<PaymentsDashboard />);
      
      const searchInput = screen.getByPlaceholderText(/search payments/i);
      await user.type(searchInput, 'web development');
      
      await waitFor(() => {
        expect(screen.getByText('Web development services')).toBeInTheDocument();
        expect(screen.queryByText('Consulting services')).not.toBeInTheDocument();
        expect(screen.queryByText('Logo design')).not.toBeInTheDocument();
      });
    });
  });

  describe('Branching', () => {
    it('should show loading state while fetching payments', () => {
      const { usePayments } = require('@/hooks/usePayments');
      usePayments.mockReturnValue({
        payments: [],
        isLoading: true,
        error: null,
        refreshPayments: vi.fn(),
        totalAmount: 0,
        paidAmount: 0,
        pendingAmount: 0,
        expiredAmount: 0
      });

      render(<PaymentsDashboard />);
      
      expect(screen.getByText(/loading payments/i)).toBeInTheDocument();
      expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });

    it('should refresh payment status when clicking refresh button', async () => {
      const mockRefreshPayments = vi.fn();
      const { usePayments } = require('@/hooks/usePayments');
      usePayments.mockReturnValue({
        payments: mockPaymentHistory,
        isLoading: false,
        error: null,
        refreshPayments: mockRefreshPayments,
        totalAmount: 4000,
        paidAmount: 1500,
        pendingAmount: 2000,
        expiredAmount: 500
      });

      const user = userEvent.setup();
      render(<PaymentsDashboard />);
      
      const refreshButton = screen.getByRole('button', { name: /refresh/i });
      await user.click(refreshButton);
      
      expect(mockRefreshPayments).toHaveBeenCalled();
    });

    it('should show empty state when no payments exist', () => {
      const { usePayments } = require('@/hooks/usePayments');
      usePayments.mockReturnValue({
        payments: [],
        isLoading: false,
        error: null,
        refreshPayments: vi.fn(),
        totalAmount: 0,
        paidAmount: 0,
        pendingAmount: 0,
        expiredAmount: 0
      });

      render(<PaymentsDashboard />);
      
      expect(screen.getByText(/no payments found/i)).toBeInTheDocument();
      expect(screen.getByText(/create your first payment link/i)).toBeInTheDocument();
    });

    it('should copy payment link to clipboard', async () => {
      const mockClipboard = {
        writeText: vi.fn().mockResolvedValue(undefined)
      };
      
      Object.assign(navigator, {
        clipboard: mockClipboard
      });

      const user = userEvent.setup();
      render(<PaymentsDashboard />);
      
      const copyButton = screen.getAllByText(/copy link/i)[0];
      await user.click(copyButton);
      
      expect(mockClipboard.writeText).toHaveBeenCalledWith('https://razorpay.me/test1');
      expect(mockToast).toHaveBeenCalledWith({
        title: 'Success',
        description: 'Payment link copied to clipboard',
        variant: 'default'
      });
    });
  });

  describe('Exception Handling', () => {
    it('should handle error state while loading payments', () => {
      const { usePayments } = require('@/hooks/usePayments');
      usePayments.mockReturnValue({
        payments: [],
        isLoading: false,
        error: 'Failed to load payments',
        refreshPayments: vi.fn(),
        totalAmount: 0,
        paidAmount: 0,
        pendingAmount: 0,
        expiredAmount: 0
      });

      render(<PaymentsDashboard />);
      
      expect(screen.getByText(/failed to load payments/i)).toBeInTheDocument();
      expect(screen.getByText(/error occurred while fetching/i)).toBeInTheDocument();
    });

    it('should handle clipboard API not being available', async () => {
      // Mock clipboard API not being available
      Object.assign(navigator, {
        clipboard: undefined
      });

      const user = userEvent.setup();
      render(<PaymentsDashboard />);
      
      const copyButton = screen.getAllByText(/copy link/i)[0];
      await user.click(copyButton);
      
      expect(mockToast).toHaveBeenCalledWith({
        title: 'Error',
        description: 'Unable to copy to clipboard. Please copy the link manually.',
        variant: 'destructive'
      });
    });

    it('should handle network error during refresh', async () => {
      const mockRefreshWithError = vi.fn().mockRejectedValue(new Error('Network error'));
      const { usePayments } = require('@/hooks/usePayments');
      usePayments.mockReturnValue({
        payments: mockPaymentHistory,
        isLoading: false,
        error: null,
        refreshPayments: mockRefreshWithError,
        totalAmount: 4000,
        paidAmount: 1500,
        pendingAmount: 2000,
        expiredAmount: 500
      });

      const user = userEvent.setup();
      render(<PaymentsDashboard />);
      
      const refreshButton = screen.getByRole('button', { name: /refresh/i });
      await user.click(refreshButton);
      
      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith({
          title: 'Error',
          description: 'Failed to refresh payments. Please try again.',
          variant: 'destructive'
        });
      });
    });

    it('should handle malformed payment data', () => {
      const malformedPayments = [
        {
          id: 'plink_bad',
          // Missing required fields
          status: 'paid',
          createdAt: '2024-01-15T09:00:00.000Z'
        }
      ];

      const { usePayments } = require('@/hooks/usePayments');
      usePayments.mockReturnValue({
        payments: malformedPayments,
        isLoading: false,
        error: null,
        refreshPayments: vi.fn(),
        totalAmount: 0,
        paidAmount: 0,
        pendingAmount: 0,
        expiredAmount: 0
      });

      render(<PaymentsDashboard />);
      
      // Should render without crashing and show fallback values
      expect(screen.getByText(/payments dashboard/i)).toBeInTheDocument();
    });
  });

  describe('Payment Status Updates', () => {
    it('should update payment status automatically', async () => {
      const mockRefreshPayments = vi.fn();
      const { usePayments } = require('@/hooks/usePayments');
      
      // Initial render with pending payment
      usePayments.mockReturnValue({
        payments: [mockPaymentHistory[1]], // Pending payment
        isLoading: false,
        error: null,
        refreshPayments: mockRefreshPayments,
        totalAmount: 2000,
        paidAmount: 0,
        pendingAmount: 2000,
        expiredAmount: 0
      });

      render(<PaymentsDashboard />);
      
      expect(screen.getByText('Pending')).toBeInTheDocument();
      
      // Wait for auto-refresh (assuming 30-second interval)
      await waitFor(() => {
        expect(mockRefreshPayments).toHaveBeenCalled();
      }, { timeout: 31000 });
    });

    it('should show real-time status updates', async () => {
      const { usePayments } = require('@/hooks/usePayments');
      const { rerender } = render(<PaymentsDashboard />);
      
      expect(screen.getByText('Pending')).toBeInTheDocument();
      
      // Simulate status update
      usePayments.mockReturnValue({
        payments: [
          {
            ...mockPaymentHistory[1],
            status: 'paid',
            paidAt: '2024-01-16T15:30:00.000Z',
            paymentMethod: 'card'
          }
        ],
        isLoading: false,
        error: null,
        refreshPayments: vi.fn(),
        totalAmount: 2000,
        paidAmount: 2000,
        pendingAmount: 0,
        expiredAmount: 0
      });
      
      rerender(<PaymentsDashboard />);
      
      expect(screen.getByText('Paid')).toBeInTheDocument();
      expect(screen.getByText(/card/i)).toBeInTheDocument();
    });
  });

  describe('Export Functionality', () => {
    it('should export payments to CSV', async () => {
      const user = userEvent.setup();
      render(<PaymentsDashboard />);
      
      const exportButton = screen.getByRole('button', { name: /export/i });
      await user.click(exportButton);
      
      // Mock the CSV export functionality
      expect(mockToast).toHaveBeenCalledWith({
        title: 'Success',
        description: 'Payments exported successfully',
        variant: 'default'
      });
    });

    it('should handle export error', async () => {
      // Mock a failed export
      vi.spyOn(console, 'error').mockImplementation(() => {});
      
      const user = userEvent.setup();
      render(<PaymentsDashboard />);
      
      const exportButton = screen.getByRole('button', { name: /export/i });
      
      // Mock an error during export
      vi.spyOn(document, 'createElement').mockImplementation(() => {
        throw new Error('Export failed');
      });
      
      await user.click(exportButton);
      
      expect(mockToast).toHaveBeenCalledWith({
        title: 'Error',
        description: 'Failed to export payments. Please try again.',
        variant: 'destructive'
      });
    });
  });

  describe('Pagination', () => {
    it('should paginate large number of payments', () => {
      const manyPayments = Array.from({ length: 25 }, (_, i) => ({
        ...mockPaymentHistory[0],
        id: `plink_${i + 1}`,
        description: `Payment ${i + 1}`
      }));

      const { usePayments } = require('@/hooks/usePayments');
      usePayments.mockReturnValue({
        payments: manyPayments,
        isLoading: false,
        error: null,
        refreshPayments: vi.fn(),
        totalAmount: 37500,
        paidAmount: 37500,
        pendingAmount: 0,
        expiredAmount: 0
      });

      render(<PaymentsDashboard />);
      
      // Should show pagination controls
      expect(screen.getByText(/page 1 of/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /next page/i })).toBeInTheDocument();
    });

    it('should navigate between pages', async () => {
      const manyPayments = Array.from({ length: 25 }, (_, i) => ({
        ...mockPaymentHistory[0],
        id: `plink_${i + 1}`,
        description: `Payment ${i + 1}`
      }));

      const { usePayments } = require('@/hooks/usePayments');
      usePayments.mockReturnValue({
        payments: manyPayments,
        isLoading: false,
        error: null,
        refreshPayments: vi.fn(),
        totalAmount: 37500,
        paidAmount: 37500,
        pendingAmount: 0,
        expiredAmount: 0
      });

      const user = userEvent.setup();
      render(<PaymentsDashboard />);
      
      const nextButton = screen.getByRole('button', { name: /next page/i });
      await user.click(nextButton);
      
      expect(screen.getByText(/page 2 of/i)).toBeInTheDocument();
    });
  });
});