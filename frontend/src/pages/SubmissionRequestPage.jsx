import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { ArrowLeft, CheckCircle, Clock, RotateCcw, XCircle } from 'lucide-react'
import Sidebar from '../components/Sidebar'
import api from '../api/axios'
import SubmissionAttachments from '../components/SubmissionAttachments'

const statusInfo = {
    pending: { label: 'Pending in administrator queue', icon: Clock, badge: 'badge-blue' },
    approved: { label: 'Approved and published', icon: CheckCircle, badge: 'badge-green' },
    rejected: { label: 'Rejected', icon: XCircle, badge: 'badge-red' },
    revision_requested: { label: 'Returned for revision', icon: RotateCcw, badge: 'badge-yellow' },
}

export default function SubmissionRequestPage() {
    const { id } = useParams()
    const navigate = useNavigate()
    const [submission, setSubmission] = useState(null)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [form, setForm] = useState({})
    const [researchFile, setResearchFile] = useState(null)
    const [systemFile, setSystemFile] = useState(null)

    const load = useCallback(() => {
        setLoading(true)
        api.get(`/repository/submission-requests/${id}/status/`)
            .then(({ data }) => {
                setSubmission(data)
                setForm({
                    title: data.title || '',
                    abstract: data.abstract || '',
                    author: data.author || '',
                    department: data.department || '',
                    course: data.course || '',
                    year: data.year || '',
                    keywords: (data.keywords || []).join(', '),
                    system_details: data.system_details || '',
                    proposed_system_link: data.proposed_system_link || '',
                })
            })
            .catch(() => {
                toast.error('Request not found or not accessible.')
                navigate('/dashboard')
            })
            .finally(() => setLoading(false))
    }, [id, navigate])

    useEffect(() => load(), [load])

    const resubmit = async (event) => {
        event.preventDefault()
        if ([researchFile, systemFile].some(file => file && file.size > 100 * 1024 * 1024)) {
            toast.error('Each file must be 100 MB or smaller.')
            return
        }
        setSaving(true)
        try {
            const body = new FormData()
            Object.entries(form).forEach(([key, value]) => {
                body.append(key, key === 'keywords' ? JSON.stringify(value.split(',').map(word => word.trim()).filter(Boolean)) : value)
            })
            if (researchFile) body.append('research_file', researchFile)
            if (systemFile) body.append('system_file', systemFile)
            const { data } = await api.post(`/repository/submission-requests/${id}/resubmit/`, body)
            setSubmission(data)
            setResearchFile(null)
            setSystemFile(null)
            toast.success(`Request resubmitted at queue position #${data.queue_position}.`)
        } catch (err) {
            const data = err.response?.data
            toast.error(data?.detail || data?.research_file?.[0] || data?.system_file?.[0] || data?.system_details?.[0] || 'Resubmission failed.')
        } finally {
            setSaving(false)
        }
    }

    if (loading) return <div className="layout"><Sidebar /><div className="main-content"><div className="spinner" /></div></div>
    if (!submission) return null

    const info = statusInfo[submission.status] || statusInfo.pending
    const StatusIcon = info.icon
    const canRevise = submission.status === 'revision_requested'
    const hasSystem = submission.submission_type !== 'research_paper'

    return (
        <div className="layout">
            <Sidebar />
            <div className="main-content">
                <div className="page-header">
                    <button className="btn btn-ghost btn-sm" onClick={() => navigate('/dashboard')}><ArrowLeft size={14} /> Dashboard</button>
                    <span className={`badge ${info.badge}`}><StatusIcon size={12} /> {info.label}</span>
                </div>
                <div className="page-body" style={{ maxWidth: 820 }}>
                    <div className="card" style={{ marginBottom: 18 }}>
                        <h1 style={{ fontSize: '1.35rem', marginBottom: 8 }}>{submission.title}</h1>
                        <p style={{ color: 'var(--text2)' }}>Request #{submission.id}{submission.queue_position ? ` · Queue position #${submission.queue_position}` : ''}</p>
                        {submission.admin_comment && (
                            <div style={{ marginTop: 16, padding: 14, borderRadius: 8, background: 'var(--bg3)', borderLeft: '3px solid var(--warning)' }}>
                                <strong>Administrator feedback</strong>
                                <p style={{ color: 'var(--text2)', marginTop: 6, whiteSpace: 'pre-wrap' }}>{submission.admin_comment}</p>
                            </div>
                        )}
                        {submission.published_archive_id && (
                            <button className="btn btn-primary btn-sm" style={{ marginTop: 16 }} onClick={() => navigate(`/archives/${submission.published_archive_id}`)}>
                                View published archive
                            </button>
                        )}
                    </div>

                    <div className="card" style={{ marginBottom: 18 }}>
                        <h2 style={{ fontSize: '1rem', marginBottom: 12 }}>Submitted files</h2>
                        <SubmissionAttachments key={submission.updated_at} submission={submission} />
                    </div>

                    {canRevise ? (
                        <form className="card" onSubmit={resubmit} style={{ display: 'grid', gap: 16 }}>
                            <div>
                                <h2 style={{ fontSize: '1rem' }}>Revise request details</h2>
                                <p style={{ color: 'var(--text2)', fontSize: '0.85rem', marginTop: 4 }}>Update your details and replace any files that need corrections. Existing files are kept unless replaced. Resubmission places this request at the end of the pending queue.</p>
                            </div>
                            {submission.submission_type !== 'executable_system' && <label className="form-group">{submission.has_research_file ? 'Replacement research PDF (optional)' : 'Research PDF (required)'}
                                <input className="form-input" type="file" accept=".pdf,application/pdf" required={!submission.has_research_file} onChange={event => setResearchFile(event.target.files[0] || null)} />
                            </label>}
                            {hasSystem && <label className="form-group">{submission.has_system_file ? 'Replacement system ZIP (optional)' : 'System ZIP (required)'}
                                <input className="form-input" type="file" accept=".zip,application/zip" required={!submission.has_system_file} onChange={event => setSystemFile(event.target.files[0] || null)} />
                            </label>}
                            <div className="form-group"><label className="form-label">Title</label><input className="form-input" value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} required /></div>
                            <div className="form-group"><label className="form-label">Abstract</label><textarea className="form-textarea" rows={4} value={form.abstract} onChange={(event) => setForm((current) => ({ ...current, abstract: event.target.value }))} /></div>
                            <div className="grid-2">
                                <div className="form-group"><label className="form-label">Author</label><input className="form-input" value={form.author} onChange={(event) => setForm((current) => ({ ...current, author: event.target.value }))} required /></div>
                                <div className="form-group"><label className="form-label">Year</label><input className="form-input" type="number" value={form.year} onChange={(event) => setForm((current) => ({ ...current, year: event.target.value }))} /></div>
                            </div>
                            <div className="grid-2">
                                <div className="form-group"><label className="form-label">Department</label><input className="form-input" value={form.department} onChange={(event) => setForm((current) => ({ ...current, department: event.target.value }))} /></div>
                                <div className="form-group"><label className="form-label">Course</label><input className="form-input" value={form.course} onChange={(event) => setForm((current) => ({ ...current, course: event.target.value }))} /></div>
                            </div>
                            <div className="form-group"><label className="form-label">Keywords</label><input className="form-input" value={form.keywords} onChange={(event) => setForm((current) => ({ ...current, keywords: event.target.value }))} /></div>
                            {hasSystem && (
                                <>
                                    <div className="form-group"><label className="form-label">System handoff details</label><textarea className="form-textarea" rows={4} value={form.system_details} onChange={(event) => setForm((current) => ({ ...current, system_details: event.target.value }))} required /></div>
                                    <div className="form-group"><label className="form-label">Proposed system link</label><input className="form-input" type="url" value={form.proposed_system_link} onChange={(event) => setForm((current) => ({ ...current, proposed_system_link: event.target.value }))} /></div>
                                </>
                            )}
                            <button className="btn btn-primary" type="submit" disabled={saving}><RotateCcw size={15} /> {saving ? 'Resubmitting…' : 'Resubmit request'}</button>
                        </form>
                    ) : (
                        <div className="card">
                            <h2 style={{ fontSize: '1rem', marginBottom: 10 }}>Submitted metadata</h2>
                            <p style={{ color: 'var(--text2)', whiteSpace: 'pre-wrap' }}>{submission.abstract || 'No abstract provided.'}</p>
                            {hasSystem && <p style={{ marginTop: 12, whiteSpace: 'pre-wrap' }}><strong>System details:</strong> {submission.system_details}</p>}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
