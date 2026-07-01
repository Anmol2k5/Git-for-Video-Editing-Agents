/**
 * EditVCS — Merge Engine
 *
 * Handles merging of domain-split JSON files with:
 * - Auto-merge when changes are in different domains
 * - Conflict detection within same domain
 * - AI-assisted semantic merge suggestions for cross-domain conflicts
 */
import { diffDomains } from "./differ.js";
/**
 * Merge two sets of domain files against a common base
 */
export function mergeDomains(base, ours, theirs, domains) {
    const autoMerged = [];
    const conflicts = [];
    for (const domain of domains) {
        const baseData = base[domain.name] || {};
        const ourData = ours[domain.name] || {};
        const theirData = theirs[domain.name] || {};
        const ourChanges = diffDomains(domain.name, baseData, ourData);
        const theirChanges = diffDomains(domain.name, baseData, theirData);
        // No changes in this domain from either side
        if (ourChanges.length === 0 && theirChanges.length === 0) {
            autoMerged.push({ domain: domain.name, data: baseData });
            continue;
        }
        // Only one side changed — take that side
        if (ourChanges.length === 0) {
            autoMerged.push({ domain: domain.name, data: theirData });
            continue;
        }
        if (theirChanges.length === 0) {
            autoMerged.push({ domain: domain.name, data: ourData });
            continue;
        }
        // Both sides changed — check for conflicts
        const ourPaths = new Set(ourChanges.map(c => c.path));
        const theirPaths = new Set(theirChanges.map(c => c.path));
        // Find overlapping paths (potential conflicts)
        const conflictPaths = new Set([...ourPaths].filter(p => theirPaths.has(p)));
        if (conflictPaths.size === 0) {
            // No overlapping paths — safe to merge both sets of changes
            const merged = deepMerge(baseData, ourData, theirData);
            autoMerged.push({ domain: domain.name, data: merged });
        }
        else {
            // There are conflicting paths
            for (const path of conflictPaths) {
                const ourChange = ourChanges.find(c => c.path === path);
                const theirChange = theirChanges.find(c => c.path === path);
                conflicts.push({
                    domain: domain.name,
                    path,
                    description: `Both sides modified '${path}' in ${domain.name}`,
                    oursValue: ourChange.newValue ?? ourChange.oldValue,
                    theirsValue: theirChange.newValue ?? theirChange.oldValue,
                    baseValue: getNestedValue(baseData, path),
                    suggestedResolution: suggestResolution(domain.name, path, getNestedValue(baseData, path), ourChange.newValue, theirChange.newValue),
                    resolutionReasoning: generateResolutionReasoning(domain.name, path, ourChange, theirChange)
                });
            }
            // Merge non-conflicting changes
            const partialMerge = deepMerge(baseData, ourData, theirData);
            autoMerged.push({ domain: domain.name, data: partialMerge });
        }
    }
    return {
        success: conflicts.length === 0,
        autoMerged,
        conflicts
    };
}
// ─── Deep Merge ──────────────────────────────────────────────────────
/**
 * Three-way deep merge of objects
 */
function deepMerge(base, ours, theirs) {
    const result = { ...base };
    const allKeys = new Set([
        ...Object.keys(ours),
        ...Object.keys(theirs)
    ]);
    for (const key of allKeys) {
        const baseVal = base[key];
        const ourVal = ours[key];
        const theirVal = theirs[key];
        // If only one side changed, take that change
        if (JSON.stringify(baseVal) === JSON.stringify(ourVal)) {
            result[key] = theirVal;
        }
        else if (JSON.stringify(baseVal) === JSON.stringify(theirVal)) {
            result[key] = ourVal;
        }
        else if (typeof ourVal === "object" && typeof theirVal === "object" &&
            ourVal !== null && theirVal !== null &&
            !Array.isArray(ourVal) && !Array.isArray(theirVal)) {
            // Recurse for nested objects
            result[key] = deepMerge(baseVal || {}, ourVal, theirVal);
        }
        else {
            // Both changed — take ours (conflicts should be handled separately)
            result[key] = ourVal;
        }
    }
    return result;
}
// ─── Helpers ─────────────────────────────────────────────────────────
function getNestedValue(obj, path) {
    return path.split(".").reduce((acc, part) => acc?.[part], obj);
}
/**
 * Suggest a resolution for a conflict based on domain semantics
 */
function suggestResolution(domain, path, baseVal, oursVal, theirsVal) {
    // For numeric values, we can try to merge the deltas
    if (typeof oursVal === "number" && typeof theirsVal === "number" && typeof baseVal === "number") {
        const ourDelta = oursVal - baseVal;
        const theirDelta = theirsVal - baseVal;
        return baseVal + ourDelta + theirDelta;
    }
    // For colors (hex strings), suggest the most recent
    if (typeof oursVal === "string" && typeof theirsVal === "string" &&
        oursVal.startsWith("#") && theirsVal.startsWith("#")) {
        // Default to "theirs" as the more recent change
        return theirsVal;
    }
    // Default: take theirs (most recent wins)
    return theirsVal;
}
/**
 * Generate human-readable reasoning for a conflict resolution suggestion
 */
function generateResolutionReasoning(domain, path, ourChange, theirChange) {
    const parts = path.split(".");
    const prop = parts[parts.length - 1];
    if (typeof ourChange.newValue === "number" && typeof theirChange.newValue === "number") {
        return `Both sides changed '${prop}'. Suggested merging by combining both deltas from the base value.`;
    }
    return `Both sides modified '${prop}' in the ${domain} domain. Defaulting to the incoming (theirs) change. Manual review recommended.`;
}
/**
 * Cross-domain conflict detection
 * e.g., a layer was deleted in layout.json but still referenced in style.json
 */
export function detectCrossDomainConflicts(state, domains) {
    const conflicts = [];
    // Check if items referenced in style/animation/audio still exist in layout
    const layoutItems = new Set(Object.keys(state["layout"] || {}));
    for (const refDomain of ["style", "animation", "audio"]) {
        const domainData = state[refDomain] || {};
        for (const key of Object.keys(domainData)) {
            if (key !== "_meta" && !layoutItems.has(key) && layoutItems.size > 0) {
                conflicts.push({
                    domain: refDomain,
                    path: key,
                    description: `'${key}' is referenced in ${refDomain}.json but does not exist in layout.json`,
                    oursValue: domainData[key],
                    theirsValue: undefined,
                    suggestedResolution: undefined,
                    resolutionReasoning: `The item '${key}' appears to have been deleted from the layout but still has ${refDomain} data. Consider removing the orphaned ${refDomain} data.`
                });
            }
        }
    }
    return conflicts;
}
//# sourceMappingURL=merger.js.map