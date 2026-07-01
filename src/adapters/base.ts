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
export class AdapterRegistry {
  private adapters: Map<string, Adapter> = new Map();

  register(adapter: Adapter): void {
    this.adapters.set(adapter.name, adapter);
  }

  get(name: string): Adapter | undefined {
    return this.adapters.get(name);
  }

  list(): Adapter[] {
    return Array.from(this.adapters.values());
  }

  has(name: string): boolean {
    return this.adapters.has(name);
  }
}

/** Global adapter registry */
export const adapterRegistry = new AdapterRegistry();
