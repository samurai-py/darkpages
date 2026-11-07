/** "2026-11-06" no fuso local. */
export function hojeLocal(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** id válido para a coleção (a-z0-9-). */
export function novoId(prefixo: string): string {
  return `${prefixo}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}
