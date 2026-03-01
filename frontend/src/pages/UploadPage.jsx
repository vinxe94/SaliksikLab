import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import Sidebar from '../components/Sidebar'
import api from '../api/axios'
import { UploadCloud, Plus } from 'lucide-react'

const TYPES = [
    { value: 'thesis', label: 'Thesis Manuscript' },
    { value: 'software', label: 'Software Project' },
    { value: 'sourcecode', label: 'Source Code' },
    { value: 'documentation', label: 'Documentation' },
    { value: 'other', label: 'Other' },
]

const ALLOWED_EXT = '.pdf,.doc,.docx,.txt,.zip,.tar,.gz,.rar,.py,.js,.ts,.java,.c,.cpp,.h,.cs,.php,.rb,.html,.css,.json,.xml,.yaml,.yml,.md,.png,.jpg,.jpeg,.gif,.svg'

export default function UploadPage() {
    const navigate = useNavigate()
    const fileRef = useRef()
    const [form, setForm] = useState({
        title: '', abstract: '', output_type: 'thesis',
        department: '', course: '', year: new Date().getFullYear(),
        author: '', adviser: ''
    })
    const [file, setFile] = useState(null)
    const [keywords, setKeywords] = useState([])
    const [kwInput, setKwInput] = useState('')
    const [coAuthors, setCoAuthors] = useState([])
    const [coInput, setCoInput] = useState('')
    const [dragging, setDragging] = useState(false)
    const [loading, setLoading] = useState(false)
    const [errors, setErrors] = useState({})

    const handle = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }))

    const addKeyword = () => {
        const kw = kwInput.trim()
        if (kw && !keywords.includes(kw)) setKeywords(k => [...k, kw])
        setKwInput('')
    }

    const addCoAuthor = () => {
        const ca = coInput.trim()
        if (ca && !coAuthors.includes(ca)) setCoAuthors(c => [...c, ca])
        setCoInput('')
    }

    const onDrop = e => {
        e.preventDefault(); setDragging(false)
        const f = e.dataTransfer.files[0]
        if (f) setFile(f)
    }

    const submit = async e => {
        e.preventDefault()
        if (!file) { toast.error('Please select a file to upload.'); return }
        setLoading(true)
        setErrors({})
        try {
            const fd = new FormData()
            Object.entries(form).forEach(([k, v]) => fd.append(k, v))
            keywords.forEach(k => fd.append('keywords', k))
            coAuthors.forEach(c => fd.append('co_authors', c))
            fd.append('file', file)
            const { data } = await api.post('/repository/', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
            toast.success('Research output uploaded successfully!')
            navigate(`/repository/${data.id}`)
        } catch (err) {
            const errs = err.response?.data || {}
            setErrors(errs)
            toast.error(errs.file?.[0] || errs.non_field_errors?.[0] || 'Upload failed. Check the form.')
        } finally {
            setLoading(false)
        }
    }

    const field = (name, label, type = 'text', placeholder = '') => (
        <div className="form-group">
            <label className="form-label">{label}</label>
            <input className="form-input" type={type} name={name} value={form[name]} onChange={handle} placeholder={placeholder} required />
            {errors[name] && <span className="form-error">{errors[name][0]}</span>}
        </div>
    )

    return (
        <div className="layout">
            <Sidebar />
            <div className="main-content">
                <div className="page-header">
                    <div>
                        <h2 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Upload Research Output</h2>
                        <p style={{ color: 'var(--text2)', fontSize: '0.85rem' }}>Submit a new thesis, software project, or documentation</p>
                    </div>
                </div>
                <div className="page-body">
                    <form onSubmit={submit} style={{ maxWidth: 760, display: 'flex', flexDirection: 'column', gap: 20 }}>

                        {/* File dropzone */}
                        <div
                            className={`dropzone ${dragging ? 'active' : ''}`}
                            onDragOver={e => { e.preventDefault(); setDragging(true) }}
                            onDragLeave={() => setDragging(false)}
                            onDrop={onDrop}
                            onClick={() => fileRef.current.click()}
                        >
                            <input ref={fileRef} type="file" accept={ALLOWED_EXT} hidden onChange={e => setFile(e.target.files[0])} />
                            <UploadCloud size={40} style={{ margin: '0 auto 12px', display: 'block', opacity: 0.5 }} />
                            {file
                                ? <><p style={{ fontWeight: 600, color: 'var(--text)' }}>{file.name}</p><p style={{ fontSize: '0.8rem', color: 'var(--text2)' }}>{(file.size / 1024 / 1024).toFixed(2)} MB</p></>
                                : <><p>Drag & drop your file here, or <span style={{ color: 'var(--accent)' }}>browse</span></p><p style={{ fontSize: '0.8rem', marginTop: 4 }}>PDF, DOCX, ZIP, source code files — max 100 MB</p></>
                            }
                        </div>

                        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: 4 }}>Metadata</h3>
                            {field('title', 'Title', 'text', 'Full title of the research output')}
                            <div className="grid-2">
                                <div className="form-group">
                                    <label className="form-label">Output Type</label>
                                    <select className="form-select" name="output_type" value={form.output_type} onChange={handle}>
                                        {TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                                    </select>
                                </div>
                                {field('year', 'Year', 'number', '2024')}
                            </div>
                            <div className="grid-2">
                                {field('author', 'Author(s)', 'text', 'Primary author full name')}
                                {field('adviser', 'Adviser', 'text', 'Faculty adviser (optional)')}
                            </div>
                            <div className="grid-2">
                                {field('department', 'Department / College', 'text', 'e.g. College of Engineering')}
                                {field('course', 'Course / Program', 'text', 'e.g. BSCS, BSIT (optional)')}
                            </div>

                            {/* Co-Authors */}
                            <div className="form-group">
                                <label className="form-label">Co-Authors</label>
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <input className="form-input" value={coInput} onChange={e => setCoInput(e.target.value)} placeholder="Add co-author name…" onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addCoAuthor())} />
                                    <button type="button" className="btn btn-ghost btn-sm" onClick={addCoAuthor}><Plus size={16} /></button>
                                </div>
                                {coAuthors.length > 0 && (
                                    <div className="tags-container" style={{ marginTop: 8 }}>
                                        {coAuthors.map(c => (
                                            <span key={c} className="tag">
                                                {c} <button onClick={() => setCoAuthors(cs => cs.filter(x => x !== c))}>×</button>
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="form-group">
                                <label className="form-label">Abstract</label>
                                <textarea className="form-textarea" name="abstract" value={form.abstract} onChange={handle} placeholder="Brief summary of the research output…" rows={4} />
                            </div>

                            {/* Keywords */}
                            <div className="form-group">
                                <label className="form-label">Keywords</label>
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <input className="form-input" value={kwInput} onChange={e => setKwInput(e.target.value)} placeholder="Add keyword…" onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addKeyword())} />
                                    <button type="button" className="btn btn-ghost btn-sm" onClick={addKeyword}><Plus size={16} /></button>
                                </div>
                                {keywords.length > 0 && (
                                    <div className="tags-container" style={{ marginTop: 8 }}>
                                        {keywords.map(k => (
                                            <span key={k} className="tag">
                                                {k} <button onClick={() => setKeywords(kws => kws.filter(x => x !== k))}>×</button>
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: 12 }}>
                            <button type="submit" className="btn btn-primary" disabled={loading}>
                                <UploadCloud size={16} /> {loading ? 'Uploading…' : 'Submit Output'}
                            </button>
                            <button type="button" className="btn btn-ghost" onClick={() => navigate(-1)}>Cancel</button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    )
}
