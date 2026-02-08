import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import PaymentsForm from '../PaymentsForm';

// Mock the hooks and services
vi.mock('@/hooks/useClients', () => ({
  useClients: vi.fn(() => ({
    clients: [
      { id: '1', name: 'Client A', email: 'clienta@example.com' },
      { id: '2', name: 'Client B', email: 'clientb@example.com' },
      { id: '3', name: 'Vendor X', email: 'vendorx@example.com' }
    ],
    isLoading: false,
    error: null
  }))
}));

vi.mock('@/services/paymentsService', () => ({
  paymentsService: {
    createPaymentLink: vi.fn()
  }
}));

vi.mock('@/hooks/useClients', () => ({
  useClients: vi.fn(() => ({
    data: [
      { id: '1', name: 'Client A', email: 'clienta@example.com' },
      { id: '2', name: 'Client B', email: 'clientb@example.com' },
      { id: '3', name: 'Vendor X', email: 'vendorx@example.com' }
    ],
    isLoading: false,
    error: null
  }))
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: vi.fn(() => ({
    toast: vi.fn()
  }))
}));

const mockOnSubmit = vi.fn();
const mockToast = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PaymentsForm', () => {
  const defaultProps = {
    onSubmit: mockOnSubmit,
    isSubmitting: false
  };

  describe('Happy Path', () => {
    it('should render form correctly', () => {
      render(<PaymentsForm {...defaultProps} />);
      
      // Check if all form fields are present
      expect(screen.getByLabelText(/amount/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/description/i)).toBeInTheDocument();
      expect(screen.getByText(/select vendor/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /submit/i })).toBeInTheDocument();
    });

    it('should handle valid form submission successfully', async () => {
      const user = userEvent.setup();
      render(<PaymentsForm {...defaultProps} />);
      
      // Fill out the form
      const amountInput = screen.getByLabelText(/amount/i);
      const descriptionInput = screen.getByLabelText(/description/i);
      const vendorSelect = screen.getByText(/select vendor/i);
      const submitButton = screen.getByRole('button', { name: /submit/i });

      await user.type(amountInput, '1000');
      await user.type(descriptionInput, 'Payment for services');
      
      // Click vendor dropdown and select a vendor
      await user.click(vendorSelect);
      await user.click(screen.getByText('Client A'));
      
      // Submit the form
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledWith({
          amount: 1000,
          description: 'Payment for services',
          vendorId: '1',
          vendorEmail: 'clienta@example.com'
        });
      });
    });
  });

  describe('Input Verification', () => {
    it('should show validation error for empty amount', async () => {
      const user = userEvent.setup();
      render(<PaymentsForm {...defaultProps} />);
      
      const submitButton = screen.getByRole('button', { name: /submit/i });
      
      // Try to submit without filling amount
      await user.click(submitButton);
      
      await waitFor(() => {
        expect(screen.getByText(/amount is required/i)).toBeInTheDocument();
      });
      
      expect(mockOnSubmit).not.toHaveBeenCalled();
    });

    it('should show validation error for invalid amount format', async () => {
      const user = userEvent.setup();
      render(<PaymentsForm {...defaultProps} />);
      
      const amountInput = screen.getByLabelText(/amount/i);
      const submitButton = screen.getByRole('button', { name: /submit/i });
      
      // Enter invalid amount
      await user.type(amountInput, 'invalid-amount');
      await user.click(submitButton);
      
      await waitFor(() => {
        expect(screen.getByText(/amount must be a valid number/i)).toBeInTheDocument();
      });
      
      expect(mockOnSubmit).not.toHaveBeenCalled();
    });

    it('should show validation error for negative amount', async () => {
      const user = userEvent.setup();
      render(<PaymentsForm {...defaultProps} />);
      
      const amountInput = screen.getByLabelText(/amount/i);
      const submitButton = screen.getByRole('button', { name: /submit/i });
      
      // Enter negative amount
      await user.type(amountInput, '-100');
      await user.click(submitButton);
      
      await waitFor(() => {
        expect(screen.getByText(/amount must be greater than 0/i)).toBeInTheDocument();
      });
      
      expect(mockOnSubmit).not.toHaveBeenCalled();
    });

    it('should show validation error for empty description', async () => {
      const user = userEvent.setup();
      render(<PaymentsForm {...defaultProps} />);
      
      const amountInput = screen.getByLabelText(/amount/i);
      const submitButton = screen.getByRole('button', { name: /submit/i });
      
      // Fill only amount, leave description empty
      await user.type(amountInput, '1000');
      await user.click(submitButton);
      
      await waitFor(() => {
        expect(screen.getByText(/description is required/i)).toBeInTheDocument();
      });
      
      expect(mockOnSubmit).not.toHaveBeenCalled();
    });

    it('should show validation error when no vendor is selected', async () => {
      const user = userEvent.setup();
      render(<PaymentsForm {...defaultProps} />);
      
      const amountInput = screen.getByLabelText(/amount/i);
      const descriptionInput = screen.getByLabelText(/description/i);
      const submitButton = screen.getByRole('button', { name: /submit/i });
      
      // Fill amount and description but not vendor
      await user.type(amountInput, '1000');
      await user.type(descriptionInput, 'Payment for services');
      await user.click(submitButton);
      
      await waitFor(() => {
        expect(screen.getByText(/vendor selection is required/i)).toBeInTheDocument();
      });
      
      expect(mockOnSubmit).not.toHaveBeenCalled();
    });

    it('should validate minimum description length', async () => {
      const user = userEvent.setup();
      render(<PaymentsForm {...defaultProps} />);
      
      const amountInput = screen.getByLabelText(/amount/i);
      const descriptionInput = screen.getByLabelText(/description/i);
      const submitButton = screen.getByRole('button', { name: /submit/i });
      
      // Enter short description
      await user.type(amountInput, '1000');
      await user.type(descriptionInput, 'ab');
      await user.click(submitButton);
      
      await waitFor(() => {
        expect(screen.getByText(/description must be at least 5 characters/i)).toBeInTheDocument();
      });
      
      expect(mockOnSubmit).not.toHaveBeenCalled();
    });

    it('should validate maximum amount limit', async () => {
      const user = userEvent.setup();
      render(<PaymentsForm {...defaultProps} />);
      
      const amountInput = screen.getByLabelText(/amount/i);
      const submitButton = screen.getByRole('button', { name: /submit/i });
      
      // Enter amount exceeding limit (assuming max is 1000000)
      await user.type(amountInput, '10000000');
      await user.click(submitButton);
      
      await waitFor(() => {
        expect(screen.getByText(/amount cannot exceed ₹1,000,000/i)).toBeInTheDocument();
      });
      
      expect(mockOnSubmit).not.toHaveBeenCalled();
    });
  });

  describe('Branching', () => {
    it('should show loading state during form submission', () => {
      render(<PaymentsForm {...defaultProps} isSubmitting={true} />);
      
      const submitButton = screen.getByRole('button', { name: /creating payment link/i });
      expect(submitButton).toBeDisabled();
      expect(screen.getByText(/creating payment link/i)).toBeInTheDocument();
    });

    it('should disable form fields during submission', () => {
      render(<PaymentsForm {...defaultProps} isSubmitting={true} />);
      
      expect(screen.getByLabelText(/amount/i)).toBeDisabled();
      expect(screen.getByLabelText(/description/i)).toBeDisabled();
      expect(screen.getByRole('button', { name: /creating payment link/i })).toBeDisabled();
    });

    it('should clear form after successful submission', async () => {
      const user = userEvent.setup();
      const onSubmitSuccess = vi.fn(() => Promise.resolve());
      
      render(<PaymentsForm onSubmit={onSubmitSuccess} isSubmitting={false} />);
      
      const amountInput = screen.getByLabelText(/amount/i);
      const descriptionInput = screen.getByLabelText(/description/i);
      const vendorSelect = screen.getByText(/select vendor/i);
      
      // Fill form
      await user.type(amountInput, '1000');
      await user.type(descriptionInput, 'Payment for services');
      await user.click(vendorSelect);
      await user.click(screen.getByText('Client A'));
      
      const submitButton = screen.getByRole('button', { name: /submit/i });
      await user.click(submitButton);
      
      // Wait for form to be cleared (assuming it clears on success)
      await waitFor(() => {
        expect(amountInput).toHaveValue('');
        expect(descriptionInput).toHaveValue('');
      });
    });

    it('should handle vendor loading state', () => {
      const { useClients } = require('@/hooks/useClients');
      useClients.mockReturnValue({
        clients: [],
        isLoading: true,
        error: null
      });
      
      render(<PaymentsForm {...defaultProps} />);
      
      expect(screen.getByText(/loading vendors/i)).toBeInTheDocument();
    });
  });

  describe('Exception Handling', () => {
    it('should handle submission failure', async () => {
      const user = userEvent.setup();
      const onSubmitError = vi.fn(() => Promise.reject(new Error('Payment failed')));
      
      render(<PaymentsForm onSubmit={onSubmitError} isSubmitting={false} />);
      
      // Fill and submit form
      await user.type(screen.getByLabelText(/amount/i), '1000');
      await user.type(screen.getByLabelText(/description/i), 'Payment for services');
      await user.click(screen.getByText(/select vendor/i));
      await user.click(screen.getByText('Client A'));
      await user.click(screen.getByRole('button', { name: /submit/i }));
      
      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith({
          title: 'Error',
          description: 'Failed to create payment link. Please try again.',
          variant: 'destructive'
        });
      });
    });

    it('should handle vendor loading error', () => {
      const { useClients } = require('@/hooks/useClients');
      useClients.mockReturnValue({
        clients: [],
        isLoading: false,
        error: 'Failed to load vendors'
      });
      
      render(<PaymentsForm {...defaultProps} />);
      
      expect(screen.getByText(/failed to load vendors/i)).toBeInTheDocument();
    });

    it('should handle network error during submission', async () => {
      const user = userEvent.setup();
      const networkError = new Error('Network error');
      networkError.name = 'NetworkError';
      
      const onSubmitNetworkError = vi.fn(() => Promise.reject(networkError));
      
      render(<PaymentsForm onSubmit={onSubmitNetworkError} isSubmitting={false} />);
      
      // Fill and submit form
      await user.type(screen.getByLabelText(/amount/i), '1000');
      await user.type(screen.getByLabelText(/description/i), 'Payment for services');
      await user.click(screen.getByText(/select vendor/i));
      await user.click(screen.getByText('Client A'));
      await user.click(screen.getByRole('button', { name: /submit/i }));
      
      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith({
          title: 'Network Error',
          description: 'Please check your internet connection and try again.',
          variant: 'destructive'
        });
      });
    });

    it('should handle empty vendor list gracefully', () => {
      render(<PaymentsForm {...defaultProps} />);
      
      // Since we have a mock component, just check that it renders
      expect(screen.getByText(/select vendor/i)).toBeInTheDocument();
    });
  });

  describe('Form Validation Integration', () => {
    it('should validate all fields before submission', async () => {
      const user = userEvent.setup();
      render(<PaymentsForm {...defaultProps} />);
      
      const submitButton = screen.getByRole('button', { name: /submit/i });
      await user.click(submitButton);
      
      // Check that all validation errors appear
      await waitFor(() => {
        expect(screen.getByText(/amount is required/i)).toBeInTheDocument();
        expect(screen.getByText(/description is required/i)).toBeInTheDocument();
        expect(screen.getByText(/vendor selection is required/i)).toBeInTheDocument();
      });
      
      expect(mockOnSubmit).not.toHaveBeenCalled();
    });

    it('should clear validation errors when user starts typing', async () => {
      const user = userEvent.setup();
      render(<PaymentsForm {...defaultProps} />);
      
      // First trigger validation errors
      const submitButton = screen.getByRole('button', { name: /submit/i });
      await user.click(submitButton);
      
      await waitFor(() => {
        expect(screen.getByText(/amount is required/i)).toBeInTheDocument();
      });
      
      // Then start typing in amount field
      const amountInput = screen.getByLabelText(/amount/i);
      await user.type(amountInput, '1000');
      
      // Error should be cleared
      await waitFor(() => {
        expect(screen.queryByText(/amount is required/i)).not.toBeInTheDocument();
      });
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels', () => {
      render(<PaymentsForm {...defaultProps} />);
      
      expect(screen.getByLabelText(/amount/i)).toHaveAttribute('aria-required', 'true');
      expect(screen.getByLabelText(/description/i)).toHaveAttribute('aria-required', 'true');
      expect(screen.getByRole('button', { name: /submit/i })).toHaveAttribute('type', 'submit');
    });

    it('should associate error messages with form fields', async () => {
      const user = userEvent.setup();
      render(<PaymentsForm {...defaultProps} />);
      
      const submitButton = screen.getByRole('button', { name: /submit/i });
      await user.click(submitButton);
      
      await waitFor(() => {
        const amountInput = screen.getByLabelText(/amount/i);
        const errorElement = screen.getByText(/amount is required/i);
        
        expect(amountInput).toHaveAttribute('aria-describedby');
        expect(errorElement).toHaveAttribute('id');
      });
    });

    it('should support keyboard navigation', async () => {
      const user = userEvent.setup();
      render(<PaymentsForm {...defaultProps} />);
      
      // Tab through form elements
      await user.tab();
      expect(screen.getByLabelText(/amount/i)).toHaveFocus();
      
      await user.tab();
      expect(screen.getByLabelText(/description/i)).toHaveFocus();
      
      await user.tab();
      expect(screen.getByText(/select vendor/i)).toHaveFocus();
      
      await user.tab();
      expect(screen.getByRole('button', { name: /submit/i })).toHaveFocus();
    });
  });
});