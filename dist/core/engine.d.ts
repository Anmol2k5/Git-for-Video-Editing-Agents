/**
 * EditVCS — Core VCS Engine
 *
 * Wraps git operations with creative-editing semantics.
 * Manages domain-split JSON files, commits with actor metadata,
 * branching, and project initialization.
 */
import type { Actor, BranchInfo, Commit, DomainConfig, DomainFile, ProjectConfig } from "./types.js";
export declare class EditVCSEngine {
    private git;
    private projectRoot;
    private configDir;
    constructor(projectRoot: string);
    /**
     * Initialize a new EditVCS project
     */
    init(name: string, adapter?: string, domains?: DomainConfig[]): Promise<void>;
    /**
     * Load project configuration
     */
    getConfig(): ProjectConfig;
    /**
     * Check if current directory is an EditVCS project
     */
    isInitialized(): boolean;
    /**
     * Commit current state with actor metadata
     */
    commit(message: string, actor: Actor): Promise<Commit>;
    /**
     * Get commit history
     */
    log(maxCount?: number): Promise<Commit[]>;
    /**
     * Create a new branch
     */
    createBranch(name: string): Promise<void>;
    /**
     * Switch to a branch
     */
    checkout(name: string): Promise<void>;
    /**
     * Merge a branch into current branch
     */
    merge(name: string): Promise<void>;
    /**
     * List branches
     */
    listBranches(): Promise<BranchInfo[]>;
    /**
     * Get current branch
     */
    currentBranch(): Promise<string>;
    /**
     * Get status of domain files
     */
    status(): Promise<{
        domain: string;
        status: string;
    }[]>;
    /**
     * Read a domain file
     */
    readDomain(domainName: string): DomainFile;
    /**
     * Write to a domain file
     */
    writeDomain(domainName: string, data: Record<string, any>): void;
    /**
     * Import a full state JSON and split into domains
     */
    importState(state: Record<string, any>): Promise<any>;
    /**
     * Export all domains as a single state object
     */
    exportState(): Record<string, any>;
}
//# sourceMappingURL=engine.d.ts.map