import { StartupInput, type StartupInputRaw } from "./startup";

/**
 * PlugSecure — the seed example (§7 of CLAUDE.md). Zero values for ARR, burn,
 * cash and revenue are placeholders the wizard asks the user to fill in.
 * Amounts were originally entered in EUR; these are the USD-converted values.
 */
export const PLUGSECURE_EXAMPLE: StartupInputRaw = {
  name: "PlugSecure",
  website: "https://plugsecure.io",
  oneLiner:
    "Cybersecurity for critical energy infrastructure — securing EV charging (OCPP/CSMS), solar inverters, BESS and smart-grid assets for CPOs, utilities and OEMs.",
  sector: "cybersecurity",
  subSector: "OT/ICS security for EV charging & distributed energy",
  businessModel: "b2b_saas",
  foundedDate: "2025-01-01",
  hqRegion: "EU",
  hqCountry: "GR",
  otherBranches: [],
  operatingCountries: ["GR", "UK", "RO"],
  team: {
    fullTimeEmployees: 3,
    founders: 2,
    foundersWithPriorExit: 1,
    foundersWithDomainYears: 10,
    technicalCofounder: true,
    keyHiresPlanned12m: 2,
    advisorsNotable: 1,
  },
  traction: {
    payingCustomers: 3,
    pilotsOrLOIs: 2,
    arrUsd: 0,
    nonRecurringRevenueTtmUsd: 0,
    marqueeCustomers: [],
    partnerships: [],
    pipelineWeightedUsd: 0,
  },
  financials: { monthlyBurnUsd: 0, cashOnHandUsd: 0, isProfitable: false },
  funding: {
    rounds: [
      {
        type: "pre_seed",
        date: "2025-04-01",
        amountUsd: 720000,
        postMoneyUsd: 2620000,
        leadInvestorType: "vc",
      },
    ],
    totalRaisedUsd: 720000,
    currentlyRaising: true,
    targetRaiseUsd: 1500000,
    grantsNonDilutiveUsd: 0,
  },
  ip: {
    patentsGranted: 1,
    patentsPending: 0,
    trademarksRegistered: true,
    proprietaryData: true,
    certifications: [],
    regulatoryTailwind: true,
    productStage: "launched",
    techDefensibility: "high",
  },
  market: { competitorsNamed: [], competitiveIntensity: "medium" },
  risks: {
    keyPersonDependency: true,
    hardwareSupplyRisk: false,
    litigationOrRegulatoryRisk: false,
  },
  narrative:
    "NIS2 and the Cyber Resilience Act force CPOs and energy-asset operators to secure OCPP/Modbus/DNP3 endpoints. Founders previously built and sold a company to PPC Group, Greece's largest utility. Product is live with paying customers in three countries.",
  selfDeclaredStage: "pre_seed",
  reportingCurrency: "USD",
};

/** The example with zod defaults applied. */
export function plugSecure(): StartupInput {
  return StartupInput.parse(PLUGSECURE_EXAMPLE);
}
