import { useRef, useState } from 'react'
import PropTypes from 'prop-types'
import { Check, FileArchive, FileText, UploadCloud, X } from 'lucide-react'
import '../styles/auth-submission.css'

export default function ResearchFileInput({ id, kind, file, onChange, required = true, disabled = false, replacement = false }) {
    const input = useRef(null)
    const [error, setError] = useState('')
    const isPaper = kind === 'pdf'
    const Icon = isPaper ? FileText : FileArchive
    const title = `${replacement ? 'Replacement ' : ''}${isPaper ? 'research paper' : 'system files'}`
    const size = file ? (file.size < 1024 * 1024 ? `${Math.max(1, Math.round(file.size / 1024))} KB` : `${(file.size / (1024 * 1024)).toFixed(1)} MB`) : ''

    const select = (event) => {
        const selected = event.target.files?.[0]
        if (!selected) return
        if (!selected.name.toLowerCase().endsWith(`.${kind}`)) {
            setError(`Choose a ${kind.toUpperCase()} file for ${isPaper ? 'the research paper' : 'the system'}.`)
            event.target.value = ''
            return
        }
        if (selected.size > 100 * 1024 * 1024) {
            setError('This file exceeds 100 MB. Choose a smaller file.')
            event.target.value = ''
            return
        }
        setError('')
        onChange(selected)
    }

    return (
        <div className="submission-file-group">
            <label htmlFor={id} className={`submission-file-card${file ? ' has-file' : ''}${disabled ? ' is-disabled' : ''}`}>
                <input ref={input} id={id} type="file" accept={isPaper ? '.pdf,application/pdf' : '.zip,application/zip'} onChange={select} required={required && !file} disabled={disabled} aria-describedby={`${id}-hint${error ? ` ${id}-error` : ''}`} aria-invalid={Boolean(error)} />
                <span className="submission-file-icon"><Icon size={24} /></span>
                <span className="submission-file-heading">{title}<span>{required ? 'Required' : 'Optional'}</span></span>
                {file ? <span className="submission-file-selected"><Check size={15} /><span>{file.name}</span></span> : <span className="submission-file-description">{isPaper ? 'Your complete research document' : 'Your application and its dependencies'}</span>}
                <span id={`${id}-hint`} className="submission-file-hint">{file ? `${size} · ${kind.toUpperCase()} selected` : `${kind.toUpperCase()} format · Up to 100 MB`}</span>
                <span className="submission-file-choose"><UploadCloud size={16} />{file ? 'Choose a different file' : `Choose ${kind.toUpperCase()} file`}</span>
            </label>
            {file && <button type="button" className="submission-file-remove" aria-label={`Remove ${file.name}`} disabled={disabled} onClick={() => { onChange(null); setError(''); if (input.current) input.current.value = '' }}><X size={14} /> Remove file</button>}
            {error && <p id={`${id}-error`} className="form-error" role="alert">{error}</p>}
        </div>
    )
}

ResearchFileInput.propTypes = {
    id: PropTypes.string.isRequired,
    kind: PropTypes.oneOf(['pdf', 'zip']).isRequired,
    file: PropTypes.object,
    onChange: PropTypes.func.isRequired,
    required: PropTypes.bool,
    disabled: PropTypes.bool,
    replacement: PropTypes.bool,
}
