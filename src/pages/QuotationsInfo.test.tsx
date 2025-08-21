import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import QuotationsInfo from './QuotationsInfo';
import { useQuotations, useUpdateQuotationStatus } from '@/hooks/useQuotations';

// Mock the hooks
vi.mock('@/hooks/useQuotations', () => ({
  useQuotations: vi.fn(),
  useUpdateQuotationStatus: vi.fn(),
}));

// Mock the toast hook
vi.mock('@/hooks/use-toast', () => ({
  useToast: vi.fn(() => ({
    toast: vi.fn(),
  })),
}));

// Mock the UI components
vi.mock('@/components/ui/sidebar', () => ({
  SidebarTrigger: ({ children, ...props }: any) => <button {...props}>{children}</button>,
}));

const mockQuotations = [
  {
    id: '1',
    quotation_number: 'QT-001',
    client_name: 'Acme Corp',
    client_email: 'contact@acme.com',
    client_phone: '+1234567890',
    client_address: '123 Business St',
    subtotal: 1000,
    tax_amount: 180,
    total_amount: 1180,
    discount: 0,
    quotation_date: '2024-01-15',
    validity_period: 30,
    items: [],
    items_with_product_id: [],
    terms_conditions: 'Standard terms',
    status: 'draft' as const,
    created_at: '2024-01-15T10:00:00Z',
  },
  {
    id: '2',
    quotation_number: 'QT-002',
    client_name: 'Tech Solutions',
    client_email: 'info@techsolutions.com',
    client_phone: '+9876543210',
    client_address: '456 Tech Avenue',
    subtotal: 2500,
    tax_amount: 450,
    total_amount: 2950,
    discount: 100,
    quotation_date: '2024-01-16',
    validity_period: 45,
    items: [],
    items_with_product_id: [],
    terms_conditions: 'Net 30 terms',
    status: 'sent' as const,
    created_at: '2024-01-16T14:30:00Z',
  },
  {
    id: '3',
    quotation_number: 'QT-003',
    client_name: 'Global Industries',
    client_email: 'procurement@global.com',
    client_phone: '+1122334455',
    client_address: '789 Corporate Blvd',
    subtotal: 5000,
    tax_amount: 900,
    total_amount: 5900,
    discount: 0,
    quotation_date: '2024-01-17',
    validity_period: 60,
    items: [],
    items_with_product_id: [],
    terms_conditions: 'Payment on delivery',
    status: 'accepted' as const,
    created_at: '2024-01-17T09:15:00Z',
  }
];

const createTestQueryClient = () => {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  });
};

const renderWithQueryClient = (component: React.ReactElement) => {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      {component}
    </QueryClientProvider>
  );
};

