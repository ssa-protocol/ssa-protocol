export { SovereignAgent, type CreateSSAOptions } from "./agent.js";
export { SovereignAgent as SSA } from "./agent.js";
export * from "./schema.js";
export * from "./policy.js";

import { SovereignAgent, type CreateSSAOptions } from "./agent.js";

export function createSSA(options: string | CreateSSAOptions): SovereignAgent {
  return SovereignAgent.create(typeof options === "string" ? { name: options } : options);
}
