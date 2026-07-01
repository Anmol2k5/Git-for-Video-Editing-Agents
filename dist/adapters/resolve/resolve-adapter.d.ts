import { Adapter, ValidationResult } from "../base.js";
import { DomainFile, DomainConfig } from "../../core/types.js";
import { resolveDiffer } from "./resolve-differ.js";
export declare class ResolveAdapter implements Adapter {
    name: string;
    displayName: string;
    description: string;
    serialize(projectState: any): DomainFile[];
    deserialize(domains: DomainFile[]): any;
    getDomainConfig(): DomainConfig[];
    validate(projectState: any): ValidationResult;
    getDiffer(): typeof resolveDiffer;
}
//# sourceMappingURL=resolve-adapter.d.ts.map