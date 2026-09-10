/**
 * Browser shim for `import('uxp')` — enables Chrome/Safari preview without Premiere.
 */

const memoryFiles = new Map()

function createFile(name) {
  const file = {
    name,
    isFolder: false,
    get nativePath() {
      return `/videon-browser-cache/${name}`
    },
    href: `memory://${name}`,
    async write(buffer) {
      memoryFiles.set(name, buffer)
    },
    async read() {
      return memoryFiles.get(name) || new ArrayBuffer(0)
    },
    async delete() {
      memoryFiles.delete(name)
      folder._entries.delete(name)
    },
  }
  return file
}

const folder = {
  async createFile(name, _opts) {
    const file = createFile(name)
    memoryFiles.set(name, memoryFiles.get(name) || new ArrayBuffer(0))
    folder._entries.set(name, file)
    return file
  },
  async getEntries() {
    return [...folder._entries.values()]
  },
  _entries: new Map(),
}

export const storage = {
  formats: { binary: 'binary' },
  localFileSystem: {
    async getDataFolder() {
      return folder
    },
  },
}

export const shell = {
  async openExternal(url) {
    window.open(url, '_blank', 'noopener,noreferrer')
  },
}

function previewHostName() {
  try {
    const q = new URLSearchParams(window.location.search).get('host')
    if (q && /aeft|aftereffects|ae/i.test(q)) return 'AEFT'
  } catch {
    /* ignore */
  }
  return 'PPRO'
}

export const host = {
  get name() {
    return previewHostName()
  },
  __videonPreview: true,
}

export default { storage, shell, host }
