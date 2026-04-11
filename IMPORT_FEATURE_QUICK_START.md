# Import Feature - Quick Start Guide

## How to Use Import Feature

### 1. Access Import Feature
Navigate to any of these pages and click the **Import** button:
- **Clients** page
- **Vendors** page  
- **Invoices** page
- **Quotations** (Info/List) page

### 2. Download Template (First Time)
1. Click "Download Template" button in the import dialog
2. A blank CSV file will download with all the required columns
3. Open it in Excel, Google Sheets, or any spreadsheet app

### 3. Fill in Your Data
Enter your data into the template CSV file:

**Clients Template:**
```
client_name,email,phone,gst_number,billing_address,shipping_address,contact_person
Acme Corp,contact@acme.com,9876543210,27AABCT1234A1Z0,123 Main St,456 Ship St,John Doe
```

**Vendors Template:**
```
vendor_name,email,phone,gst_number,billing_address,contact_person
Supplier Inc,supplier@inc.com,9876543210,27AABCT1234A1Z0,789 Vendor Ave,Jane Smith
```

**Invoices Template:**
```
invoice_number,invoice_date,due_date,client_name,item_description,quantity,rate,gst_rate,hsn_sac,notes
INV-001,2024-01-15,2024-02-15,Acme Corp,Services,1,1000,18,999999,Net payment
```

**Quotations Template:**
```
quotation_number,quotation_date,client_name,client_email,client_phone,client_address,item_description,quantity,rate,gst_rate,notes
QT-001,2024-01-15,Acme Corp,contact@acme.com,9876543210,123 Main St,Consulting,10,500,18,Valid 30 days
```

### 4. Upload Your File
1. In the import dialog, click the upload area or select "Browse Files"
2. Choose your filled CSV or XLSX file
3. The system will automatically validate your data

### 5. Review Results
The system shows:
- ✅ **Valid Records**: Number of rows ready to import
- ❌ **Invalid Records**: Number of rows with errors
- **Error Details**: Specific validation errors for each invalid row

### 6. Download Errors (If Needed)
If there are invalid rows:
1. Click "Download Error CSV" 
2. Fix the errors in that CSV file
3. Re-upload and try again

### 7. Confirm Import
Once validation is complete:
1. Review the valid row count
2. Click "Import" to import all valid records
3. You'll see a success message with the number imported

## Validation Rules

### Required Fields
Must be present and non-empty:
- **Clients**: Client name, Email
- **Vendors**: Vendor name, Email
- **Invoices**: Invoice number, Date, Client name, Item description, Quantity, Rate
- **Quotations**: Quotation number, Date, Client name, Item description, Quantity, Rate

### Field Formats

| Field | Format | Example |
|-------|--------|---------|
| Email | Valid email | contact@company.com |
| Phone | 10 digits or +91-XXXXX-XXXXX | 9876543210 or +91-98765-43210 |
| GST | 15 characters (Indian GSTIN) | 27AABCT1234A1Z0 |
| Date | YYYY-MM-DD | 2024-01-15 |
| Quantity | Number ≥ 0 | 10, 5.5 |
| Rate | Number ≥ 0 | 100, 99.99 |
| GST Rate | Number 0-100 | 18, 5, 12 (defaults to 18 if empty) |

### Duplicate Detection
The system checks if a record with the same unique identifier already exists:
- **Clients**: Checks by client name (case-insensitive)
- **Vendors**: Checks by vendor name (case-insensitive)
- **Invoices**: Checks by invoice number
- **Quotations**: Checks by quotation number

## Tips & Tricks

✅ **Do**:
- Use the provided template - it has the correct column names
- Keep emails and phone numbers in standard formats
- Use dates in YYYY-MM-DD format (e.g., 2024-12-25)
- Test with a few records first before large imports
- Keep a backup of your original file

❌ **Don't**:
- Add extra columns that aren't in the template
- Leave required fields empty
- Use invalid email addresses
- Mix date formats (use YYYY-MM-DD for all)
- Include duplicate rows (they'll fail validation)

## Common Errors & Solutions

| Error | Cause | Solution |
|-------|-------|----------|
| "Email must be a valid email address" | Invalid email format | Use format: user@domain.com |
| "GST must be 15 alphanumeric characters" | Wrong GST format | Check Indian GSTIN format (15 chars) |
| "Phone must be 10 digits" | Invalid phone format | Use 10-digit number or +91-format |
| "Field name is required" | Empty required field | Fill in all required columns |
| "Must be a number ≥ 0" | Non-numeric or negative | Use positive numbers only |
| "Record already exists" | Duplicate detected | Check if record is already in system |
| "Date must be in YYYY-MM-DD format" | Wrong date format | Use YYYY-MM-DD (e.g., 2024-01-15) |

## File Formats Supported

✅ **Supported**:
- CSV (Comma-Separated Values)
- XLSX (Excel 2007+)
- ODS (LibreOffice Calc)

❌ **Not Supported**:
- XLS (older Excel format) - use XLSX instead
- PDF, Images, or other formats

## Limits

- **File Size**: Up to 10 MB recommended
- **Rows**: Tested up to 1000 rows per import
- **Columns**: Only columns in template are processed
- **Special Characters**: Avoid in names; stick to letters, numbers, spaces, and basic punctuation

## Need Help?

If an import fails:
1. Download the error CSV provided
2. Check the error messages for each row
3. Fix the errors according to the validation rules
4. Re-upload the corrected file

For persistent issues, check:
- File format is CSV or XLSX (not PDF or other)
- Column names match the template exactly
- No extra rows or columns before the data
- All required fields are filled
- Date format is YYYY-MM-DD
- Email addresses are valid
- GST numbers are 15 characters

---

**Pro Tip**: Use the "Download Template" feature each time you want to import. It ensures you have the correct column names and order.
