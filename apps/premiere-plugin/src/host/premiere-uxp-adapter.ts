export function createPremiereUxpAdapter() {
  return {
    async getCurrentProject() {
      return null;
    },
    async getCapabilities() {
      return {
        projectPath: false,
        trackClipRead: false
      };
    }
  };
}
