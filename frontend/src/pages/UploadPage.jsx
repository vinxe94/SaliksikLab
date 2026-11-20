import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import Sidebar from '../components/Sidebar'
import WorkspaceHeader from '../components/WorkspaceHeader'
import WorkspaceBanner from '../components/WorkspaceBanner'
import WorkspaceFooter from '../components/WorkspaceFooter'
import { useAuth } from '../contexts/AuthContext'
import api from '../api/axios'
import { Check, FileCheck2, FileArchive, FileText, Layers3, LoaderCircle, Send, ShieldCheck, UploadCloud } from 'lucide-react'
import ResearchFileInput from '../components/ResearchFileInput'
import '../styles/auth-submission.css'
import '../styles/workspace-pages.css'

const TYPES = [
    { value: 'research_paper', label: 'Research paper', description: 'Share your findings as a PDF.', icon: FileText },
    { value: 'executable_system', label: 'Executable system', description: 'Upload your application as a ZIP.', icon: FileArchive },
    { value: 'paper_and_system', label: 'Paper + system', description: 'Keep your research and code together.', icon: Layers3 },
]

function apiErrorMessage(err) {
    const data = err.response?.data

    const firstMessage = (value) => {
        if (typeof value === 'string') {
            const message = value.trim()
            if (message.startsWith('<!DOCTYPE') || message.startsWith('<html')) return ''
            return message
        }
        if (Array.isArray(value)) {
            for (const item of value) {
                const message = firstMessage(item)
                if (message) return message
            }
        } else if (value && typeof value === 'object') {
            for (const item of Object.values(value)) {
                const message = firstMessage(item)
                if (message) return message
            }
        }
        return ''
    }

    if (!err.response) return 'Cannot reach the server. Check that the backend and database are running.'
    if (err.response.status >= 500) return 'The server could not save the submission. Check that database migrations are up to date.'
    const responseMessage = firstMessage(data)
    if (responseMessage) return responseMessage
    return 'The submission could not be saved.'
}

