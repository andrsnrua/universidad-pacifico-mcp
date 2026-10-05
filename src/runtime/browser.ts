import { chromium, type BrowserContext } from 'playwright';
import { sequentializeByKey } from './concurrency.js';

type Options = Parameters<typeof chromium.launchPersistentContext>[1];
const launches = new Map<string, Promise<void>>();

// El acceso institucional se realiza en un navegador real. No se alteran
// indicadores de automatización ni se contestan formularios por el usuario.
export async function launchPersistentContextSafe(directory: string, options: Options): Promise<BrowserContext> {
  return sequentializeByKey(launches, directory, async () => {
    if (options?.channel) return chromium.launchPersistentContext(directory, options);
    for (const channel of ['chrome', 'msedge'] as const) {
      try { return await chromium.launchPersistentContext(directory, { ...options, channel }); }
      catch { /* Prueba el siguiente navegador instalado. */ }
    }
    try { return await chromium.launchPersistentContext(directory, options); }
    catch {
      throw new Error('No se pudo abrir un navegador compatible. Ejecuta npm run browser:install y revisa que el perfil no esté abierto en otro proceso.');
    }
  });
}
