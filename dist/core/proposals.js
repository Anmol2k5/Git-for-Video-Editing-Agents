import * as fs from "fs";
import * as path from "path";
import { resolveDiffer } from "../adapters/resolve/resolve-differ.js";
export class ProposalManager {
    proposalsDir;
    constructor(repoPath) {
        this.proposalsDir = path.join(repoPath, ".editvcs", "proposals");
        if (!fs.existsSync(this.proposalsDir)) {
            fs.mkdirSync(this.proposalsDir, { recursive: true });
        }
    }
    /**
     * Creates a new EditProposal by diffing the sourceBranch against the targetBranch.
     */
    async createProposal(projectId, title, description, sourceBranch, targetBranch, createdBy, agentMetadata, baseDomainFiles, // In a real system, we fetch these from the engine
    compareDomainFiles) {
        const changeGroups = [];
        // Diff each domain
        if (baseDomainFiles && compareDomainFiles) {
            for (const domain of Object.keys(compareDomainFiles)) {
                const changes = resolveDiffer(domain, baseDomainFiles[domain] || {}, compareDomainFiles[domain] || {});
                if (changes.length > 0) {
                    changeGroups.push({
                        id: crypto.randomUUID(),
                        domain,
                        title: `Changes in ${domain}`,
                        description: `${changes.length} modifications detected.`,
                        status: "pending",
                        changes
                    });
                }
            }
        }
        const proposal = {
            id: crypto.randomUUID(),
            projectId,
            title,
            description,
            sourceBranch,
            targetBranch,
            status: "pending_review",
            createdBy,
            createdAt: new Date().toISOString(),
            agentMetadata,
            changeGroups
        };
        this.saveProposal(proposal);
        return proposal;
    }
    getProposal(id) {
        const p = path.join(this.proposalsDir, `${id}.json`);
        if (!fs.existsSync(p))
            return null;
        return JSON.parse(fs.readFileSync(p, "utf-8"));
    }
    listProposals() {
        const files = fs.readdirSync(this.proposalsDir).filter(f => f.endsWith(".json"));
        return files.map(f => {
            const content = fs.readFileSync(path.join(this.proposalsDir, f), "utf-8");
            return JSON.parse(content);
        }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
    approveProposal(id, reviewer) {
        const proposal = this.getProposal(id);
        if (!proposal)
            throw new Error("Proposal not found");
        proposal.status = "approved";
        proposal.reviewedBy = reviewer;
        proposal.reviewedAt = new Date().toISOString();
        // Auto-approve all pending change groups
        proposal.changeGroups.forEach(cg => {
            if (cg.status === "pending")
                cg.status = "approved";
        });
        this.saveProposal(proposal);
        return proposal;
    }
    rejectProposal(id, reviewer, reason) {
        const proposal = this.getProposal(id);
        if (!proposal)
            throw new Error("Proposal not found");
        proposal.status = "rejected";
        proposal.reviewedBy = reviewer;
        proposal.reviewedAt = new Date().toISOString();
        if (!proposal.comments)
            proposal.comments = [];
        proposal.comments.push({
            id: crypto.randomUUID(),
            author: reviewer,
            content: reason,
            timestamp: new Date().toISOString()
        });
        // Auto-reject all pending change groups
        proposal.changeGroups.forEach(cg => {
            if (cg.status === "pending")
                cg.status = "rejected";
        });
        this.saveProposal(proposal);
        return proposal;
    }
    setChangeGroupStatus(proposalId, groupId, status) {
        const proposal = this.getProposal(proposalId);
        if (!proposal)
            throw new Error("Proposal not found");
        const group = proposal.changeGroups.find(g => g.id === groupId);
        if (!group)
            throw new Error("Change group not found");
        group.status = status;
        this.saveProposal(proposal);
        return proposal;
    }
    saveProposal(proposal) {
        const p = path.join(this.proposalsDir, `${proposal.id}.json`);
        fs.writeFileSync(p, JSON.stringify(proposal, null, 2), "utf-8");
    }
}
//# sourceMappingURL=proposals.js.map