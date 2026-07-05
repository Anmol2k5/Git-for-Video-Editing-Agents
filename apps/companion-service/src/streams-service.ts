import type { VersionStream } from "@editvcs/shared-types";

export function createStreamsService() {
  const streams: VersionStream[] = [];

  return {
    async createStream(stream: VersionStream) {
      streams.push(stream);
      return stream;
    },
    async getStreams(projectId: string) {
      return streams.filter(s => s.projectId === projectId);
    },
    async switchStream(streamId: string) {
      return streams.find(s => s.id === streamId) || null;
    }
  };
}
