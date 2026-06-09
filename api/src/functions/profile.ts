import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { getTableClient } from '../lib/tableClient'
import type { Profile } from '../types'
import { withCors, corsPreflightResponse } from '../lib/cors'

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

function defaultProfile(): Profile {
  return {
    partitionKey: 'profile',
    rowKey: 'default',
    ownerId: 'default',
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

  return withCors(
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(toProfile(owner ?? defaultProfile())),
    },
    origin,
  )
}

export async function putProfileHandler(
  req: HttpRequest,
  ctx: InvocationContext,
): Promise<HttpResponseInit> {
  const origin = req.headers.get('origin') ?? undefined
  if (req.method === 'OPTIONS') return corsPreflightResponse(origin)

  let updates: Partial<Pick<Profile, 'displayName' | 'email' | 'extensions'>>
  try {
    updates = (await req.json()) as Partial<Pick<Profile, 'displayName' | 'email' | 'extensions'>>
  } catch {
    return withCors({ status: 400, body: 'Invalid JSON body' }, origin)
  }

  const rowKey = 'default'
  const existing = (await getTableClient('Profiles').getEntity('profile', rowKey)) as Partial<Profile> | undefined

  const entity: Profile = {
    partitionKey: 'profile',
    rowKey,
    ownerId: 'default',
    displayName: updates.displayName ?? existing?.displayName ?? '',
    email: updates.email ?? existing?.email ?? '',
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    extensions: updates.extensions ?? existing?.extensions ?? {},
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
    const origin = req.headers.get('origin') ?? undefined
    if (req.method === 'OPTIONS') return corsPreflightResponse(origin)

    const client = getTableClient('Profiles')
    let owner: Profile | undefined
    try {
      owner = (await client.getEntity('profile', 'default')) as Profile
    } catch {
      owner = undefined
    }
    return getProfileHandler(req, ctx, owner)
  },
})

app.http('putProfile', {
  methods: ['PUT', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'profile',
  handler: async (req, ctx) => {
    const origin = req.headers.get('origin') ?? undefined
    if (req.method === 'OPTIONS') return corsPreflightResponse(origin)
    return putProfileHandler(req, ctx)
  },
})
