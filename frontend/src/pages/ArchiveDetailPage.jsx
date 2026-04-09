import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import Sidebar from '../components/Sidebar'
import api from '../api/axios'
import { ArrowLeft, Download, Link2, FileText } from 'lucide-react'

export default function ArchiveDetailPage() {
    const { id } = useParams()
    const navigate = useNavigate()
    const [doc, setDoc] = useState(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        api.get(`/repository/archives/${id}/`)
            .then((response) => setDoc(response.data))
            .catch(() => navigate('/repository'))
            .finally(() => setLoading(false))
    }, [id])

    const download = () => {
        const token = localStorage.getItem('access_token')
        fetch(`/api/repository/archives/${id}/download/`, { headers: { Authorization: `Bearer ${token}` } })
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

    if (loading) return <div className="layout"><Sidebar /><div className="main-content"><div className="spinner" /></div></div>

    return (
        <div className="layout">
            <Sidebar />
            <div className="main-content">
                <div className="page-header">
                    <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)}><ArrowLeft size={14} /> Back</button>
                    <div style={{ display: 'flex', gap: 8 }}>
                        {doc.linked_repository && (
                            <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/repository/${doc.linked_repository.id}`)}>
                                <Link2 size={14} /> Go to Repository
                            </button>
                        )}
                        <button className="btn btn-primary btn-sm" onClick={download}>
                            <Download size={14} /> Download
                        </button>
                    </div>
                </div>
                <div className="page-body">
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 24 }}>
                        <div className="card">
                            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                                <span className="badge badge-gray"><FileText size={11} style={{ marginRight: 4 }} /> Archive Document</span>
                                {doc.linked_repository && <span className="badge badge-blue">Linked</span>}
                            </div>
                            <h1 style={{ fontSize: '1.45rem', fontWeight: 800, marginBottom: 12 }}>{doc.title}</h1>
                            <p style={{ color: 'var(--text2)', lineHeight: 1.7, marginBottom: 18 }}>{doc.abstract || 'No abstract provided.'}</p>
                            <div className="grid-2">
                                <div>
                                    <div className="form-label">Author</div>
                                    <div>{doc.author || '—'}</div>
                                </div>
                                <div>
                                    <div className="form-label">Year</div>
                                    <div>{doc.year || '—'}</div>
                                </div>
                                <div>
                                    <div className="form-label">Department</div>
                                    <div>{doc.department || '—'}</div>
                                </div>
                                <div>
                                    <div className="form-label">Course</div>
                                    <div>{doc.course || '—'}</div>
                                </div>
                            </div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            <div className="card">
                                <h3 style={{ fontSize: '0.95rem', marginBottom: 12 }}>Document Info</h3>
                                <div className="profile-summary-list">
                                    <div><span>Filename</span><strong>{doc.original_filename}</strong></div>
                                    <div><span>Uploaded</span><strong>{new Date(doc.uploaded_at).toLocaleDateString()}</strong></div>
                                    <div><span>Uploaded by</span><strong>{doc.uploaded_by?.full_name || doc.uploaded_by?.email || '—'}</strong></div>
                                    <div><span>Linked repository</span><strong>{doc.linked_repository?.title || 'None'}</strong></div>
                                </div>
                            </div>
                            {doc.linked_repository && (
                                <div className="card">
                                    <h3 style={{ fontSize: '0.95rem', marginBottom: 10 }}>Related Repository</h3>
                                    <button type="button" className="profile-pinned-card" onClick={() => navigate(`/repository/${doc.linked_repository.id}`)}>
                                        <div className="profile-pinned-title">{doc.linked_repository.title}</div>
                                        <p>{doc.linked_repository.description || 'Open the linked source repository.'}</p>
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
