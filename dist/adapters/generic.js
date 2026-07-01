/**
 * EditVCS — Generic JSON Adapter
 *
 * A universal adapter that works with any tool that can export/import JSON.
 * Users provide a flat or nested JSON object, and this adapter splits it
 * into the default domain structure.
 *
 * Supports custom domain mapping via a mapping config.
 */
import { DEFAULT_DOMAINS } from "../core/types.js";
import { adapterRegistry } from "./base.js";
export class GenericAdapter {
    name = "generic";
    displayName = "Generic JSON";
    description = "Universal adapter for any tool that exports JSON. Manually split your project state into domain files.";
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
    serialize(projectState) {
        const domains = this.getDomainConfig();
        const files = [];
        for (const domain of domains) {
            const data = projectState[domain.name] || {};
            files.push({ domain: domain.name, data });
        }
        return files;
    }
    /**
     * Deserialize domain files back into a single state object
     */
    deserialize(domains) {
        const state = {};
        for (const file of domains) {
            state[file.domain] = file.data;
        }
        return state;
    }
    /**
     * Get default domain configuration
     */
    getDomainConfig() {
        return DEFAULT_DOMAINS;
    }
    /**
     * Validate a project state
     */
    validate(projectState) {
        const errors = [];
        const warnings = [];
        const domains = this.getDomainConfig();
        if (typeof projectState !== "object" || projectState === null) {
            errors.push("Project state must be a non-null object");
            return { valid: false, errors, warnings };
        }
        // Check for recognized domain keys
        const knownDomains = new Set(domains.map(d => d.name));
        const stateKeys = Object.keys(projectState);
        for (const key of stateKeys) {
            if (!knownDomains.has(key)) {
                warnings.push(`Unknown domain key '${key}'. Known domains: ${[...knownDomains].join(", ")}`);
            }
        }
        if (stateKeys.length === 0) {
            warnings.push("Project state is empty");
        }
        // Validate each domain's data is an object
        for (const key of stateKeys) {
            if (typeof projectState[key] !== "object" || projectState[key] === null) {
                errors.push(`Domain '${key}' must be an object, got ${typeof projectState[key]}`);
            }
        }
        return { valid: errors.length === 0, errors, warnings };
    }
}
// Register the generic adapter
adapterRegistry.register(new GenericAdapter());
//# sourceMappingURL=generic.js.map