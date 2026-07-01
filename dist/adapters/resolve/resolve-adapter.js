import { RESOLVE_DOMAINS } from "../../core/types.js";
import { normalizeResolveTimeline, denormalizeToResolveTimeline } from "./resolve-normalizer.js";
import { resolveDiffer } from "./resolve-differ.js";
export class ResolveAdapter {
    name = "davinci-resolve";
    displayName = "DaVinci Resolve";
    description = "DaVinci Resolve Timeline XML/JSON Metadata Adapter";
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
        return { valid: true, errors: [], warnings: [] }; // Mock validation
    }
    getDiffer() {
        return resolveDiffer;
    }
}
//# sourceMappingURL=resolve-adapter.js.map