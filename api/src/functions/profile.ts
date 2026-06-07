import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { getTableClient } from '../lib/tableClient'
import type { Profile } from '../types'
import { withCors, corsPreflightResponse } from '../lib/cors'
import { ownerFromBearer } from '../lib/identity'

function toProfile(entity: Profile): Profile {
  return {
    partitionKey: entity.partitionKey,
    rowKey: entity.rowKey,
    ownerId: entity.ownerId,
    displayName: entity.displayName,
    email: entity.email,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
    extensions: entity.extensions,
  }
}

function emptyProfile(ownerId: string): Profile {
  return {
    partitionKey: 'profile',
    rowKey: ownerId,
    ownerId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

export async function getProfileHandler(
  req: HttpRequest,
  ctx: InvocationContext,
  owner: Profile | undefined,
): Promise<HttpResponseInit> {
  const origin = req.headers.get('origin') ?? undefined
  if (req.method === 'OPTIONS') return corsPreflightResponse(origin)

  if (!owner) {
    return withCors({ status: 404, body: 'Not found' }, origin)
  }

  return withCors(
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(toProfile(owner)),
    },
    origin,
  )
}

export async function putProfileHandler(
  req: HttpRequest,
  ctx: InvocationContext,
  owner: Profile | undefined,
): Promise<HttpResponseInit> {
  const origin = req.headers.get('origin') ?? undefined
  if (req.method === 'OPTIONS') return corsPreflightResponse(origin)

  const existing = owner ?? emptyProfile('')
  let updates: Partial<Pick<Profile, 'displayName' | 'email' | 'extensions'>>
  try {
    updates = (await req.json()) as Partial<Pick<Profile, 'displayName' | 'email' | 'extensions'>>
  } catch {
    return withCors({ status: 400, body: 'Invalid JSON body' }, origin)
  }

  const entity: Profile = {
    partitionKey: 'profile',
    rowKey: existing.rowKey,
    ownerId: existing.ownerId,
    displayName: updates.displayName ?? existing.displayName,
    email: updates.email ?? existing.email,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
    extensions: updates.extensions ?? existing.extensions,
  }

  const client = getTableClient('Profiles')
  await client.upsertEntity(entity)

  return withCors(
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(toProfile(entity)),
    },
    origin,
  )
}

app.http('getProfile', {
  methods: ['GET', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'profile',
  handler: async (req, ctx) => {
    const bearer = req.headers.get('authorization')
    const token = bearer?.startsWith('Bearer ') ? bearer.slice(7) : undefined
    let owner: Profile | undefined
    if (token) {
      try {
        const ctx2 = await ownerFromBearer(token)
        const client = getTableClient('Profiles')
        try {
          owner = (await client.getEntity('profile', ctx2.ownerId)) as Profile
        } catch {
          owner = undefined
        }
      } catch {
        /* unauthenticated */
      }
    }
    return getProfileHandler(req, ctx, owner)
  },
})

app.http('putProfile', {
  methods: ['PUT', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'profile',
  handler: async (req, ctx) => {
    const bearer = req.headers.get('authorization')
    const token = bearer?.startsWith('Bearer ') ? bearer.slice(7) : undefined
    let owner: Profile | undefined
    if (token) {
      try {
        const ctx2 = await ownerFromBearer(token)
        const client = getTableClient('Profiles')
        try {
          owner = (await client.getEntity('profile', ctx2.ownerId)) as Profile
        } catch {
          owner = emptyProfile(ctx2.ownerId)
        }
      } catch {
        return withCors({ status: 401, body: 'Invalid bearer token' }, req.headers.get('origin') ?? undefined)
      }
    } else {
      return withCors({ status: 401, body: 'Missing bearer token' }, req.headers.get('origin') ?? undefined)
    }
    return putProfileHandler(req, ctx, owner)
  },
})