describe('QuotationsInfo', () => {
  const mockUpdateStatus = {
    mutateAsync: vi.fn(),
    isPending: false,
    error: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useUpdateQuotationStatus).mockReturnValue(mockUpdateStatus);
  });

  describe('Happy Path Scenarios', () => {
    it('should display quotations list successfully', () => {
      vi.mocked(useQuotations).mockReturnValue({
        data: mockQuotations,
        isLoading: false,
        error: null,
      });

      renderWithQueryClient(<QuotationsInfo />);

      expect(screen.getByText('Quotations Info')).toBeInTheDocument();
      expect(screen.getByText('View and manage your quotations and their statuses')).toBeInTheDocument();
      
      // Check if quotations are displayed
      expect(screen.getByText('QT-001')).toBeInTheDocument();
      expect(screen.getByText('QT-002')).toBeInTheDocument();
      expect(screen.getByText('QT-003')).toBeInTheDocument();
      
      expect(screen.getByText('Acme Corp')).toBeInTheDocument();
      expect(screen.getByText('Tech Solutions')).toBeInTheDocument();
      expect(screen.getByText('Global Industries')).toBeInTheDocument();

      // Check total amounts
      expect(screen.getByText('₹1,180')).toBeInTheDocument();
      expect(screen.getByText('₹2,950')).toBeInTheDocument();
      expect(screen.getByText('₹5,900')).toBeInTheDocument();
    });

    it('should update quotation status successfully', async () => {
      const user = userEvent.setup();
      mockUpdateStatus.mutateAsync.mockResolvedValue(mockQuotations[0]);
      
      vi.mocked(useQuotations).mockReturnValue({
        data: mockQuotations,
        isLoading: false,
        error: null,
      });

      renderWithQueryClient(<QuotationsInfo />);

      // Find the status select for the first quotation
      const statusSelects = screen.getAllByRole('combobox');
      const firstStatusSelect = statusSelects[0];

      await user.click(firstStatusSelect);
      
      // Wait for the dropdown to open and select "Sent"
      await waitFor(() => {
        const sentOption = screen.getByRole('option', { name: 'Sent' });
        expect(sentOption).toBeInTheDocument();
      });

      const sentOption = screen.getByRole('option', { name: 'Sent' });
      await user.click(sentOption);

      expect(mockUpdateStatus.mutateAsync).toHaveBeenCalledWith({
        quotationId: '1',
        status: 'sent',
      });
    });

    it('should search quotations by number', async () => {
      const user = userEvent.setup();
      
      vi.mocked(useQuotations).mockReturnValue({
        data: mockQuotations,
        isLoading: false,
        error: null,
      });

      renderWithQueryClient(<QuotationsInfo />);

      const searchInput = screen.getByPlaceholderText('Search quotations...');
      await user.type(searchInput, 'QT-001');

      // Only QT-001 should be visible
      expect(screen.getByText('QT-001')).toBeInTheDocument();
      expect(screen.queryByText('QT-002')).not.toBeInTheDocument();
      expect(screen.queryByText('QT-003')).not.toBeInTheDocument();
    });

    it('should filter quotations by status', async () => {
      const user = userEvent.setup();
      
      vi.mocked(useQuotations).mockReturnValue({
        data: mockQuotations,
        isLoading: false,
        error: null,
      });

      renderWithQueryClient(<QuotationsInfo />);

      // Click on "Accepted" filter button
      const acceptedButton = screen.getByRole('button', { name: /Accepted/ });
      await user.click(acceptedButton);

      // Only accepted quotation should be visible
      expect(screen.getByText('QT-003')).toBeInTheDocument();
      expect(screen.queryByText('QT-001')).not.toBeInTheDocument();
      expect(screen.queryByText('QT-002')).not.toBeInTheDocument();
    });
  });

  describe('Input Verification Scenarios', () => {
    it('should handle empty quotations list', () => {
      vi.mocked(useQuotations).mockReturnValue({
        data: [],
        isLoading: false,
        error: null,
      });

      renderWithQueryClient(<QuotationsInfo />);

      expect(screen.getByText('No quotations found.')).toBeInTheDocument();
    });
  });

  describe('Exception Handling Scenarios', () => {
    it('should handle invalid status update', async () => {
      const user = userEvent.setup();
      const mockToast = vi.fn();
      
      vi.mocked(useQuotations).mockReturnValue({
        data: mockQuotations,
        isLoading: false,
        error: null,
      });

      // Mock the toast function
      vi.mocked(require('@/hooks/use-toast').useToast).mockReturnValue({
        toast: mockToast,
      });

      mockUpdateStatus.mutateAsync.mockRejectedValue(new Error('Update failed'));

      renderWithQueryClient(<QuotationsInfo />);

      // Find the first status select
      const statusSelects = screen.getAllByRole('combobox');
      const firstStatusSelect = statusSelects[0];

      await user.click(firstStatusSelect);
      
      await waitFor(() => {
        const sentOption = screen.getByRole('option', { name: 'Sent' });
        expect(sentOption).toBeInTheDocument();
      });

      const sentOption = screen.getByRole('option', { name: 'Sent' });
      await user.click(sentOption);

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith({
          title: 'Error',
          description: 'Failed to update quotation status. Please try again.',
          variant: 'destructive',
        });
      });
    });
  });

  describe('Branching Scenarios', () => {
    it('should show loading state correctly', () => {
      vi.mocked(useQuotations).mockReturnValue({
        data: [],
        isLoading: true,
        error: null,
      });

      renderWithQueryClient(<QuotationsInfo />);

      expect(screen.getByText('Quotations Info')).toBeInTheDocument();
      expect(screen.getByText('Loading quotations...')).toBeInTheDocument();
      
      // Check for loading skeleton
      const cards = document.querySelectorAll('.animate-pulse');
      expect(cards.length).toBeGreaterThan(0);
    });

    it('should display correct status badges', () => {
      vi.mocked(useQuotations).mockReturnValue({
        data: mockQuotations,
        isLoading: false,
        error: null,
      });

      renderWithQueryClient(<QuotationsInfo />);

      // Check status badges
      expect(screen.getByText('Draft')).toBeInTheDocument();
      expect(screen.getByText('Sent')).toBeInTheDocument();
      expect(screen.getByText('Accepted')).toBeInTheDocument();
    });
  });

  describe('Additional Functionality', () => {
    it('should handle search by client name', async () => {
      const user = userEvent.setup();
      
      vi.mocked(useQuotations).mockReturnValue({
        data: mockQuotations,
        isLoading: false,
        error: null,
      });

      renderWithQueryClient(<QuotationsInfo />);

      const searchInput = screen.getByPlaceholderText('Search quotations...');
      await user.type(searchInput, 'Acme');

      // Only Acme Corp quotation should be visible
      expect(screen.getByText('Acme Corp')).toBeInTheDocument();
      expect(screen.queryByText('Tech Solutions')).not.toBeInTheDocument();
      expect(screen.queryByText('Global Industries')).not.toBeInTheDocument();
    });

    it('should display formatted dates correctly', () => {
      vi.mocked(useQuotations).mockReturnValue({
        data: mockQuotations,
        isLoading: false,
        error: null,
      });

      renderWithQueryClient(<QuotationsInfo />);

      // Check if dates are displayed (format may vary based on locale)
      const dateRegex = /\d{1,2}\/\d{1,2}\/\d{4}/;
      const dateCells = screen.getAllByText(dateRegex);
      expect(dateCells.length).toBeGreaterThan(0);
    });

    it('should reset filters when clicking All button', async () => {
      const user = userEvent.setup();
      
      vi.mocked(useQuotations).mockReturnValue({
        data: mockQuotations,
        isLoading: false,
        error: null,
      });

      renderWithQueryClient(<QuotationsInfo />);

      // First filter by Accepted
      const acceptedButton = screen.getByRole('button', { name: /Accepted/ });
      await user.click(acceptedButton);

      // Only accepted quotation should be visible
      expect(screen.getByText('QT-003')).toBeInTheDocument();
      expect(screen.queryByText('QT-001')).not.toBeInTheDocument();

      // Then click All button
      const allButton = screen.getByRole('button', { name: 'All' });
      await user.click(allButton);

      // All quotations should be visible again
      expect(screen.getByText('QT-001')).toBeInTheDocument();
      expect(screen.getByText('QT-002')).toBeInTheDocument();
      expect(screen.getByText('QT-003')).toBeInTheDocument();
    });

    it('should maintain search term when changing filters', async () => {
      const user = userEvent.setup();
      
      vi.mocked(useQuotations).mockReturnValue({
        data: mockQuotations,
        isLoading: false,
        error: null,
      });

      renderWithQueryClient(<QuotationsInfo />);

      // Search for Tech Solutions
      const searchInput = screen.getByPlaceholderText('Search quotations...');
      await user.type(searchInput, 'Tech');

      expect(screen.getByText('Tech Solutions')).toBeInTheDocument();
      expect(screen.queryByText('Acme Corp')).not.toBeInTheDocument();

      // Filter by sent status (Tech Solutions has sent status)
      const sentButton = screen.getByRole('button', { name: /Rejected/ });
      await user.click(sentButton);

      // Should show no results since Tech Solutions is not rejected
      expect(screen.getByText('No quotations found.')).toBeInTheDocument();
    });
  });
});