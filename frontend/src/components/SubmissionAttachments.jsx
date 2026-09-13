import { lazy, Suspense, useEffect, useState } from 'react'
import { Download, FileText } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../api/axios'

const ResearchPdfPreview = lazy(() => import('./ResearchPdfPreview'))

// eslint-disable-next-line react/prop-types -- Shared by the request owner and administrator review screens.
export default function SubmissionAttachments({ submission, autoPreview = false }) {
    const [showPreview, setShowPreview] = useState(autoPreview)
    const [pdfUrl, setPdfUrl] = useState('')
    const [previewError, setPreviewError] = useState('')
    const [downloading, setDownloading] = useState(false)
    // eslint-disable-next-line react/prop-types
    const { id, has_research_file: hasPaper, has_system_file: hasSystem, research_original_filename: paperName, system_original_filename: systemName } = submission

    useEffect(() => {
        if (!showPreview || !hasPaper) return undefined
        let disposed = false
        let objectUrl = ''
        const controller = new AbortController()
        setPdfUrl('')
        setPreviewError('')
        api.get(`/repository/submission-requests/${id}/research/`, { responseType: 'blob', signal: controller.signal })
            .then(({ data }) => {
                if (disposed) return
                objectUrl = URL.createObjectURL(new Blob([data], { type: 'application/pdf' }))
                setPdfUrl(objectUrl)
            })
            .catch(() => {
                if (!disposed) setPreviewError('The PDF could not be loaded. Close the preview and try again.')
            })
        return () => { disposed = true; controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl) }
    }, [id, hasPaper, showPreview])

    const downloadSystem = async () => {
        setDownloading(true)
        try {
            const { data } = await api.get(`/repository/submission-requests/${id}/system/`, { responseType: 'blob' })
            const url = URL.createObjectURL(data)
            const anchor = document.createElement('a')
            anchor.href = url
            anchor.download = systemName || 'system.zip'
            anchor.click()
            setTimeout(() => URL.revokeObjectURL(url), 1000)
        } catch {
            toast.error('The submitted ZIP could not be downloaded.')
        } finally { setDownloading(false) }
    }

    return <section style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', minWidth: 0, gap: 12 }} aria-label="Submitted attachments">
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
            {hasPaper && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowPreview(value => !value)}><FileText size={14} /> {showPreview ? 'Hide PDF preview' : 'View submitted PDF'}</button>}
            {hasSystem && <button type="button" className="btn btn-ghost btn-sm" disabled={downloading} onClick={downloadSystem}><Download size={14} /> {downloading ? 'Downloading…' : 'Download submitted ZIP'}</button>}
        </div>
        <div className="text-sm text-muted" style={{ overflowWrap: 'anywhere' }}>
            {hasPaper && <p>Research PDF: {paperName}</p>}
            {hasSystem && <p>System ZIP: {systemName}</p>}
            {!hasPaper && !hasSystem && <p>This earlier request has no attachments. An administrator can add the files when approving it, or return it for revision.</p>}
        </div>
        {showPreview && hasPaper && <div style={{ minWidth: 0 }}>
            {previewError ? <p role="alert" style={{ color: 'var(--danger)' }}>{previewError}</p> : pdfUrl ? <>
                <Suspense fallback={<p role="status">Loading PDF viewer…</p>}>
                    <ResearchPdfPreview key={pdfUrl} url={pdfUrl} filename={paperName} />
                </Suspense>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                    <a className="btn btn-ghost btn-sm" href={pdfUrl} target="_blank" rel="noreferrer">Open PDF in a new tab</a>
                    <a className="btn btn-ghost btn-sm" href={pdfUrl} download={paperName || 'research.pdf'}>Download submitted PDF</a>
                </div>
            </> : <p role="status">Loading submitted PDF…</p>}
        </div>}
    </section>
}
