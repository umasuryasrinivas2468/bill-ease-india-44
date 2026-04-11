# Expense Management Module

A comprehensive expense management system for the CA tools & Accounting platform that allows users to record business expenses and automatically post them to the ledger.

## Features

### Core Functionality
- ✅ Create expense entries with vendor linkage
- ✅ Categorize expenses (Rent, Fuel, Advertising, etc.)
- ✅ Multiple payment modes (Cash, Bank, Credit Card, UPI, etc.)
- ✅ Tax calculations and GST handling
- ✅ Auto-posting to ledger accounts
- ✅ Bill attachment support (planned)
- ✅ Monthly expense summary charts
- ✅ Advanced filtering and search

### Key Components

#### 1. Database Tables
- **expenses**: Main expense records
- **expense_categories**: Pre-defined and custom categories
- **expense_attachments**: File attachments for bills/receipts
- **vendors**: Vendor master data (already exists)

#### 2. Frontend Components
- **ExpensesList**: Display and manage expense entries
- **ExpenseForm**: Create/edit expense entries
- **ExpenseStats**: Analytics and summary statistics
- **ExpenseChart**: Visual charts and graphs
- **ExpenseFilters**: Advanced filtering options
- **PostToLedgerButton**: Automatic journal posting

#### 3. API Hooks
- **useExpenses**: Fetch and manage expense data
- **useExpenseCategories**: Manage expense categories
- **useExpenseStats**: Generate analytics and statistics
- **useCreateExpense**: Create new expense entries
- **useUpdateExpense**: Update existing expenses
- **useDeleteExpense**: Delete expense entries

## Setup Instructions

### 1. Database Migration

Execute the SQL migration file to create the required tables:

```sql
-- Run the migration file:
-- supabase/migrations/20251008000001_create_expenses_system.sql
```

### 2. Navigation Setup

The expense module is already integrated into the CA Tools & Accounting section in the sidebar. Access it via:
- **Main Menu**: CA Tools & Accounting → Expenses
- **Direct URL**: `/expenses`

### 3. Default Categories

The system comes with pre-configured expense categories:
- Office Rent
- Fuel & Transportation
- Advertising & Marketing
- Office Supplies
- Professional Fees
- Utilities
- Travel & Accommodation
- Communication
- Insurance
- Repairs & Maintenance
- Software & Subscriptions
- Printing & Stationery
- Bank Charges
- Entertainment
- Training & Development
- Miscellaneous

## Usage Guide

### Creating an Expense

1. **Navigate to Expenses**: Go to CA Tools & Accounting → Expenses
2. **Click "Add Expense"**: Opens the expense creation form
3. **Fill Required Fields**:
   - Expense Date
   - Vendor (select from dropdown or enter manually)
   - Category (select from dropdown or enter custom)
   - Description
   - Amount
   - Payment Mode
4. **Optional Fields**:
   - Tax Amount (for GST/VAT)
   - Reference Number
   - Bill Number
   - Notes
5. **Submit**: The expense is created with a unique expense number

### Automatic Ledger Posting

The system automatically creates journal entries when an expense is posted to the ledger:

#### Journal Entry Structure:
```
Dr. [Expense Account]     Amount
Dr. [Input Tax Account]   Tax Amount (if applicable)
    Cr. [Payment Account]     Total Amount
```

#### Account Creation:
- **Expense Accounts**: Auto-created based on categories (e.g., "Office Rent Expense")
- **Payment Accounts**: Maps to existing or creates new accounts:
  - Cash → Cash Account
  - Bank/UPI/Debit → Bank Account
  - Credit Card → Credit Card Account
- **Tax Accounts**: Input Tax Account for recoverable taxes

### Analytics and Reporting

#### Dashboard Stats:
- Total expenses count and amount
- Monthly summaries
- Tax amount tracking
- Average per expense

#### Category Breakdown:
- Expense distribution by category
- Top spending categories
- Category-wise trends

#### Payment Mode Analysis:
- Payment method preferences
- Cash vs non-cash spending
- Payment mode distribution

#### Monthly Trends:
- Spending patterns over time
- Seasonal variations
- Growth/decline trends

### Export and Reports

