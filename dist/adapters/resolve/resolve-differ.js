function framesToTimecode(frames, fps = 24) {
    const f = Math.floor(frames % fps);
    const s = Math.floor((frames / fps) % 60);
    const m = Math.floor((frames / (fps * 60)) % 60);
    const h = Math.floor(frames / (fps * 3600));
    const pad = (num) => num.toString().padStart(2, "0");
    return `${pad(h)}:${pad(m)}:${pad(s)}:${pad(f)}`;
}
export function resolveDiffer(domain, oldData, newData) {
    const changes = [];
    const fps = 24; // Hardcoding 24fps for this MVP diff formatting
    const oldKeys = new Set(Object.keys(oldData));
    const newKeys = new Set(Object.keys(newData));
    // Additions
    for (const id of newKeys) {
        if (!oldKeys.has(id)) {
            const item = newData[id];
            const type = getEntityType(domain, item);
            changes.push({
                id: crypto.randomUUID(),
                domain,
                operation: "add",
                entityType: type,
                entityId: id,
                before: null,
                after: item,
                humanReadableSummary: generateAddSummary(domain, type, item, fps),
                timecodeStart: item.recordIn ? framesToTimecode(item.recordIn, fps) : undefined,
                timecodeEnd: item.recordOut ? framesToTimecode(item.recordOut, fps) : undefined,
                affectedTrack: item.trackName
            });
        }
    }
    // Deletions
    for (const id of oldKeys) {
        if (!newKeys.has(id)) {
            const item = oldData[id];
            const type = getEntityType(domain, item);
            changes.push({
                id: crypto.randomUUID(),
                domain,
                operation: "remove",
                entityType: type,
                entityId: id,
                before: item,
                after: null,
                humanReadableSummary: generateRemoveSummary(domain, type, item, fps),
                timecodeStart: item.recordIn ? framesToTimecode(item.recordIn, fps) : undefined,
                timecodeEnd: item.recordOut ? framesToTimecode(item.recordOut, fps) : undefined,
                affectedTrack: item.trackName
            });
        }
    }
    // Modifications
    for (const id of newKeys) {
        if (oldKeys.has(id)) {
            const oldItem = oldData[id];
            const newItem = newData[id];
            const type = getEntityType(domain, newItem);
            if (JSON.stringify(oldItem) !== JSON.stringify(newItem)) {
                // Detect specific type of update (trim, move, replace, property change)
                const summary = generateUpdateSummary(domain, type, oldItem, newItem, fps);
                // Let's determine the exact operation
                let operation = "update";
                if (oldItem.name !== newItem.name)
                    operation = "replace";
                else if (oldItem.recordIn !== newItem.recordIn && oldItem.recordOut - oldItem.recordIn === newItem.recordOut - newItem.recordIn)
                    operation = "move";
                changes.push({
                    id: crypto.randomUUID(),
                    domain,
                    operation,
                    entityType: type,
                    entityId: id,
                    before: oldItem,
                    after: newItem,
                    humanReadableSummary: summary,
                    timecodeStart: newItem.recordIn ? framesToTimecode(newItem.recordIn, fps) : undefined,
                    timecodeEnd: newItem.recordOut ? framesToTimecode(newItem.recordOut, fps) : undefined,
                    affectedTrack: newItem.trackName
                });
            }
        }
    }
    return changes;
}
function getEntityType(domain, item) {
    if (domain === "cuts")
        return "clip";
    if (domain === "audio")
        return "audio_clip";
    if (domain === "effects")
        return "effect";
    if (domain === "captions")
        return "caption";
    if (domain === "color")
        return "color_grade";
    if (domain === "markers")
        return "marker";
    return "metadata";
}
function generateAddSummary(domain, type, item, fps) {
    const tc = item.recordIn !== undefined ? ` at ${framesToTimecode(item.recordIn, fps)}` : "";
    if (type === "caption")
        return `Added animated caption: '${item.textConfig?.content || item.name}'${tc}.`;
    if (type === "audio_clip")
        return `Added audio track '${item.name}'${tc}.`;
    return `Added ${type.replace("_", " ")} '${item.name || item.id}'${tc}.`;
}
function generateRemoveSummary(domain, type, item, fps) {
    const tc = item.recordIn !== undefined ? ` from ${framesToTimecode(item.recordIn, fps)}` : "";
    return `Removed ${type.replace("_", " ")} '${item.name || item.id}'${tc}.`;
}
function generateUpdateSummary(domain, type, oldItem, newItem, fps) {
    if (type === "clip") {
        // Replacement
        if (oldItem.name !== newItem.name) {
            return `Replaced '${oldItem.name}' with '${newItem.name}' from ${framesToTimecode(newItem.recordIn, fps)}.`;
        }
        // Trim
        if (oldItem.recordOut - oldItem.recordIn !== newItem.recordOut - newItem.recordIn) {
            const oldDur = (oldItem.recordOut - oldItem.recordIn) / fps;
            const newDur = (newItem.recordOut - newItem.recordIn) / fps;
            const diff = Math.abs(oldDur - newDur).toFixed(1);
            const action = newDur < oldDur ? "Trimmed" : "Extended";
            return `${action} clip '${newItem.name}' by ${diff} seconds from ${framesToTimecode(newItem.recordIn, fps)} to ${framesToTimecode(newItem.recordOut, fps)}.`;
        }
        // Move
        if (oldItem.recordIn !== newItem.recordIn) {
            return `Moved '${newItem.name}' on ${newItem.trackName} to ${framesToTimecode(newItem.recordIn, fps)}.`;
        }
    }
    if (type === "audio_clip" && oldItem.audioConfig && newItem.audioConfig) {
        if (oldItem.audioConfig.volumeDb !== newItem.audioConfig.volumeDb) {
            return `Changed dialogue audio gain from ${oldItem.audioConfig.volumeDb.toFixed(1)} dB to ${newItem.audioConfig.volumeDb.toFixed(1)} dB for clip '${newItem.name}'.`;
        }
    }
    if (type === "color_grade") {
        if (oldItem.preset !== newItem.preset) {
            return `Applied ${newItem.preset} cinematic grade preset to clip.`;
        }
    }
    return `Updated ${type.replace("_", " ")} properties for '${newItem.name || newItem.id}'.`;
}
//# sourceMappingURL=resolve-differ.js.map