export interface ITR6FormData {
  // Assessment Details
  assessmentYear: string;
  filingType: 'original' | 'revised' | 'belated';
  filingSectionCode: number;
  itrFilingDueDate: string;

  // Tax Regime Options
  section115BAA: boolean;
  matApplicable: boolean;

  // Startup/MSME Status
  startupDPIITFlag: boolean;
  dpiitRecognitionNumber: string;
  interMinisterialCertFlag: boolean;
  form2AccordPara5Flag: boolean;
  
  msmeRegistered: boolean;
  udyamNumber: string;

  // Audit Details
  auditApplicable: boolean;
  auditType: string;
  auditSection: string;
  auditReportDate: string;
  form3CDStatus: boolean;

  // Nature of Business
  natureOfBusiness: 'services' | 'trading' | 'manufacturing';
  businessCode: string;

  // Disallowable Expenses
  disallowableExpenses: DisallowableExpense[];

  // Exempt Income
  exemptIncomes: ExemptIncome[];

  // Brought Forward Losses
  broughtForwardLosses: BroughtForwardLoss[];

  // Tax Payments
  advanceTax: AdvanceTaxPayment[];
  selfAssessmentTax: SelfAssessmentTaxPayment[];
  tdsDetails: TDSDetail[];

  // Authorized Signatory
  signatoryName: string;
  signatoryPAN: string;
  signatoryDesignation: string;
  signatoryPlace: string;
  signatoryDate: string;
}

export interface DisallowableExpense {
  section: string;
  description: string;
  amount: number;
}

export interface ExemptIncome {
  section: string;
  description: string;
  amount: number;
}

export interface BroughtForwardLoss {
  assessmentYear: string;
  lossType: 'business' | 'speculation' | 'capital' | 'house_property';
  amount: number;
}

export interface AdvanceTaxPayment {
  bsrCode: string;
  dateOfDeposit: string;
  serialNumber: string;
  amount: number;
}

export interface SelfAssessmentTaxPayment {
  bsrCode: string;
  dateOfDeposit: string;
  serialNumber: string;
  amount: number;
}

export interface TDSDetail {
  tanOfDeductor: string;
  deductorName: string;
  grossAmount: number;
  tdsDeducted: number;
  tdsClaimedThisYear: number;
}

export interface ITR6Json {
  ITR: {
    ITR6: {
      CreationInfo: CreationInfo;
      Form_ITR6: FormITR6;
      PartA_GEN1: PartA_GEN1;
      PartA_GEN2For6: PartA_GEN2For6;
      PARTA_BSFor6FrmAY13: any;
      TradingAccount: any;
      PARTA_PL: any;
      CorpScheduleBP: any;
      ScheduleCG?: any;
      ScheduleOS?: any;
      ScheduleBFLA?: any;
      ScheduleCFL?: any;
      ScheduleMAT?: any;
      ScheduleSI?: any;
      ScheduleTDS1?: any;
      ScheduleTDS2?: any;
      ScheduleIT?: any;
      ScheduleTCS?: any;
      ScheduleTaxPaid?: any;
      PartBTI?: any;
      PartBTTI?: any;
      Verification?: Verification;
    };
  };
}

export interface CreationInfo {
  SWVersionNo: string;
  SWCreatedBy: string;
  JSONCreatedBy: string;
  JSONCreationDate: string;
  IntermediaryCity: string;
  Digest: string;
}

export interface FormITR6 {
  FormName: string;
  Description: string;
  AssessmentYear: string;
  SchemaVer: string;
  FormVer: string;
}

export interface PartA_GEN1 {
  OrgFirmInfo: {
    AssesseeName: {
      SurNameOrOrgName: string;
    };
    PAN: string;
    CINissuedByMCA: string;
    Address: {
      ResidenceNo: string;
      RoadOrStreet: string;
      LocalityOrArea: string;
      CityOrTownOrDistrict: string;
      StateCode: string;
      CountryCode: string;
      PinCode: number;
      CountryCodeMobile: number;
      MobileNo: number;
      EmailAddress: string;
    };
    DateOFFormOrIncorp: string;
    StatusOrCompanyType: string;
    DomesticCompFlg: string;
  };
  FilingStatus: {
    ReturnFileSec: {
      IncomeTaxSec: number;
    };
    ResidentialStatus: string;
    Section115BA: string;
    Section115CurrAY: string;
    GrossReceipt: string;
    FinancialStmtFlag: string;
    IsIfsc: string;
    UnderLiquidation: string;
    FiiFpiFlag: string;
    Sec581AFlag: string;
    AsseseeRepFlg: string;
    StartUpDPIITFlag: string;
    RecgnNumAllottedByDPIIT?: string;
    InterMinisterialCertFlag: string;
    Form2AccordPara5DPIITFlag: string;
    ItrFilingDueDate: string;
    ifMSME: string;
    RegNumMSMEDAct2006?: string;
  };
}

