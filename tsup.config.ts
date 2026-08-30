import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'adapters/node': 'src/adapters/node.ts',
    'adapters/express': 'src/adapters/express.ts',
    'adapters/fastify': 'src/adapters/fastify.ts',
    'adapters/hono': 'src/adapters/hono.ts',
    'adapters/nextjs': 'src/adapters/nextjs.ts',
    'adapters/tanstack': 'src/adapters/tanstack.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  treeshake: true,
})
