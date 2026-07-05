import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { App } from "./App";
import { createMockPanelHost } from "./host/mock-panel-host";

describe("Premiere panel", () => {
  it("shows no-project state", async () => {
    render(<App host={createMockPanelHost({ project: null })} />);
    expect(await screen.findByText("Open a Premiere project to start protecting your edits.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create Save Point" })).toBeDisabled();
  });

  it("shows first-run state for an untracked project", async () => {
    render(<App host={createMockPanelHost({ tracked: false })} />);
    expect(await screen.findByRole("button", { name: "Start version history" })).toBeInTheDocument();
    expect(screen.getByText("EditVCS saves project versions, not your footage.")).toBeInTheDocument();
  });

  it("opens save-point dialog for tracked projects", async () => {
    const user = userEvent.setup();
    render(<App host={createMockPanelHost({ tracked: true })} />);
    await user.click(await screen.findByRole("button", { name: "Create Save Point" }));
    expect(screen.getByLabelText("Save point name")).toBeInTheDocument();
  });
});
