/**
 * EditVCS — Semantic Differ
 *
 * Produces human-readable, domain-aware diffs between two states.
 * Instead of raw JSON diffs, this generates descriptions like:
 *   "Layer 'Hero Image' moved from (100, 200) to (150, 250)"
 *   "Color of 'Background' changed from #1a1a2e to #16213e"
 */
import type { DiffChange, DiffResult, DomainConfig } from "./types.js";
/**
 * Deep diff two objects, producing structured changes with human-readable descriptions
 */
export declare function diffDomains(domainName: string, oldData: Record<string, any>, newData: Record<string, any>, parentPath?: string): DiffChange[];
/**
 * Generate a full diff result between two complete states
 */
export declare function diffStates(fromCommit: string, toCommit: string, oldState: Record<string, Record<string, any>>, newState: Record<string, Record<string, any>>, domains: DomainConfig[]): DiffResult;
//# sourceMappingURL=differ.d.ts.map