import { Adapter } from "../base.js";
import { TimelineSnapshot, DomainFile, DomainConfig } from "../../core/types.js";
export declare class ResolveAdapter implements Adapter {
    name: string;
    displayName: string;
    description: string;
    serialize(projectState: any): DomainFile[];
    deserialize(domains: DomainFile[]): any;
    getDomainConfig(): DomainConfig[];
    validate(projectState: any): {
        valid: boolean;
        errors: string[];
        warnings: never[];
    };
    /**
  
     * Imports state either from a live DaVinci Resolve instance or a JSON fixture.
     */
    importState(rawData: any): Promise<TimelineSnapshot>;
    exportState(snapshot: TimelineSnapshot): Promise<any>;
    diff(base: TimelineSnapshot, compare: TimelineSnapshot): import("../../core/types.js").TimelineChange[];
}
//# sourceMappingURL=resolve-adapter.d.ts.map