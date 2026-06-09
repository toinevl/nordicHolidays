export class SignInButton {
  private el: HTMLButtonElement

  constructor() {
    this.el = document.createElement('button')
    this.el.className = 'status-btn'
    this.el.textContent = ''
    this.el.style.display = 'none'
  }

  mount(): void {
    const slot = document.querySelector<HTMLElement>('#signin-slot')
    if (!slot) return
    slot.appendChild(this.el)
  }
}

export async function loadProfile(): Promise<void> {
  return
}
