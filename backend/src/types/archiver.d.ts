declare module 'archiver' {
  import { Stream } from 'stream'
  import { ZlibOptions } from 'zlib'

  interface EntryData {
    name: string
    type?: 'directory' | 'file' | 'symlink'
    date?: Date | string
    mode?: number
    prefix?: string
    stats?: import('fs').Stats
  }

  interface Archiver extends Stream.Transform {
    append(source: string | Buffer | NodeJS.ReadableStream, data: EntryData): this
    file(filepath: string, data: EntryData): this
    directory(dirpath: string, destpath: string | false, data?: EntryData): this
    finalize(): Promise<void>
    pointer(): number
    on(event: 'error' | 'warning', listener: (error: Error) => void): this
  }

  interface ArchiverOptions {
    zlib?: ZlibOptions
    store?: boolean
  }

  function archiver(format: string, options?: ArchiverOptions): Archiver

  export = archiver
}
