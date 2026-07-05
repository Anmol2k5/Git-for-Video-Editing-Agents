/**
 * EditVCS — Core Domain Types (Video Edit Pull Requests)
 */
export interface Project {
    id: string;
    name: string;
    activeTimelineId: string;
    adapterType: string;
    createdAt: string;
}
export interface Actor {
    type: "human" | "agent";
    name: string;
    email?: string;
    model?: string;
    provider?: string;
    toolCalls?: ToolCall[];
    reasoning?: string;
    confidence?: number;
}
export interface AgentMetadata {
    agentName: string;
    provider: string;
    model: string;
    prompt?: string;
    reasoningSummary: string;
    confidence: number;
    toolCalls?: ToolCall[];
    executionDurationMs?: number;
    inputSnapshotId?: string;
}
export interface ToolCall {
    tool: string;
    args: Record<string, any>;
    result?: string;
    durationMs?: number;
}
export interface Commit {
    id: string;
    shortId: string;
    message: string;
    author: Actor;
    timestamp: string;
    domains: string[];
    parentIds: string[];
    branch: string;
    tags?: string[];
    status?: "approved" | "pending" | "rejected";
    reviewedBy?: Actor;
    reviewNote?: string;
}
export interface TimelineSnapshot {
    id: string;
    projectId: string;
    parentSnapshotId?: string;
    branchName: string;
    createdBy: Actor;
    createdAt: string;
    sourceTimelinePath?: string;
    domains: DomainFile[] | string[];
    previewPath?: string;
    summary: string;
}
export type ProposalStatus = "draft" | "pending_review" | "approved" | "rejected" | "merged" | "changes_requested";
export interface EditProposal {
    id: string;
    projectId: string;
    sourceBranch: string;
    targetBranch: string;
    title: string;
    description: string;
    status: ProposalStatus;
    createdBy: Actor;
    createdAt: string;
    reviewedBy?: Actor;
    reviewedAt?: string;
    agentMetadata?: AgentMetadata;
    changeGroups: ChangeGroup[];
    comments?: ProposalComment[];
}
export interface ProposalComment {
    id: string;
    author: Actor;
    content: string;
    timestamp: string;
    timecode?: string;
}
export type ChangeGroupStatus = "pending" | "approved" | "rejected";
export interface ChangeGroup {
    id: string;
    domain: string;
    title: string;
    description: string;
    confidence?: number;
    status: ChangeGroupStatus;
    changes: TimelineChange[];
    previewStartTimecode?: string;
    previewEndTimecode?: string;
}
export type TimelineOperation = "add" | "remove" | "update" | "move" | "replace";
export type EntityType = "clip" | "audio_clip" | "marker" | "transition" | "effect" | "caption" | "color_grade" | "metadata";
export interface TimelineChange {
    id: string;
    domain: string;
    operation: TimelineOperation;
    entityType: EntityType;
    entityId: string;
    before: any;
    after: any;
    humanReadableSummary: string;
    timecodeStart?: string;
    timecodeEnd?: string;
    affectedTrack?: string;
}
export interface DiffChange {
    domain: string;
    path: string;
    type: "added" | "removed" | "modified";
    oldValue?: any;
    newValue?: any;
    description: string;
}
export interface DiffResult {
    fromCommit: string;
    toCommit: string;
    changes: DiffChange[];
    summary: string;
    domains: string[];
}
export interface MergeConflict {
    domain: string;
    path: string;
    description: string;
    oursValue: any;
    theirsValue: any;
    baseValue?: any;
    suggestedResolution?: any;
    resolutionReasoning?: string;
}
export interface MergeResult {
    success: boolean;
    autoMerged: DomainFile[];
    conflicts: MergeConflict[];
    commitId?: string;
}
export interface DomainConfig {
    name: string;
    filename: string;
    description: string;
    icon: string;
    color: string;
    typicalOwner?: string;
}
export interface DomainFile {
    domain: string;
    data: Record<string, any>;
}
export interface ProjectConfig {
    name: string;
    adapter: string;
    domains: DomainConfig[];
    createdAt: string;
    version: string;
}
export interface BranchInfo {
    name: string;
    current: boolean;
    lastCommit?: Commit;
    aheadBehind?: {
        ahead: number;
        behind: number;
    };
}
export declare const RESOLVE_DOMAINS: DomainConfig[];
export declare const DEFAULT_DOMAINS: DomainConfig[];
//# sourceMappingURL=types.d.ts.map