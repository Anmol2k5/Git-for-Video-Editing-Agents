import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

const demoDir = path.resolve("demo_project");

console.log("🎬 Setting up EditVCS Demo Flow...");

// 1. Clean up old demo
if (fs.existsSync(demoDir)) {
  fs.rmSync(demoDir, { recursive: true, force: true });
}

// 2. Build CLI
console.log("🔨 Building CLI...");
execSync("npm run build", { stdio: "inherit" });

const cliPath = path.resolve("dist/cli/index.js");
const runCLI = (cmd: string) => execSync(`node "${cliPath}" ${cmd}`, { cwd: demoDir, stdio: "inherit" });

// 3. Initialize project
console.log("📁 Initializing project...");
fs.mkdirSync(demoDir);
runCLI('init "Creator Podcast Episode 14" --adapter davinci-resolve');

const projectDir = path.join(demoDir, "Creator Podcast Episode 14");
const runProjectCLI = (cmd: string) => execSync(`node "${cliPath}" ${cmd}`, { cwd: projectDir, stdio: "inherit" });

// 4. Import base timeline
console.log("📥 Importing base timeline...");
const baseFixture = path.resolve("fixtures/base-timeline.json");
runProjectCLI(`import "${baseFixture}"`);
runProjectCLI('commit -m "Initial timeline sync"');

// 5. Create agent branch & import agent changes
console.log("🤖 Creating agent edit path...");
runProjectCLI('branch agent/shorter-hook');
runProjectCLI('checkout agent/shorter-hook');

const agentFixture = path.resolve("fixtures/agent-shorter-hook.json");
runProjectCLI(`import "${agentFixture}"`);
runProjectCLI('commit -m "Trim intro, add captions, boost audio" --agent --agent-name "HookAgent" --agent-model "claude-3.5-sonnet" --reasoning "I removed the first 6 seconds of dead air, added engaging captions to the hook, and boosted dialogue clarity." --confidence 0.87');

// 6. Create the pull request (Proposal)
console.log("📝 Creating Edit Proposal...");
runProjectCLI('checkout master');
runProjectCLI('proposal create --title "Shorten opening hook & add captions" --description "Agent has prepared a tighter hook for review." --from agent/shorter-hook --to master --agent-name "HookAgent" --agent-model "claude-3.5-sonnet" --confidence 0.87');

console.log("\n✅ Demo setup complete!");
console.log("To run the dashboard, execute:");
console.log(`  cd demo_project`);
console.log(`  node "${cliPath}" serve`);
