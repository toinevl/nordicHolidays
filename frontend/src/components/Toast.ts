export type ToastType = 'error' | 'success' | 'info'

export class Toast {
  private container: HTMLElement

  constructor() {
    this.container = document.createElement('div')
    this.container.className = 'toast-container'
    document.body.appendChild(this.container)
  }

  show(message: string, type: ToastType = 'info', durationMs = 4000): void {
    const toast = document.createElement('div')
    toast.className = `toast toast--${type}`
    toast.textContent = message
    this.container.appendChild(toast)
    requestAnimationFrame(() => toast.classList.add('toast--visible'))
    setTimeout(() => {
      toast.classList.remove('toast--visible')
      setTimeout(() => toast.remove(), 300)
    }, durationMs)
  }

  error(message: string): void { this.show(message, 'error', 6000) }
  success(message: string): void { this.show(message, 'success') }
  info(message: string): void { this.show(message, 'info') }
}
