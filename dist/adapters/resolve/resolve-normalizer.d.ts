import { ResolveTimeline } from "./resolve-schema.js";
import { DomainFile } from "../../core/types.js";
/**
 * Splits a monolithic DaVinci Resolve timeline into first-class domain files.
 */
export declare function normalizeResolveTimeline(timeline: ResolveTimeline): DomainFile[];
/**
 * Reassembles domain files back into a single Resolve timeline JSON.
 * (In a real implementation, this might push directly to the Resolve API instead of generating JSON)
 */
export declare function denormalizeToResolveTimeline(domainFiles: DomainFile[]): ResolveTimeline;
//# sourceMappingURL=resolve-normalizer.d.ts.map