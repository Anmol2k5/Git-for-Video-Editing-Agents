/**
 * EditVCS — Core Domain Types (Video Edit Pull Requests)
 */
// ─── Constants ──────────────────────────────────────────────────────────
export const RESOLVE_DOMAINS = [
    { name: "cuts", filename: "cuts.json", description: "Video tracks and clips", icon: "✂️", color: "#818cf8" },
    { name: "audio", filename: "audio.json", description: "Audio tracks and clips", icon: "🔊", color: "#60a5fa" },
    { name: "effects", filename: "effects.json", description: "Transitions and effects", icon: "✨", color: "#f472b6" },
    { name: "captions", filename: "captions.json", description: "Subtitles and text", icon: "📝", color: "#34d399" },
    { name: "color", filename: "color.json", description: "Color grades and nodes", icon: "🎨", color: "#fbbf24" },
    { name: "markers", filename: "markers.json", description: "Timeline markers", icon: "📌", color: "#a78bfa" },
    { name: "metadata", filename: "metadata.json", description: "Timeline metadata", icon: "⚙️", color: "#94a3b8" }
];
export const DEFAULT_DOMAINS = RESOLVE_DOMAINS;
//# sourceMappingURL=types.js.map