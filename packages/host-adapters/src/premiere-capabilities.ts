import type { PremiereCapabilities } from "@editvcs/shared-types";

export const defaultPremiereCapabilities: PremiereCapabilities = {
  projectPath: true,
  activeSequenceRead: true,
  sequenceInventoryRead: true,
  trackClipRead: false,
  mediaReferenceRead: false,
  saveEventHooks: false
};
