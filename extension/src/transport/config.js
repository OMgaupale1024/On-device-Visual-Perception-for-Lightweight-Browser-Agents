// The sole application endpoint. Manifest CSP must agree when this changes.
export const PLANNER_CONFIG = Object.freeze({
  url: 'http://127.0.0.1:8000/plan',
  timeoutMs: 20_000,
});
