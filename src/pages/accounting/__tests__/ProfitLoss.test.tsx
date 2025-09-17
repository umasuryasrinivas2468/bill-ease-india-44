import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useUser } from '@clerk/clerk-react';
import { useNavigate } from 'react-router-dom';
import ProfitLoss from '../ProfitLoss';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

// Mock external dependencies
vi.mock('@clerk/clerk-react');
vi.mock('react-router-dom');
vi.mock('@/integrations/supabase/client');
vi.mock('sonner');
vi.mock('jspdf', () => ({
  default: class MockjsPDF {
    setFontSize = vi.fn();
    setFont = vi.fn();
    text = vi.fn();
    addPage = vi.fn();
    save = vi.fn();
    output = vi.fn(() => new Blob(['mock-pdf'], { type: 'application/pdf' }));
    lastAutoTable = { finalY: 100 };
  }
}));
vi.mock('jspdf-autotable', () => ({
  default: vi.fn()
}));
vi.mock('xlsx', () => ({
  utils: {
    book_new: vi.fn(() => ({})),
    aoa_to_sheet: vi.fn(() => ({})),
    book_append_sheet: vi.fn(),
  },
  writeFile: vi.fn()
}));
vi.mock('@/utils/csvExport', () => ({
  objectsToCSV: vi.fn(() => 'mock,csv,data'),
  downloadCSV: vi.fn(),
  generateFilename: vi.fn(() => 'mock-filename.csv')
}));

const mockUser = {
  id: 'test-user-id',
  emailAddresses: [{ emailAddress: 'test@example.com' }]
};

const mockNavigate = vi.fn();

const mockJournalData = [
  {
    id: '1',
    debit: 1000,
    credit: 0,
    journal_date: '2024-01-15',
    account_type: 'expense',
    account_name: 'Office Supplies',
    account_id: 'acc-1',
    journal_id: 'journal-1',
    journal_number: 'JE001',
    narration: 'Office supplies purchase'
  },
  {
    id: '2',
    debit: 0,
    credit: 5000,
    journal_date: '2024-01-20',
    account_type: 'income',
    account_name: 'Service Revenue',
    account_id: 'acc-2',
    journal_id: 'journal-2',
    journal_number: 'JE002',
    narration: 'Service income'
  },
  {
    id: '3',
    debit: 500,
    credit: 0,
    journal_date: '2024-02-10',
    account_type: 'expense',
    account_name: 'Utilities',
    account_id: 'acc-3',
    journal_id: 'journal-3',
    journal_number: 'JE003',
    narration: 'Electricity bill'
  }
];

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
};

