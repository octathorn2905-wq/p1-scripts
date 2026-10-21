/**
 * Fixed records the P1 checks depend on. These are identifiers in the target environment, not secrets.
 * Specs read them from here and never inline them. When a record is renamed or replaced, change it once here.
 *
 * Accounts that sign in (and their emails) come from `.env`, not from this file.
 */
export const TEST_DATA = {
  /** Display name of the ADMIN account in `.env`. Shown as an assignee on tasks it creates. */
  adminName: 'Jordan Ellis',

  /** The VETERAN account in `.env`. */
  veteran: {
    name: 'muskan aaa',
    /** Exact label of this veteran in the Create Case veteran picker. */
    casePickerLabel: 'muskan aaa (VET-10009) · CLI-8006',
  },

  /** The PROVIDER account in `.env`. */
  provider: {
    name: 'Muskan prov',
    /** `<option value>` of this provider in the Create Case "Assign Provider" select. */
    caseOptionValue: '51',
  },

  referringOrganization: 'My Org',
  caseType: 'IME Single',
  /** Existing case owned by the veteran above. Linked to tasks created by NX-049. */
  linkedCaseId: 'NXL-2026-0327',
  /** Clinic location whose state STATE-MATCH changes and restores. */
  clinic: 'P1 LOC',
  /** Two different states that exist in every state select. */
  states: { same: 'Texas (TX)', other: 'California (CA)' },
  newStaffUserGroup: 'Scheduler — Staff Portal',
  taskCategory: 'QA',
} as const;
