import { TestInfo } from '@playwright/test';

/**
 * Record what the check covers as test annotations, so the report reads like a ticket verification:
 * area, expected behaviour, and numbered repro steps. Call it first thing in every test.
 */
export function describeCheck(testInfo: TestInfo, details: { area: string; expected: string; steps: string[] }): void {
  testInfo.annotations.push({ type: 'area', description: details.area });
  testInfo.annotations.push({ type: 'expected', description: details.expected });
  testInfo.annotations.push({
    type: 'repro',
    description: details.steps.map((step, i) => `${i + 1}. ${step}`).join('\n'),
  });
}

/** Record what was actually observed when the check passed. Call it last in every test. */
export function recordActual(testInfo: TestInfo, actual: string): void {
  testInfo.annotations.push({ type: 'actual', description: actual });
}
