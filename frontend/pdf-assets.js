import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Keep the viewer's fonts, character maps, and image decoders on this host.
// Pending research PDFs never need an external document viewer or CDN.
export default function pdfAssets() {
    const root = new URL('./node_modules/pdfjs-dist/', import.meta.url)
    const assets = new Map([['/LICENSE', readFileSync(new URL('LICENSE', root))]])
    for (const directory of ['cmaps', 'standard_fonts', 'wasm', 'iccs']) {
        const source = new URL(`${directory}/`, root)
        for (const name of readdirSync(fileURLToPath(source))) {
            assets.set(`/${directory}/${name}`, readFileSync(new URL(name, source)))
        }
    }
    return {
        name: 'research-pdf-assets',
        configureServer(server) {
            server.middlewares.use(`${server.config.base}pdf-assets`, (request, response, next) => {
                const path = request.url.split('?')[0]
                const content = assets.get(path)
                if (!content) return next()
                response.setHeader('Content-Type', path.endsWith('.wasm') ? 'application/wasm' : path.endsWith('.js') ? 'text/javascript' : 'application/octet-stream')
                response.end(content)
            })
        },
        generateBundle() {
            for (const [path, source] of assets) {
                this.emitFile({ type: 'asset', fileName: `pdf-assets${path}`, source })
            }
        },
    }
}
