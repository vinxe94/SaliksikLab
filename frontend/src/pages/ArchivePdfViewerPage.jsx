import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import api, { apiUrl } from '../api/axios'
import { ArrowLeft, FileText } from 'lucide-react'

export default function ArchivePdfViewerPage() {
    const { id } = useParams()
    const navigate = useNavigate()
    const [searchParams] = useSearchParams()
    const [doc, setDoc] = useState(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')

    useEffect(() => {
        setLoading(true)
        setError('')
        api.get(`/repository/archives/${id}/`)
            .then((response) => setDoc(response.data))
            .catch(() => setError('The archive file could not be opened.'))
            .finally(() => setLoading(false))
    }, [id])

    if (loading) return <div className="spinner" role="status" aria-label="Loading research paper" style={{ marginTop: 120 }} />

    const token = localStorage.getItem('access_token')
    const versionId = searchParams.get('version')
    const previewPath = versionId
        ? apiUrl(`/repository/archives/${id}/preview/${versionId}/`)
        : apiUrl(`/repository/archives/${id}/preview/`)
    const previewUrl = token
        ? `${previewPath}?${new URLSearchParams({ token }).toString()}#toolbar=0&navpanes=0`
        : ''
    const title = doc?.title || 'Archive file'

    if (error || !doc || !previewUrl) {
        return (
            <main className="archive-reader">
                <header className="archive-reader-header">
                    <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/archives/${id}`, { replace: true })}>
                        <ArrowLeft size={14} /> Back to details
                    </button>
                </header>
                <div className="empty-state" style={{ margin: '80px auto', maxWidth: 520 }}>
                    <FileText size={34} />
                    <h3>File preview unavailable</h3>
                    <p>{error || 'Sign in again to view this archive file.'}</p>
                </div>
            </main>
        )
    }

    return (
        <main className="archive-reader">
            <header className="archive-reader-header">
                <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/archives/${id}`, { replace: true })}>
                    <ArrowLeft size={14} /> Back to details
                </button>
                <div className="archive-reader-title">
                    <FileText size={16} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                    <strong className="truncate">{title}</strong>
                    <span className="badge badge-blue">{versionId ? 'Version view' : `v${doc.current_version || 1}`}</span>
                </div>
            </header>
            <iframe
                title={`${title} file preview`}
                src={previewUrl}
                className="archive-reader-document"
            />
        </main>
    )
}
