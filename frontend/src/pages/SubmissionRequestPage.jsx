import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { ArrowLeft, ArrowUpRight, CheckCircle, Clock, FileText, Hash, LoaderCircle, MessageSquare, RotateCcw, XCircle } from 'lucide-react'
import Sidebar from '../components/Sidebar'
import api from '../api/axios'
import SubmissionAttachments from '../components/SubmissionAttachments'
import ResearchFileInput from '../components/ResearchFileInput'
import '../styles/auth-submission.css'

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
    const [saveError, setSaveError] = useState('')

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
        setSaveError('')
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
            const message = data?.detail || data?.research_file?.[0] || data?.system_file?.[0] || data?.system_details?.[0] || 'Resubmission failed. Please try again.'
            setSaveError(message)
            toast.error(message)
        } finally {
            setSaving(false)
        }
    }

    if (loading) return <div className="layout"><Sidebar /><main id="main-content" tabIndex={-1} className="main-content submission-status-loading" aria-busy="true"><div className="spinner" aria-hidden="true" /><p role="status">Loading your submission…</p></main></div>
    if (!submission) return null

    const info = statusInfo[submission.status] || statusInfo.pending
    const StatusIcon = info.icon
    const canRevise = submission.status === 'revision_requested'
    const hasSystem = submission.submission_type !== 'research_paper'
    const hasPaper = submission.submission_type !== 'executable_system'
    const update = (name) => (event) => setForm(current => ({ ...current, [name]: event.target.value }))
    const input = (name, label, { required = false, type = 'text', hint = '' } = {}) => (
        <div className="form-group">
            <label className="form-label" htmlFor={`revision-${name}`}>{label}{required && <span className="submission-required"> *</span>}</label>
            <input id={`revision-${name}`} className="form-input" type={type} value={form[name]} onChange={update(name)} required={required} aria-describedby={hint ? `revision-${name}-hint` : undefined} />
            {hint && <span id={`revision-${name}-hint`} className="research-form-hint">{hint}</span>}
        </div>
    )

    return (
        <div className="layout">
            <Sidebar />
            <main id="main-content" tabIndex={-1} className="main-content submission-workspace">
                <div className="page-header">
                    <button className="btn btn-ghost btn-sm" onClick={() => navigate('/dashboard')}><ArrowLeft size={14} /> Dashboard</button>
                    <span className={`badge ${info.badge}`}><StatusIcon size={12} /> {info.label}</span>
                </div>
                <div className="page-body submission-status-body">
                    <section className="card submission-status-header" aria-labelledby="submission-title">
                        <div className="submission-status-heading">
                            <span className="submission-status-icon"><FileText size={23} /></span>
                            <div><p className="submission-eyebrow">YOUR RESEARCH SUBMISSION</p><h1 id="submission-title">{submission.title}</h1>
                                <div className="submission-status-meta"><span><Hash size={14} />Request {submission.id}</span>{submission.queue_position && <span><Clock size={14} />Queue position {submission.queue_position}</span>}</div>
                            </div>
                        </div>
                        {submission.admin_comment && (
                            <div className="submission-feedback">
                                <h2><MessageSquare size={16} />Administrator feedback</h2>
                                <p>{submission.admin_comment}</p>
                            </div>
                        )}
                        {submission.status === 'pending' && <p className="submission-status-copy">Your request is waiting for an administrator to review it. You can return here to check your status and read any feedback.</p>}
                        {submission.published_archive_id && (
                            <button className="btn btn-primary" onClick={() => navigate(`/archives/${submission.published_archive_id}`)}>
                                View published research <ArrowUpRight size={16} />
                            </button>
                        )}
                    </section>

                    <section className="card submission-section" aria-labelledby="submitted-files-heading">
                        <div className="submission-section-heading"><span><FileText size={16} /></span><div><h2 id="submitted-files-heading">Submitted files</h2><p>Preview the paper or download the system attached to this request.</p></div></div>
                        <SubmissionAttachments key={submission.updated_at} submission={submission} />
                    </section>

                    {canRevise ? (
                        <form className="submission-revision-form" onSubmit={resubmit} aria-busy={saving}>
                            <fieldset className="submission-fields" disabled={saving}>
                                <section className="card submission-section" aria-labelledby="revision-files-heading">
                                    <div className="submission-section-heading"><span>01</span><div><h2 id="revision-files-heading">Update your files</h2><p>Address the administrator’s feedback. Your existing files will be kept unless you choose replacements.</p></div></div>
                                    <div className={`submission-files-grid${hasPaper && hasSystem ? '' : ' is-single'}`}>
                                        {hasPaper && <ResearchFileInput id="revision-research-file" kind="pdf" file={researchFile} onChange={setResearchFile} required={!submission.has_research_file} replacement={submission.has_research_file} disabled={saving} />}
                                        {hasSystem && <ResearchFileInput id="revision-system-file" kind="zip" file={systemFile} onChange={setSystemFile} required={!submission.has_system_file} replacement={submission.has_system_file} disabled={saving} />}
                                    </div>
                                </section>
                                <section className="card submission-section" aria-labelledby="revision-details-heading">
                                    <div className="submission-section-heading"><span>02</span><div><h2 id="revision-details-heading">Revise request details</h2><p>Review your research information before sending the updated request.</p></div></div>
                                    {input('title', 'Research title', { required: true })}
                                    <div className="form-group"><label className="form-label" htmlFor="revision-abstract">Abstract <span className="submission-optional">Optional</span></label><textarea id="revision-abstract" className="form-textarea" rows={5} value={form.abstract} onChange={update('abstract')} /></div>
                                    <div className="research-form-grid">{input('author', 'Author', { required: true })}{input('year', 'Year', { type: 'number' })}</div>
                                    <div className="research-form-grid">{input('department', 'Department')}{input('course', 'Course')}</div>
                                    {input('keywords', 'Keywords', { hint: 'Separate your keywords with commas.' })}
                                    {hasSystem && <div className="form-group"><label className="form-label" htmlFor="revision-system-details">System handoff details <span className="submission-required">*</span></label><textarea id="revision-system-details" className="form-textarea" rows={4} value={form.system_details} onChange={update('system_details')} required aria-describedby="revision-system-details-hint" /><span id="revision-system-details-hint" className="research-form-hint">Describe the application, dependencies, and steps needed to run it.</span></div>}
                                </section>
                                {saveError && <div className="alert alert-error" role="alert">{saveError}</div>}
                                <div className="submission-actions"><p>Resubmitting places your request at the end of the review queue.</p><div><button className="btn btn-primary" type="submit" disabled={saving}>{saving ? <LoaderCircle size={16} className="research-loading-icon" /> : <RotateCcw size={16} />}{saving ? 'Resubmitting…' : 'Resubmit for review'}</button></div></div>
                            </fieldset>
                        </form>
                    ) : (
                        <section className="card submission-section" aria-labelledby="submitted-details-heading">
                            <div className="submission-section-heading"><span><FileText size={16} /></span><div><h2 id="submitted-details-heading">Research details</h2><p>The information included with your submission.</p></div></div>
                            <p className="submission-status-copy">{submission.abstract || 'No abstract provided.'}</p>
                            <dl className="submission-metadata">
                                {[['Author', submission.author], ['Year', submission.year], ['Department', submission.department], ['Course', submission.course], ['Keywords', (submission.keywords || []).join(', ')]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || 'Not provided'}</dd></div>)}
                            </dl>
                            {hasSystem && <div className="submission-system-description"><h3>System handoff details</h3><p className="submission-status-copy">{submission.system_details || 'No system details provided.'}</p></div>}
                        </section>
                    )}
                </div>
            </main>
        </div>
    )
}
