import { Adapter, ValidationResult } from "../base";
import { ProjectConfig, DomainFile, TimelineSnapshot, RESOLVE_DOMAINS, DomainConfig } from "../../core/types";
import { normalizeResolveTimeline, denormalizeToResolveTimeline } from "./resolve-normalizer";
import { resolveDiffer } from "./resolve-differ";

export class ResolveAdapter implements Adapter {
  name = "davinci-resolve";
  displayName = "DaVinci Resolve";
  description = "DaVinci Resolve Timeline XML/JSON Metadata Adapter";

  serialize(projectState: any): DomainFile[] {
    return normalizeResolveTimeline(projectState);
  }

  deserialize(domains: DomainFile[]): any {
    return denormalizeToResolveTimeline(domains);
  }

  getDomainConfig(): DomainConfig[] {
    return RESOLVE_DOMAINS;
  }

  validate(projectState: any): ValidationResult {
    return { valid: true, errors: [], warnings: [] }; // Mock validation
  }

  getDiffer() {
    return resolveDiffer;
  }
}

