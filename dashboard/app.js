/**
 * EditVCS Dashboard — Application
 * 
 * Powered by local EditVCS API
 */

class EditVCSDashboard {
  constructor() {
    this.currentView = "overview";
    this.activeDiffDomain = "cuts";
    this.projectData = null;
    this.proposals = [];
    this.init();
  }

  async init() {
    this.bindNavigation();
    
    // Initial fetch
    await this.fetchData();
    
    document.getElementById("btn-refresh").addEventListener("click", () => this.fetchData());
  }

  async fetchData() {
    try {
      const projRes = await fetch("/api/projects/current");
      if (projRes.ok) {
        this.projectData = await projRes.json();
      }

      const propRes = await fetch("/api/proposals");
      if (propRes.ok) {
        this.proposals = await propRes.json();
      }

      this.render();
    } catch (e) {
      console.error("Failed to fetch data", e);
    }
  }

  render() {
    if (this.projectData) {
      document.getElementById("project-name").textContent = `🎬 ${this.projectData.name}`;
      const currBranch = this.projectData.branches.find(b => b.current);
      if (currBranch) {
        document.getElementById("project-branch").textContent = `🌿 ${currBranch.name}`;
      }
      
      document.getElementById("stat-branches").textContent = this.projectData.branches.length;
      document.getElementById("badge-paths").textContent = this.projectData.branches.length;
    }

    if (this.proposals) {
      document.getElementById("stat-proposals").textContent = this.proposals.length;
      this.renderPendingReviews();
    }

    this.renderBranches();
  }

  // ─── Navigation ──────────────────────────────────────────────────

  bindNavigation() {
    document.querySelectorAll(".sidebar-link[data-view]").forEach(link => {
      link.addEventListener("click", () => {
        const view = link.dataset.view;
        this.switchView(view);
      });
    });
  }

  switchView(viewName) {
    document.querySelectorAll(".sidebar-link[data-view]").forEach(l => l.classList.remove("active"));
    const activeLink = document.querySelector(`[data-view="${viewName}"]`);
    if (activeLink) activeLink.classList.add("active");

    document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
    const view = document.getElementById(`view-${viewName}`);
    if (view) {
      view.classList.remove("active");
      void view.offsetWidth;
      view.classList.add("active");
    }

    const headers = {
      overview: { icon: "📊", text: "Project Overview" },
      timeline: { icon: "📜", text: "Saved Versions" },
      diff: { icon: "🔀", text: "What Changed" },
      branches: { icon: "🌿", text: "Edit Paths" },
      agents: { icon: "🤖", text: "Agent Activity" }
    };

    const h = headers[viewName] || headers.overview;
    document.getElementById("header-icon").textContent = h.icon;
    document.getElementById("header-text").textContent = h.text;

    this.currentView = viewName;
  }

  // ─── Renderers ───────────────────────────────────────────────────

