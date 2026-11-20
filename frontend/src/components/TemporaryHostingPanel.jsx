import { useCallback, useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { Activity, Check, CheckCircle2, ChevronDown, Clock3, Copy, ExternalLink, FileArchive, Globe2, LoaderCircle, Play, RefreshCw, Server, Square, Terminal, Trash2, Upload } from 'lucide-react'
import api from '../api/axios'
import '../styles/management.css'

const pending = ['uploaded', 'validating', 'extracting', 'building', 'starting', 'stopping']
const emptyForm = { name: '', project_type: 'auto', entrypoint: '', start_command: '', site_zip: null }
const runtimeHelp = {
    fullstack: 'Upload your frontend, backend, and optional database folder together. A hosting.json file can select the database and configure builds. Database changes are kept for this saved deployment unless persistence is disabled.',
    ruby: 'Include a Gemfile for dependencies. Use app.rb, server.rb, config.ru, or a Ruby entrypoint. Serve HTTP on 0.0.0.0 using the PORT environment variable.',
    cpp: 'Upload C++ source (.cpp, .cc, .cxx). Root source files compile together with C++17; an entrypoint selects one source file. Serve HTTP on 0.0.0.0 using PORT. The executable is /app/.hosting-build/server.',
}
const fullstackManifest = JSON.stringify({
    version: 1,
    frontend: { path: 'frontend', output: 'dist' },
    backend: { path: 'backend', runtime: 'python' },
    database: { engine: 'sqlite', persist: true },
}, null, 2)
const runtimeLabel = value => value === 'auto' ? 'Detect automatically' : value === 'fullstack' ? 'Frontend + backend + database' : value === 'cpp' ? 'C++' : value === 'ruby' ? 'Ruby' : value
const showTime = value => value ? new Date(value).toLocaleString() : '—'
const statusLabels = { uploaded: 'Queued', validating: 'Checking files', extracting: 'Preparing files', building: 'Building system', starting: 'Starting system', running: 'Live', stopping: 'Stopping', stopped: 'Stopped', expired: 'Session ended', failed: 'Needs attention' }

// eslint-disable-next-line react/prop-types -- Used by the authenticated admin and archive routes.
export default function TemporaryHostingPanel({ archiveId, defaultName = '', isAdmin = false }) {
    const base = archiveId ? `/hosting/archives/${archiveId}` : '/hosting'
    const [session, setSession] = useState(null)
    const [systems, setSystems] = useState([])
    const [defaultId, setDefaultId] = useState(null)
    const [logs, setLogs] = useState('')
    const [form, setForm] = useState(emptyForm)
    const [busy, setBusy] = useState(false)
    const [loading, setLoading] = useState(true)
    const [workerOnline, setWorkerOnline] = useState(false)
    const [activeId, setActiveId] = useState(null)
    const [error, setError] = useState('')
    const [copied, setCopied] = useState(false)
    const [clock, setClock] = useState(Date.now())
    const [countdown, setCountdown] = useState({ seconds: 0, received: Date.now() })
    const requests = useRef({ version: 0 })
    const zipInputRef = useRef(null)

    const load = useCallback(async () => {
        const version = ++requests.current.version
        try {
            const [status, logResult, saved] = await Promise.all([
                api.get(`${base}/status/`),
                isAdmin ? api.get(`${base}/logs/`) : Promise.resolve(null),
                !archiveId && isAdmin ? api.get('/hosting/saved/') : Promise.resolve(null),
            ])
            if (version !== requests.current.version) return
            const current = status.data.session
            setSession(current)
            setSystems(saved?.data.systems || status.data.systems || [])
            setDefaultId(status.data.default_session_id || null)
            setLogs(logResult?.data.session?.id === current?.id ? logResult?.data.logs || '' : '')
            setWorkerOnline(status.data.worker_online)
            setActiveId(status.data.active_deployment_id ?? (current && (pending.includes(current.status) || current.status === 'running') ? current.id : null))
            setCountdown({ seconds: current?.seconds_remaining || 0, received: Date.now() })
            setError('')
        } catch (err) {
            if (version === requests.current.version) {
                setError(err.response?.data?.detail || 'Unable to refresh hosting status. Please retry.')
            }
        } finally {
            if (version === requests.current.version) setLoading(false)
        }
    }, [archiveId, base, isAdmin])

    useEffect(() => {
        const pendingRequests = requests.current
        setLoading(true)
        setSession(null)
        setSystems([])
        setDefaultId(null)
        setActiveId(null)
        setWorkerOnline(false)
        setLogs('')
        setError('')
        setCopied(false)
        setCountdown({ seconds: 0, received: Date.now() })
        let mounted = true
        let poll
        const refresh = async () => {
            await load()
            if (mounted) poll = setTimeout(refresh, 3000)
        }
        refresh()
        const tick = setInterval(() => setClock(Date.now()), 1000)
        return () => { mounted = false; pendingRequests.version++; clearTimeout(poll); clearInterval(tick) }
    }, [load])

    const remaining = Math.max(0, Math.floor(countdown.seconds - Math.max(0, clock - countdown.received) / 1000))
    const active = pending.includes(session?.status) || session?.status === 'running'
    const anotherActive = activeId && activeId !== session?.id
    const canOpen = session?.status === 'running' && remaining > 0 && session?.preview_url
    const statusLabel = loading ? 'Checking status' : statusLabels[session?.status] || (isAdmin ? 'Ready to configure' : 'Not running')

    useEffect(() => {
        if (!copied) return
        const timeout = setTimeout(() => setCopied(false), 2500)
        return () => clearTimeout(timeout)
    }, [copied])

    const copyLink = async () => {
        try {
            await navigator.clipboard.writeText(session.preview_url)
            setCopied(true)
            toast.success('Public link copied.')
        } catch {
            toast.error('Copy is unavailable in this browser. Select the link to copy it.')
        }
    }

    const submit = async event => {
        event.preventDefault()
        if (!form.site_zip) return toast.error('Select a website ZIP.')
        setBusy(true)
        try {
            const body = new FormData()
            Object.entries(form).forEach(([key, value]) => body.append(key, key === 'name' ? value || defaultName : value))
            await api.post(`${base}/start/`, body)
            setForm(emptyForm)
            if (zipInputRef.current) zipInputRef.current.value = ''
            toast.success('Deployment queued. Progress and logs will update below.')
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Deployment could not be queued.')
        } finally {
            setBusy(false)
            await load()
        }
    }

    const action = async (name, savedId) => {
        setBusy(true)
        try {
            const url = savedId ? `${base}/saved/${savedId}/start/` : `${base}/${name}/`
            await api.post(url, { session_id: session?.id })
            toast.success(name === 'stop' ? 'Stop requested.' : 'System queued. Progress and logs will update below.')
        } catch (err) {
            toast.error(err.response?.data?.detail || `Unable to ${name} deployment.`)
        } finally {
            setBusy(false)
            await load()
        }
    }

    const deleteSaved = async system => {
        if (!window.confirm(`Delete "${system.name}" and its saved database data? This cannot be undone.`)) return
        setBusy(true)
        try {
            await api.delete(`/hosting/saved/${system.id}/`)
            toast.success('Saved deployment and database data deleted.')
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Unable to delete the saved deployment.')
        } finally {
            setBusy(false)
            await load()
        }
    }

    return <section className="card archive-hosting-card hosting-panel" aria-label="Temporary hosting">
        <header className="hosting-heading">
            <div className="hosting-title-group">
                <span className="hosting-icon"><Server size={21} /></span>
                <div><span className="management-eyebrow">RESEARCH IN ACTION</span><h3>Temporary Hosting</h3><p>Bring a research system online for a live demonstration.</p></div>
            </div>
            <span className={`hosting-status hosting-status--${session?.status || 'idle'}`}>
                {loading || pending.includes(session?.status) ? <LoaderCircle size={13} className="hosting-spin" /> : <span className="hosting-status-dot" />}
                {statusLabel}
            </span>
        </header>
        {error && <div className="hosting-notice hosting-notice--error" role="alert">{error} <button type="button" className="btn btn-ghost btn-sm" onClick={load}>Retry</button></div>}
        {isAdmin && !loading && !error && !workerOnline && <p className="hosting-notice" role="status">The hosting service is offline. New deployments will be available when it reconnects.</p>}
        {isAdmin && anotherActive && <p className="hosting-notice" role="status">Another website is using the hosting slot. Stop it or wait for its session to end before starting this system.</p>}
        {session ? <div className={`hosting-session ${canOpen ? 'hosting-session--live' : ''}`}>
            <div className="hosting-session-heading">
                <div><span className="hosting-label">CURRENT SYSTEM</span><h4>{session.name}</h4><p>{runtimeLabel(session.project_type)}</p></div>
                <div className="hosting-countdown"><span><Clock3 size={13} /> Time remaining</span><strong>{Math.floor(remaining / 60)}<span>:</span>{String(remaining % 60).padStart(2, '0')}</strong></div>
            </div>
            {pending.includes(session.status) && <div className="hosting-progress" role="status"><LoaderCircle size={16} className="hosting-spin" /><span>{statusLabel}. This panel updates automatically.</span></div>}
            {canOpen && <div className="hosting-public-link">
                <label htmlFor={`hosting-url-${archiveId || 'admin'}`}><Globe2 size={15} /> Public website</label>
                <div className="hosting-url-row">
                    <input id={`hosting-url-${archiveId || 'admin'}`} value={session.preview_url} readOnly onFocus={event => event.target.select()} aria-label="Public website URL" />
                    <button className="btn btn-ghost btn-sm" onClick={copyLink} aria-label={copied ? 'Public link copied' : 'Copy public website link'} title="Copy public link">{copied ? <Check size={16} /> : <Copy size={16} />}</button>
                    <a className="btn btn-primary btn-sm" href={session.preview_url} target="_blank" rel="noreferrer">Open Website <ExternalLink size={14} /></a>
                </div>
                <p>{session.preview_url.includes('.trycloudflare.com/') ? 'Accessible online while this system is running. Restarting creates a new temporary link.' : 'This link is available for the duration of the running session.'}</p>
            </div>}
            <dl className="hosting-details">
                <div><dt><Activity size={13} /> Health</dt><dd>{session.health_status || 'Waiting'}</dd></div>
                <div><dt>Started</dt><dd>{showTime(session.started_at)}</dd></div>
                <div><dt>Expires</dt><dd>{showTime(session.expires_at)}</dd></div>
            </dl>
            {isAdmin && <div className="hosting-session-actions">
                <button className="btn btn-ghost btn-sm" disabled={busy || !active || session?.status === 'stopping'} onClick={() => action('stop')}><Square size={14} /> Stop system</button>
                <button className="btn btn-ghost btn-sm" disabled={busy || !session || pending.includes(session?.status) || !!anotherActive || !workerOnline} onClick={() => action('restart')}><RefreshCw size={14} /> Restart</button>
                <span className="hosting-service-state"><span className={`hosting-status-dot ${workerOnline ? 'is-online' : ''}`} />Service {workerOnline ? 'online' : 'offline'}</span>
            </div>}
        </div> : loading ? <div className="hosting-empty" role="status"><LoaderCircle size={24} className="hosting-spin" /><p>Checking your hosting workspace…</p></div> : <div className="hosting-empty"><Globe2 size={28} /><div><h4>No system is running yet</h4><p>{isAdmin ? 'Run an approved configuration or upload a ZIP to create a temporary website.' : 'A live website will appear here when an administrator starts this research system.'}</p></div></div>}
        {isAdmin && session?.error_message && <p className="hosting-notice hosting-notice--error" role="alert">{session.error_message}</p>}
        {isAdmin && defaultId && <div className="hosting-approved">
            <CheckCircle2 size={21} />
            <div><strong>Approved system is ready</strong><p>The ZIP submitted with this research is saved as its default configuration.</p></div>
            <button className="btn btn-primary btn-sm" disabled={busy || active || !!anotherActive || !workerOnline} onClick={() => action('restart', defaultId)}><Play size={14} /> Run approved system</button>
        </div>}
        {isAdmin && <details className="hosting-config" open={!defaultId && !session}>
            <summary><span><Upload size={17} /> {defaultId || session ? 'Upload another configuration' : 'Upload a system configuration'}</span><ChevronDown size={16} /></summary>
            <form onSubmit={submit} className="hosting-upload-form">
                <div className="hosting-form-grid">
                    <label className="form-group">Application name
                        <input className="form-input" maxLength={180} value={form.name} placeholder={defaultName || 'e.g. Library management system'} onChange={e => setForm({ ...form, name: e.target.value })} />
                    </label>
                    <label className="form-group">Runtime
                        <select className="form-input" value={form.project_type} onChange={e => setForm({ ...form, project_type: e.target.value, ...(e.target.value === 'fullstack' ? { entrypoint: '', start_command: '' } : {}) })}>
                            <option value="auto">Detect automatically</option>
                            <option value="fullstack">Frontend + backend + database</option>
                            <option value="static">HTML / CSS / JavaScript</option>
                            <option value="node">Node.js</option><option value="python">Python</option><option value="php">PHP</option>
                            <option value="ruby">Ruby</option><option value="cpp">C++</option>
                        </select>
                    </label>
                </div>
                {runtimeHelp[form.project_type] && <p className="hosting-help" role="note">{runtimeHelp[form.project_type]}</p>}
                {form.project_type === 'fullstack' && <details className="hosting-advanced">
                    <summary>Configuration example for a frontend and Django backend</summary>
                    <p>Put hosting.json beside the frontend and backend folders. Use postgresql or mysql for a server database; the database folder can contain an optional seed file. Frontend API requests should use /api on the preview website.</p>
                    <pre>{fullstackManifest}</pre>
                    <p>For other backends, set the runtime and use the supplied DATABASE_URL or DB_* environment variables to connect to the database.</p>
                </details>}
                <label className="form-group hosting-file-field"><span><FileArchive size={16} /> Website ZIP</span>
                    <input ref={zipInputRef} className="form-input" type="file" accept=".zip,application/zip" required disabled={busy} onChange={e => setForm({ ...form, site_zip: e.target.files[0] || null })} />
                    <span className="hosting-help">Include source files and dependency manifests. Leave out venv, .venv, node_modules, .git, and caches.</span>
                </label>
                {form.project_type !== 'fullstack' && <details className="hosting-advanced">
                    <summary>Advanced settings <span>Optional</span></summary>
                    <div className="hosting-form-grid">
                        <label className="form-group">Entrypoint
                            <input className="form-input" maxLength={260} value={form.entrypoint} placeholder="app.py, index.php, app.rb, main.cpp" onChange={e => setForm({ ...form, entrypoint: e.target.value })} />
                        </label>
                        <label className="form-group">Start command
                            <input className="form-input" maxLength={500} value={form.start_command} placeholder="python manage.py runserver 0.0.0.0:{port}" onChange={e => setForm({ ...form, start_command: e.target.value })} />
                        </label>
                    </div>
                </details>}
                <div className="hosting-upload-footer"><span>Your configuration is saved for future runs.</span><button className="btn btn-primary btn-sm" disabled={busy || active || !!anotherActive || !workerOnline} type="submit">{busy ? <LoaderCircle size={15} className="hosting-spin" /> : <Upload size={15} />} Save and run</button></div>
            </form>
        </details>}
        {isAdmin && systems.length > 0 && <section className="hosting-saved" aria-label="Saved configurations">
            <div className="hosting-section-title"><h4>Saved configurations</h4><span>{systems.length} saved</span></div>
            {systems.map(system => <div key={system.id} className="hosting-saved-row">
                <span className="hosting-saved-icon"><FileArchive size={18} /></span>
                <div className="hosting-saved-copy"><strong>{system.name}</strong><p>{runtimeLabel(system.project_type)} <span>· #{system.id}</span></p>{system.is_default && <span className="badge badge-green">Approved default</span>}</div>
                <div className="hosting-saved-actions">
                    <button className="btn btn-ghost btn-sm" disabled={busy || active || !!anotherActive || !workerOnline} onClick={() => action('restart', system.id)} aria-label={`Run ${system.name}`}><Play size={13} /> Run</button>
                    <button className="btn btn-ghost btn-sm hosting-delete" disabled={busy || pending.includes(system.status) || system.status === 'running'} onClick={() => deleteSaved(system)} aria-label={`Delete ${system.name}`} title="Delete saved configuration"><Trash2 size={15} /></button>
                </div>
            </div>)}
        </section>}
        {isAdmin && <details className="hosting-config hosting-logs" open={session?.status === 'failed'}>
            <summary><span><Terminal size={17} /> Deployment logs</span><ChevronDown size={16} /></summary>
            <div className="hosting-log-content">
                <div className="hosting-log-toolbar"><span>Updates automatically every 3 seconds</span><button className="btn btn-ghost btn-sm" disabled={busy} onClick={load}><RefreshCw size={13} /> Refresh</button></div>
                {session && <p className="hosting-log-meta">Deployment: {session.deployment_id} · Container: {session.container_status || 'Not created'}</p>}
                <pre tabIndex={0} aria-label="Deployment logs">{logs || 'Deployment activity will appear here when a system starts.'}</pre>
            </div>
        </details>}
    </section>
}
