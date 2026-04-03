/**
 * @opensip-tools/simulation — Simulation scenarios for codebase analysis
 */

export {
  defineScenario,
  getRegisteredScenarios,
  getScenario,
  getScenariosByTag,
  clearScenarioRegistry,
} from './framework/define-scenario.js';

export { GenericRegistry, type Registerable } from './framework/generic-registry.js';
