// Notificación por webhook de Discord. Tolerante: si no hay URL configurada
// (DISCORD_ACCESS_WEBHOOK_URL), no hace nada. No lanza — nunca debe romper el
// flujo de login por un fallo de notificación.
export async function notifyDiscord(content: string): Promise<void> {
  const url = process.env.DISCORD_ACCESS_WEBHOOK_URL;
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content })
    });
  } catch {
    /* best-effort: no interrumpir el login */
  }
}
