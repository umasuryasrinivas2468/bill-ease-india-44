import { useInvoices } from './useInvoices';
import { useClients } from './useClients';
import { useMemo } from 'react';

interface GSTCalculation {
  taxableValue: number;
  integratedTax: number;
  centralTax: number;
  stateUTTax: number;
  cessTax: number;
}

interface GSTCalculationPartial {
  taxableValue?: number;
  integratedTax: number;
  centralTax?: number;
  stateUTTax?: number;
  cessTax: number;
}

interface GST3Data {
  outwardSupplies: {
    outwardTaxableOther: GSTCalculation;
    outwardTaxableZero: GSTCalculationPartial;
    otherOutwardNilExempt: { taxableValue: number };
    inwardLiableReverse: GSTCalculation;
    nonGSTOutward: { taxableValue: number };
  };
  suppliesNotified: {
    electronicCommerceOperatorPays: GSTCalculation;
    registeredPersonThroughECommerce: { taxableValue: number };
  };
  interStateSupplies: {
    unregisteredPersons: Array<{ placeOfSupply: string; taxableValue: number; integratedTax: number }>;
    compositionTaxablePersons: Array<{ placeOfSupply: string; taxableValue: number; integratedTax: number }>;
    uinHolders: { message: string };
  };
  eligibleITC: {
    importGoods: { integratedTax: number; cessTax: number };
    importServices: { integratedTax: number; cessTax: number };
    inwardLiableReverse: { integratedTax: number; centralTax: number; stateUTTax: number; cessTax: number };
    inwardFromISD: { message: string };
    allOtherITC: { integratedTax: number; centralTax: number; stateUTTax: number; cessTax: number };
  };
  exemptSupplies: {
    compositionScheme: { interState: number; intraState: number };
    nonGSTSupply: { interState: number; intraState: number };
  };
}

export const useGST3Data = () => {
  const { data: invoices = [] } = useInvoices();
  const { data: clients = [] } = useClients();

  const gst3Data = useMemo((): GST3Data => {
    // Filter only paid invoices for GST calculations
    const paidInvoices = invoices.filter(invoice => invoice.status === 'paid');

    // Calculate outward taxable supplies
    const outwardTaxableOther = paidInvoices.reduce((acc, invoice) => {
      const gstRate = Number(invoice.gst_rate) || 0;
      const totalAmount = Number(invoice.total_amount) || 0;
      const gstAmount = Number(invoice.gst_amount) || 0;
      const taxableValue = totalAmount - gstAmount;

      // For simplicity, assume all are intrastate (CGST + SGST) unless GST rate is 0
      // In real implementation, you'd determine this based on client location vs business location
      const isZeroRated = gstRate === 0;

      if (!isZeroRated) {
        acc.taxableValue += taxableValue;
        // Split GST equally between central and state for intrastate
        acc.centralTax += gstAmount / 2;
        acc.stateUTTax += gstAmount / 2;
      }

      return acc;
    }, { taxableValue: 0, integratedTax: 0, centralTax: 0, stateUTTax: 0, cessTax: 0 });

    // Calculate zero-rated supplies (assuming export-like or nil-rated)
    const zeroRatedInvoices = paidInvoices.filter(invoice => Number(invoice.gst_rate) === 0);
    const outwardTaxableZero = zeroRatedInvoices.reduce((acc, invoice) => {
      const totalAmount = Number(invoice.total_amount) || 0;
      acc.taxableValue = (acc.taxableValue || 0) + totalAmount;
      return acc;
    }, { taxableValue: 0, integratedTax: 0, cessTax: 0 });

    // Calculate nil-rated and exempted supplies
    const otherOutwardNilExempt = {
      taxableValue: zeroRatedInvoices.reduce((sum, invoice) => sum + Number(invoice.total_amount), 0)
    };

    // Calculate interstate supplies - for now, assume based on client GST number format
    const interStateSupplies = paidInvoices
      .filter(invoice => {
        // Simple heuristic: if client has GST number, check if different state code
        const clientGstNumber = invoice.client_gst_number || '';
        return clientGstNumber.length >= 2; // Has state code
      })
      .reduce((acc, invoice) => {
        const clientGstNumber = invoice.client_gst_number || '';
        const stateCode = clientGstNumber.substring(0, 2);
        const placeOfSupply = `State Code: ${stateCode}`;
        const taxableValue = Number(invoice.total_amount) - Number(invoice.gst_amount);
        const integratedTax = Number(invoice.gst_amount);

        const existing = acc.find(item => item.placeOfSupply === placeOfSupply);
        if (existing) {
          existing.taxableValue += taxableValue;
          existing.integratedTax += integratedTax;
        } else {
          acc.push({
            placeOfSupply,
            taxableValue,
            integratedTax
          });
        }

        return acc;
      }, [] as Array<{ placeOfSupply: string; taxableValue: number; integratedTax: number }>);

    return {
      outwardSupplies: {
        outwardTaxableOther,
        outwardTaxableZero,
        otherOutwardNilExempt,
        inwardLiableReverse: { taxableValue: 0, integratedTax: 0, centralTax: 0, stateUTTax: 0, cessTax: 0 },
        nonGSTOutward: { taxableValue: 0 }
      },
      suppliesNotified: {
        electronicCommerceOperatorPays: { taxableValue: 0, integratedTax: 0, centralTax: 0, stateUTTax: 0, cessTax: 0 },
        registeredPersonThroughECommerce: { taxableValue: 0 }
      },
      interStateSupplies: {
        unregisteredPersons: interStateSupplies,
        compositionTaxablePersons: [],
        uinHolders: { message: "We are not tracking supplies made to UIN holders" }
      },
      eligibleITC: {
        importGoods: { integratedTax: 0, cessTax: 0 },
        importServices: { integratedTax: 0, cessTax: 0 },
        inwardLiableReverse: { integratedTax: 0, centralTax: 0, stateUTTax: 0, cessTax: 0 },
        inwardFromISD: { message: "- - -We do not support in Aczen Bilz- - -" },
        allOtherITC: { integratedTax: 0, centralTax: 0, stateUTTax: 0, cessTax: 0 }
      },
      exemptSupplies: {
        compositionScheme: { interState: 0, intraState: 0 },
        nonGSTSupply: { interState: 0, intraState: 0 }
      }
    };
  }, [invoices, clients]);

  // Calculate totals for the summary row
  const totals = useMemo(() => {
    const { outwardSupplies } = gst3Data;
    return {
      taxableValue: outwardSupplies.outwardTaxableOther.taxableValue + 
                   (outwardSupplies.outwardTaxableZero.taxableValue || 0) + 
                   outwardSupplies.otherOutwardNilExempt.taxableValue + 
                   outwardSupplies.inwardLiableReverse.taxableValue + 
                   outwardSupplies.nonGSTOutward.taxableValue,
      integratedTax: outwardSupplies.outwardTaxableOther.integratedTax + 
                    outwardSupplies.outwardTaxableZero.integratedTax + 
                    outwardSupplies.inwardLiableReverse.integratedTax,
      centralTax: outwardSupplies.outwardTaxableOther.centralTax + 
                 outwardSupplies.inwardLiableReverse.centralTax,
      stateUTTax: outwardSupplies.outwardTaxableOther.stateUTTax + 
                 outwardSupplies.inwardLiableReverse.stateUTTax,
      cessTax: outwardSupplies.outwardTaxableOther.cessTax + 
              outwardSupplies.outwardTaxableZero.cessTax + 
              outwardSupplies.inwardLiableReverse.cessTax
    };
  }, [gst3Data]);

  return { gst3Data, totals };
};