import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useAuth } from '../contexts/AuthContext'
import Sidebar from '../components/Sidebar'
import api from '../api/axios'
import { ArrowLeft, Link2, FileText, Eye, CheckCircle, MessageSquare, XCircle, RefreshCw, Download } from 'lucide-react'

const PDF_ONLY_MESSAGE = 'Only PDF files are allowed.'

function isPdf(file) {
    return file?.name?.toLowerCase().endsWith('.pdf')
}

function uploadErrorMessage(err) {
    const data = err.response?.data
    if (data?.file?.[0]) return data.file[0]
    if (data?.detail) return data.detail
    return 'Revision upload failed.'
}

export default function ArchiveDetailPage() {
    const { id } = useParams()
    const navigate = useNavigate()
    const { user } = useAuth()
    const [doc, setDoc] = useState(null)
    const [loading, setLoading] = useState(true)
    const [reviewAction, setReviewAction] = useState(null)
    const [reviewComment, setReviewComment] = useState('')
    const [reviewLoading, setReviewLoading] = useState(false)
    const [versions, setVersions] = useState([])
    const [showRevForm, setShowRevForm] = useState(false)
    const [revFile, setRevFile] = useState(null)
    const [revNotes, setRevNotes] = useState('')
    const [revLoading, setRevLoading] = useState(false)

    const load = useCallback(() => {
        setLoading(true)
        Promise.all([
            api.get(`/repository/archives/${id}/`),
            api.get(`/repository/archives/${id}/versions/`),
        ])
            .then(([docRes, versionsRes]) => {
                setDoc(docRes.data)
                setVersions(versionsRes.data.results || versionsRes.data)
            })
            .catch(() => navigate('/repository'))
            .finally(() => setLoading(false))
    }, [id, navigate])

    useEffect(() => {
        load()
    }, [load])

    const canReview = user?.role === 'faculty' && doc?.assigned_faculty?.id === user.id
    const canRevise = user?.role === 'admin' || user?.id === doc?.uploaded_by?.id
    const latestVersion = versions[0]

    const downloadVersion = (versionId) => {
        const url = versionId
            ? `/api/repository/archives/${id}/download/${versionId}/`
            : `/api/repository/archives/${id}/download/`
        const token = localStorage.getItem('access_token')
        fetch(url, { headers: { Authorization: `Bearer ${token}` } })
            .then((response) => {
                if (!response.ok) throw new Error('Download failed.')
                return response.blob()
            })
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

    const statusBadge = () => {
        if (doc.is_approved) return <span className="badge badge-green">Approved</span>
        if (doc.is_rejected && doc.revision_comment && !doc.rejection_reason) return <span className="badge badge-yellow">Revision requested</span>
        if (doc.is_rejected) return <span className="badge" style={{ background: 'rgba(248,81,73,0.12)', color: 'var(--danger)' }}>Rejected</span>
        return <span className="badge badge-yellow">Pending review</span>
    }

    const openReview = (action) => {
        setReviewAction(action)
        setReviewComment('')
    }

    const submitReview = async () => {
        if (['reject', 'revision'].includes(reviewAction) && !reviewComment.trim()) {
            toast.error('Please add a comment.')
            return
        }
        setReviewLoading(true)
        try {
            const { data } = await api.post(`/repository/archives/${id}/review/`, {
                action: reviewAction,
                comment: reviewComment,
            })
            setDoc(data)
            setReviewAction(null)
            toast.success('Review saved.')
        } catch (err) {
            toast.error(err.response?.data?.detail || err.response?.data?.comment?.[0] || 'Review failed.')
        } finally {
            setReviewLoading(false)
        }
    }

    const chooseRevisionFile = (selected) => {
        if (!selected) return
        if (!isPdf(selected)) {
            setRevFile(null)
            toast.error(PDF_ONLY_MESSAGE)
            return
        }
        setRevFile(selected)
    }

    const submitRevision = async (e) => {
        e.preventDefault()
        if (!revFile) {
            toast.error('Select a revised PDF.')
            return
        }
        if (!isPdf(revFile)) {
            toast.error(PDF_ONLY_MESSAGE)
            return
        }
        setRevLoading(true)
        try {
            const fd = new FormData()
            fd.append('file', revFile)
            fd.append('change_notes', revNotes)
            const { data } = await api.post(`/repository/archives/${id}/revise/`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
            toast.success(`Version ${data.version} uploaded. Status reset to pending review.`)
            setShowRevForm(false)
            setRevFile(null)
            setRevNotes('')
            load()
        } catch (err) {
            toast.error(uploadErrorMessage(err))
        } finally {
            setRevLoading(false)
        }
    }

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
                        {canRevise && (
                            <button className="btn btn-ghost btn-sm" onClick={() => setShowRevForm((value) => !value)}>
                                <RefreshCw size={14} /> Upload New Version
                            </button>
                        )}
                    </div>
                </div>
                <div className="page-body">
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 24 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            <div className="card">
                                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                                    <span className="badge badge-gray"><FileText size={11} style={{ marginRight: 4 }} /> Archive Document</span>
                                    <span className="badge badge-blue">v{latestVersion?.version || doc.current_version || 1}</span>
                                    <span className="badge badge-gray">{versions.length || doc.version_count || 1} version{(versions.length || doc.version_count || 1) === 1 ? '' : 's'}</span>
                                    <span className={`badge ${doc.is_public ? 'badge-green' : 'badge-gray'}`}>{doc.is_public ? 'Public' : 'Private'}</span>
                                    {statusBadge()}
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

                            {showRevForm && (
                                <div className="card">
                                    <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 12 }}>Upload Revised PDF</h3>
                                    <form onSubmit={submitRevision} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                        <div className="form-group">
                                            <label className="form-label">Revised Paper</label>
                                            <input type="file" accept=".pdf" className="form-input" onChange={(e) => chooseRevisionFile(e.target.files[0])} />
                                            <span className="dashboard-stat-meta">PDF files only. Uploading a revision resets the paper to pending review.</span>
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">Change Notes</label>
                                            <textarea
                                                className="form-textarea"
                                                rows={3}
                                                value={revNotes}
                                                onChange={(e) => setRevNotes(e.target.value)}
                                                placeholder="Summarize what changed in this version."
                                            />
                                        </div>
                                        <div style={{ display: 'flex', gap: 10 }}>
                                            <button type="submit" className="btn btn-primary btn-sm" disabled={revLoading}>
                                                {revLoading ? 'Uploading...' : 'Submit Revision'}
                                            </button>
                                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowRevForm(false)} disabled={revLoading}>Cancel</button>
                                        </div>
                                    </form>
                                </div>
                            )}

                            <div className="card" style={{ textAlign: 'center', padding: 32 }}>
                                <FileText size={38} style={{ opacity: 0.45, marginBottom: 12 }} />
                                <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 8 }}>PDF is ready to view</h3>
                                <p style={{ color: 'var(--text2)', fontSize: '0.9rem', marginBottom: 16 }}>
                                    Open or download the current PDF version.
                                </p>
                                <div style={{ display: 'flex', justifyContent: 'center', gap: 10, flexWrap: 'wrap' }}>
                                    <button className="btn btn-primary" onClick={() => navigate(`/archives/${id}/view`)}>
                                        <Eye size={16} /> View PDF
                                    </button>
                                    <button className="btn btn-ghost" onClick={() => downloadVersion()}>
                                        <Download size={16} /> Download Current
                                    </button>
                                </div>
                            </div>

                            {canReview && (
                                <div className="card">
                                    <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 12 }}>Faculty Review</h3>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                                        <button className="btn btn-sm" style={{ background: 'rgba(46,168,108,0.1)', color: 'var(--accent2)' }} onClick={() => openReview('approve')}>
                                            <CheckCircle size={14} /> Approve
                                        </button>
                                        <button className="btn btn-sm" style={{ background: 'rgba(230,81,0,0.12)', color: 'var(--warning)' }} onClick={() => openReview('revision')}>
                                            <MessageSquare size={14} /> Request Revision
                                        </button>
                                        <button className="btn btn-sm" style={{ background: 'rgba(248,81,73,0.1)', color: 'var(--danger)' }} onClick={() => openReview('reject')}>
                                            <XCircle size={14} /> Reject
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            <div className="card">
                                <h3 style={{ fontSize: '0.95rem', marginBottom: 12 }}>Document Info</h3>
                                <div className="profile-summary-list">
                                    <div><span>Filename</span><strong>{doc.original_filename}</strong></div>
                                    <div><span>Current version</span><strong>v{latestVersion?.version || doc.current_version || 1}</strong></div>
                                    <div><span>Uploaded</span><strong>{new Date(doc.uploaded_at).toLocaleDateString()}</strong></div>
                                    <div><span>Uploaded by</span><strong>{doc.uploaded_by?.full_name || doc.uploaded_by?.email || '—'}</strong></div>
                                    <div><span>Assigned faculty</span><strong>{doc.assigned_faculty?.full_name || doc.assigned_faculty?.email || '—'}</strong></div>
                                    <div><span>Visibility</span><strong>{doc.is_public ? 'Public' : 'Private'}</strong></div>
                                    <div><span>Review status</span><strong>{doc.review_status || 'pending'}</strong></div>
                                    <div><span>System link</span><strong>{doc.system_link || 'None'}</strong></div>
                                </div>
                            </div>
                            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontWeight: 700 }}>Version History</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 0, padding: 12 }}>
                                    {versions.map((version) => (
                                        <div key={version.id} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 12, marginBottom: 10 }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                                                <strong>v{version.version}</strong>
                                                {version.id === latestVersion?.id && <span className="badge badge-green">Current</span>}
                                            </div>
                                            <div style={{ fontSize: '0.82rem', color: 'var(--text2)', wordBreak: 'break-word' }}>{version.original_filename}</div>
                                            {version.change_notes && <div style={{ fontSize: '0.8rem', marginTop: 8 }}>{version.change_notes}</div>}
                                            <div style={{ fontSize: '0.78rem', color: 'var(--text2)', marginTop: 8 }}>
                                                {new Date(version.uploaded_at).toLocaleDateString()} by {version.uploaded_by?.full_name || version.uploaded_by?.email || '—'}
                                            </div>
                                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                                                <button
                                                    type="button"
                                                    className="btn btn-ghost btn-sm"
                                                    onClick={() => navigate(`/archives/${id}/view?version=${version.id}`)}
                                                >
                                                    <Eye size={14} /> View
                                                </button>
                                                <button
                                                    type="button"
                                                    className="btn btn-ghost btn-sm"
                                                    onClick={() => downloadVersion(version.id)}
                                                >
                                                    <Download size={14} /> Download
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                    {versions.length === 0 && (
                                        <p style={{ color: 'var(--text2)', fontSize: '0.9rem' }}>No version history yet.</p>
                                    )}
                                </div>
                            </div>
                            {(doc.revision_comment || doc.rejection_reason) && (
                                <div className="card">
                                    <h3 style={{ fontSize: '0.95rem', marginBottom: 10 }}>Review Notes</h3>
                                    <p style={{ color: 'var(--text2)', lineHeight: 1.6 }}>{doc.revision_comment || doc.rejection_reason}</p>
                                    {doc.reviewed_by && (
                                        <p style={{ color: 'var(--text2)', fontSize: '0.82rem', marginTop: 10 }}>
                                            By {doc.reviewed_by.full_name || doc.reviewed_by.email}
                                        </p>
                                    )}
                                </div>
                            )}
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
            {reviewAction && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
                    <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 28, width: '100%', maxWidth: 480 }}>
                        <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 12, textTransform: 'capitalize' }}>
                            {reviewAction === 'revision' ? 'Request Revision' : `${reviewAction} Paper`}
                        </h3>
                        <div className="form-group">
                            <label className="form-label">{reviewAction === 'approve' ? 'Comment' : 'Comment required'}</label>
                            <textarea
                                className="form-textarea"
                                rows={4}
                                value={reviewComment}
                                onChange={(e) => setReviewComment(e.target.value)}
                                placeholder="Write feedback for the uploader."
                                autoFocus
                            />
                        </div>
                        <div style={{ display: 'flex', gap: 10, marginTop: 16, justifyContent: 'flex-end' }}>
                            <button className="btn btn-ghost btn-sm" onClick={() => setReviewAction(null)} disabled={reviewLoading}>Cancel</button>
                            <button className="btn btn-primary btn-sm" onClick={submitReview} disabled={reviewLoading}>
                                {reviewLoading ? 'Saving...' : 'Save Review'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
