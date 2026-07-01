import { Adapter } from "../base.js";
import { TimelineSnapshot, DomainFile } from "../../core/types.js";
import { normalizeResolveTimeline, denormalizeToResolveTimeline } from "./resolve-normalizer.js";
import { resolveDiffer } from "./resolve-differ.js";
import { ResolveLiveImporter } from "./resolve-live-import.js";
import * as crypto from "crypto";

export class ResolveAdapter implements Adapter {
  name = "davinci-resolve";

  /**
   * Imports state either from a live DaVinci Resolve instance or a JSON fixture.
   */
  async importState(rawData: any): Promise<TimelineSnapshot> {
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
      timestamp: Date.now(),
      domains,
      sourceType: exportData.source === "davinci-resolve-live" ? "resolve-live-import" : "resolve-mock"
    };
  }

  async exportState(snapshot: TimelineSnapshot): Promise<any> {
    // For Phase 1, we do not export back to live resolve.
    // This just returns the mocked format.
    return denormalizeToResolveTimeline(snapshot.domains);
  }

  diff(base: TimelineSnapshot, compare: TimelineSnapshot) {
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
