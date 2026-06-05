const OWNER_KEY = 'ownerId'

export function getOwnerId(): string {
  const existing = localStorage.getItem(OWNER_KEY)
  if (existing) return existing
  const id = `owner-${crypto.randomUUID()}`
  localStorage.setItem(OWNER_KEY, id)
  return id
}

export function clearOwnerId(): void {
  localStorage.removeItem(OWNER_KEY)
}

export function isGuestOwner(ownerId: string): boolean {
  return ownerId.startsWith('owner-')
}
