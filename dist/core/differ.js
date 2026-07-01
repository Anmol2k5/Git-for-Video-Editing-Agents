/**
 * EditVCS — Semantic Differ
 *
 * Produces human-readable, domain-aware diffs between two states.
 * Instead of raw JSON diffs, this generates descriptions like:
 *   "Layer 'Hero Image' moved from (100, 200) to (150, 250)"
 *   "Color of 'Background' changed from #1a1a2e to #16213e"
 */
/**
 * Deep diff two objects, producing structured changes with human-readable descriptions
 */
export function diffDomains(domainName, oldData, newData, parentPath = "") {
    const changes = [];
    const allKeys = new Set([
        ...Object.keys(oldData || {}),
        ...Object.keys(newData || {})
    ]);
    for (const key of allKeys) {
        const currentPath = parentPath ? `${parentPath}.${key}` : key;
        const oldVal = oldData?.[key];
        const newVal = newData?.[key];
        if (oldVal === undefined && newVal !== undefined) {
            changes.push({
                domain: domainName,
                path: currentPath,
                type: "added",
                newValue: newVal,
                description: describeChange("added", domainName, currentPath, undefined, newVal)
            });
        }
        else if (oldVal !== undefined && newVal === undefined) {
            changes.push({
                domain: domainName,
                path: currentPath,
                type: "removed",
                oldValue: oldVal,
                description: describeChange("removed", domainName, currentPath, oldVal, undefined)
            });
        }
        else if (typeof oldVal === "object" && typeof newVal === "object" &&
            oldVal !== null && newVal !== null &&
            !Array.isArray(oldVal) && !Array.isArray(newVal)) {
            // Recurse into nested objects
            changes.push(...diffDomains(domainName, oldVal, newVal, currentPath));
        }
        else if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
            changes.push({
                domain: domainName,
                path: currentPath,
                type: "modified",
                oldValue: oldVal,
                newValue: newVal,
                description: describeChange("modified", domainName, currentPath, oldVal, newVal)
            });
        }
    }
    return changes;
}
/**
 * Generate a full diff result between two complete states
 */
export function diffStates(fromCommit, toCommit, oldState, newState, domains) {
    const allChanges = [];
    const affectedDomains = [];
    for (const domain of domains) {
        const oldData = oldState[domain.name] || {};
        const newData = newState[domain.name] || {};
        const changes = diffDomains(domain.name, oldData, newData);
        if (changes.length > 0) {
            allChanges.push(...changes);
            affectedDomains.push(domain.name);
        }
    }
    // Build summary
    const domainCounts = affectedDomains.map(d => {
        const count = allChanges.filter(c => c.domain === d).length;
        return `${count} ${d} change${count !== 1 ? "s" : ""}`;
    });
    const summary = domainCounts.length > 0
        ? domainCounts.join(", ")
        : "No changes";
    return {
        fromCommit,
        toCommit,
        changes: allChanges,
        summary,
        domains: affectedDomains
    };
}
// ─── Human-Readable Descriptions ─────────────────────────────────────
/**
 * Generate a human-readable description for a change based on domain semantics
 */
