import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import api from '../api/axios'
import { ArrowLeft, FileText } from 'lucide-react'

export default function ArchivePdfViewerPage() {
    const { id } = useParams()
    const navigate = useNavigate()
    const [searchParams] = useSearchParams()
    const [doc, setDoc] = useState(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        api.get(`/repository/archives/${id}/`)
            .then((response) => setDoc(response.data))
            .catch(() => navigate('/repository'))
            .finally(() => setLoading(false))
    }, [id, navigate])

    if (loading) return <div className="spinner" style={{ marginTop: 120 }} />

    const token = localStorage.getItem('access_token')
    const versionId = searchParams.get('version')
    const previewPath = versionId
        ? `/api/repository/archives/${id}/preview/${versionId}/`
        : `/api/repository/archives/${id}/preview/`
    const previewUrl = `${previewPath}?token=${encodeURIComponent(token || '')}#toolbar=0&navpanes=0`

    return (
        <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ height: 58, padding: '0 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: 'var(--bg2)' }}>
                <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/archives/${id}`)}>
                    <ArrowLeft size={14} /> Back to details
                </button>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    <FileText size={16} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                    <strong className="truncate" style={{ maxWidth: '52vw' }}>{doc.title}</strong>
                    <span className="badge badge-blue">{versionId ? 'Version view' : `v${doc.current_version || 1}`}</span>
                </div>
                <div style={{ width: 116 }} />
            </div>
            <iframe
                title={`${doc.title} PDF viewer`}
                src={previewUrl}
                style={{ flex: 1, width: '100%', border: 0, background: 'var(--bg2)' }}
            />
        </div>
    )
}
