import { 
  ITR6FormData, 
  ITR6Json, 
  STATE_CODES,
  KeyPerson,
  ShareHolderInfo
} from '@/types/itr6';

interface BusinessInfo {
  businessName: string;
  ownerName: string;
  email: string;
  phone: string;
  gstNumber: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
  currency: string;
  pan?: string;
  cin?: string;
  dateOfIncorporation?: string;
}

interface FinancialData {
  totalRevenue: number;
  totalExpenses: number;
  grossProfit: number;
  netProfit: number;
  totalAssets: number;
  totalLiabilities: number;
  shareCapital: number;
  reservesAndSurplus: number;
  currentAssets: number;
  currentLiabilities: number;
  fixedAssets: number;
  cgst: number;
  sgst: number;
  igst: number;
  expenseBreakdown: {
    salaries: number;
    rent: number;
    utilities: number;
    professional: number;
    travel: number;
    depreciation: number;
    other: number;
  };
}

interface Director {
  name: string;
  pan: string;
  din: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  designation: string;
  shareholdingPercent?: number;
}

function formatDate(date: string): string {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getStateCode(state: string): string {
  const normalized = state.toLowerCase().trim();
  return STATE_CODES[normalized] || '36'; // Default to Telangana
}

function generateDigest(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  let result = '';
  for (let i = 0; i < 44; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export function generateITR6Json(
  formData: ITR6FormData,
  businessInfo: BusinessInfo,
  financialData: FinancialData,
  directors: Director[],
  bankDetails?: { accountNumber: string; ifscCode: string; bankName: string }
): ITR6Json {
  const today = new Date();
  const jsonCreationDate = formatDate(today.toISOString());
  const stateCode = getStateCode(businessInfo.state);
  
  // Parse phone number
  const phoneNumber = parseInt(businessInfo.phone.replace(/\D/g, '').slice(-10)) || 0;
  const pincode = parseInt(businessInfo.pincode) || 0;

  // Create KeyPersons from directors
  const keyPersons: KeyPerson[] = directors.map(dir => ({
    PersonName: dir.name.toUpperCase(),
    Designation: dir.designation === 'director' ? 'DIR' : dir.designation.toUpperCase(),
    AddressDetailWithZipCode: {
      AddrDetail: dir.address.toUpperCase(),
      CityOrTownOrDistrict: dir.city.toUpperCase(),
      StateCode: getStateCode(dir.state),
      CountryCode: '91',
      PinCode: parseInt(dir.pincode) || pincode,
    },
    KeyPerPAN: dir.pan.toUpperCase(),
    DirectorIdNo: dir.din,
  }));

  // Create ShareHolderInfo from directors with shareholding
  const shareholders: ShareHolderInfo[] = directors
    .filter(dir => dir.shareholdingPercent && dir.shareholdingPercent > 0)
    .map(dir => ({
      ShareHolderInfoName: dir.name.toUpperCase(),
      AddressDetailWithZipCode: {
        AddrDetail: dir.address.toUpperCase(),
        CityOrTownOrDistrict: dir.city.toUpperCase(),
        StateCode: getStateCode(dir.state),
        CountryCode: '91',
        PinCode: parseInt(dir.pincode) || pincode,
      },
      PercentageOfShare: dir.shareholdingPercent || 0,
      ShareHolderPAN: dir.pan.toUpperCase(),
    }));

  // Calculate financial figures
  const grossProfit = Math.round(financialData.grossProfit);
  const totalExpenses = Math.round(financialData.totalExpenses);
  const netProfit = Math.round(financialData.netProfit);
  const pbt = netProfit; // Profit Before Tax

  const itr6: ITR6Json = {
    ITR: {
      ITR6: {
        CreationInfo: {
          SWVersionNo: '1568',
          SWCreatedBy: 'SW20000029',
          JSONCreatedBy: 'SW20000029',
          JSONCreationDate: jsonCreationDate,
          IntermediaryCity: businessInfo.city,
          Digest: generateDigest(),
        },
        Form_ITR6: {
          FormName: 'ITR-6',
          Description: 'For Companies other than companies claiming exemption under section 11',
          AssessmentYear: formData.assessmentYear,
          SchemaVer: 'Ver1.0',
          FormVer: 'Ver1.0',
        },
        PartA_GEN1: {
          OrgFirmInfo: {
            AssesseeName: {
              SurNameOrOrgName: businessInfo.businessName.toUpperCase(),
            },
            PAN: (businessInfo.pan || '').toUpperCase(),
            CINissuedByMCA: (businessInfo.cin || '').toUpperCase(),
            Address: {
              ResidenceNo: businessInfo.address,
              RoadOrStreet: '',
              LocalityOrArea: businessInfo.city,
              CityOrTownOrDistrict: businessInfo.city,
              StateCode: stateCode,
              CountryCode: '91',
              PinCode: pincode,
              CountryCodeMobile: 91,
              MobileNo: phoneNumber,
              EmailAddress: businessInfo.email,
            },
            DateOFFormOrIncorp: businessInfo.dateOfIncorporation || formatDate(today.toISOString()),
            StatusOrCompanyType: '7', // Private Limited Company
            DomesticCompFlg: 'Y',
          },
          FilingStatus: {
            ReturnFileSec: {
              IncomeTaxSec: formData.filingSectionCode,
            },
            ResidentialStatus: 'RES',
            Section115BA: formData.section115BAA ? 'Y' : 'NA',
            Section115CurrAY: formData.section115BAA ? 'Y' : 'N',
            GrossReceipt: financialData.totalRevenue > 10000000 ? 'Y' : 'N',
            FinancialStmtFlag: 'N',
            IsIfsc: 'N',
            UnderLiquidation: 'N',
            FiiFpiFlag: 'N',
            Sec581AFlag: 'N',
            AsseseeRepFlg: 'N',
            StartUpDPIITFlag: formData.startupDPIITFlag ? 'Y' : 'N',
            ...(formData.startupDPIITFlag && formData.dpiitRecognitionNumber && {
              RecgnNumAllottedByDPIIT: formData.dpiitRecognitionNumber,
            }),
            InterMinisterialCertFlag: formData.interMinisterialCertFlag ? 'Y' : 'N',
            Form2AccordPara5DPIITFlag: formData.form2AccordPara5Flag ? 'Y' : 'N',
            ItrFilingDueDate: formData.itrFilingDueDate,
            ifMSME: formData.msmeRegistered ? 'Y' : 'N',
            ...(formData.msmeRegistered && formData.udyamNumber && {
              RegNumMSMEDAct2006: formData.udyamNumber,
            }),
          },
        },
        PartA_GEN2For6: {
          LiableSec44AAflg: 'Y',
          IncDclrdUs: 'N',
          TotalSalesExcOneCr: financialData.totalRevenue > 10000000 ? 'N' : 'Y',
          LiableSec44ABflg: formData.auditApplicable ? 'Y' : 'N',
          LiableSec92Eflg: 'N',
          AccountAuditFlag: formData.auditApplicable ? 'Y' : 'N',
          ...(formData.auditApplicable && {
            AuditReportDetails: [{
              AuditReportAct: '6',
              AuditReportSection: formData.auditSection,
              OtherITActFlag: formData.form3CDStatus ? 'Y' : 'N',
              AuditReportDate: formData.auditReportDate,
            }],
          }),
          HoldingStatus: {
            NatOfCompFlg: '4', // Private Company
          },
          KeyPersons: keyPersons.length > 0 ? keyPersons : [{
            PersonName: businessInfo.ownerName.toUpperCase(),
            Designation: 'DIR',
            AddressDetailWithZipCode: {
              AddrDetail: businessInfo.address.toUpperCase(),
              CityOrTownOrDistrict: businessInfo.city.toUpperCase(),
              StateCode: stateCode,
              CountryCode: '91',
              PinCode: pincode,
            },
            KeyPerPAN: formData.signatoryPAN.toUpperCase(),
            DirectorIdNo: '',
          }],
          ShareHolderInfo: shareholders.length > 0 ? shareholders : [{
            ShareHolderInfoName: businessInfo.ownerName.toUpperCase(),
            AddressDetailWithZipCode: {
              AddrDetail: businessInfo.address.toUpperCase(),
              CityOrTownOrDistrict: businessInfo.city.toUpperCase(),
              StateCode: stateCode,
              CountryCode: '91',
              PinCode: pincode,
            },
            PercentageOfShare: 100,
            ShareHolderPAN: formData.signatoryPAN.toUpperCase(),
          }],
          NatureOfComp: {
            PubSectCompUs2_36AFlg: 'N',
            RBICompFlg: 'N',
            CompLes40PercSharGovRBIFlg: 'N',
            BankCompUs5Flg: 'N',
            SchedBankOfRBIActFlg: 'N',
            CompWithIRDARegisterFlg: 'N',
            NonBankFIICompFlg: 'N',
            CompanyUnlistedFlag: 'Y',
          },
          NatOfBus: {
            NatureOfBusiness: [{
              Code: formData.businessCode,
              TradeName1: businessInfo.businessName.toUpperCase(),
            }],
          },
        },
        PARTA_BSFor6FrmAY13: generateBalanceSheet(financialData),
        TradingAccount: generateTradingAccount(financialData),
        PARTA_PL: generateProfitAndLoss(financialData, formData),
        CorpScheduleBP: generateScheduleBP(financialData, formData),
        ...(formData.broughtForwardLosses.length > 0 && {
          ScheduleBFLA: generateScheduleBFLA(formData.broughtForwardLosses),
          ScheduleCFL: generateScheduleCFL(formData.broughtForwardLosses),
        }),
        ...(formData.matApplicable && {
          ScheduleMAT: generateScheduleMAT(financialData),
        }),
        ...(formData.tdsDetails.length > 0 && {
          ScheduleTDS1: generateScheduleTDS1(formData.tdsDetails),
        }),
        ...(formData.advanceTax.length > 0 && {
          ScheduleIT: generateScheduleIT(formData.advanceTax),
        }),
        ScheduleTaxPaid: generateScheduleTaxPaid(formData),
        PartBTI: generatePartBTI(financialData, formData),
        PartBTTI: generatePartBTTI(financialData, formData),
        Verification: {
          Declaration: {
            AssesseeVerName: formData.signatoryName.toUpperCase(),
            AssesseeVerPAN: formData.signatoryPAN.toUpperCase(),
            FatherName: '',
            Designation: formData.signatoryDesignation.toUpperCase(),
          },
          Place: formData.signatoryPlace.toUpperCase(),
          Date: formData.signatoryDate,
          Capacity: 'D', // Director
        },
      },
    },
  };

  return itr6;
}

function generateBalanceSheet(financialData: FinancialData): any {
  return {
    EquityAndLiablities: {
      ShareHolderFund: {
        ShareCapital: {
          Authorised: Math.round(financialData.shareCapital * 10),
          IssuedSubsPaidUp: Math.round(financialData.shareCapital),
          SubscribedNotFullyPaid: 0,
          TotShareCapital: Math.round(financialData.shareCapital),
        },
        ResrNSurp: {
          CapResr: 0,
          CapRedempResr: 0,
          SecurPremResr: 0,
          DebunRedResr: 0,
          RevResr: 0,
          ShareOptOSAmount: 0,
          OtherResrvTotal: 0,
          PLAccount: Math.round(financialData.reservesAndSurplus),
          TotResrNSurp: Math.round(financialData.reservesAndSurplus),
        },
        MoneyRecvdAgainstShares: 0,
        TotShareHolderFund: Math.round(financialData.shareCapital + financialData.reservesAndSurplus),
      },
      NonCurrLiabilities: {
        TotalNonCurrLiabilites: 0,
      },
      CurrentLiabilities: {
        TotCurrLiabilitiesProvision: Math.round(financialData.currentLiabilities),
      },
      TotEquityAndLiabilities: Math.round(financialData.totalLiabilities),
    },
    Assets: {
      NonCurrAssets: {
        FixedAsset: {
          TotFixedAsset: Math.round(financialData.fixedAssets),
        },
        TotNonCurrAssets: Math.round(financialData.fixedAssets),
      },
      CurrentAssets: {
        TotCurrAssets: Math.round(financialData.currentAssets),
      },
    },
    TotalAssets: Math.round(financialData.totalAssets),
  };
}

function generateTradingAccount(financialData: FinancialData): any {
  return {
    SaleOfServices: Math.round(financialData.totalRevenue),
    OperatingRevenueTotal: 0,
    SalesGrossReceiptsTotal: Math.round(financialData.totalRevenue),
    ExciseCustomsVAT: {
      TotExciseCustomsVAT: 0,
    },
    TotRevenueFrmOperations: Math.round(financialData.totalRevenue),
    TardingAccTotCred: Math.round(financialData.totalRevenue),
    DirectExpenses: 0,
    TotOthDirectExpenses: 0,
    DutyTaxPay: {
      ExciseCustomsVAT: {
        TotExciseCustomsVAT: 0,
      },
    },
    GoodsCostPrdcdFrmMA: 0,
    GrossProfitFrmBusProf: Math.round(financialData.grossProfit),
  };
}

function generateProfitAndLoss(financialData: FinancialData, formData: ITR6FormData): any {
  const expenses = financialData.expenseBreakdown;
  const otherExpenses = formData.disallowableExpenses.reduce((sum, exp) => sum + exp.amount, 0);
  
  return {
    CreditsToPL: {
      GrossProfitTrnsfFrmTrdAcc: Math.round(financialData.grossProfit),
      OthIncome: {
        RentInc: 0,
        Comissions: 0,
        Dividends: 0,
        InterestInc: 0,
        ProfitOnSaleFixedAsset: 0,
        MiscOthIncome: 0,
        TotOthIncome: 0,
      },
      TotCreditsToPL: Math.round(financialData.grossProfit),
    },
    DebitsToPL: {
      DebitPlAcnt: {
        Freight: 0,
        ConsumptionOfStores: 0,
        PowerFuel: Math.round(expenses.utilities),
        RentExpdr: Math.round(expenses.rent),
        RepairsBldg: 0,
        RepairMach: 0,
        EmployeeComp: {
          SalsWages: Math.round(expenses.salaries),
          Bonus: 0,
          TotEmployeeComp: Math.round(expenses.salaries),
        },
        ProfessionalConstDtls: {
          NonResOtherCompany: 0,
          Others: Math.round(expenses.professional),
          Total: Math.round(expenses.professional),
        },
        TravelExp: Math.round(expenses.travel),
        OtherExpenses: Math.round(expenses.other + otherExpenses),
        DepreciationAmort: Math.round(expenses.depreciation),
        PBIDTA: Math.round(financialData.netProfit + expenses.depreciation),
        InterestExpdrtDtls: {
          NonResOtherCompany: 0,
          Others: 0,
          InterestExpdr: 0,
        },
        PBT: Math.round(financialData.netProfit),
      },
      TaxProvAppr: {
        ProvForCurrTax: 0,
        ProvDefTax: 0,
        ProfitAfterTax: Math.round(financialData.netProfit),
        BalBFPrevYr: 0,
        AmtAvlAppr: Math.round(financialData.netProfit),
        Appropriations: {
          TrfToReserves: 0,
          TotAppropriations: 0,
        },
        PartnerAccBalTrf: Math.round(financialData.netProfit),
      },
    },
    TotalNumOfMonths: 0,
    TotalPrsumptvIncUs44EGoods: 0,
    TotalPrsumptvIncUs44E: 0,
  };
}

function generateScheduleBP(financialData: FinancialData, formData: ITR6FormData): any {
  const netProfit = Math.round(financialData.netProfit);
  const disallowances = formData.disallowableExpenses.reduce((sum, exp) => sum + exp.amount, 0);
  const exemptions = formData.exemptIncomes.reduce((sum, inc) => sum + inc.amount, 0);
  
  return {
    BusinessIncOthThanSpec: {
      ProfBfrTaxPL: netProfit,
      NetPLFromSpecBus: 0,
      IncRecCredPLOthHeadDtls: {
        HouseProperty: 0,
        CapitalGains: 0,
        OtherSources: 0,
        Dividend: 0,
      },
      IncCredPL: {
        FirmShareInc: 0,
        AOPBOISharInc: 0,
        OthExempInc: Math.round(exemptions),
        TotExempInc: Math.round(exemptions),
      },
      BalancePLOthThanSpecBus: netProfit,
      ExpDebToPLExemptInc: 0,
      TotExpDebPL: 0,
      AdjustedPLOthThanSpecBus: netProfit,
      DepreciationDebPLCosAct: 0,
      DepreciationAllowITAct32: {
        TotDeprAllowITAct: Math.round(financialData.expenseBreakdown.depreciation),
      },
      AdjustPLAfterDeprOthSpecInc: netProfit,
      AmtDebPLDisallowUs36: Math.round(disallowances),
      AmtDebPLDisallowUs37: 0,
      AmtDebPLDisallowUs40: 0,
      AmtDebPLDisallowUs40A: 0,
      AmtDebPLDisallowUs43B: 0,
      TotAfterAddToPLDeprOthSpecInc: Math.round(disallowances),
      TotDeductionAmts: 0,
      PLAftAdjDedBusOthThanSpec: netProfit,
      NetPLAftAdjBusOthThanSpec: netProfit,
      NetPLBusOthThanSpec7A7B7C: netProfit,
      IncomeOtherThanRule: netProfit,
    },
    IncChrgUnHdProftGain: netProfit,
    BusSetoffCurrYr: {
      LossSetOffOnBusLoss: netProfit < 0 ? Math.abs(netProfit) : 0,
      TotLossSetOffOnBus: 0,
      LossRemainSetOffOnBus: netProfit < 0 ? Math.abs(netProfit) : 0,
    },
  };
}

function generateScheduleBFLA(losses: any[]): any {
  return {
    TotalBFLossSetOff: losses.reduce((sum, l) => sum + l.amount, 0),
    AssessmentYear: losses.map(l => ({
      AssYr: l.assessmentYear,
      DateofFiling: '',
      HousePropertyLoss: l.lossType === 'house_property' ? l.amount : 0,
      BrightFwdBusLoss: l.lossType === 'business' ? l.amount : 0,
      BrightFwdSpecLoss: l.lossType === 'speculation' ? l.amount : 0,
      BrightFwdCapLoss: l.lossType === 'capital' ? l.amount : 0,
    })),
  };
}

function generateScheduleCFL(losses: any[]): any {
  return {
    LossCFFromPrev8thYearFromAY: {
      DateofFiling: '',
      CarryFwdLossSetoff: {
        BusLossSetoff: 0,
        OthSrcLossSetoff: 0,
        HPLossSetoff: 0,
      },
    },
    TotalLossCFSummary: {
      TotalHPCF: losses.filter(l => l.lossType === 'house_property').reduce((s, l) => s + l.amount, 0),
      TotalBusCF: losses.filter(l => l.lossType === 'business').reduce((s, l) => s + l.amount, 0),
      TotalSpecCF: losses.filter(l => l.lossType === 'speculation').reduce((s, l) => s + l.amount, 0),
      TotalCapCF: losses.filter(l => l.lossType === 'capital').reduce((s, l) => s + l.amount, 0),
    },
  };
}

function generateScheduleMAT(financialData: FinancialData): any {
  const bookProfit = Math.round(financialData.netProfit);
  const matRate = 0.15; // 15% MAT rate
  const matPayable = Math.round(bookProfit > 0 ? bookProfit * matRate : 0);
  
  return {
    BookProfitComputation: {
      ProfitLossAsPerBooks: bookProfit,
      AdditionUs115JB: {
        TotalAddition: 0,
      },
      DeductionUs115JB: {
        TotalDeduction: 0,
      },
      BookProfit: bookProfit,
    },
    TaxPayableUnderMAT: {
      TaxableIncUs115JB: bookProfit > 0 ? bookProfit : 0,
      TaxUs115JB: matPayable,
      SurchargeOnAbove: 0,
      EduCess: Math.round(matPayable * 0.04),
      GrossTaxPayable: Math.round(matPayable * 1.04),
    },
  };
}

function generateScheduleTDS1(tdsDetails: any[]): any {
  return {
    TDSonSalary: {
      TDSonSalaryDtls: tdsDetails.map(tds => ({
        TANofDeductor: tds.tanOfDeductor,
        NameOfDeductor: tds.deductorName,
        GrossAmtOfSalary: Math.round(tds.grossAmount),
        AmtOfTDSDeducted: Math.round(tds.tdsDeducted),
        AmtTDSClaimedThisYear: Math.round(tds.tdsClaimedThisYear),
      })),
      TotalTDSonSal: tdsDetails.reduce((sum, t) => sum + t.tdsDeducted, 0),
    },
  };
}

function generateScheduleIT(advanceTax: any[]): any {
  return {
    AdvanceTax: {
      AdvTaxDtls: advanceTax.map(tax => ({
        BSRCode: tax.bsrCode,
        DateDep: tax.dateOfDeposit,
        SrlNoOfChaln: tax.serialNumber,
        Amt: Math.round(tax.amount),
      })),
      TotalAdvanceTax: advanceTax.reduce((sum, t) => sum + t.amount, 0),
    },
  };
}

function generateScheduleTaxPaid(formData: ITR6FormData): any {
  const totalAdvanceTax = formData.advanceTax.reduce((sum, t) => sum + t.amount, 0);
  const totalSAT = formData.selfAssessmentTax.reduce((sum, t) => sum + t.amount, 0);
  const totalTDS = formData.tdsDetails.reduce((sum, t) => sum + t.tdsClaimedThisYear, 0);
  
  return {
    AdvanceTaxPaid: Math.round(totalAdvanceTax),
    SelfAssessmentTaxPaid: Math.round(totalSAT),
    TDSClaimed: Math.round(totalTDS),
    TotalTaxPaid: Math.round(totalAdvanceTax + totalSAT + totalTDS),
  };
}

function generatePartBTI(financialData: FinancialData, formData: ITR6FormData): any {
  const netProfit = Math.round(financialData.netProfit);
  const exemptions = formData.exemptIncomes.reduce((sum, inc) => sum + inc.amount, 0);
  const bfLosses = formData.broughtForwardLosses.reduce((sum, l) => sum + l.amount, 0);
  
  return {
    IncomeUnderHeadBusiness: netProfit,
    IncomeUnderHeadOther: 0,
    GrossTotalIncome: netProfit,
    DeductionsUnder80C: 0,
    DeductionsUnder80G: 0,
    TotalDeductions: 0,
    TotalIncome: netProfit > 0 ? netProfit - bfLosses : 0,
    TotalIncomeForRatePurpose: netProfit > 0 ? netProfit - bfLosses : 0,
  };
}

function generatePartBTTI(financialData: FinancialData, formData: ITR6FormData): any {
  const netProfit = Math.round(financialData.netProfit);
  const taxableIncome = netProfit > 0 ? netProfit : 0;
  
  // Calculate tax based on regime
  let taxRate = 0.25; // Default 25% for companies
  if (formData.section115BAA) {
    taxRate = 0.22; // 22% under Section 115BAA
  }
  
  const incomeTax = Math.round(taxableIncome * taxRate);
  const surcharge = taxableIncome > 10000000 ? Math.round(incomeTax * 0.10) : 0;
  const cess = Math.round((incomeTax + surcharge) * 0.04);
  const grossTax = incomeTax + surcharge + cess;
  
  const totalTaxPaid = formData.advanceTax.reduce((sum, t) => sum + t.amount, 0) +
    formData.selfAssessmentTax.reduce((sum, t) => sum + t.amount, 0) +
    formData.tdsDetails.reduce((sum, t) => sum + t.tdsClaimedThisYear, 0);
  
  const taxPayable = grossTax - totalTaxPaid;
  
  return {
    ComputationOfTaxLiability: {
      TaxPayableOnTI: {
        TaxAtNormalRates: incomeTax,
        TaxAtSpecialRates: 0,
        RebateOnAgriInc: 0,
        TaxPayOnTotInc: incomeTax,
      },
      Surcharge: surcharge,
      EducationCess: cess,
      GrossTaxLiability: grossTax,
      GrossTaxPayable: grossTax,
      CreditUs115JAA: 0,
      CreditUs115JD: 0,
      TaxPayAfterCreditUs115JAA: grossTax,
      TaxRelief: {
        Section89: 0,
        Section90: 0,
        Section91: 0,
        TotTaxRelief: 0,
      },
      NetTaxLiability: grossTax,
      InterestPayable: {
        Interest234A: 0,
        Interest234B: 0,
        Interest234C: 0,
        TotalInterest: 0,
      },
      AggregateTaxInterestLiability: grossTax,
      TaxPaid: {
        TaxesPaid: {
          AdvanceTax: Math.round(formData.advanceTax.reduce((s, t) => s + t.amount, 0)),
          TDS: Math.round(formData.tdsDetails.reduce((s, t) => s + t.tdsClaimedThisYear, 0)),
          TCS: 0,
          SelfAssessmentTax: Math.round(formData.selfAssessmentTax.reduce((s, t) => s + t.amount, 0)),
          TotalTaxesPaid: Math.round(totalTaxPaid),
        },
      },
      BalTaxPayable: taxPayable > 0 ? taxPayable : 0,
      TotalRefund: taxPayable < 0 ? Math.abs(taxPayable) : 0,
    },
    Refund: {
      RefundDue: taxPayable < 0 ? Math.abs(taxPayable) : 0,
      BankAccountDtls: {
        PrsntBankAcc: 'Y',
      },
    },
  };
}

export function downloadITR6Json(json: ITR6Json, filename: string): void {
  const jsonString = JSON.stringify(json);
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
