/**
 * EditVCS — Merge Engine
 *
 * Handles merging of domain-split JSON files with:
 * - Auto-merge when changes are in different domains
 * - Conflict detection within same domain
 * - AI-assisted semantic merge suggestions for cross-domain conflicts
 */
import type { DomainConfig, MergeConflict, MergeResult } from "./types.js";
/**
 * Merge two sets of domain files against a common base
 */
export declare function mergeDomains(base: Record<string, Record<string, any>>, ours: Record<string, Record<string, any>>, theirs: Record<string, Record<string, any>>, domains: DomainConfig[]): MergeResult;
/**
 * Cross-domain conflict detection
 * e.g., a layer was deleted in layout.json but still referenced in style.json
 */
export declare function detectCrossDomainConflicts(state: Record<string, Record<string, any>>, domains: DomainConfig[]): MergeConflict[];
//# sourceMappingURL=merger.d.ts.map