export default function UploadPage() {
    const navigate = useNavigate()
    const { user } = useAuth()
    const isAdmin = user?.role === 'admin'
    const isStudent = user?.role === 'student'
    const [loading, setLoading] = useState(false)
    const [uploadProgress, setUploadProgress] = useState(null)
    const [submitError, setSubmitError] = useState('')
    const [researchFile, setResearchFile] = useState(null)
    const [systemFile, setSystemFile] = useState(null)
    const [departments, setDepartments] = useState([])
    const [courses, setCourses] = useState([])
    const [form, setForm] = useState({
        title: '',
        abstract: '',
        submission_type: 'research_paper',
        author: '',
        department: '',
        course: '',
        year: new Date().getFullYear(),
        keywords: '',
        system_details: '',
    })

    const needsPaper = form.submission_type !== 'executable_system'
    const needsSystem = form.submission_type !== 'research_paper'

    useEffect(() => {
        Promise.all([
            api.get('/repository/departments/'),
            api.get('/repository/courses/'),
        ]).then(([deptRes, courseRes]) => {
            setDepartments(deptRes.data || [])
            setCourses(courseRes.data || [])
        }).catch(() => toast.error('Failed to load departments and courses.'))
    }, [])

    const payload = () => ({
        ...form,
        year: form.year || null,
        keywords: form.keywords.split(',').map((keyword) => keyword.trim()).filter(Boolean),
    })

    const submit = async (event) => {
        event.preventDefault()
        if (!isAdmin && !isStudent) {
            toast.error('Only students can request uploads.')
            return
        }
        if (needsSystem && !form.system_details.trim()) {
            toast.error('Describe the executable system for the administrator.')
            return
        }
        if (needsPaper && !researchFile) {
            toast.error('Select the research PDF.')
            return
        }
        if (needsSystem && !systemFile) {
            toast.error('Select the executable system ZIP.')
            return
        }
        if ([needsPaper && researchFile, needsSystem && systemFile].some(file => file && file.size > 100 * 1024 * 1024)) {
            toast.error('Each file must be 100 MB or smaller.')
            return
        }

        setSubmitError('')
        setUploadProgress(0)
        setLoading(true)
        const uploadOptions = { onUploadProgress: ({ loaded, total }) => setUploadProgress(total ? Math.round(loaded * 100 / total) : null) }
        try {
            if (isAdmin) {
                const data = payload()
                const body = new FormData()
                for (const [key, value] of Object.entries(data)) {
                    if (key === 'submission_type' || key === 'system_details') continue
                    if (key === 'keywords') {
                        value.forEach((keyword) => body.append('keywords', keyword))
                    } else if (value !== null && value !== '') {
                        body.append(key, value)
                    }
                }
                if (needsPaper && researchFile) body.append('file', researchFile)
                if (needsSystem && systemFile) body.append('system_file', systemFile)
                const response = await api.post('/repository/archives/', body, uploadOptions)
                toast.success('Research artifacts published.')
                navigate(`/archives/${response.data.id}`)
            } else {
                const body = new FormData()
                Object.entries(payload()).forEach(([key, value]) => {
                    if (value !== null) body.append(key, key === 'keywords' ? JSON.stringify(value) : value)
                })
                if (needsPaper && researchFile) body.append('research_file', researchFile)
                if (needsSystem && systemFile) body.append('system_file', systemFile)
                const response = await api.post('/repository/submission-requests/', body, uploadOptions)
                toast.success(`Upload request #${response.data.id} joined the review queue.`)
                navigate(`/submission-requests/${response.data.id}`)
            }
        } catch (err) {
            setSubmitError(apiErrorMessage(err))
            toast.error(apiErrorMessage(err))
        } finally {
            setLoading(false)
            setUploadProgress(null)
        }
    }

    if (!isAdmin && !isStudent) {
        return (
            <div className="layout workspace-layout">
                <Sidebar />
                <main id="main-content" tabIndex={-1} className="main-content workspace-content submission-workspace">
                    <WorkspaceHeader title="Research Submissions" eyebrow="Your workspace" />
                    <div className="page-body workspace-page-body">
                        <div className="card submission-access-note">
                            <ShieldCheck size={32} />
                            <h2>Research submissions</h2>
                            <p>Students submit research files for review, and administrators approve and publish the artifacts.</p>
                            <button className="btn btn-primary" onClick={() => navigate('/repository')}>Explore the repository</button>
                        </div>
                        <WorkspaceFooter />
                    </div>
                </main>
            </div>
        )
    }

    const update = (name) => (event) => setForm(current => ({ ...current, [name]: event.target.value }))
    const readyChecks = [
        { label: 'Research title and author', done: Boolean(form.title.trim() && form.author.trim()) },
        ...(needsPaper ? [{ label: 'Research paper attached', done: Boolean(researchFile) }] : []),
        ...(needsSystem ? [{ label: 'System ZIP attached', done: Boolean(systemFile) }, { label: 'System details provided', done: Boolean(form.system_details.trim()) }] : []),
    ]

    return (
        <div className="layout workspace-layout">
            <Sidebar />
            <main id="main-content" tabIndex={-1} className="main-content workspace-content submission-workspace">
                <WorkspaceHeader title={isAdmin ? 'Publish Research' : 'Share Research'} eyebrow="Contribute to the collection" />

                <div className="page-body workspace-page-body submission-page-body">
                    <WorkspaceBanner compact eyebrow="Every contribution matters"
                        title={<>Your research. <span>A wider reach.</span></>}
                        description={isAdmin ? 'Give approved research a place to be discovered. Share the final files with your academic community.' : 'Submit your work for review and take the next step toward publication.'}
                    />
                    <form className="submission-layout" onSubmit={submit} aria-busy={loading}>
                        <fieldset className="submission-fields" disabled={loading}>
                            <section className="card submission-section" aria-labelledby="submission-type-heading">
                                <div className="submission-section-heading"><span aria-hidden="true"><Layers3 size={20} /></span><div><h2 id="submission-type-heading">What are you sharing?</h2><p>Choose the format that best represents your work.</p></div></div>
                                <div className="submission-type-options" role="radiogroup" aria-labelledby="submission-type-heading">
                                    {TYPES.map(({ value, label, description, icon: Icon }) => (
                                        <label key={value} className={`submission-type-option${form.submission_type === value ? ' is-selected' : ''}`}>
                                            <input type="radio" name="submission_type" value={value} checked={form.submission_type === value} onChange={update('submission_type')} />
                                            <span className="submission-type-icon"><Icon size={22} /></span>
                                            <strong>{label}</strong><span>{description}</span>
                                            <span className="submission-type-check" aria-hidden="true">{form.submission_type === value && <Check size={12} />}</span>
                                        </label>
                                    ))}
                                </div>
                            </section>

                            <section className="card submission-section" aria-labelledby="submission-files-heading">
                                <div className="submission-section-heading"><span aria-hidden="true"><UploadCloud size={20} /></span><div><h2 id="submission-files-heading">Attach your files</h2><p>{isAdmin ? 'Upload the final files for this publication.' : 'Add the files you want the administrator to review.'}</p></div></div>
                                <div className={`submission-files-grid${needsPaper && needsSystem ? '' : ' is-single'}`}>
                                    {needsPaper && <ResearchFileInput id="research-file" kind="pdf" file={researchFile} onChange={setResearchFile} disabled={loading} />}
                                    {needsSystem && <ResearchFileInput id="system-file" kind="zip" file={systemFile} onChange={setSystemFile} disabled={loading} />}
                                </div>
                                {needsSystem && <p className="research-form-hint">Include your application source and dependency files in a single ZIP. The approved ZIP becomes this research’s saved system configuration.</p>}
                            </section>

                            <section className="card submission-section" aria-labelledby="submission-details-heading">
                                <div className="submission-section-heading"><span aria-hidden="true"><FileText size={20} /></span><div><h2 id="submission-details-heading">Tell us about your research</h2><p>Good details help others find and understand your contribution.</p></div></div>
                                <div className="form-group">
                                    <label className="form-label" htmlFor="research-title">Research title <span className="submission-required">*</span></label>
                                    <input id="research-title" className="form-input" value={form.title} onChange={update('title')} placeholder="Give your research a clear, descriptive title" required />
                                </div>
                                <div className="form-group">
                                    <label className="form-label" htmlFor="research-abstract">Abstract <span className="submission-optional">Optional</span></label>
                                    <textarea id="research-abstract" className="form-textarea" rows={5} value={form.abstract} onChange={update('abstract')} placeholder="Summarize your research question, approach, and key findings." />
                                </div>
                                <div className="research-form-grid">
                                    <div className="form-group">
                                        <label className="form-label" htmlFor="research-author">Author <span className="submission-required">*</span></label>
                                        <input id="research-author" className="form-input" value={form.author} onChange={update('author')} placeholder="Full name or author names" required />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label" htmlFor="research-year">Year</label>
                                        <input id="research-year" className="form-input" type="number" value={form.year} onChange={update('year')} />
                                    </div>
                                </div>
                                <div className="research-form-grid">
                                    <div className="form-group">
                                        <label className="form-label" htmlFor="research-department">Department</label>
                                        <select id="research-department" className="form-select" value={form.department} onChange={(event) => setForm((current) => ({ ...current, department: event.target.value, course: '' }))}>
                                            <option value="">Select department</option>
                                            {departments.map((department) => <option key={department.id} value={department.name}>{department.name}</option>)}
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label" htmlFor="research-course">Course</label>
                                        <select id="research-course" className="form-select" value={form.course} onChange={update('course')}>
                                            <option value="">Select course</option>
                                            {courses.filter((course) => !form.department || course.department_name === form.department).map((course) => <option key={course.id} value={course.name}>{course.name}</option>)}
                                        </select>
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label className="form-label" htmlFor="research-keywords">Keywords <span className="submission-optional">Optional</span></label>
                                    <input id="research-keywords" className="form-input" value={form.keywords} onChange={update('keywords')} placeholder="Machine learning, learning analytics, capstone" aria-describedby="research-keywords-hint" />
                                    <span id="research-keywords-hint" className="research-form-hint">Separate keywords with commas so your research is easier to discover.</span>
                                </div>
                                {needsSystem && (
                                    <div className="form-group">
                                        <label className="form-label" htmlFor="research-system-details">System handoff details <span className="submission-required">*</span></label>
                                        <textarea id="research-system-details" className="form-textarea" rows={4} value={form.system_details} onChange={update('system_details')} placeholder="Describe what the system does, the technology used, and how to run it." required aria-describedby="research-system-hint" />
                                        <span id="research-system-hint" className="research-form-hint">Include setup steps and dependencies. If your system needs a hosting configuration, include hosting.json in the ZIP.</span>
                                    </div>
                                )}
                            </section>
                            {submitError && <div className="alert alert-error" role="alert">{submitError}</div>}
                            <div className="submission-actions">
                                <p>{isAdmin ? 'Your files will be published to the repository.' : 'You can track your request after submitting.'}</p>
                                <div><button type="button" className="btn btn-ghost" onClick={() => navigate(-1)}>Cancel</button>
                                    <button type="submit" className="btn btn-primary" disabled={loading}>
                                        {loading ? <LoaderCircle size={17} className="research-loading-icon" /> : isAdmin ? <UploadCloud size={17} /> : <Send size={17} />}
                                        {loading ? (uploadProgress === 100 ? 'Saving submission…' : `Uploading${uploadProgress === null ? '…' : ` ${uploadProgress}%`}`) : isAdmin ? 'Publish research' : 'Submit for review'}
                                    </button>
                                </div>
                            </div>
                        </fieldset>
                        <aside className="submission-guide" aria-label="Submission guidance">
                            <div className="submission-guide-icon"><ShieldCheck size={25} /></div>
                            <h2>{isAdmin ? 'Ready for the collection' : 'Your work, thoughtfully reviewed'}</h2>
                            <p>{isAdmin ? 'Make sure your research details and final files are complete before publishing.' : 'Your files stay private while an administrator reviews your request. Requests are processed in submission order.'}</p>
                            <div className="submission-checklist"><h3>Before you submit</h3>
                                {readyChecks.map(({ label, done }) => <div key={label} className={done ? 'is-complete' : ''}><span aria-label={done ? 'Complete' : 'Incomplete'}>{done && <Check size={12} />}</span>{label}</div>)}
                            </div>
                            <p className="submission-guide-note"><FileCheck2 size={17} />{isAdmin ? 'Published research is available in the repository.' : 'You’ll find review updates in your dashboard.'}</p>
                        </aside>
                    </form>
                    <WorkspaceFooter />
                </div>
            </main>
        </div>
    )
}
