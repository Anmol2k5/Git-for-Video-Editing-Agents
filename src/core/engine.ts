/**
 * EditVCS — Core VCS Engine
 * 
 * Wraps git operations with creative-editing semantics.
 * Manages domain-split JSON files, commits with actor metadata,
 * branching, and project initialization.
 */

import { simpleGit, SimpleGit } from "simple-git";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import type {
  Actor,
  BranchInfo,
  Commit,
  DomainConfig,
  DomainFile,
  ProjectConfig,
  DEFAULT_DOMAINS
} from "./types.js";

export class EditVCSEngine {
  private git: SimpleGit;
  private projectRoot: string;
  private configDir: string;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
    this.configDir = join(projectRoot, ".editvcs");
    if (!existsSync(projectRoot)) {
      mkdirSync(projectRoot, { recursive: true });
    }
    this.git = simpleGit(projectRoot);
  }

  // ─── Initialization ─────────────────────────────────────────────────

  /**
   * Initialize a new EditVCS project
   */
  async init(name: string, adapter: string = "generic", domains?: DomainConfig[]): Promise<void> {
    // Create project directory if it doesn't exist
    if (!existsSync(this.projectRoot)) {
      mkdirSync(this.projectRoot, { recursive: true });
    }

    // Initialize git repo
    await this.git.init();

    // Create .editvcs config directory
    mkdirSync(this.configDir, { recursive: true });

    // Import DEFAULT_DOMAINS dynamically to avoid circular deps
    const { DEFAULT_DOMAINS: defaultDomains } = await import("./types.js");

    // Write project config
    const config: ProjectConfig = {
      name,
      adapter,
      domains: domains || defaultDomains,
      createdAt: new Date().toISOString(),
      version: "0.1.0"
    };

    writeFileSync(
      join(this.configDir, "config.json"),
      JSON.stringify(config, null, 2)
    );

    // Create initial domain files
    const domainList = domains || defaultDomains;
    for (const domain of domainList) {
      const filePath = join(this.projectRoot, domain.filename);
      if (!existsSync(filePath)) {
        writeFileSync(filePath, JSON.stringify({}, null, 2));
      }
    }

    // Create .gitignore
    const gitignore = [
      "node_modules/",
      ".DS_Store",
      "Thumbs.db",
      "*.tmp",
      ""
    ].join("\n");
    writeFileSync(join(this.projectRoot, ".gitignore"), gitignore);

    // Initial commit
    await this.git.add(".");
    await this.git.commit("Initialize EditVCS project", {
      "--author": `EditVCS <editvcs@system>`
    });
  }

  // ─── Configuration ──────────────────────────────────────────────────

  /**
   * Load project configuration
   */
  getConfig(): ProjectConfig {
    const configPath = join(this.configDir, "config.json");
    if (!existsSync(configPath)) {
      throw new Error("Not an EditVCS project. Run 'editvcs init' first.");
    }
    return JSON.parse(readFileSync(configPath, "utf-8"));
  }

  /**
   * Check if current directory is an EditVCS project
   */
  isInitialized(): boolean {
    return existsSync(join(this.configDir, "config.json"));
  }

  // ─── Commit Operations ──────────────────────────────────────────────

  /**
   * Commit current state with actor metadata
   */
  async commit(message: string, actor: Actor): Promise<Commit> {
    const config = this.getConfig();

    // Detect which domain files changed
    const status = await this.git.status();
    const changedDomains = config.domains
      .filter(d => 
        status.modified.includes(d.filename) || 
        status.not_added.includes(d.filename) ||
        status.created.includes(d.filename)
      )
      .map(d => d.name);

    // Store actor metadata as a JSON file in .editvcs/commits/
    const commitsDir = join(this.configDir, "commits");
    mkdirSync(commitsDir, { recursive: true });

    // Stage all domain files
    for (const domain of config.domains) {
      const filePath = join(this.projectRoot, domain.filename);
      if (existsSync(filePath)) {
        await this.git.add(domain.filename);
      }
    }

    // Construct author string
    const authorName = actor.type === "agent" 
      ? `🤖 ${actor.name}` 
      : actor.name;
    const authorEmail = actor.email || 
      (actor.type === "agent" ? `${actor.name.toLowerCase().replace(/\s/g, '-')}@agent` : "user@editvcs");

    // Commit
    await this.git.add(".editvcs/");
    const result = await this.git.commit(message, {
      "--author": `${authorName} <${authorEmail}>`
    });

    const commitId = result.commit || "HEAD";
    const shortId = commitId.substring(0, 7);

    // Store extended actor metadata
    const commitMeta = {
      id: commitId,
      actor,
      domains: changedDomains,
      timestamp: new Date().toISOString()
    };
    writeFileSync(
      join(commitsDir, `${shortId}.json`),
      JSON.stringify(commitMeta, null, 2)
    );
    await this.git.add(".editvcs/");
    
    // Amend to include the metadata
    try {
      await this.git.raw(["commit", "--amend", "--no-edit"]);
    } catch {
      // If amend fails, just continue
    }

    const log = await this.git.log({ maxCount: 1 });
    const latest = log.latest!;

    return {
      id: latest.hash,
      shortId: latest.hash.substring(0, 7),
      message,
      author: actor,
      timestamp: latest.date,
      domains: changedDomains,
      parentIds: [],
      branch: (await this.git.branch()).current
    };
  }

  // ─── Log ────────────────────────────────────────────────────────────

  /**
   * Get commit history
   */
  async log(maxCount: number = 50): Promise<Commit[]> {
    const gitLog = await this.git.log({ maxCount });
    const commitsDir = join(this.configDir, "commits");

    return gitLog.all.map(entry => {
      // Try to load actor metadata
      const shortId = entry.hash.substring(0, 7);
      let actor: Actor = { type: "human", name: entry.author_name };
      let domains: string[] = [];

      const metaPath = join(commitsDir, `${shortId}.json`);
      if (existsSync(metaPath)) {
        try {
          const meta = JSON.parse(readFileSync(metaPath, "utf-8"));
          actor = meta.actor || actor;
          domains = meta.domains || domains;
        } catch {
          // Use defaults
        }
      }

      // Detect agent from author name pattern
      if (entry.author_name.startsWith("🤖")) {
        actor.type = "agent";
        actor.name = entry.author_name.replace("🤖 ", "");
      }

      return {
        id: entry.hash,
        shortId,
        message: entry.message,
        author: actor,
        timestamp: entry.date,
        domains,
        parentIds: [],
        branch: entry.refs || ""
      };
    });
  }

  // ─── Branch Operations ──────────────────────────────────────────────

  /**
   * Create a new branch
   */
  async createBranch(name: string): Promise<void> {
    await this.git.checkoutLocalBranch(name);
  }

  /**
   * Switch to a branch
   */
  async checkout(name: string): Promise<void> {
    await this.git.checkout(name);
  }

  /**
   * Merge a branch into current branch
   */
  async merge(name: string): Promise<void> {
    await this.git.merge([name]);
  }

  /**
   * List branches
   */
  async listBranches(): Promise<BranchInfo[]> {
    const branches = await this.git.branch();
    return Object.entries(branches.branches).map(([name, info]) => ({
      name,
      current: info.current,
      lastCommit: undefined // Would need additional log calls
    }));
  }

  /**
   * Get current branch
   */
  async currentBranch(): Promise<string> {
    const branches = await this.git.branch();
    return branches.current;
  }

  // ─── Status ─────────────────────────────────────────────────────────

  /**
   * Get status of domain files
   */
  async status(): Promise<{ domain: string; status: string }[]> {
    const config = this.getConfig();
    const gitStatus = await this.git.status();
    const results: { domain: string; status: string }[] = [];

    for (const domain of config.domains) {
      if (gitStatus.modified.includes(domain.filename)) {
        results.push({ domain: domain.name, status: "modified" });
      } else if (gitStatus.not_added.includes(domain.filename)) {
        results.push({ domain: domain.name, status: "untracked" });
      } else if (gitStatus.created.includes(domain.filename)) {
        results.push({ domain: domain.name, status: "new" });
      } else {
        results.push({ domain: domain.name, status: "clean" });
      }
    }

    return results;
  }

  // ─── Domain File Operations ─────────────────────────────────────────

  /**
   * Read a domain file
   */
  readDomain(domainName: string): DomainFile {
    const config = this.getConfig();
    const domainConfig = config.domains.find(d => d.name === domainName);
    if (!domainConfig) {
      throw new Error(`Unknown domain: ${domainName}`);
    }

    const filePath = join(this.projectRoot, domainConfig.filename);
    const data = existsSync(filePath) 
      ? JSON.parse(readFileSync(filePath, "utf-8")) 
      : {};

    return { domain: domainName, data };
  }

  /**
   * Write to a domain file
   */
  writeDomain(domainName: string, data: Record<string, any>): void {
    const config = this.getConfig();
    const domainConfig = config.domains.find(d => d.name === domainName);
    if (!domainConfig) {
      throw new Error(`Unknown domain: ${domainName}`);
    }

    const filePath = join(this.projectRoot, domainConfig.filename);
    writeFileSync(filePath, JSON.stringify(data, null, 2));
  }

  /**
   * Import a full state JSON and split into domains
   */
  async importState(state: Record<string, any>): Promise<any> {
    const config = this.getConfig();
    // Use adapter if possible
    const { adapterRegistry } = await import("../adapters/base.js");
    // Also need to register Resolve and Premiere adapters
    await import("../adapters/resolve/index.js").catch(() => {});
    await import("../adapters/premiere/index.js").catch(() => {});
    
    const adapter = adapterRegistry.get(config.adapter);
    let snapshotId = "unknown";
    
    if (adapter && (adapter as any).importState) {
        const snapshot = await (adapter as any).importState(state);
        for (const domainFile of snapshot.domains) {
           this.writeDomain(domainFile.domain, domainFile.data);
        }
        return snapshot;
    } else {
        // Fallback
        for (const domain of config.domains) {
          if (state[domain.name]) {
            this.writeDomain(domain.name, state[domain.name]);
          }
        }
        return {
           id: "fallback",
           domains: config.domains.map(d => ({ domain: d.name, data: state[d.name] }))
        };
    }
  }

  /**
   * Export all domains as a single state object
   */
  exportState(): Record<string, any> {
    const config = this.getConfig();
    const state: Record<string, any> = {};
    for (const domain of config.domains) {
      state[domain.name] = this.readDomain(domain.name).data;
    }
    return state;
  }
}
