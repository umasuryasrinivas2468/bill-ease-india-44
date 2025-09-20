import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useGST3Data } from '@/hooks/useGST3Data';

const GST3Filing: React.FC = () => {
  const { gst3Data, totals } = useGST3Data();

  const formatCurrency = (amount: number) => `₹${amount.toFixed(2)}`;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">GST-3 Filing Report</h1>
        <div className="flex gap-2">
          <Button variant="outline">Export PDF</Button>
          <Button>File GST-3</Button>
        </div>
      </div>

      {/* Section 3.1: Outward Supplies */}
      <Card>
        <CardHeader>
          <CardTitle>3.1 Details of Outward Supplies and inward supplies liable to reverse charge</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse border border-gray-300">
              <thead>
                <tr className="bg-blue-100">
                  <th className="border border-gray-300 p-2 text-left">Nature of Supply</th>
                  <th className="border border-gray-300 p-2 text-center">Taxable Value</th>
                  <th className="border border-gray-300 p-2 text-center">Integrated Tax</th>
                  <th className="border border-gray-300 p-2 text-center">Central Tax</th>
                  <th className="border border-gray-300 p-2 text-center">State/UT Tax</th>
                  <th className="border border-gray-300 p-2 text-center">CESS Tax</th>
                </tr>
                <tr className="bg-blue-50">
                  <th className="border border-gray-300 p-2 text-center">1</th>
                  <th className="border border-gray-300 p-2 text-center">2</th>
                  <th className="border border-gray-300 p-2 text-center">3</th>
                  <th className="border border-gray-300 p-2 text-center">4</th>
                  <th className="border border-gray-300 p-2 text-center">5</th>
                  <th className="border border-gray-300 p-2 text-center">6</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border border-gray-300 p-2">(a) Outward taxable supplies (other than zero rated, nil rated and exempted)</td>
                  <td className="border border-gray-300 p-2 text-right">{formatCurrency(gst3Data.outwardSupplies.outwardTaxableOther.taxableValue)}</td>
                  <td className="border border-gray-300 p-2 text-right">{formatCurrency(gst3Data.outwardSupplies.outwardTaxableOther.integratedTax)}</td>
                  <td className="border border-gray-300 p-2 text-right">{formatCurrency(gst3Data.outwardSupplies.outwardTaxableOther.centralTax)}</td>
                  <td className="border border-gray-300 p-2 text-right">{formatCurrency(gst3Data.outwardSupplies.outwardTaxableOther.stateUTTax)}</td>
                  <td className="border border-gray-300 p-2 text-right">{formatCurrency(gst3Data.outwardSupplies.outwardTaxableOther.cessTax)}</td>
                </tr>
                <tr className="bg-gray-50">
                  <td className="border border-gray-300 p-2">(b) Outward taxable supplies (zero rated)</td>
                  <td className="border border-gray-300 p-2 text-right">{formatCurrency(gst3Data.outwardSupplies.outwardTaxableZero.taxableValue || 0)}</td>
                  <td className="border border-gray-300 p-2 text-right">{formatCurrency(gst3Data.outwardSupplies.outwardTaxableZero.integratedTax)}</td>
                  <td className="border border-gray-300 p-2 text-right">-</td>
                  <td className="border border-gray-300 p-2 text-right">-</td>
                  <td className="border border-gray-300 p-2 text-right">{formatCurrency(gst3Data.outwardSupplies.outwardTaxableZero.cessTax)}</td>
                </tr>
                <tr>
                  <td className="border border-gray-300 p-2">(c) Other outward supplies (Nil rated, exempted)</td>
                  <td className="border border-gray-300 p-2 text-right">{formatCurrency(gst3Data.outwardSupplies.otherOutwardNilExempt.taxableValue)}</td>
                  <td className="border border-gray-300 p-2 text-right">-</td>
                  <td className="border border-gray-300 p-2 text-right">-</td>
                  <td className="border border-gray-300 p-2 text-right">-</td>
                  <td className="border border-gray-300 p-2 text-right">-</td>
                </tr>
                <tr className="bg-gray-50">
                  <td className="border border-gray-300 p-2">(d) Inward supplies (liable to reverse charge)</td>
                  <td className="border border-gray-300 p-2 text-right">{formatCurrency(gst3Data.outwardSupplies.inwardLiableReverse.taxableValue)}</td>
                  <td className="border border-gray-300 p-2 text-right">{formatCurrency(gst3Data.outwardSupplies.inwardLiableReverse.integratedTax)}</td>
                  <td className="border border-gray-300 p-2 text-right">{formatCurrency(gst3Data.outwardSupplies.inwardLiableReverse.centralTax)}</td>
                  <td className="border border-gray-300 p-2 text-right">{formatCurrency(gst3Data.outwardSupplies.inwardLiableReverse.stateUTTax)}</td>
                  <td className="border border-gray-300 p-2 text-right">{formatCurrency(gst3Data.outwardSupplies.inwardLiableReverse.cessTax)}</td>
                </tr>
                <tr>
                  <td className="border border-gray-300 p-2">(e) Non-GST outward supplies</td>
                  <td className="border border-gray-300 p-2 text-right">{formatCurrency(gst3Data.outwardSupplies.nonGSTOutward.taxableValue)}</td>
                  <td className="border border-gray-300 p-2 text-right">-</td>
                  <td className="border border-gray-300 p-2 text-right">-</td>
                  <td className="border border-gray-300 p-2 text-right">-</td>
                  <td className="border border-gray-300 p-2 text-right">-</td>
                </tr>
                <tr className="bg-blue-50 font-semibold">
                  <td className="border border-gray-300 p-2">Total value</td>
                  <td className="border border-gray-300 p-2 text-right">{formatCurrency(totals.taxableValue)}</td>
                  <td className="border border-gray-300 p-2 text-right">{formatCurrency(totals.integratedTax)}</td>
                  <td className="border border-gray-300 p-2 text-right">{formatCurrency(totals.centralTax)}</td>
                  <td className="border border-gray-300 p-2 text-right">{formatCurrency(totals.stateUTTax)}</td>
                  <td className="border border-gray-300 p-2 text-right">{formatCurrency(totals.cessTax)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Section 3.1.1: Supplies notified under sub-section */}
      <Card>
        <CardHeader>
          <CardTitle>3.1.1 Details of supplies notified under sub-section (5) of section 9 of the Central Goods and Services Tax Act</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse border border-gray-300">
              <thead>
                <tr className="bg-blue-100">
                  <th className="border border-gray-300 p-2 text-left">Description</th>
                  <th className="border border-gray-300 p-2 text-center">Taxable Value</th>
                  <th className="border border-gray-300 p-2 text-center">Integrated Tax</th>
                  <th className="border border-gray-300 p-2 text-center">Central Tax</th>
                  <th className="border border-gray-300 p-2 text-center">State/UT Tax</th>
                  <th className="border border-gray-300 p-2 text-center">CESS Tax</th>
                </tr>
                <tr className="bg-blue-50">
                  <th className="border border-gray-300 p-2 text-center">1</th>
                  <th className="border border-gray-300 p-2 text-center">2</th>
                  <th className="border border-gray-300 p-2 text-center">3</th>
                  <th className="border border-gray-300 p-2 text-center">4</th>
                  <th className="border border-gray-300 p-2 text-center">5</th>
                  <th className="border border-gray-300 p-2 text-center">6</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border border-gray-300 p-2">
                    <strong>(i) Taxable supplies on which electronic commerce operator pays tax under Sub-section (5) of Section 9</strong>
                    <br />
                    <span className="text-sm text-gray-600">[To be furnished by the electronic commerce operator]</span>
                  </td>
                  <td className="border border-gray-300 p-2 text-right">0</td>
                  <td className="border border-gray-300 p-2 text-right">0</td>
                  <td className="border border-gray-300 p-2 text-right">0</td>
                  <td className="border border-gray-300 p-2 text-right">0</td>
                  <td className="border border-gray-300 p-2 text-right">0</td>
                </tr>
                <tr className="bg-gray-50">
                  <td className="border border-gray-300 p-2">
                    <strong>(ii) Taxable supplies made by the registered person through electronic commerce operator, on which electronic commerce operator is required to pay tax under Sub-section (5) of Section 9</strong>
                    <br />
                    <span className="text-sm text-gray-600">[To be furnished by the registered person making supplies through electronic commerce operator]</span>
                  </td>
                  <td className="border border-gray-300 p-2 text-right">{formatCurrency(gst3Data.suppliesNotified.registeredPersonThroughECommerce.taxableValue)}</td>
                  <td className="border border-gray-300 p-2 text-right">-</td>
                  <td className="border border-gray-300 p-2 text-right">-</td>
                  <td className="border border-gray-300 p-2 text-right">-</td>
                  <td className="border border-gray-300 p-2 text-right">-</td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Section 3.2: Inter-State Supplies */}
      <Card>
        <CardHeader>
          <CardTitle>3.2 Of the supplies shown in 3.1 (a) above, details of inter-State supplies made to unregistered persons, composition taxable persons and UIN holders</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse border border-gray-300">
              <thead>
                <tr className="bg-blue-100">
                  <th className="border border-gray-300 p-2 text-left">Place of Supply</th>
                  <th className="border border-gray-300 p-2 text-center">Taxable Value</th>
                  <th className="border border-gray-300 p-2 text-center">Integrated Tax</th>
                </tr>
                <tr className="bg-blue-50">
                  <th className="border border-gray-300 p-2 text-center">1</th>
                  <th className="border border-gray-300 p-2 text-center">2</th>
                  <th className="border border-gray-300 p-2 text-center">3</th>
                  <th className="border border-gray-300 p-2 text-center">4</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border border-gray-300 p-2 font-medium">Supplies made to Unregistered Persons</td>
                  <td className="border border-gray-300 p-2"></td>
                  <td className="border border-gray-300 p-2"></td>
                  <td className="border border-gray-300 p-2"></td>
                </tr>
                <tr className="bg-gray-50">
                  <td className="border border-gray-300 p-2 font-medium">Supplies made to Composition Taxable Persons</td>
                  <td className="border border-gray-300 p-2"></td>
                  <td className="border border-gray-300 p-2"></td>
                  <td className="border border-gray-300 p-2"></td>
                </tr>
                <tr>
                  <td className="border border-gray-300 p-2 font-medium">Supplies made to UIN holders</td>
                  <td className="border border-gray-300 p-2 text-center text-gray-600" colSpan={3}>We are not tracking supplies made to UIN holders</td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Section 4: Eligible ITC */}
      <Card>
        <CardHeader>
          <CardTitle>4. Eligible ITC</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse border border-gray-300">
              <thead>
                <tr className="bg-orange-100">
                  <th className="border border-gray-300 p-2 text-left">Details</th>
                  <th className="border border-gray-300 p-2 text-center">Integrated Tax</th>
                  <th className="border border-gray-300 p-2 text-center">Central Tax</th>
                  <th className="border border-gray-300 p-2 text-center">State/UT Tax</th>
                  <th className="border border-gray-300 p-2 text-center">CESS Tax</th>
                </tr>
                <tr className="bg-orange-50">
                  <th className="border border-gray-300 p-2 text-center">1</th>
                  <th className="border border-gray-300 p-2 text-center">2</th>
                  <th className="border border-gray-300 p-2 text-center">3</th>
                  <th className="border border-gray-300 p-2 text-center">4</th>
                  <th className="border border-gray-300 p-2 text-center">5</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border border-gray-300 p-2">(A) ITC Available (whether in full or part)</td>
                  <td className="border border-gray-300 p-2"></td>
                  <td className="border border-gray-300 p-2"></td>
                  <td className="border border-gray-300 p-2"></td>
                  <td className="border border-gray-300 p-2"></td>
                </tr>
                <tr>
                  <td className="border border-gray-300 p-2 pl-6">(1) Import of Goods</td>
                  <td className="border border-gray-300 p-2 text-right">{formatCurrency(gst3Data.eligibleITC.importGoods.integratedTax)}</td>
                  <td className="border border-gray-300 p-2 text-right">-</td>
                  <td className="border border-gray-300 p-2 text-right">-</td>
                  <td className="border border-gray-300 p-2 text-right">{formatCurrency(gst3Data.eligibleITC.importGoods.cessTax)}</td>
                </tr>
                <tr className="bg-gray-50">
                  <td className="border border-gray-300 p-2 pl-6">(2) Import of Services</td>
                  <td className="border border-gray-300 p-2 text-right">{formatCurrency(gst3Data.eligibleITC.importServices.integratedTax)}</td>
                  <td className="border border-gray-300 p-2 text-right">-</td>
                  <td className="border border-gray-300 p-2 text-right">-</td>
                  <td className="border border-gray-300 p-2 text-right">{formatCurrency(gst3Data.eligibleITC.importServices.cessTax)}</td>
                </tr>
                <tr>
                  <td className="border border-gray-300 p-2 pl-6">(3) Inward supplies liable to reverse charge ( other than 1 & 2 above)</td>
                  <td className="border border-gray-300 p-2 text-right">{formatCurrency(gst3Data.eligibleITC.inwardLiableReverse.integratedTax)}</td>
                  <td className="border border-gray-300 p-2 text-right">{formatCurrency(gst3Data.eligibleITC.inwardLiableReverse.centralTax)}</td>
                  <td className="border border-gray-300 p-2 text-right">{formatCurrency(gst3Data.eligibleITC.inwardLiableReverse.stateUTTax)}</td>
                  <td className="border border-gray-300 p-2 text-right">{formatCurrency(gst3Data.eligibleITC.inwardLiableReverse.cessTax)}</td>
                </tr>
                <tr className="bg-gray-50">
                  <td className="border border-gray-300 p-2 pl-6">(4) Inward supplies from ISD</td>
                  <td className="border border-gray-300 p-2 text-center text-gray-600" colSpan={4}>{gst3Data.eligibleITC.inwardFromISD.message}</td>
                </tr>
                <tr>
                  <td className="border border-gray-300 p-2 pl-6">(5) All other ITC</td>
                  <td className="border border-gray-300 p-2 text-right">{formatCurrency(gst3Data.eligibleITC.allOtherITC.integratedTax)}</td>
                  <td className="border border-gray-300 p-2 text-right">{formatCurrency(gst3Data.eligibleITC.allOtherITC.centralTax)}</td>
                  <td className="border border-gray-300 p-2 text-right">{formatCurrency(gst3Data.eligibleITC.allOtherITC.stateUTTax)}</td>
                  <td className="border border-gray-300 p-2 text-right">{formatCurrency(gst3Data.eligibleITC.allOtherITC.cessTax)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Section 5: Exempt Supplies */}
      <Card>
        <CardHeader>
          <CardTitle>5. Values of exempt, nil-rated and non-GST inward supplies</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse border border-gray-300">
              <thead>
                <tr className="bg-orange-100">
                  <th className="border border-gray-300 p-2 text-left">Nature of Supply</th>
                  <th className="border border-gray-300 p-2 text-center">Inter-State Supplies</th>
                  <th className="border border-gray-300 p-2 text-center">Intra-State Supplies</th>
                </tr>
                <tr className="bg-orange-50">
                  <th className="border border-gray-300 p-2 text-center">1</th>
                  <th className="border border-gray-300 p-2 text-center">2</th>
                  <th className="border border-gray-300 p-2 text-center">3</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border border-gray-300 p-2">Composition Scheme, Exempted, Nil Rated</td>
                  <td className="border border-gray-300 p-2 text-right">{formatCurrency(gst3Data.exemptSupplies.compositionScheme.interState)}</td>
                  <td className="border border-gray-300 p-2 text-right">{formatCurrency(gst3Data.exemptSupplies.compositionScheme.intraState)}</td>
                </tr>
                <tr className="bg-gray-50">
                  <td className="border border-gray-300 p-2">Non-GST supply</td>
                  <td className="border border-gray-300 p-2 text-right">{formatCurrency(gst3Data.exemptSupplies.nonGSTSupply.interState)}</td>
                  <td className="border border-gray-300 p-2 text-right">{formatCurrency(gst3Data.exemptSupplies.nonGSTSupply.intraState)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-center mt-6">
        <p className="text-sm text-gray-600">Generated from Aczen Dashboard</p>
      </div>
    </div>
  );
};

export default GST3Filing;