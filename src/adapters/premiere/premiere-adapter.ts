import { Adapter, ValidationResult } from "../base.js";
import { DomainFile, DomainConfig, RESOLVE_DOMAINS } from "../../core/types.js";
import { normalizePremiereTimeline, denormalizeToPremiereTimeline } from "./premiere-normalizer.js";

export class PremiereAdapter implements Adapter {
  name = "adobe-premiere";
  displayName = "Adobe Premiere Pro";
  description = "Adapter for Adobe Premiere Pro sequences";

  serialize(projectState: any): DomainFile[] {
    return normalizePremiereTimeline(projectState);
  }

  deserialize(domains: DomainFile[]): any {
    return denormalizeToPremiereTimeline(domains);
  }

  getDomainConfig(): DomainConfig[] {
    return RESOLVE_DOMAINS; // Reusing standard domain configs (cuts, audio, markers, etc)
  }

  validate(projectState: any): ValidationResult {
    if (!projectState || projectState.error) {
      return { valid: false, errors: [projectState?.error || "Invalid state"], warnings: [] };
    }
    return { valid: true, errors: [], warnings: [] };
  }
}
