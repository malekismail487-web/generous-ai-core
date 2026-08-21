const RELATIVE_SPECIFIER = /^(?:\.{1,2}\/)/;
const KNOWN_EXTENSION = /\.(?:[cm]?[jt]sx?|json|node)$/i;

const REPOSITORY_ROOT = new URL("../../", import.meta.url);

async function resolveWithExtensions(specifier, context, nextResolve) {
  for (const extension of ["", ".ts", ".tsx", ".js", ".mjs"]) {
    try {
      return await nextResolve(`${specifier}${extension}`, context);
    } catch (candidateError) {
      if (candidateError?.code !== "ERR_MODULE_NOT_FOUND") throw candidateError;
    }
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const resolved = await resolveWithExtensions(new URL(`src/${specifier.slice(2)}`, REPOSITORY_ROOT).href, context, nextResolve);
    if (resolved) return resolved;
  }

  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    if (
      error?.code !== "ERR_MODULE_NOT_FOUND" ||
      !RELATIVE_SPECIFIER.test(specifier) ||
      KNOWN_EXTENSION.test(specifier)
    ) {
      throw error;
    }

    const resolved = await resolveWithExtensions(specifier, context, nextResolve);
    if (resolved) return resolved;

    throw error;
  }
}
