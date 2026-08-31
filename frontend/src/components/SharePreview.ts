import { t, tpl } from '../i18n/index'
import { escapeHtml } from '../lib/escape'

export function renderSharePreview(tripTitle: string, tripId: string): HTMLElement {
  const container = document.createElement('div')
  container.className = 'share-preview'
  container.innerHTML = `
    <h3>${t('share.previewTitle')}</h3>
    <p class="share-preview-text">${tpl('share.previewText', { title: escapeHtml(tripTitle) })}</p>
    <div class="share-preview-url">
      <input type="text" readonly value="https://sweden.van-vliet.eu/?id=${escapeHtml(tripId)}" onclick="this.select()" aria-label="Share URL" />
      <button class="btn btn--secondary btn--small" onclick="navigator.clipboard.writeText(this.previousElementSibling.value); this.textContent='Copied'; setTimeout(()=>this.textContent='${t('share.copyLink')}', 1200)">${t('share.copyLink')}</button>
    </div>
    <p class="share-preview-hint">${t('share.previewHint')}</p>
  `
  return container
}
