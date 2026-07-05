import { RESOLVE_DOMAINS } from "../../core/types.js";
import { normalizeResolveTimeline, denormalizeToResolveTimeline } from "./resolve-normalizer.js";
import { resolveDiffer } from "./resolve-differ.js";
import { ResolveLiveImporter } from "./resolve-live-import.js";
import * as crypto from "crypto";
export class ResolveAdapter {
    name = "davinci-resolve";
    displayName = "DaVinci Resolve";
    description = "Adapter for Blackmagic DaVinci Resolve";
    serialize(projectState) {
        return normalizeResolveTimeline(projectState);
    }
    deserialize(domains) {
        return denormalizeToResolveTimeline(domains);
    }
    getDomainConfig() {
        return RESOLVE_DOMAINS;
    }
    validate(projectState) {
        if (!projectState)
            return { valid: false, errors: ["Empty state"], warnings: [] };
        return { valid: true, errors: [], warnings: [] };
    }
    /**
  
     * Imports state either from a live DaVinci Resolve instance or a JSON fixture.
     */
    async importState(rawData) {
        let exportData = rawData;
        // If rawData is the string "--live", trigger the python bridge
        if (rawData === "--live" || rawData?.live) {
            const importer = new ResolveLiveImporter();
            const result = await importer.runImport({ redactMediaPaths: rawData?.redactMediaPaths });
            if (!result.success) {
                throw new Error(`Live Import Failed: ${result.errorType} - ${result.error}`);
            }
            exportData = result.data;
        }
        const domains = normalizeResolveTimeline(exportData);
        return {
            id: crypto.randomUUID(),
            projectId: exportData.project?.id || "unknown",
            branchName: "main",
            createdBy: { type: "human", name: "User" },
            createdAt: new Date().toISOString(),
            summary: "Imported from Resolve",
            domains: domains
        };
    }
    async exportState(snapshot) {
        // For Phase 1, we do not export back to live resolve.
        // This just returns the mocked format.
        return denormalizeToResolveTimeline(snapshot.domains);
    }
    diff(base, compare) {
        const changes = [];
        for (const domainFile of compare.domains) {
            const baseDomainFile = base.domains.find((d) => d.domain === domainFile.domain);
            const baseData = baseDomainFile ? baseDomainFile.data : {};
            const compareData = domainFile.data;
            const domainChanges = resolveDiffer(domainFile.domain, baseData, compareData);
            changes.push(...domainChanges);
        }
        return changes;
    }
}
//# sourceMappingURL=resolve-adapter.js.map