import { buildSafeAgentContext } from '../src/privacy/agent-context.js';

export const SECRETS = ['Rahul Sharma', 'rahul@example.com', '9876543210', 'EMP1024', 'secret123'];
export function plannerInput() {
  return {
    goal: 'Check whether this travel request is complete and submit it.',
    semantic: { fields: ['name', 'email', 'phone', 'employee_id', 'password', 'destination', 'purpose'].map((role, i) => ({
      id: `field_${i + 1}`, role, sensitive: i < 5, filled: true,
      value: i < 5 ? `[${role.toUpperCase()}]` : role === 'destination' ? 'Bengaluru' : 'Conference',
    })) },
    visualState: { items: [{ id: 'visual_12', text: 'Continue',
      bbox: { x: 10, y: 200, width: 100, height: 30 }, confidence: 0.95 }] },
    image: { width: 800, height: 600, redactedRegions: 5 },
    observation: { id: 'obs_demo-abc', capturedAt: '2026-09-10T00:00:00.000Z', viewport: { width: 800, height: 600 } },
    sensitiveValues: SECRETS,
  };
}
export const approvedContext = () => buildSafeAgentContext(plannerInput()).context;
export const clickPlan = () => ({ schemaVersion: 1, observationId: 'obs_demo-abc', action: 'CLICK',
  target: 'visual_12', reason: 'Required fields are filled and Continue is available.' });