- **CSV Export**: Export filtered expense data
- **Date Range Filtering**: Custom date ranges
- **Category/Vendor Filtering**: Granular filtering options
- **Search Functionality**: Text search across all fields

## Advanced Features

### Filters and Search
- Date range selection
- Category filtering
- Vendor filtering
- Payment mode filtering
- Status filtering (Pending, Approved, Posted)
- Text search across descriptions and vendor names

### Auto-Numbering
Expenses are automatically assigned numbers in the format:
```
EXP/YYYY/0001
```
- EXP: Expense prefix
- YYYY: Year of expense
- 0001: Sequential number per year per user

### Status Management
- **Pending**: Newly created expenses
- **Approved**: Expenses approved for payment
- **Rejected**: Expenses rejected for payment
- **Posted**: Expenses posted to ledger

## File Structure

```
src/
├── pages/
│   └── Expenses.tsx                 # Main expense page
├── components/
│   └── expenses/
│       ├── ExpensesList.tsx         # List view component
│       ├── ExpenseForm.tsx          # Create/edit form
│       ├── ExpenseStats.tsx         # Analytics component
│       ├── ExpenseChart.tsx         # Charts component
│       ├── ExpenseFilters.tsx       # Filters component
│       └── PostToLedgerButton.tsx   # Ledger posting button
├── hooks/
│   └── useExpenses.ts               # React Query hooks
├── types/
│   └── expenses.ts                  # TypeScript interfaces
└── utils/
    └── journalPosting.ts            # Ledger posting utilities
```

## Database Schema

### expenses Table
```sql
id              UUID PRIMARY KEY
user_id         TEXT NOT NULL
vendor_id       UUID REFERENCES vendors(id)
vendor_name     TEXT NOT NULL
expense_number  TEXT NOT NULL UNIQUE
expense_date    DATE NOT NULL
category_id     UUID REFERENCES expense_categories(id)
category_name   TEXT NOT NULL
description     TEXT NOT NULL
amount          DECIMAL(12,2) NOT NULL
tax_amount      DECIMAL(12,2) DEFAULT 0
total_amount    DECIMAL(12,2) NOT NULL
payment_mode    TEXT CHECK (payment_mode IN (...))
reference_number TEXT
bill_number     TEXT
bill_attachment_url TEXT
notes           TEXT
status          TEXT DEFAULT 'pending'
posted_to_ledger BOOLEAN DEFAULT FALSE
journal_id      UUID
created_at      TIMESTAMP DEFAULT NOW()
updated_at      TIMESTAMP DEFAULT NOW()
```

### expense_categories Table
```sql
id              UUID PRIMARY KEY
user_id         TEXT NOT NULL
category_name   TEXT NOT NULL
description     TEXT
is_default      BOOLEAN DEFAULT FALSE
is_active       BOOLEAN DEFAULT TRUE
created_at      TIMESTAMP DEFAULT NOW()
updated_at      TIMESTAMP DEFAULT NOW()
```

## Future Enhancements

### Planned Features
1. **File Attachments**: Upload and attach bills/receipts
2. **OCR Integration**: Extract data from bill images
3. **Approval Workflow**: Multi-level approval process
4. **Recurring Expenses**: Set up recurring expense entries
5. **Mobile App**: React Native mobile application
6. **Expense Reports**: Advanced reporting and analytics
7. **Budget Management**: Set and track expense budgets
8. **Integration**: Connect with banking APIs for auto-import

### API Extensions
- Bulk import from CSV/Excel
- Integration with accounting software
- Mobile API for expense capture
- Webhook notifications

## Troubleshooting

### Common Issues

1. **Expense not posting to ledger**:
   - Check if user has required accounts set up
   - Verify journal posting permissions
   - Check error logs for account creation issues

2. **Categories not showing**:
   - Run the migration to populate default categories
   - Check user permissions for expense_categories table

3. **Vendor dropdown empty**:
   - Create vendors in the vendor management section first
   - Check RLS policies for vendors table

### Support
For technical issues or feature requests, please contact the development team or create an issue in the project repository.

## License
This module is part of the Bill Ease India CA Tools & Accounting platform and follows the same licensing terms as the main application.