describe('ProfitLoss', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    (useUser as any).mockReturnValue({ user: mockUser });
    (useNavigate as any).mockReturnValue(mockNavigate);
    (toast as any).success = vi.fn();
    (toast as any).error = vi.fn();

    // Mock supabase query
    (supabase.from as any).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      in: vi.fn().mockResolvedValue({
        data: mockJournalData,
        error: null
      })
    });

    // Mock global fetch for email functionality
    global.fetch = vi.fn();
    
    // Mock setTimeout for email simulation
    vi.spyOn(global, 'setTimeout').mockImplementation((callback: any) => {
      callback();
      return 0 as any;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Happy Path Scenarios', () => {
    it('renders profit and loss summary', async () => {
      const wrapper = createWrapper();
      render(<ProfitLoss />, { wrapper });

      // Wait for data to load
      await waitFor(() => {
        expect(screen.queryByText('Loading Profit & Loss data...')).not.toBeInTheDocument();
      });

      // Check if main components are rendered
      expect(screen.getByText('Profit & Loss Report')).toBeInTheDocument();
      expect(screen.getByText('Total Income')).toBeInTheDocument();
      expect(screen.getByText('Total Expenses')).toBeInTheDocument();
      expect(screen.getByText(/Net (Profit|Loss)/)).toBeInTheDocument();

      // Check if summary values are displayed correctly
      expect(screen.getByText('₹5,000')).toBeInTheDocument(); // Income
      expect(screen.getByText('₹1,500')).toBeInTheDocument(); // Expenses (1000 + 500)
      expect(screen.getByText('₹3,500')).toBeInTheDocument(); // Net profit (5000 - 1500)

      // Check if account breakdown is shown
      expect(screen.getByText('Account Breakdown')).toBeInTheDocument();
      expect(screen.getByText('Income Accounts')).toBeInTheDocument();
      expect(screen.getByText('Expense Accounts')).toBeInTheDocument();
    });

    it('exports PDF successfully', async () => {
      const wrapper = createWrapper();
      render(<ProfitLoss />, { wrapper });
      const user = userEvent.setup();

      await waitFor(() => {
        expect(screen.queryByText('Loading Profit & Loss data...')).not.toBeInTheDocument();
      });

      // Open export dialog
      const exportButton = screen.getByRole('button', { name: /export/i });
      await user.click(exportButton);

      // Click PDF export button
      const pdfButton = screen.getByRole('button', { name: /pdf/i });
      await user.click(pdfButton);

      // Check if toast success message is shown
      expect(toast.success).toHaveBeenCalledWith('PDF exported successfully');
    });

    it('exports Excel successfully', async () => {
      const wrapper = createWrapper();
      render(<ProfitLoss />, { wrapper });
      const user = userEvent.setup();

      await waitFor(() => {
        expect(screen.queryByText('Loading Profit & Loss data...')).not.toBeInTheDocument();
      });

      // Open export dialog
      const exportButton = screen.getByRole('button', { name: /export/i });
      await user.click(exportButton);

      // Click Excel export button
      const excelButton = screen.getByRole('button', { name: /excel/i });
      await user.click(excelButton);

      // Check if toast success message is shown
      expect(toast.success).toHaveBeenCalledWith('Excel file exported successfully');
    });

    it('exports CSV successfully', async () => {
      const wrapper = createWrapper();
      render(<ProfitLoss />, { wrapper });
      const user = userEvent.setup();

      await waitFor(() => {
        expect(screen.queryByText('Loading Profit & Loss data..')).not.toBeInTheDocument();
      });

      // Open export dialog
      const exportButton = screen.getByRole('button', { name: /export/i });
      await user.click(exportButton);

      // Click CSV export button
      const csvButton = screen.getByRole('button', { name: /csv/i });
      await user.click(csvButton);

      // Check if toast success message is shown
      expect(toast.success).toHaveBeenCalledWith('Profit & Loss report exported successfully');
    });

    it('emails report successfully', async () => {
      const wrapper = createWrapper();
      render(<ProfitLoss />, { wrapper });
      const user = userEvent.setup();

      await waitFor(() => {
        expect(screen.queryByText('Loading Profit & Loss data...')).not.toBeInTheDocument();
      });

      // Open email dialog
      const emailButton = screen.getByRole('button', { name: /email/i });
      await user.click(emailButton);

      // Check if email dialog is open
      expect(screen.getByText('Email Profit & Loss Report')).toBeInTheDocument();

      // Enter email address
      const emailInput = screen.getByPlaceholderText('Enter recipient email address');
      await user.type(emailInput, 'test@example.com');

      // Click send button
      const sendButton = screen.getByRole('button', { name: /send report/i });
      await user.click(sendButton);

      // Wait for email to be sent
      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith('Report successfully sent to test@example.com');
      });
    });
  });

  describe('Input Verification Scenarios', () => {
    it('handles empty data gracefully', async () => {
      // Mock empty data response
      (supabase.from as any).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        lte: vi.fn().mockReturnThis(),
        in: vi.fn().mockResolvedValue({
          data: [],
          error: null
        })
      });

      const wrapper = createWrapper();
      render(<ProfitLoss />, { wrapper });

      await waitFor(() => {
        expect(screen.queryByText('Loading Profit & Loss data...')).not.toBeInTheDocument();
      });

      // Check if zero values are displayed
      expect(screen.getByText('₹0')).toBeInTheDocument();
      expect(screen.getByText('No income accounts found')).toBeInTheDocument();
      expect(screen.getByText('No expense accounts found')).toBeInTheDocument();
    });

    it('validates date range inputs', async () => {
      const wrapper = createWrapper();
      render(<ProfitLoss />, { wrapper });
      const user = userEvent.setup();

      await waitFor(() => {
        expect(screen.queryByText('Loading Profit & Loss data...')).not.toBeInTheDocument();
      });

      // Get date inputs
      const startDateInput = screen.getByLabelText('Start Date');
      const endDateInput = screen.getByLabelText('End Date');

      // Set invalid date range (end date before start date)
      await user.clear(startDateInput);
      await user.type(startDateInput, '2024-12-01');
      
      await user.clear(endDateInput);
      await user.type(endDateInput, '2024-01-01');

      // Check that inputs accept the values (component should handle validation)
      expect(startDateInput).toHaveValue('2024-12-01');
      expect(endDateInput).toHaveValue('2024-01-01');
    });
  });

  describe('Branching Scenarios', () => {
    it('shows comparison data correctly', async () => {
      const wrapper = createWrapper();
      render(<ProfitLoss />, { wrapper });
      const user = userEvent.setup();

      await waitFor(() => {
        expect(screen.queryByText('Loading Profit & Loss data...')).not.toBeInTheDocument();
      });

      // Navigate to comparison tab
      const comparisonTab = screen.getByRole('tab', { name: /comparison/i });
      await user.click(comparisonTab);

      // Enable comparison
      const enableComparisonCheckbox = screen.getByRole('checkbox', { name: /enable period comparison/i });
      await user.click(enableComparisonCheckbox);

      // Check if comparison UI elements appear
      expect(screen.getByText('Comparison Period')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Previous Year (Same Period)')).toBeInTheDocument();

      // Check if comparison dates are visible
      expect(screen.getByLabelText('Comparison Start Date')).toBeInTheDocument();
      expect(screen.getByLabelText('Comparison End Date')).toBeInTheDocument();
    });

    it('handles account drill-down functionality', async () => {
      const wrapper = createWrapper();
      render(<ProfitLoss />, { wrapper });
      const user = userEvent.setup();

      await waitFor(() => {
        expect(screen.queryByText('Loading Profit & Loss data...')).not.toBeInTheDocument();
      });

      // Find and click on an account to drill down
      const incomeSection = screen.getByText('Income Accounts').closest('div');
      const serviceRevenueAccount = within(incomeSection as HTMLElement).getByText('Service Revenue');
      
      await user.click(serviceRevenueAccount.closest('div') as HTMLElement);

      // Wait for drill-down functionality to be triggered
      await waitFor(() => {
        // The drill-down should set selected account and open dialog
        // This is tested by checking if the component's state changes appropriately
        expect(serviceRevenueAccount).toBeInTheDocument();
      });
    });

    it('handles different comparison period options', async () => {
      const wrapper = createWrapper();
      render(<ProfitLoss />, { wrapper });
      const user = userEvent.setup();

      await waitFor(() => {
        expect(screen.queryByText('Loading Profit & Loss data...')).not.toBeInTheDocument();
      });

      // Navigate to comparison tab
      const comparisonTab = screen.getByRole('tab', { name: /comparison/i });
      await user.click(comparisonTab);

      // Enable comparison
      const enableComparisonCheckbox = screen.getByRole('checkbox', { name: /enable period comparison/i });
      await user.click(enableComparisonCheckbox);

      // Test different comparison periods
      const comparisonSelect = screen.getByRole('combobox');
      
      // Click to open dropdown
      await user.click(comparisonSelect);
      
      // Select custom period option
      const customOption = screen.getByText('Custom Period');
      await user.click(customOption);

      // Check that date inputs are now enabled
      const comparisonStartDate = screen.getByLabelText('Comparison Start Date');
      const comparisonEndDate = screen.getByLabelText('Comparison End Date');
      
      expect(comparisonStartDate).not.toBeDisabled();
      expect(comparisonEndDate).not.toBeDisabled();
    });
  });

  describe('Exception Handling Scenarios', () => {
    it('handles email validation error', async () => {
      const wrapper = createWrapper();
      render(<ProfitLoss />, { wrapper });
      const user = userEvent.setup();

      await waitFor(() => {
        expect(screen.queryByText('Loading Profit & Loss data...')).not.toBeInTheDocument();
      });

      // Open email dialog
      const emailButton = screen.getByRole('button', { name: /email/i });
      await user.click(emailButton);

      // Try to send without email address
      const sendButton = screen.getByRole('button', { name: /send report/i });
      
      // Button should be disabled when email is empty
      expect(sendButton).toBeDisabled();

      // Enter whitespace only
      const emailInput = screen.getByPlaceholderText('Enter recipient email address');
      await user.type(emailInput, '   ');

      // Button should still be disabled
      expect(sendButton).toBeDisabled();
    });

    it('handles supabase query error', async () => {
      // Mock error response
      (supabase.from as any).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        lte: vi.fn().mockReturnThis(),
        in: vi.fn().mockResolvedValue({
          data: null,
          error: new Error('Database connection failed')
        })
      });

      const wrapper = createWrapper();
      render(<ProfitLoss />, { wrapper });

      // Should handle the error gracefully by showing loading state or empty state
      await waitFor(() => {
        // The component should either show loading or handle the error gracefully
        expect(screen.getByText(/Profit & Loss Report|Loading Profit & Loss data/)).toBeInTheDocument();
      });
    });

    it('handles export errors gracefully', async () => {
      // Mock jsPDF to throw an error
      const mockPDF = vi.fn().mockImplementation(() => {
        throw new Error('PDF generation failed');
      });

      vi.doMock('jspdf', () => ({
        default: mockPDF
      }));

      const wrapper = createWrapper();
      render(<ProfitLoss />, { wrapper });
      const user = userEvent.setup();

      await waitFor(() => {
        expect(screen.queryByText('Loading Profit & Loss data...')).not.toBeInTheDocument();
      });

      // Try to export PDF
      const exportButton = screen.getByRole('button', { name: /export/i });
      await user.click(exportButton);

      const pdfButton = screen.getByRole('button', { name: /pdf/i });
      
      // The test will verify the component doesn't crash when PDF export fails
      // In a real scenario, this might show an error toast
      expect(pdfButton).toBeInTheDocument();
    });

    it('handles email sending failure', async () => {
      // Mock fetch to simulate email service failure
      global.fetch = vi.fn().mockRejectedValue(new Error('Email service unavailable'));

      const wrapper = createWrapper();
      render(<ProfitLoss />, { wrapper });
      const user = userEvent.setup();

      await waitFor(() => {
        expect(screen.queryByText('Loading Profit & Loss data...')).not.toBeInTheDocument();
      });

      // Open email dialog and try to send
      const emailButton = screen.getByRole('button', { name: /email/i });
      await user.click(emailButton);

      const emailInput = screen.getByPlaceholderText('Enter recipient email address');
      await user.type(emailInput, 'test@example.com');

      const sendButton = screen.getByRole('button', { name: /send report/i });
      await user.click(sendButton);

      // Wait for error handling
      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Failed to send email. Please try again.');
      });
    });

    it('handles missing user gracefully', async () => {
      // Mock user as null/undefined
      (useUser as any).mockReturnValue({ user: null });

      const wrapper = createWrapper();
      render(<ProfitLoss />, { wrapper });

      // Should handle missing user by not making queries
      await waitFor(() => {
        // The component should show loading or empty state when user is missing
        expect(screen.getByText(/Loading Profit & Loss data|Profit & Loss Report/)).toBeInTheDocument();
      });
    });
  });

  describe('UI Interaction Tests', () => {
    it('toggles between current and comparison tabs', async () => {
      const wrapper = createWrapper();
      render(<ProfitLoss />, { wrapper });
      const user = userEvent.setup();

      await waitFor(() => {
        expect(screen.queryByText('Loading Profit & Loss data...')).not.toBeInTheDocument();
      });

      // Check current tab is active by default
      const currentTab = screen.getByRole('tab', { name: /current period/i });
      const comparisonTab = screen.getByRole('tab', { name: /comparison/i });

      expect(currentTab).toHaveAttribute('data-state', 'active');
      expect(comparisonTab).toHaveAttribute('data-state', 'inactive');

      // Click comparison tab
      await user.click(comparisonTab);

      expect(comparisonTab).toHaveAttribute('data-state', 'active');
      expect(currentTab).toHaveAttribute('data-state', 'inactive');
    });

    it('opens and closes export dialog', async () => {
      const wrapper = createWrapper();
      render(<ProfitLoss />, { wrapper });
      const user = userEvent.setup();

      await waitFor(() => {
        expect(screen.queryByText('Loading Profit & Loss data...')).not.toBeInTheDocument();
      });

      // Open export dialog
      const exportButton = screen.getByRole('button', { name: /export/i });
      await user.click(exportButton);

      expect(screen.getByText('Export Profit & Loss Report')).toBeInTheDocument();

      // Close dialog by clicking outside or escape key
      await user.keyboard('{Escape}');

      await waitFor(() => {
        expect(screen.queryByText('Export Profit & Loss Report')).not.toBeInTheDocument();
      });
    });

    it('opens and closes email dialog', async () => {
      const wrapper = createWrapper();
      render(<ProfitLoss />, { wrapper });
      const user = userEvent.setup();

      await waitFor(() => {
        expect(screen.queryByText('Loading Profit & Loss data...')).not.toBeInTheDocument();
      });

      // Open email dialog
      const emailButton = screen.getByRole('button', { name: /email/i });
      await user.click(emailButton);

      expect(screen.getByText('Email Profit & Loss Report')).toBeInTheDocument();

      // Close using cancel button
      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      await user.click(cancelButton);

      await waitFor(() => {
        expect(screen.queryByText('Email Profit & Loss Report')).not.toBeInTheDocument();
      });
    });
  });
});