import { createMockPanelHost } from "./mock-panel-host";
import { createPremierePanelHost } from "./premiere-uxp-adapter";

export async function createPanelHost({ demoMode = false }: { demoMode?: boolean } = {}) {
  return demoMode
    ? createMockPanelHost({ tracked: true })
    : createPremierePanelHost();
}
