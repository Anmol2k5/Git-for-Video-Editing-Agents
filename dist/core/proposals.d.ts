import { EditProposal, Actor, AgentMetadata } from "./types.js";
export declare class ProposalManager {
    private proposalsDir;
    constructor(repoPath: string);
    /**
     * Creates a new EditProposal by diffing the sourceBranch against the targetBranch.
     */
    createProposal(projectId: string, title: string, description: string, sourceBranch: string, targetBranch: string, createdBy: Actor, agentMetadata?: AgentMetadata, baseDomainFiles?: any, // In a real system, we fetch these from the engine
    compareDomainFiles?: any): Promise<EditProposal>;
    getProposal(id: string): EditProposal | null;
    listProposals(): EditProposal[];
    approveProposal(id: string, reviewer: Actor): EditProposal;
    rejectProposal(id: string, reviewer: Actor, reason: string): EditProposal;
    setChangeGroupStatus(proposalId: string, groupId: string, status: "approved" | "rejected"): EditProposal;
    saveProposal(proposal: EditProposal): void;
}
//# sourceMappingURL=proposals.d.ts.map