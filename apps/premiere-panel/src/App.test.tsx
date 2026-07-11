import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import App from "./App";

describe("Premiere panel", () => {
  it("renders the EditVCS shell without a project open", () => {
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain("EditVCS");
  });
});
