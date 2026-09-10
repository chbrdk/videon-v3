/**
 * Browser stub for `import('premierepro')`.
 * Insert reports stub mode; useful to exercise download/cache without Premiere.
 */

export const Project = {
  async getActiveProject() {
    return null
  },
}

export const TickTime = {
  TIME_ZERO: { seconds: 0 },
  createWithSeconds(seconds) {
    return { seconds }
  },
}

export default { Project, TickTime }
