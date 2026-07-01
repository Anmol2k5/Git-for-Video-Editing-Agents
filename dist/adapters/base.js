/**
 * EditVCS — Adapter Base Interface
 *
 * Adapters bridge creative tools to EditVCS. Each adapter knows how to:
 * - Serialize a tool's project state into domain-split JSON
 * - Deserialize domain JSON back into tool-compatible format
 * - Report which domains the tool supports
 */
/**
 * Registry of available adapters
 */
export class AdapterRegistry {
    adapters = new Map();
    register(adapter) {
        this.adapters.set(adapter.name, adapter);
    }
    get(name) {
        return this.adapters.get(name);
    }
    list() {
        return Array.from(this.adapters.values());
    }
    has(name) {
        return this.adapters.has(name);
    }
}
/** Global adapter registry */
export const adapterRegistry = new AdapterRegistry();
//# sourceMappingURL=base.js.map