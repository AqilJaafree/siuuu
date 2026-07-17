/** @type {import('next').NextConfig} */
const nextConfig = {
  // The engine in src/ is authored as ESM TypeScript with explicit `.js` specifiers
  // (NodeNext style). Next's bundler must map those back onto the `.ts` sources or
  // every `import '../verify/verifier.js'` fails to resolve.
  webpack: (config) => {
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js'],
      '.mjs': ['.mts', '.mjs'],
    }
    return config
  },
  turbopack: {
    resolveExtensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.json'],
  },
}

export default nextConfig
