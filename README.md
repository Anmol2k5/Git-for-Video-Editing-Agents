# EditVCS — Universal Version Control for Creative Editing

**Git for every creative tool — designed for both AI agents and humans.**

EditVCS brings version control to creative editing workflows (Figma, Premiere, After Effects, Blender, etc.) by tracking **edit decisions as lightweight JSON metadata** instead of raw media files. Inspired by [vit](https://github.com/LucasHJin/vit).

## ✨ Key Features

- **Domain-Split JSON** — Edit decisions are organized by domain (layout, style, typography, animation, audio, assets, metadata). Different roles edit different files, enabling clean merges.
- **Agent-First Design** — AI agents are first-class citizens. Track which model made a change, its reasoning, confidence, and tool calls.
- **Semantic Diffs** — Human-readable change descriptions like "Moved 'Hero Image' from (100,200) to (150,250)" instead of raw JSON diffs.
- **Beautiful Dashboard** — Glassmorphic dark-mode web UI for browsing history, diffs, branches, and agent activity.
- **Review Workflow** — Approve or reject agent-proposed changes before they land on main.
- **Plugin Architecture** — Adapter system for adding support for any creative tool.

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Launch the web dashboard
npm run dashboard
# Open http://localhost:3333

# Build the CLI
npm run build
```

## 📁 Project Structure

```
editvcs/
├── src/
│   ├── core/
│   │   ├── types.ts          # Domain models (Actor, Commit, Domain, Diff, Merge)
│   │   ├── engine.ts         # VCS engine wrapping git
│   │   ├── differ.ts         # Semantic diffing engine
│   │   └── merger.ts         # Three-way merge with conflict detection
│   ├── adapters/
│   │   ├── base.ts           # Adapter interface & registry
│   │   └── generic.ts        # Generic JSON adapter
│   └── cli/
│       └── index.ts          # CLI commands
├── dashboard/
│   ├── index.html            # Dashboard shell
│   ├── index.css             # Dark glassmorphic design system
│   └── app.js                # Interactive dashboard with mock data
├── package.json
└── tsconfig.json
```

## 🎯 Domain System

| Domain | File | Contents | Typical Owner |
|--------|------|----------|---------------|
| 📐 Layout | `layout.json` | Positions, sizes, transforms, hierarchies | Designer / Editor |
| 🎨 Style | `style.json` | Colors, gradients, effects, fills | Colorist / Designer |
| ✏️ Typography | `typography.json` | Fonts, text content, text styles | Copywriter |
| 🎬 Animation | `animation.json` | Keyframes, transitions, timing | Animator |
| 🔊 Audio | `audio.json` | Audio levels, clips, mixing | Sound Designer |
| 📦 Assets | `assets.json` | Asset references, links, media paths | Anyone |
| ⚙️ Metadata | `metadata.json` | Project settings, canvas size, framerate | Rarely changed |

## 🤖 Agent Support

Agents commit with rich metadata:

```bash
editvcs commit -m "Auto-generate color grade" \
  --agent \
  --agent-name "ColorSense" \
  --agent-model "gemini-2.5-pro" \
  --confidence 0.94 \
  --reasoning "Applied cinematic warm tone based on project brief"
```

The dashboard shows agent contributions with:
- 🧠 Reasoning explanations
- 🔧 Tool call breakdowns
- 📊 Confidence scores
- ✅ Approval/rejection workflow

## 📜 CLI Commands

```
editvcs init <name>              # Initialize new project
editvcs commit -m "message"      # Commit current state
editvcs commit --agent           # Commit as an AI agent
editvcs log                      # View history
editvcs diff                     # Semantic diff
editvcs branch <name>            # Create branch
editvcs checkout <name>          # Switch branch
editvcs status                   # Show changes
editvcs dashboard                # Launch web dashboard
editvcs import <file>            # Import JSON state
editvcs export                   # Export current state
```

## 🎨 Dashboard

The web dashboard provides 5 views:

1. **Overview** — Stats, activity feed, collaborator list, domain heatmap, pending reviews
2. **Timeline** — Commit history with branch graph, filterable by human/agent
3. **Diff View** — Domain-tabbed semantic diffs with human-readable descriptions
4. **Branches** — Branch management with merge status
5. **Agent Activity** — Agent leaderboard, confidence scores, tool call breakdowns

## License

MIT
