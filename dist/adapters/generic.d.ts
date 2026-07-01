/**
 * EditVCS — Generic JSON Adapter
 *
 * A universal adapter that works with any tool that can export/import JSON.
 * Users provide a flat or nested JSON object, and this adapter splits it
 * into the default domain structure.
 *
 * Supports custom domain mapping via a mapping config.
 */
import type { DomainConfig, DomainFile } from "../core/types.js";
import type { Adapter, ValidationResult } from "./base.js";
export declare class GenericAdapter implements Adapter {
    name: string;
    displayName: string;
    description: string;
    /**
     * Serialize a project state object into domain files.
     * Expects the input to be keyed by domain name.
     *
     * Example input:
     * {
     *   "layout": { "hero-image": { "x": 100, "y": 200 } },
     *   "style": { "hero-image": { "fill": "#ff0000" } },
     *   ...
     * }
     */
    serialize(projectState: Record<string, any>): DomainFile[];
    /**
     * Deserialize domain files back into a single state object
     */
    deserialize(domains: DomainFile[]): Record<string, any>;
    /**
     * Get default domain configuration
     */
    getDomainConfig(): DomainConfig[];
    /**
     * Validate a project state
     */
    validate(projectState: Record<string, any>): ValidationResult;
}
//# sourceMappingURL=generic.d.ts.map