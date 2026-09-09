import archiver from 'archiver'
import { createWriteStream } from 'node:fs'
import { unlink } from 'node:fs/promises'

/** Pack XMEML + media files into a Premiere-ready ZIP (spec: cut-export-extras.md). */
export async function writePremiereExportZip(input: {
  zipPath: string
  xmlFilename: string
  xmlContent: string
  readmeContent: string
  mediaFiles: Array<{ absolutePath: string; zipMediaName: string }>
}): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const output = createWriteStream(input.zipPath)
    const archive = archiver('zip', { zlib: { level: 1 } })

    output.on('close', () => resolve())
    output.on('error', reject)
    archive.on('error', reject)
    archive.pipe(output)

    archive.append(input.xmlContent, { name: input.xmlFilename })
    archive.append(input.readmeContent, { name: 'README.txt' })
    for (const media of input.mediaFiles) {
      archive.file(media.absolutePath, { name: `media/${media.zipMediaName}` })
    }

    void archive.finalize()
  })
}

export async function safeUnlink(path: string): Promise<void> {
  await unlink(path).catch(() => {})
}