  renderPendingReviews() {
    const container = document.getElementById("pending-reviews");
    const pending = this.proposals.filter(p => p.status === "pending_review");

    if (pending.length === 0) {
      container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">✅</div><div class="empty-state-title">All caught up!</div><div class="empty-state-text">No pending review requests.</div></div>';
      return;
    }

    container.innerHTML = pending.map(proposal => `
      <div class="pending-review" id="proposal-${proposal.id}">
        <div class="pending-header">
          <div class="pending-title">
            ${proposal.createdBy.type === "agent" ? "🤖" : "👤"} ${proposal.createdBy.name}
            ${proposal.agentMetadata ? `<span class="agent-badge">${proposal.agentMetadata.model}</span>` : ""}
            <span class="review-badge review-pending">⏳ Pending Review</span>
          </div>
          <div class="pending-actions">
            <button class="btn btn-success btn-sm" onclick="app.approveProposal('${proposal.id}')">Approve All</button>
            <button class="btn btn-danger btn-sm" onclick="app.rejectProposal('${proposal.id}')">Reject</button>
          </div>
        </div>
        <div class="pending-detail">
          <strong>${proposal.title}</strong>
          <div style="font-size: var(--text-sm); color: var(--text-tertiary); margin-top: 4px;">
            ${proposal.sourceBranch} → ${proposal.targetBranch}
          </div>
        </div>
        
        ${proposal.agentMetadata ? `
          <div class="agent-reasoning">
            <div class="agent-reasoning-label">🧠 Agent Reasoning</div>
            ${proposal.agentMetadata.reasoningSummary}
          </div>
        ` : ""}
        
        <div style="margin-top: var(--space-4)">
          <div style="font-weight: 600; margin-bottom: var(--space-3)">Change Groups</div>
          ${proposal.changeGroups.map(cg => `
            <div class="change-group" style="background: var(--surface-hover); padding: var(--space-3); border-radius: 6px; margin-bottom: var(--space-2); border: 1px solid var(--border-color);">
              <div class="flex-between">
                <div>
                  <strong>${this.getDomainIcon(cg.domain)} ${cg.title}</strong>
                  <div style="font-size: var(--text-xs); color: var(--text-tertiary);">${cg.description}</div>
                </div>
                <div style="display: flex; gap: 4px;">
                  <button class="btn btn-ghost btn-sm ${cg.status === 'approved' ? 'active text-green' : ''}" onclick="app.setChangeGroupStatus('${proposal.id}', '${cg.id}', 'approved')">✓</button>
                  <button class="btn btn-ghost btn-sm ${cg.status === 'rejected' ? 'active text-red' : ''}" onclick="app.setChangeGroupStatus('${proposal.id}', '${cg.id}', 'rejected')">✕</button>
                </div>
              </div>
              <ul class="timeline-changes" style="margin-top: var(--space-2)">
                ${cg.changes.map(c => `
                  <li class="timeline-change" style="font-size: var(--text-xs)">
                    <span class="timeline-change-icon ${c.operation === 'add' ? 'added' : c.operation === 'remove' ? 'removed' : 'modified'}">
                      ${c.operation === 'add' ? '+' : c.operation === 'remove' ? '-' : '~'}
                    </span>
                    ${c.humanReadableSummary}
                  </li>
                `).join("")}
              </ul>
            </div>
          `).join("")}
        </div>
        
        <div style="margin-top: var(--space-4); text-align: right;">
           <button class="btn btn-primary" onclick="app.applyProposal('${proposal.id}')" ${proposal.status !== 'approved' ? 'disabled' : ''}>Apply Approved Changes</button>
        </div>
      </div>
    `).join("");
  }

  renderBranches() {
    const list = document.getElementById("branch-list");
    if (!this.projectData) return;
    
    list.innerHTML = this.projectData.branches.map((branch, idx) => `
      <div class="branch-card ${branch.current ? 'current' : ''}" style="animation: fadeSlideIn 0.3s var(--ease-out) ${idx * 80}ms backwards">
        <div class="branch-info">
          <span class="branch-icon">${branch.current ? '🟢' : '🌿'}</span>
          <div>
            <div class="branch-name">${branch.name}</div>
          </div>
        </div>
        <div class="branch-actions">
          ${branch.current ? `
            <span class="branch-current-badge">● Current</span>
          ` : `
            <button class="btn btn-ghost btn-sm">Checkout</button>
          `}
        </div>
      </div>
    `).join("");
  }

  // ─── Actions ──────────────────────────────────────────────────────

  async approveProposal(id) {
    await fetch(`/api/proposals/${id}/approve`, { method: 'POST', headers: {'Content-Type': 'application/json'} });
    this.fetchData();
  }

  async rejectProposal(id) {
    await fetch(`/api/proposals/${id}/reject`, { method: 'POST', headers: {'Content-Type': 'application/json'} });
    this.fetchData();
  }

  async setChangeGroupStatus(proposalId, groupId, status) {
    await fetch(`/api/proposals/${proposalId}/change-groups/${groupId}`, { 
      method: 'POST', 
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ status })
    });
    this.fetchData();
  }
  
  async applyProposal(id) {
    const res = await fetch(`/api/proposals/${id}/apply`, { method: 'POST', headers: {'Content-Type': 'application/json'} });
    if(res.ok) {
       alert("Changes applied successfully to main timeline!");
       this.fetchData();
    } else {
       const err = await res.json();
       alert("Failed to apply: " + err.error);
    }
  }

  getDomainIcon(domain) {
    const icons = {
      cuts: "✂️", audio: "🔊", effects: "✨",
      captions: "📝", color: "🎨", markers: "📌", metadata: "⚙️"
    };
    return icons[domain] || "📄";
  }
}

const app = new EditVCSDashboard();
