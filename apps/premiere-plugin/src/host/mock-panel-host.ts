export function createMockPanelHost(opts: { project?: any, tracked?: boolean } = {}) {
  return {
    project: opts.project === null ? null : (opts.project || { name: 'Film.prproj' }),
    tracked: opts.tracked ?? true
  };
}
