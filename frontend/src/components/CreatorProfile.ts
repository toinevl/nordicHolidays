import { t } from '../i18n/index'

export async function renderCreatorProfile(ownerId: string): Promise<HTMLElement> {
  const container = document.createElement('section')
  container.id = 'creator-page'
  container.className = 'creator-page'

  try {
    const res = await fetch(`/api/profile/public?ownerId=${encodeURIComponent(ownerId)}`)
    if (!res.ok) {
      container.innerHTML = `<p class="creator-error">${t('creator.notFound')}</p>`
      return container
    }
    const profile = await res.json() as { displayName: string; createdAt: string; updatedAt: string }
    container.innerHTML = `
      <h2>${t('creator.title', { name: profile.displayName || t('creator.anonymous') })}</h2>
      <div class="creator-meta">
        <p>${t('creator.created')}: ${new Date(profile.createdAt).toLocaleDateString()}</p>
        <p>${t('creator.updated')}: ${new Date(profile.updatedAt).toLocaleDateString()}</p>
      </div>
    `
  } catch (err) {
    container.innerHTML = `<p class="creator-error">${t('creator.loadError')}</p>`
  }
  return container
}
