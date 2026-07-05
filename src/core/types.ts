/**
 * EditVCS — Core Domain Types (Video Edit Pull Requests)
 */

// ─── Core Entities ───────────────────────────────────────────────────────

export interface Project {
  id: string;
  name: string;
  activeTimelineId: string;
  adapterType: string;
  createdAt: string; // ISO 8601
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

// ─── Versioning (Snapshots / Commits) ───────────────────────────────────

export interface Commit {
  id: string;               // git SHA
  shortId: string;          // first 7 chars
  message: string;
  author: Actor;
  timestamp: string;        // ISO 8601
  domains: string[];        // which domain files were changed
  parentIds: string[];      // parent commit SHAs
  branch: string;           // branch name at time of commit
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

// ─── Edit Proposals (Pull Requests) ─────────────────────────────────────

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

// ─── Changes & Diffs ────────────────────────────────────────────────────

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

// ─── Domain Config & Project Settings ───────────────────────────────────

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
  aheadBehind?: { ahead: number; behind: number };
}

// ─── Constants ──────────────────────────────────────────────────────────

export const RESOLVE_DOMAINS: DomainConfig[] = [
  { name: "cuts", filename: "cuts.json", description: "Video tracks and clips", icon: "✂️", color: "#818cf8" },
  { name: "audio", filename: "audio.json", description: "Audio tracks and clips", icon: "🔊", color: "#60a5fa" },
  { name: "effects", filename: "effects.json", description: "Transitions and effects", icon: "✨", color: "#f472b6" },
  { name: "captions", filename: "captions.json", description: "Subtitles and text", icon: "📝", color: "#34d399" },
  { name: "color", filename: "color.json", description: "Color grades and nodes", icon: "🎨", color: "#fbbf24" },
  { name: "markers", filename: "markers.json", description: "Timeline markers", icon: "📌", color: "#a78bfa" },
  { name: "metadata", filename: "metadata.json", description: "Timeline metadata", icon: "⚙️", color: "#94a3b8" }
];

export const DEFAULT_DOMAINS = RESOLVE_DOMAINS;
