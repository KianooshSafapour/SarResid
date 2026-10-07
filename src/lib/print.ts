/** چاپ پرتابل — کلون‌گذاری ناحیهٔ چاپ به body تا قواعد @media print همیشه کار کنند */
export function printElement(el: HTMLElement | null) {
  if (!el) return
  const holder = document.createElement('div')
  holder.className = 'print-portal'
  holder.appendChild(el.cloneNode(true))
  document.body.appendChild(holder)
  document.body.classList.add('printing-doc')
  const done = () => {
    document.body.classList.remove('printing-doc')
    holder.remove()
    window.removeEventListener('afterprint', done)
  }
  window.addEventListener('afterprint', done)
  window.print()
  setTimeout(done, 1500)
}
