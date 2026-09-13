import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Minus, Plus } from 'lucide-react'
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?worker&url'

GlobalWorkerOptions.workerSrc = workerUrl

// eslint-disable-next-line react/prop-types -- Loaded only when a submitted PDF is opened.
export default function ResearchPdfPreview({ url, filename }) {
    const viewportRef = useRef(null)
    const canvasRef = useRef(null)
    const [pdf, setPdf] = useState(null)
    const [pageNumber, setPageNumber] = useState(1)
    const [zoom, setZoom] = useState(1)
    const [width, setWidth] = useState(0)
    const [displayedPage, setDisplayedPage] = useState(null)
    const [rendering, setRendering] = useState(true)
    const [pageText, setPageText] = useState('')
    const [error, setError] = useState('')

    useEffect(() => {
        // Measure the page area, excluding its padding and reserved scrollbar.
        // Ignore height-only changes and subpixel rounding during layout.
        const observer = new ResizeObserver(([entry]) => {
            const nextWidth = Math.floor(entry.contentRect.width)
            if (nextWidth > 0) setWidth(previous => previous === nextWidth ? previous : nextWidth)
        })
        observer.observe(viewportRef.current)
        return () => observer.disconnect()
    }, [])

    useEffect(() => {
        let disposed = false
        const assets = `${import.meta.env.BASE_URL}pdf-assets/`
        const task = getDocument({
            url, isEvalSupported: false,
            cMapUrl: `${assets}cmaps/`, cMapPacked: true,
            standardFontDataUrl: `${assets}standard_fonts/`,
            wasmUrl: `${assets}wasm/`, iccUrl: `${assets}iccs/`,
        })
        task.promise.then(document => {
            if (!disposed) setPdf(document)
        }).catch(() => {
            if (!disposed) setError('This PDF could not be previewed. Open or download the original file below to review it.')
        })
        return () => { disposed = true; void task.destroy().catch(() => {}) }
    }, [url])

    useEffect(() => {
        if (!pdf || !width) return undefined
        let disposed = false
        let renderTask
        setRendering(true)
        setError('')
        async function renderPage() {
            try {
                const page = await pdf.getPage(pageNumber)
                if (disposed) return
                const natural = page.getViewport({ scale: 1 })
                const viewport = page.getViewport({ scale: width / natural.width * zoom })
                const density = Math.min(window.devicePixelRatio || 1, 2, 4096 / Math.max(viewport.width, viewport.height))
                // Each render gets its own canvas, so resizing and page changes
                // cannot draw two pages into the visible canvas simultaneously.
                const buffer = document.createElement('canvas')
                buffer.width = Math.ceil(viewport.width * density)
                buffer.height = Math.ceil(viewport.height * density)
                renderTask = page.render({
                    canvasContext: buffer.getContext('2d'), viewport,
                    transform: [density, 0, 0, density, 0, 0],
                })
                const [, text] = await Promise.all([
                    renderTask.promise,
                    page.getTextContent().catch(() => ({ items: [] })),
                ])
                if (disposed) return
                const canvas = canvasRef.current
                canvas.width = buffer.width
                canvas.height = buffer.height
                canvas.style.width = `${viewport.width}px`
                canvas.style.height = `${viewport.height}px`
                canvas.getContext('2d').drawImage(buffer, 0, 0)
                setDisplayedPage(pageNumber)
                setPageText(text.items.map(item => item.str || '').join(' '))
                setRendering(false)
            } catch (failure) {
                if (!disposed && failure.name !== 'RenderingCancelledException') {
                    setRendering(false)
                    setError('This page could not be displayed. Open or download the original PDF below.')
                }
            }
        }
        void renderPage()
        return () => { disposed = true; renderTask?.cancel() }
    }, [pdf, pageNumber, width, zoom])

    return <div style={{ minWidth: 0, border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, padding: 10, background: 'var(--bg-secondary)' }}>
            <button type="button" className="btn btn-ghost btn-sm" aria-label="Previous PDF page" disabled={!pdf || pageNumber === 1} onClick={() => setPageNumber(value => value - 1)}><ChevronLeft size={16} /></button>
            <span className="text-sm" aria-live="polite">{pdf ? `Page ${pageNumber} of ${pdf.numPages}` : 'Loading PDF…'}</span>
            <button type="button" className="btn btn-ghost btn-sm" aria-label="Next PDF page" disabled={!pdf || pageNumber === pdf.numPages} onClick={() => setPageNumber(value => value + 1)}><ChevronRight size={16} /></button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
                <button type="button" className="btn btn-ghost btn-sm" aria-label="Zoom out PDF" disabled={!pdf || zoom <= 0.75} onClick={() => setZoom(value => value - 0.25)}><Minus size={14} /></button>
                <span className="text-sm">{Math.round(zoom * 100)}%</span>
                <button type="button" className="btn btn-ghost btn-sm" aria-label="Zoom in PDF" disabled={!pdf || zoom >= 2} onClick={() => setZoom(value => value + 0.25)}><Plus size={14} /></button>
            </div>
        </div>
        {error && <p role="alert" style={{ padding: 16, color: 'var(--danger)' }}>{error}</p>}
        <div style={{ position: 'relative' }}>
            {!error && rendering && <p role="status" className="text-sm" style={{ position: 'absolute', top: 8, left: 8, zIndex: 1, padding: '6px 10px', borderRadius: 6, background: 'var(--bg2)', color: 'var(--text2)' }}>Rendering PDF page…</p>}
            <div ref={viewportRef} style={{ height: '60vh', overflow: 'auto', scrollbarGutter: 'stable', padding: 16, background: '#e8ece9' }} aria-busy={rendering && !error}>
                {/* Keep the last completed page visible while the next one renders.
                    Collapsing it here can toggle the dialog scrollbar and cause
                    ResizeObserver to restart rendering indefinitely. */}
                <canvas ref={canvasRef} role="img" aria-label={`${filename}, page ${displayedPage || pageNumber}`} style={{ display: 'block', visibility: displayedPage && !error ? 'visible' : 'hidden', margin: '0 auto', background: '#fff', boxShadow: '0 1px 8px #0002' }} />
            </div>
        </div>
        {pdf && <details hidden={!pageText} style={{ padding: 10 }}>
            <summary className="text-sm" style={{ cursor: 'pointer' }}>Read page text</summary>
            <p className="text-sm" style={{ marginTop: 8, whiteSpace: 'pre-wrap' }}>{pageText}</p>
        </details>}
    </div>
}
