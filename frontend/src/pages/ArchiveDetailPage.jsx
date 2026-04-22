import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Sidebar from '../components/Sidebar'
import api from '../api/axios'
import { ArrowLeft, Link2, FileText, Eye } from 'lucide-react'

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

    if (loading) return <div className="layout"><Sidebar /><div className="main-content"><div className="spinner" /></div></div>

    return (
        <div className="layout">
            <Sidebar />
            <div className="main-content">
                <div className="page-header">
                    <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)}><ArrowLeft size={14} /> Back</button>
                    <div style={{ display: 'flex', gap: 8 }}>
                        {doc.system_link && (
                            <button className="btn btn-ghost btn-sm" onClick={() => window.open(doc.system_link, '_blank', 'noopener,noreferrer')}>
                                <Link2 size={14} /> Open System Link
                            </button>
                        )}
                        <button className="btn btn-primary btn-sm" onClick={() => navigate(`/archives/${id}/view`)}>
                            <Eye size={14} /> View PDF
                        </button>
                    </div>
                </div>
                <div className="page-body">
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 24 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            <div className="card">
                                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                                    <span className="badge badge-gray"><FileText size={11} style={{ marginRight: 4 }} /> Archive Document</span>
                                    <span className="badge badge-blue">View only</span>
                                    {doc.system_link && <span className="badge badge-blue">System linked</span>}
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

                            <div className="card" style={{ textAlign: 'center', padding: 32 }}>
                                <FileText size={38} style={{ opacity: 0.45, marginBottom: 12 }} />
                                <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 8 }}>PDF is ready to view</h3>
                                <p style={{ color: 'var(--text2)', fontSize: '0.9rem', marginBottom: 16 }}>
                                    Open the uploaded PDF in a dedicated view-only page.
                                </p>
                                <button className="btn btn-primary" onClick={() => navigate(`/archives/${id}/view`)}>
                                    <Eye size={16} /> View PDF
                                </button>
                            </div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            <div className="card">
                                <h3 style={{ fontSize: '0.95rem', marginBottom: 12 }}>Document Info</h3>
                                <div className="profile-summary-list">
                                    <div><span>Filename</span><strong>{doc.original_filename}</strong></div>
                                    <div><span>Uploaded</span><strong>{new Date(doc.uploaded_at).toLocaleDateString()}</strong></div>
                                    <div><span>Uploaded by</span><strong>{doc.uploaded_by?.full_name || doc.uploaded_by?.email || '—'}</strong></div>
                                    <div><span>System link</span><strong>{doc.system_link || 'None'}</strong></div>
                                </div>
                            </div>
                            {doc.system_link && (
                                <div className="card">
                                    <h3 style={{ fontSize: '0.95rem', marginBottom: 10 }}>System Link</h3>
                                    <button type="button" className="profile-pinned-card" onClick={() => window.open(doc.system_link, '_blank', 'noopener,noreferrer')}>
                                        <div className="profile-pinned-title">{doc.system_link}</div>
                                        <p>Open the linked system in a new tab.</p>
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