function describeChange(type, domain, path, oldVal, newVal) {
    const parts = path.split(".");
    const itemName = extractItemName(parts);
    switch (domain) {
        case "layout":
            return describeLayoutChange(type, parts, itemName, oldVal, newVal);
        case "style":
            return describeStyleChange(type, parts, itemName, oldVal, newVal);
        case "typography":
            return describeTypographyChange(type, parts, itemName, oldVal, newVal);
        case "animation":
            return describeAnimationChange(type, parts, itemName, oldVal, newVal);
        case "audio":
            return describeAudioChange(type, parts, itemName, oldVal, newVal);
        default:
            return describeGenericChange(type, path, oldVal, newVal);
    }
}
function extractItemName(parts) {
    // Try to find a meaningful name from the path
    // e.g., "layers.hero-image.position.x" -> "hero-image"
    if (parts.length >= 2) {
        return parts[1].replace(/-/g, " ").replace(/_/g, " ");
    }
    return parts[0];
}
function describeLayoutChange(type, parts, name, oldVal, newVal) {
    const prop = parts[parts.length - 1];
    if (type === "added")
        return `Added layer '${name}'`;
    if (type === "removed")
        return `Removed layer '${name}'`;
    if (prop === "x" || prop === "y") {
        return `Moved '${name}' ${prop} from ${oldVal} to ${newVal}`;
    }
    if (prop === "width" || prop === "height") {
        return `Resized '${name}' ${prop} from ${oldVal} to ${newVal}`;
    }
    if (prop === "rotation") {
        return `Rotated '${name}' from ${oldVal}° to ${newVal}°`;
    }
    if (prop === "opacity") {
        return `Changed '${name}' opacity from ${Math.round(oldVal * 100)}% to ${Math.round(newVal * 100)}%`;
    }
    if (prop === "visible") {
        return newVal ? `Made '${name}' visible` : `Hidden '${name}'`;
    }
    return `Modified '${name}' ${prop}: ${JSON.stringify(oldVal)} → ${JSON.stringify(newVal)}`;
}
function describeStyleChange(type, parts, name, oldVal, newVal) {
    const prop = parts[parts.length - 1];
    if (type === "added")
        return `Added style for '${name}'`;
    if (type === "removed")
        return `Removed style for '${name}'`;
    if (prop === "fill" || prop === "color" || prop === "backgroundColor") {
        return `Changed '${name}' color from ${oldVal} to ${newVal}`;
    }
    if (prop === "stroke") {
        return `Changed '${name}' stroke to ${newVal}`;
    }
    if (prop === "blur") {
        return `Changed '${name}' blur from ${oldVal}px to ${newVal}px`;
    }
    if (prop === "shadow") {
        return `Updated shadow on '${name}'`;
    }
    return `Modified '${name}' style ${prop}: ${JSON.stringify(oldVal)} → ${JSON.stringify(newVal)}`;
}
function describeTypographyChange(type, parts, name, oldVal, newVal) {
    const prop = parts[parts.length - 1];
    if (type === "added")
        return `Added text element '${name}'`;
    if (type === "removed")
        return `Removed text element '${name}'`;
    if (prop === "fontSize") {
        return `Changed '${name}' font size from ${oldVal}px to ${newVal}px`;
    }
    if (prop === "fontFamily") {
        return `Changed '${name}' font from "${oldVal}" to "${newVal}"`;
    }
    if (prop === "content" || prop === "text") {
        const oldStr = String(oldVal).substring(0, 30);
        const newStr = String(newVal).substring(0, 30);
        return `Updated '${name}' text: "${oldStr}…" → "${newStr}…"`;
    }
    return `Modified '${name}' typography ${prop}`;
}
function describeAnimationChange(type, parts, name, oldVal, newVal) {
    const prop = parts[parts.length - 1];
    if (type === "added")
        return `Added animation on '${name}'`;
    if (type === "removed")
        return `Removed animation on '${name}'`;
    if (prop === "duration") {
        return `Changed '${name}' animation duration from ${oldVal}s to ${newVal}s`;
    }
    if (prop === "easing") {
        return `Changed '${name}' easing from "${oldVal}" to "${newVal}"`;
    }
    if (prop === "delay") {
        return `Changed '${name}' delay from ${oldVal}s to ${newVal}s`;
    }
    return `Modified '${name}' animation ${prop}`;
}
function describeAudioChange(type, parts, name, oldVal, newVal) {
    const prop = parts[parts.length - 1];
    if (type === "added")
        return `Added audio track '${name}'`;
    if (type === "removed")
        return `Removed audio track '${name}'`;
    if (prop === "volume" || prop === "level") {
        return `Changed '${name}' volume from ${Math.round(oldVal * 100)}% to ${Math.round(newVal * 100)}%`;
    }
    if (prop === "pan") {
        return `Panned '${name}' from ${oldVal} to ${newVal}`;
    }
    if (prop === "muted") {
        return newVal ? `Muted '${name}'` : `Unmuted '${name}'`;
    }
    return `Modified '${name}' audio ${prop}`;
}
function describeGenericChange(type, path, oldVal, newVal) {
    if (type === "added")
        return `Added ${path}`;
    if (type === "removed")
        return `Removed ${path}`;
    return `Modified ${path}: ${JSON.stringify(oldVal)} → ${JSON.stringify(newVal)}`;
}
//# sourceMappingURL=differ.js.map