/**
 * Splits a monolithic DaVinci Resolve timeline into first-class domain files.
 */
export function normalizeResolveTimeline(timeline) {
    const cuts = {};
    const audio = {};
    const effects = {};
    const captions = {};
    const color = {};
    const markers = {};
    // Metadata
    const metadata = {
        id: timeline.id,
        name: timeline.name,
        framerate: timeline.framerate,
        resolution: timeline.resolution
    };
    // Markers
    timeline.markers.forEach(m => {
        markers[m.id] = m;
    });
    // Tracks and Clips
    timeline.tracks.forEach(track => {
        track.clips.forEach(clip => {
            // 1. Cuts (Video structure)
            if (track.type === "video") {
                cuts[clip.id] = {
                    trackId: track.id,
                    trackName: track.name,
                    name: clip.name,
                    type: clip.type,
                    recordIn: clip.recordIn,
                    recordOut: clip.recordOut,
                    startFrame: clip.startFrame,
                    endFrame: clip.endFrame
                };
                // Effects on video clips
                if (clip.effects && clip.effects.length > 0) {
                    effects[clip.id] = clip.effects;
                }
                // Color grades on video clips
                if (clip.colorGrade) {
                    color[clip.id] = clip.colorGrade;
                }
            }
            // 2. Audio (Audio structure & mix)
            if (track.type === "audio") {
                audio[clip.id] = {
                    trackId: track.id,
                    trackName: track.name,
                    name: clip.name,
                    recordIn: clip.recordIn,
                    recordOut: clip.recordOut,
                    startFrame: clip.startFrame,
                    endFrame: clip.endFrame,
                    audioConfig: clip.audioConfig || { volumeDb: 0, pan: 0 }
                };
            }
            // 3. Captions / Titles
            if (track.type === "subtitle" || clip.type === "title") {
                captions[clip.id] = {
                    trackId: track.id,
                    trackName: track.name,
                    name: clip.name,
                    recordIn: clip.recordIn,
                    recordOut: clip.recordOut,
                    textConfig: clip.textConfig
                };
            }
        });
    });
    return [
        { domain: "cuts", data: cuts },
        { domain: "audio", data: audio },
        { domain: "effects", data: effects },
        { domain: "captions", data: captions },
        { domain: "color", data: color },
        { domain: "markers", data: markers },
        { domain: "metadata", data: metadata }
    ];
}
/**
 * Reassembles domain files back into a single Resolve timeline JSON.
 * (In a real implementation, this might push directly to the Resolve API instead of generating JSON)
 */
export function denormalizeToResolveTimeline(domainFiles) {
    const getFile = (domain) => domainFiles.find(f => f.domain === domain)?.data || {};
    const cuts = getFile("cuts");
    const audio = getFile("audio");
    const effects = getFile("effects");
    const captions = getFile("captions");
    const color = getFile("color");
    const markers = getFile("markers");
    const metadata = getFile("metadata");
    const timeline = {
        id: metadata.id || "unknown",
        name: metadata.name || "Reassembled Timeline",
        framerate: metadata.framerate || 24,
        resolution: metadata.resolution || { width: 1920, height: 1080 },
        tracks: [],
        markers: Object.values(markers)
    };
    // We need to rebuild tracks from clips
    const trackMap = new Map();
    const getOrCreateTrack = (trackId, trackName, type) => {
        if (!trackMap.has(trackId)) {
            trackMap.set(trackId, {
                id: trackId,
                index: trackMap.size + 1,
                type,
                name: trackName,
                clips: []
            });
        }
        return trackMap.get(trackId);
    };
    // Reassemble Video Cuts
    Object.entries(cuts).forEach(([clipId, cutData]) => {
        const track = getOrCreateTrack(cutData.trackId, cutData.trackName, "video");
        const clip = {
            id: clipId,
            name: cutData.name,
            type: cutData.type,
            recordIn: cutData.recordIn,
            recordOut: cutData.recordOut,
            startFrame: cutData.startFrame,
            endFrame: cutData.endFrame,
            duration: cutData.endFrame - cutData.startFrame
        };
        if (effects[clipId])
            clip.effects = effects[clipId];
        if (color[clipId])
            clip.colorGrade = color[clipId];
        track.clips.push(clip);
    });
    // Reassemble Audio
    Object.entries(audio).forEach(([clipId, audioData]) => {
        const track = getOrCreateTrack(audioData.trackId, audioData.trackName, "audio");
        track.clips.push({
            id: clipId,
            name: audioData.name,
            type: "audio",
            recordIn: audioData.recordIn,
            recordOut: audioData.recordOut,
            startFrame: audioData.startFrame,
            endFrame: audioData.endFrame,
            duration: audioData.endFrame - audioData.startFrame,
            audioConfig: audioData.audioConfig
        });
    });
    // Reassemble Captions
    Object.entries(captions).forEach(([clipId, capData]) => {
        const track = getOrCreateTrack(capData.trackId, capData.trackName, "subtitle");
        track.clips.push({
            id: clipId,
            name: capData.name,
            type: "title",
            recordIn: capData.recordIn,
            recordOut: capData.recordOut,
            startFrame: capData.recordIn, // rough approximation for titles
            endFrame: capData.recordOut,
            duration: capData.recordOut - capData.recordIn,
            textConfig: capData.textConfig
        });
    });
    // Sort tracks by index
    timeline.tracks = Array.from(trackMap.values()).sort((a, b) => a.index - b.index);
    return timeline;
}
//# sourceMappingURL=resolve-normalizer.js.map