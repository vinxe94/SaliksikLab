import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import Sidebar from '../components/Sidebar'
import api from '../api/axios'
import { useAuth } from '../contexts/AuthContext'
import FileExplorer from '../components/FileExplorer'
import RepositoryRunner from '../components/RepositoryRunner'
import { ArrowLeft, Download, RefreshCw, Trash2, Link2, FileText } from 'lucide-react'

export default function DetailPage() {
    const { id } = useParams()
    const navigate = useNavigate()
    const { user } = useAuth()
    const [repository, setRepository] = useState(null)
    const [versions, setVersions] = useState([])
    const [relatedDocs, setRelatedDocs] = useState([])
    const [loading, setLoading] = useState(true)
    const [revFile, setRevFile] = useState(null)
    const [revNotes, setRevNotes] = useState('')
    const [showRevForm, setShowRevForm] = useState(false)
    const [revLoading, setRevLoading] = useState(false)

    const load = () => {
        setLoading(true)
        Promise.all([
            api.get(`/repository/repos/${id}/`),
            api.get(`/repository/repos/${id}/versions/`),
            api.get(`/repository/repos/${id}/documents/`),
        ]).then(([repoRes, versionRes, docsRes]) => {
            setRepository(repoRes.data)
            setVersions(versionRes.data.results || versionRes.data)
            setRelatedDocs(docsRes.data.results || docsRes.data)
        }).catch(() => navigate('/repository'))
            .finally(() => setLoading(false))
    }

    useEffect(() => { load() }, [id])

    const latestVersion = versions[0]
    const canEdit = user?.role === 'admin' || user?.id === repository?.created_by?.id

    const download = (fileId) => {
        const url = fileId ? `/api/repository/repos/${id}/download/${fileId}/` : `/api/repository/repos/${id}/download/`
        const token = localStorage.getItem('access_token')
        fetch(url, { headers: { Authorization: `Bearer ${token}` } })
            .then((r) => r.blob())
            .then((blob) => {
                const href = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = href
                a.download = ''
                a.click()
                URL.revokeObjectURL(href)
            })
            .catch(() => toast.error('Download failed.'))
    }

    const submitRevision = async (e) => {
        e.preventDefault()
        if (!revFile) {
            toast.error('Select a file.')
            return
        }
        setRevLoading(true)
        try {
            const fd = new FormData()
            fd.append('file', revFile)
            fd.append('change_notes', revNotes)
            const { data } = await api.post(`/repository/repos/${id}/revise/`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
            toast.success(`Repository updated to version ${data.version}.`)
            setShowRevForm(false)
            setRevFile(null)
            setRevNotes('')
            load()
        } catch {
            toast.error('Revision failed.')
        } finally {
            setRevLoading(false)
        }
    }

    const deleteRepository = async () => {
        if (!confirm('Delete this repository?')) return
        await api.delete(`/repository/repos/${id}/`)
        toast.success('Repository deleted.')
        navigate('/repository')
    }

    if (loading) return <div className="layout"><Sidebar /><div className="main-content"><div className="spinner" /></div></div>

    return (
        <div className="layout">
            <Sidebar />
            <div className="main-content">
                <div className="page-header">
                    <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)}><ArrowLeft size={14} /> Back</button>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn btn-primary btn-sm" onClick={() => download()}>
                            <Download size={14} /> Download Latest
                        </button>
                        {canEdit && (
                            <>
                                <button className="btn btn-ghost btn-sm" onClick={() => setShowRevForm((v) => !v)}>
                                    <RefreshCw size={14} /> Upload New Version
                                </button>
                                <button className="btn btn-danger btn-sm" onClick={deleteRepository}><Trash2 size={14} /></button>
                            </>
                        )}
                    </div>
                </div>
                <div className="page-body">
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 24 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                            <div className="card">
                                <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                                    <span className="badge badge-blue">Repository</span>
                                    <span className="badge badge-gray">v{latestVersion?.version || 1}</span>
                                    <span className="badge badge-gray">{versions.length} version{versions.length !== 1 ? 's' : ''}</span>
                                </div>
                                <h1 style={{ fontSize: '1.45rem', fontWeight: 800, marginBottom: 10 }}>{repository.title}</h1>
                                <p style={{ color: 'var(--text2)', lineHeight: 1.7 }}>
                                    {repository.description || 'No repository description yet.'}
                                </p>
                                <div className="repository-preview-meta" style={{ marginTop: 16 }}>
                                    <span className="feed-meta-item">Owner: <strong>{repository.created_by?.full_name || repository.created_by?.email}</strong></span>
                                    <span className="feed-meta-item">Created: <strong>{new Date(repository.created_at).toLocaleDateString()}</strong></span>
                                    <span className="feed-meta-item"><Link2 size={13} /> {relatedDocs.length} linked documents</span>
                                </div>
                            </div>

                            {showRevForm && (
                                <div className="card">
                                    <h3 style={{ marginBottom: 10 }}>Upload New Repository Version</h3>
                                    <form onSubmit={submitRevision} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                        <div className="form-group">
                                            <label className="form-label">Repository File</label>
                                            <input type="file" className="form-input" onChange={(e) => setRevFile(e.target.files[0])} />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">Change Notes</label>
                                            <textarea className="form-textarea" rows={3} value={revNotes} onChange={(e) => setRevNotes(e.target.value)} />
                                        </div>
                                        <div style={{ display: 'flex', gap: 10 }}>
                                            <button type="submit" className="btn btn-primary btn-sm" disabled={revLoading}>{revLoading ? 'Uploading...' : 'Submit Version'}</button>
                                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowRevForm(false)}>Cancel</button>
                                        </div>
                                    </form>
                                </div>
                            )}

                            <FileExplorer repositoryId={id} fileId={latestVersion?.id} resourceBase="/repository/repos" />
                            <RepositoryRunner repositoryId={id} fileId={latestVersion?.id} filename={latestVersion?.original_filename} resourceBase="/repository/repos" />
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            <div className="card">
                                <h3 style={{ fontSize: '0.95rem', marginBottom: 12 }}>Linked Research Documents</h3>
                                {relatedDocs.length === 0 ? (
                                    <p style={{ color: 'var(--text2)', fontSize: '0.9rem' }}>No archive documents are linked to this repository yet.</p>
                                ) : (
                                    <div className="repo-list">
                                        {relatedDocs.map((doc) => (
                                            <button key={doc.id} type="button" className="profile-activity-item" onClick={() => navigate(`/archives/${doc.id}`)}>
                                                <div className="profile-activity-copy">
                                                    <strong>{doc.title}</strong>
                                                    <span>{doc.original_filename || 'Document'} • {new Date(doc.uploaded_at).toLocaleDateString()}</span>
                                                </div>
                                                <span className="badge badge-gray"><FileText size={11} style={{ marginRight: 4 }} /> Document</span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontWeight: 700 }}>Version History</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 0, padding: 12 }}>
                                    {versions.map((version) => (
                                        <div key={version.id} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 12, marginBottom: 10 }}>
                                            <div style={{ fontWeight: 700, marginBottom: 4 }}>v{version.version}</div>
                                            <div style={{ fontSize: '0.82rem', color: 'var(--text2)' }}>{version.original_filename}</div>
                                            {version.change_notes && <div style={{ fontSize: '0.8rem', marginTop: 8 }}>{version.change_notes}</div>}
                                            <div style={{ marginTop: 10 }}>
                                                <button className="btn btn-ghost btn-sm" onClick={() => download(version.id)}>
                                                    <Download size={14} /> Download
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
