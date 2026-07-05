import { LiveResolveExport } from "./resolve-schema.js";
import { DomainFile } from "../../core/types.js";
/**
 * Splits a monolithic live DaVinci Resolve JSON export into first-class domain files.
 */
export declare function normalizeResolveTimeline(exportData: LiveResolveExport): DomainFile[];
/**
 * For Phase 1 (Read-Only), denormalization is not fully implemented for write-back.
 * This function exists for mock compatibility but will not generate a full live JSON
 * capable of round-tripping into Resolve until Phase 2.
 */
export declare function denormalizeToResolveTimeline(domains: DomainFile[]): any;
//# sourceMappingURL=resolve-normalizer.d.ts.map