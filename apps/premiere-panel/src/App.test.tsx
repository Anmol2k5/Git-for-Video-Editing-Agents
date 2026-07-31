import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import App from "./App";

describe("Premiere panel", () => {
  it("renders the EditVCS shell initialization screen", () => {
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain("Starting Engine...");
  });
});
