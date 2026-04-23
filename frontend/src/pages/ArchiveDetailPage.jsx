import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useAuth } from '../contexts/AuthContext'
import Sidebar from '../components/Sidebar'
import api from '../api/axios'
import { ArrowLeft, Link2, FileText, Eye, CheckCircle, MessageSquare, XCircle } from 'lucide-react'

export default function ArchiveDetailPage() {
    const { id } = useParams()
    const navigate = useNavigate()
    const { user } = useAuth()
    const [doc, setDoc] = useState(null)
    const [loading, setLoading] = useState(true)
    const [reviewAction, setReviewAction] = useState(null)
    const [reviewComment, setReviewComment] = useState('')
    const [reviewLoading, setReviewLoading] = useState(false)

    useEffect(() => {
        api.get(`/repository/archives/${id}/`)
            .then((response) => setDoc(response.data))
            .catch(() => navigate('/repository'))
            .finally(() => setLoading(false))
    }, [id, navigate])

    const canReview = user?.role === 'faculty' && doc?.assigned_faculty?.id === user.id

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
                                    <div><span>Uploaded</span><strong>{new Date(doc.uploaded_at).toLocaleDateString()}</strong></div>
                                    <div><span>Uploaded by</span><strong>{doc.uploaded_by?.full_name || doc.uploaded_by?.email || '—'}</strong></div>
                                    <div><span>Assigned faculty</span><strong>{doc.assigned_faculty?.full_name || doc.assigned_faculty?.email || '—'}</strong></div>
                                    <div><span>Review status</span><strong>{doc.review_status || 'pending'}</strong></div>
                                    <div><span>System link</span><strong>{doc.system_link || 'None'}</strong></div>
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
