import { supabase } from '@/lib/supabase';

export const createSampleBusinessData = async (userId: string) => {
  try {
    // Create sample clients
    const sampleClients = [
      {
        name: 'Acme Corp',
        email: 'billing@acmecorp.com',
        phone: '+91-9876543210',
        address: '123 Business District, Mumbai 400001',
        gst_number: '27ABCDE1234F1Z5',
        user_id: userId,
      },
      {
        name: 'TechSoft Solutions',
        email: 'accounts@techsoft.in',
        phone: '+91-9876543211',
        address: '456 IT Park, Bangalore 560001',
        gst_number: '29ABCDE5678F1Z5',
        user_id: userId,
      },
      {
        name: 'Green Energy Ltd',
        email: 'finance@greenenergy.co.in',
        phone: '+91-9876543212',
        address: '789 Industrial Area, Chennai 600001',
        gst_number: '33ABCDE9012F1Z5',
        user_id: userId,
      },
    ];

    // Insert clients
    const { data: clients, error: clientsError } = await supabase
      .from('clients')
      .upsert(sampleClients, { onConflict: 'email,user_id' })
      .select();

    if (clientsError) throw clientsError;

    // Create sample inventory items
    const sampleInventory = [
      {
        product_name: 'Website Development Service',
        description: 'Custom website development with responsive design',
        price: 50000,
        stock_quantity: 10,
        hsn_sac: '998311',
        unit: 'Service',
        user_id: userId,
      },
      {
        product_name: 'Mobile App Development',
        description: 'Native mobile application development',
        price: 75000,
        stock_quantity: 5,
        hsn_sac: '998311',
        unit: 'Service',
        user_id: userId,
      },
      {
        product_name: 'Digital Marketing Package',
        description: 'Complete digital marketing solution',
        price: 25000,
        stock_quantity: 20,
        hsn_sac: '998311',
        unit: 'Service',
        user_id: userId,
      },
      {
        product_name: 'Software License',
        description: 'Annual software license',
        price: 15000,
        stock_quantity: 100,
        hsn_sac: '998311',
        unit: 'License',
        user_id: userId,
      },
    ];

    // Insert inventory
    const { data: inventory, error: inventoryError } = await supabase
      .from('inventory')
      .upsert(sampleInventory, { onConflict: 'product_name,user_id' })
      .select();

    if (inventoryError) throw inventoryError;

    // Create sample invoices with better distribution across months
    if (clients && clients.length > 0) {
      const currentDate = new Date();
      const sampleInvoices = [];

      // Create invoices for the last 6 months with varying amounts
      for (let monthOffset = 0; monthOffset < 6; monthOffset++) {
        for (let invoiceInMonth = 0; invoiceInMonth < 3; invoiceInMonth++) {
          const invoiceDate = new Date(currentDate);
          invoiceDate.setMonth(currentDate.getMonth() - monthOffset);
          invoiceDate.setDate(5 + (invoiceInMonth * 10)); // Spread across the month
          
          const dueDate = new Date(invoiceDate);
          dueDate.setDate(invoiceDate.getDate() + 30);

          const client = clients[invoiceInMonth % clients.length];
          const product = sampleInventory[invoiceInMonth % sampleInventory.length];
          
          // Vary quantities and products for more realistic data
          const quantity = invoiceInMonth === 0 ? 1 : invoiceInMonth === 1 ? 2 : 1;
          const items = [
            {
              description: product.product_name,
              product_id: inventory?.[invoiceInMonth % sampleInventory.length]?.id || null,
              hsn_sac: product.hsn_sac,
              quantity: quantity,
              rate: product.price,
              amount: product.price * quantity,
            }
          ];

          const subtotal = items.reduce((sum, item) => sum + item.amount, 0);
          const gstAmount = subtotal * 0.18;
          const totalAmount = subtotal + gstAmount;

          // More realistic status distribution - more paid invoices in older months
          let status = 'paid';
          if (monthOffset === 0) {
            status = invoiceInMonth % 3 === 0 ? 'paid' : invoiceInMonth % 3 === 1 ? 'pending' : 'overdue';
          } else if (monthOffset === 1) {
            status = invoiceInMonth % 2 === 0 ? 'paid' : 'pending';
          }

          const invoiceIndex = monthOffset * 3 + invoiceInMonth + 1;
          sampleInvoices.push({
            invoice_number: `INV-${String(invoiceDate.getFullYear()).slice(-2)}${String(invoiceDate.getMonth() + 1).padStart(2, '0')}-${String(invoiceIndex).padStart(3, '0')}`,
            client_name: client.name,
            client_email: client.email,
            client_gst_number: client.gst_number,
            client_address: client.address,
            amount: subtotal,
            gst_amount: gstAmount,
            total_amount: totalAmount,
            advance: 0,
            discount: 0,
            roundoff: 0,
            gst_rate: 18,
            from_email: 'business@example.com',
            status: status,
            invoice_date: invoiceDate.toISOString().split('T')[0],
            due_date: dueDate.toISOString().split('T')[0],
            items: items,
            items_with_product_id: items,
            notes: 'Sample invoice for demonstration purposes',
            user_id: userId,
          });
        }
      }

      // Insert invoices
      const { error: invoicesError } = await supabase
        .from('invoices')
        .upsert(sampleInvoices, { onConflict: 'invoice_number,user_id' });

      if (invoicesError) throw invoicesError;
    }

    // Create sample purchase bills with better distribution
    const currentDateForBills = new Date();
    const sampleBills = [];
    
    const vendors = [
      'Office Supplies Inc',
      'Software Solutions Pvt Ltd', 
      'Marketing Agency Co',
      'Utilities Provider',
      'Equipment Rental Co'
    ];
    
    const billTypes = [
      'Office supplies and stationery',
      'Software licenses and subscriptions',
      'Marketing and advertising services',
      'Utility bills (electricity, internet)',
      'Equipment rental and maintenance'
    ];

    // Create bills for the last 4 months
    for (let monthOffset = 0; monthOffset < 4; monthOffset++) {
      for (let billInMonth = 0; billInMonth < 2; billInMonth++) {
        const billDate = new Date(currentDateForBills);
        billDate.setMonth(currentDateForBills.getMonth() - monthOffset);
        billDate.setDate(10 + (billInMonth * 15)); // Spread across the month
        
        const dueDate = new Date(billDate);
        dueDate.setDate(billDate.getDate() + 30);

        const vendor = vendors[billInMonth % vendors.length];
        const description = billTypes[billInMonth % billTypes.length];
        
        // Vary bill amounts
        const baseAmount = [8000, 12000, 18000, 5000, 22000][billInMonth % 5];
        const totalAmount = baseAmount + (Math.random() * 5000); // Add some variation
        
        // Status distribution - older bills more likely to be paid
        let status = 'paid';
        let paidAmount = totalAmount;
        
        if (monthOffset === 0) {
          // Current month - mix of statuses
          status = billInMonth % 3 === 0 ? 'paid' : billInMonth % 3 === 1 ? 'pending' : 'overdue';
          paidAmount = status === 'paid' ? totalAmount : 0;
        } else if (monthOffset === 1) {
          // Last month - mostly paid, some pending
          status = billInMonth % 2 === 0 ? 'paid' : 'pending';
          paidAmount = status === 'paid' ? totalAmount : 0;
        } else {
          // Older months - mostly paid
          status = 'paid';
          paidAmount = totalAmount;
        }

        const billIndex = monthOffset * 2 + billInMonth + 1;
        sampleBills.push({
          vendor_name: vendor,
          bill_number: `BILL-${String(billDate.getFullYear()).slice(-2)}${String(billDate.getMonth() + 1).padStart(2, '0')}-${String(billIndex).padStart(3, '0')}`,
          bill_date: billDate.toISOString().split('T')[0],
          due_date: dueDate.toISOString().split('T')[0],
          total_amount: Math.round(totalAmount),
          paid_amount: Math.round(paidAmount),
          status: status,
          description: description,
          user_id: userId,
        });
      }
    }

    // Insert bills
    const { error: billsError } = await supabase
      .from('purchase_bills')
      .upsert(sampleBills, { onConflict: 'bill_number,user_id' });

    if (billsError) throw billsError;

    console.log('Sample business data created successfully');
    return { success: true, message: 'Sample data created successfully' };

  } catch (error) {
    console.error('Error creating sample business data:', error);
    throw error;
  }
};