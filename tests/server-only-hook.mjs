import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

function resolveTypeScriptModule(url) {
  const modulePath = fileURLToPath(url);
  const candidates = [
    `${modulePath}.ts`,
    `${modulePath}.tsx`,
    `${modulePath}.mts`,
    `${modulePath}/index.ts`,
  ];
  const candidate = candidates.find((path) => existsSync(path));

  return candidate ? pathToFileURL(candidate).href : null;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'server-only') {
      return {
        shortCircuit: true,
        url: new URL('./server-only-stub.mjs', import.meta.url).href,
      };
    }

    if (
      context.parentURL?.endsWith('/src/lib/admin-session.ts') &&
      (specifier === '@/lib/auth' || specifier === 'next/headers')
    ) {
      return {
        shortCircuit: true,
        url: new URL('./admin-auth-stub.mjs', import.meta.url).href,
      };
    }

    if (specifier.startsWith('@/')) {
      const resolvedUrl = resolveTypeScriptModule(
        new URL(`../src/${specifier.slice(2)}`, import.meta.url),
      );

      if (resolvedUrl) {
        return { shortCircuit: true, url: resolvedUrl };
      }
    }

    if (specifier.startsWith('.') && context.parentURL) {
      const resolvedUrl = resolveTypeScriptModule(
        new URL(specifier, context.parentURL),
      );

      if (resolvedUrl) {
        return { shortCircuit: true, url: resolvedUrl };
      }
    }

    if (
      ['next/cache', 'next/headers', 'next/navigation'].includes(specifier)
    ) {
      return nextResolve(`${specifier}.js`, context);
    }

    return nextResolve(specifier, context);
  },
});
