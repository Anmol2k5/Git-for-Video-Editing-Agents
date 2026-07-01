/**
 * EditVCS — Adapter Base Interface
 *
 * Adapters bridge creative tools to EditVCS. Each adapter knows how to:
 * - Serialize a tool's project state into domain-split JSON
 * - Deserialize domain JSON back into tool-compatible format
 * - Report which domains the tool supports
 */
import type { DomainConfig, DomainFile } from "../core/types.js";
/**
 * Abstract adapter interface that all tool-specific adapters implement
 */
export interface Adapter {
    /** Unique adapter name, e.g., "figma", "premiere", "generic" */
    name: string;
    /** Human-readable display name */
    displayName: string;
    /** Description of what this adapter works with */
    description: string;
    /**
     * Serialize tool project state into domain-split JSON files
     * @param projectState - The raw project state from the tool
     * @returns Array of domain files
     */
    serialize(projectState: any): DomainFile[];
    /**
     * Deserialize domain JSON files back into a tool-compatible project state
     * @param domains - Array of domain files
     * @returns Tool-compatible project state
     */
    deserialize(domains: DomainFile[]): any;
    /**
     * Get the domain configuration for this adapter
     * @returns Array of supported domains
     */
    getDomainConfig(): DomainConfig[];
    /**
     * Validate a project state
     * @param projectState - The state to validate
     * @returns Validation result
     */
    validate(projectState: any): ValidationResult;
}
export interface ValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
}
/**
 * Registry of available adapters
 */
export declare class AdapterRegistry {
    private adapters;
    register(adapter: Adapter): void;
    get(name: string): Adapter | undefined;
    list(): Adapter[];
    has(name: string): boolean;
}
/** Global adapter registry */
export declare const adapterRegistry: AdapterRegistry;
//# sourceMappingURL=base.d.ts.map