export interface PartA_GEN2For6 {
  LiableSec44AAflg: string;
  IncDclrdUs: string;
  TotalSalesExcOneCr: string;
  LiableSec44ABflg: string;
  LiableSec92Eflg: string;
  AccountAuditFlag: string;
  AuditReportDetails?: AuditReportDetail[];
  HoldingStatus: {
    NatOfCompFlg: string;
  };
  KeyPersons: KeyPerson[];
  ShareHolderInfo: ShareHolderInfo[];
  NatureOfComp: {
    PubSectCompUs2_36AFlg: string;
    RBICompFlg: string;
    CompLes40PercSharGovRBIFlg: string;
    BankCompUs5Flg: string;
    SchedBankOfRBIActFlg: string;
    CompWithIRDARegisterFlg: string;
    NonBankFIICompFlg: string;
    CompanyUnlistedFlag: string;
  };
  NatOfBus: {
    NatureOfBusiness: {
      Code: string;
      TradeName1: string;
    }[];
  };
}

export interface AuditReportDetail {
  AuditReportAct: string;
  AuditReportSection: string;
  OtherITActFlag: string;
  AuditReportDate: string;
}

export interface KeyPerson {
  PersonName: string;
  Designation: string;
  AddressDetailWithZipCode: {
    AddrDetail: string;
    CityOrTownOrDistrict: string;
    StateCode: string;
    CountryCode: string;
    PinCode: number;
  };
  KeyPerPAN: string;
  DirectorIdNo: string;
}

export interface ShareHolderInfo {
  ShareHolderInfoName: string;
  AddressDetailWithZipCode: {
    AddrDetail: string;
    CityOrTownOrDistrict: string;
    StateCode: string;
    CountryCode: string;
    PinCode: number;
  };
  PercentageOfShare: number;
  ShareHolderPAN: string;
}

export interface Verification {
  Declaration: {
    AssesseeVerName: string;
    AssesseeVerPAN: string;
    FatherName: string;
    Designation: string;
  };
  Place: string;
  Date: string;
  Capacity: string;
}

// Business Nature Codes
export const BUSINESS_CODES = {
  services: [
    { code: '14005', name: 'IT Services / Software Development' },
    { code: '14006', name: 'Consulting Services' },
    { code: '14007', name: 'Professional Services' },
    { code: '09016', name: 'Financial Services' },
    { code: '14009', name: 'Other Services' },
  ],
  trading: [
    { code: '01001', name: 'Trading - General' },
    { code: '01002', name: 'Trading - Wholesale' },
    { code: '01003', name: 'Trading - Retail' },
    { code: '01010', name: 'Import/Export Trading' },
  ],
  manufacturing: [
    { code: '02001', name: 'Manufacturing - General' },
    { code: '02010', name: 'Manufacturing - Electronics' },
    { code: '02020', name: 'Manufacturing - Textiles' },
    { code: '02030', name: 'Manufacturing - Chemicals' },
  ],
};

// State Codes for ITR
export const STATE_CODES: { [key: string]: string } = {
  'andhra pradesh': '37',
  'arunachal pradesh': '12',
  'assam': '18',
  'bihar': '10',
  'chhattisgarh': '22',
  'goa': '30',
  'gujarat': '24',
  'haryana': '06',
  'himachal pradesh': '02',
  'jharkhand': '20',
  'karnataka': '29',
  'kerala': '32',
  'madhya pradesh': '23',
  'maharashtra': '27',
  'manipur': '14',
  'meghalaya': '17',
  'mizoram': '15',
  'nagaland': '13',
  'odisha': '21',
  'punjab': '03',
  'rajasthan': '08',
  'sikkim': '11',
  'tamil nadu': '33',
  'telangana': '36',
  'tripura': '16',
  'uttar pradesh': '09',
  'uttarakhand': '05',
  'west bengal': '19',
  'delhi': '07',
  'jammu and kashmir': '01',
  'ladakh': '38',
  'chandigarh': '04',
  'puducherry': '34',
  'andaman and nicobar': '35',
  'dadra and nagar haveli': '26',
  'daman and diu': '25',
  'lakshadweep': '31',
};

// Filing Section Codes
export const FILING_SECTIONS = [
  { code: 11, name: 'Section 139(1) - Within due date' },
  { code: 12, name: 'Section 139(4) - Belated return' },
  { code: 13, name: 'Section 139(5) - Revised return' },
  { code: 14, name: 'Section 92CD - Modified return' },
  { code: 17, name: 'Section 119(2)(b) - After condonation' },
];

// Assessment Years
export const ASSESSMENT_YEARS = [
  '2026',
  '2025',
  '2024',
  '2023',
];
