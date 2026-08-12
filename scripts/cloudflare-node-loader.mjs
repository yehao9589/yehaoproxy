const cloudflareEnvironmentModule = `
export const env = new Proxy({}, {
  get(_target, key) { return process.env[String(key)]; },
  has(_target, key) { return Object.prototype.hasOwnProperty.call(process.env, String(key)); }
});
`;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "cloudflare:workers") {
    return {
      url: `data:text/javascript;charset=utf-8,${encodeURIComponent(cloudflareEnvironmentModule)}`,
      shortCircuit: true,
    };
  }
  return nextResolve(specifier, context);
}
