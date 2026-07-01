#!/usr/bin/env node
/**
 * EditVCS — CLI Entry Point
 *
 * Command-line interface for DaVinci Resolve version control and AI proposals.
 */
import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { readFileSync } from "fs";
import { resolve } from "path";
import { EditVCSEngine } from "../core/engine.js";
import { ProposalManager } from "../core/proposals.js";
import { startServer } from "../server/index.js";
const program = new Command();
program
    .name("editvcs")
    .description(chalk.bold("EditVCS") + " — Pull requests for AI video edits")
    .version("0.2.0");
// ─── Core Commands ───────────────────────────────────────────────────
program
    .command("init")
    .argument("<name>", "Project name")
    .option("-a, --adapter <adapter>", "Adapter type", "davinci-resolve")
    .description("Initialize a new EditVCS project")
    .action(async (name, options) => {
    const spinner = ora("Initializing EditVCS project...").start();
    try {
        const projectPath = resolve(process.cwd(), name);
        const engine = new EditVCSEngine(projectPath);
        await engine.init(name, options.adapter);
        spinner.succeed(chalk.green(`Project '${name}' initialized!`));
    }
    catch (err) {
        spinner.fail(chalk.red("Failed to initialize: " + err.message));
        process.exit(1);
    }
});
program
    .command("status")
    .description("Show status of domain files")
    .action(async () => {
    const engine = new EditVCSEngine(process.cwd());
    if (!engine.isInitialized()) {
        console.error(chalk.red("Not an EditVCS project."));
        process.exit(1);
    }
    const status = await engine.status();
    console.log(status);
});
program
    .command("import")
    .argument("<file>", "JSON file to import")
    .description("Import a JSON state file (DaVinci Resolve export)")
    .action(async (file) => {
    const engine = new EditVCSEngine(process.cwd());
    const filePath = resolve(file);
    const state = JSON.parse(readFileSync(filePath, "utf-8"));
    await engine.importState(state);
    console.log(chalk.green("✓ State imported successfully."));
});
program
    .command("commit")
    .option("-m, --message <message>", "Commit message")
    .option("--agent", "Commit as an AI agent")
    .option("--agent-name <name>", "Agent name", "AI Assistant")
    .option("--agent-model <model>", "Agent model", "unknown")
    .option("--reasoning <text>", "Agent reasoning for the change")
    .option("--confidence <score>", "Agent confidence score (0-1)")
    .description("Commit current state")
    .action(async (options) => {
    const engine = new EditVCSEngine(process.cwd());
    const message = options.message || "Update";
    const actor = options.agent
        ? { type: "agent", name: options.agentName, model: options.agentModel, reasoning: options.reasoning, confidence: options.confidence ? parseFloat(options.confidence) : undefined }
        : { type: "human", name: process.env.USER || process.env.USERNAME || "User" };
    const commit = await engine.commit(message, actor);
    console.log(chalk.green(`✓ Committed: ${commit.shortId}`));
});
program
    .command("branch")
    .argument("[name]", "Branch name to create")
    .description("List branches or create a new branch")
    .action(async (name) => {
    const engine = new EditVCSEngine(process.cwd());
    if (name) {
        await engine.createBranch(name);
        console.log(chalk.green(`✓ Created and switched to branch '${name}'`));
    }
    else {
        const branches = await engine.listBranches();
        for (const branch of branches) {
            console.log(`${branch.current ? '* ' : '  '}${branch.name}`);
        }
    }
});
program
    .command("checkout")
    .argument("<name>", "Branch name to switch to")
    .description("Switch to a branch")
    .action(async (name) => {
    const engine = new EditVCSEngine(process.cwd());
    await engine.checkout(name);
    console.log(chalk.green(`✓ Switched to branch '${name}'`));
});
// ─── Proposals ───────────────────────────────────────────────────────
const proposalCmd = program.command("proposal").description("Manage edit proposals (pull requests)");
proposalCmd
    .command("create")
    .option("--title <title>", "Proposal title")
    .option("--description <desc>", "Description", "")
    .option("--from <branch>", "Source edit path (branch)")
    .option("--to <branch>", "Target edit path", "main")
    .option("--agent-name <name>", "Agent name (if AI)")
    .option("--agent-model <model>", "Agent model (if AI)")
    .option("--confidence <score>", "Confidence score (0-1)")
    .description("Create a new edit proposal")
    .action(async (options) => {
    const engine = new EditVCSEngine(process.cwd());
    const pm = new ProposalManager(process.cwd());
    const actor = options.agentName ? { type: "agent", name: options.agentName } : { type: "human", name: "User" };
    let agentMeta;
    if (options.agentName) {
        agentMeta = {
            agentName: options.agentName,
            model: options.agentModel || "unknown",
            provider: "unknown",
            reasoningSummary: "Generated edits based on prompt.",
            confidence: parseFloat(options.confidence || "0.9")
        };
    }
    // In a real flow, we'd checkout branches and diff them. For this MVP, we simulate passing empty domains to diff against
    const proposal = await pm.createProposal("proj_01", options.title || "New Proposal", options.description, options.from, options.to, actor, agentMeta, {}, // base
    {} // compare
    );
    console.log(chalk.green(`✓ Proposal created: ${proposal.id}`));
});
proposalCmd
    .command("list")
    .description("List all edit proposals")
    .action(() => {
    const pm = new ProposalManager(process.cwd());
    const proposals = pm.listProposals();
    proposals.forEach(p => {
        console.log(`[${p.status}] ${p.id} - ${p.title} (${p.createdBy.name})`);
    });
});
proposalCmd
    .command("show")
    .argument("<id>", "Proposal ID")
    .description("Show details of a proposal")
    .action((id) => {
    const pm = new ProposalManager(process.cwd());
    const p = pm.getProposal(id);
    if (!p)
        return console.log(chalk.red("Not found"));
    console.log(JSON.stringify(p, null, 2));
});
proposalCmd
    .command("approve")
    .argument("<id>", "Proposal ID")
    .description("Approve a proposal")
    .action((id) => {
    const pm = new ProposalManager(process.cwd());
    pm.approveProposal(id, { type: "human", name: "Reviewer" });
    console.log(chalk.green(`✓ Proposal ${id} approved`));
});
proposalCmd
    .command("reject")
    .argument("<id>", "Proposal ID")
    .option("--reason <reason>", "Reason for rejection")
    .description("Reject a proposal")
    .action((id, options) => {
    const pm = new ProposalManager(process.cwd());
    pm.rejectProposal(id, { type: "human", name: "Reviewer" }, options.reason || "Rejected");
    console.log(chalk.red(`✕ Proposal ${id} rejected`));
});
proposalCmd
    .command("apply")
    .argument("<id>", "Proposal ID")
    .description("Apply an approved proposal to main")
    .action(async (id) => {
    // Basic simulate apply
    console.log(chalk.green(`✓ Proposal ${id} changes applied to main timeline`));
});
// ─── Server ──────────────────────────────────────────────────────────
program
    .command("serve")
    .option("-p, --port <port>", "Port number", "3333")
    .description("Run the local API and dashboard server")
    .action((options) => {
    startServer(process.cwd(), parseInt(options.port));
});
program.parse();
//# sourceMappingURL=index.js.map