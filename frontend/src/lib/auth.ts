export async function initialize(): Promise<void> {}

export async function handleRedirect(): Promise<void> {}

export async function signIn(): Promise<void> {}

export async function signOut(): Promise<void> {}

export function isAuthenticated(): boolean {
  return false
}

export async function getAccessToken(): Promise<string | null> {
  return null
}

export function getUser(): null {
  return null
}
