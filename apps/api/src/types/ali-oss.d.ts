declare module 'ali-oss' {
  interface OssOptions {
    endpoint: string
    accessKeyId: string
    accessKeySecret: string
    bucket: string
  }

  interface PutResult {
    url: string
  }

  interface GetResult {
    content: Buffer | string | NodeJS.ReadableStream
  }

  export default class OSS {
    constructor(options: OssOptions)
    put(key: string, data: Buffer): Promise<PutResult>
    get(key: string): Promise<GetResult>
    delete(key: string): Promise<unknown>
    signatureUrl(key: string, options?: { expires?: number }): string
  }
}
