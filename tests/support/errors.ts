/**
 * Every deliberate failure says whose problem it is, so a red run can be triaged from the message alone.
 *
 * - application: the product did the wrong thing. This is a real P1 finding.
 * - test-data:   a record the check depends on is missing or in the wrong state. Fix the data, not the code.
 * - automation:  the script could not drive the page (selector drift, missing env, timeout before a verdict).
 */
export type FailureKind = 'application' | 'test-data' | 'automation';

export class P1Error extends Error {
  readonly kind: FailureKind;

  constructor(kind: FailureKind, message: string) {
    super(`[${kind}] ${message}`);
    this.name = 'P1Error';
    this.kind = kind;
  }
}

export function failApp(message: string): never {
  throw new P1Error('application', message);
}

export function failTestData(message: string): never {
  throw new P1Error('test-data', message);
}

export function failAutomation(message: string): never {
  throw new P1Error('automation', message);
}
