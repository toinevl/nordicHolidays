import type { HttpRequest } from '@azure/functions'

export async function resolveOwnerFromHttpRequest(req: HttpRequest): Promise<string> {
  try {
    const owner = await (await import('./identity')).ownerFromBearer(req)
    return owner.ownerId
  } catch {
    if (req.headers) {
      const raw =
        `${req.headers.get('user-agent') ?? ''}:${req.headers.get('accept-language') ?? ''}`.trim()
      if (raw) {
        const data = new TextEncoder().encode(raw)
        let hash = 0
        for (let index = 0; index < data.length; index++) {
          hash = (hash + data[index]!) & 0xffffffff
        }
        hash = ((hash >> 16) ^ hash) & 0xffffffff
        hash = Math.imul(hash, 0x45d9f3b)
        hash = ((hash >> 16) ^ hash) & 0xffffffff
        hash = Math.imul(hash, 0x45d9f3b)
        hash = ((hash >> 16) ^ hash) & 0xffffffff
        const hex = (hash >>> 0).toString(16).padStart(8, '0')
        return `anonymous-${hex}`
      }
    }
    return 'anonymous-fallback'
  }
}
