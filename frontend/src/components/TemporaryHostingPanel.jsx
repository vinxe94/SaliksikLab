import { useCallback, useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { Play, RefreshCw, Server, Square, Trash2, Upload } from 'lucide-react'
import api from '../api/axios'

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

// eslint-disable-next-line react/prop-types -- Used by the authenticated admin and archive routes.
export default function TemporaryHostingPanel({ archiveId, defaultName = '', isAdmin = false }) {
    const base = archiveId ? `/hosting/archives/${archiveId}` : '/hosting'
    const [session, setSession] = useState(null)
    const [systems, setSystems] = useState([])
    const [defaultId, setDefaultId] = useState(null)
    const [logs, setLogs] = useState('')
    const [form, setForm] = useState(emptyForm)
    const [busy, setBusy] = useState(false)
    const [workerOnline, setWorkerOnline] = useState(false)
    const [activeId, setActiveId] = useState(null)
    const [error, setError] = useState('')
    const [clock, setClock] = useState(Date.now())
    const [countdown, setCountdown] = useState({ seconds: 0, received: Date.now() })
    const requests = useRef({ version: 0 })

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
        }
    }, [archiveId, base, isAdmin])

    useEffect(() => {
        const pendingRequests = requests.current
        load()
        const poll = setInterval(load, 3000)
        const tick = setInterval(() => setClock(Date.now()), 1000)
        return () => { pendingRequests.version++; clearInterval(poll); clearInterval(tick) }
    }, [load])

    const remaining = Math.max(0, Math.floor(countdown.seconds - Math.max(0, clock - countdown.received) / 1000))
    const active = pending.includes(session?.status) || session?.status === 'running'
    const anotherActive = activeId && activeId !== session?.id
    const canOpen = session?.status === 'running' && remaining > 0 && session?.preview_url

    const submit = async event => {
        event.preventDefault()
        if (!form.site_zip) return toast.error('Select a website ZIP.')
        setBusy(true)
        try {
            const body = new FormData()
            Object.entries(form).forEach(([key, value]) => body.append(key, key === 'name' ? value || defaultName : value))
            await api.post(`${base}/start/`, body)
            setForm(emptyForm)
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

    return <div className="card archive-hosting-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
            <h3><Server size={17} /> Temporary Hosting</h3>
            <span className={`badge ${session?.status === 'running' ? 'badge-green' : session?.status === 'failed' ? 'badge-red' : 'badge-gray'}`}>
                {(session?.status || 'not configured').toUpperCase()}
            </span>
        </div>
        {error && <p role="alert" style={{ color: 'var(--danger)' }}>{error}</p>}
        {isAdmin && !workerOnline && <p role="status">The hosting service is offline. New deployments are unavailable until it reconnects.</p>}
        {isAdmin && anotherActive && <p role="status">Another temporary website is active. Stop it or wait until it expires.</p>}
        {isAdmin && defaultId && <div style={{ padding: 14, margin: '14px 0', border: '1px solid var(--border)', borderRadius: 8 }}>
            <strong>Approved system configuration</strong>
            <p style={{ margin: '6px 0 12px' }}>The ZIP approved with this research is saved and ready to run. No upload is needed.</p>
            <button className="btn btn-primary btn-sm" disabled={busy || active || !!anotherActive || !workerOnline} onClick={() => action('restart', defaultId)}><Play size={14} /> Run approved system</button>
        </div>}
        {isAdmin && <details open={!defaultId} style={{ marginBottom: 20 }}>
            <summary style={{ cursor: 'pointer', marginBottom: 12 }}>{defaultId ? 'Upload another configuration' : 'Upload a system configuration'}</summary>
            <form onSubmit={submit} style={{ display: 'grid', gap: 12, marginBottom: 20 }}>
            <div className="grid-2">
                <label className="form-group">Application name
                    <input className="form-input" maxLength={180} value={form.name} placeholder={defaultName || 'Demo website'} onChange={e => setForm({ ...form, name: e.target.value })} />
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
            {runtimeHelp[form.project_type] && <p role="note" style={{ margin: 0 }}>{runtimeHelp[form.project_type]}</p>}
            {form.project_type === 'fullstack' && <details>
                <summary>Example hosting.json for a frontend and Django backend</summary>
                <p>Put this file beside the frontend and backend folders. Use postgresql or mysql for a server database; the database folder can contain an optional seed file. Frontend API requests should use /api on the preview website.</p>
                <pre style={{ overflow: 'auto', padding: 12, background: 'var(--bg3)', borderRadius: 8 }}>{fullstackManifest}</pre>
                <p>For other backends, set the runtime and use the supplied DATABASE_URL or DB_* environment variables to connect to the database.</p>
            </details>}
            <label className="form-group">Website ZIP
                <input key={form.site_zip?.name || 'empty'} className="form-input" type="file" accept=".zip,application/zip" onChange={e => setForm({ ...form, site_zip: e.target.files[0] || null })} />
            </label>
            <p style={{ margin: 0 }}>Include source and dependency manifests. Leave out venv, .venv, node_modules, .git, and caches.</p>
            {form.project_type !== 'fullstack' && <div className="grid-2">
                <label className="form-group">Entrypoint (optional)
                    <input className="form-input" maxLength={260} value={form.entrypoint} placeholder="app.py, index.php, app.rb, main.cpp" onChange={e => setForm({ ...form, entrypoint: e.target.value })} />
                </label>
                <label className="form-group">Start command (optional)
                    <input className="form-input" maxLength={500} value={form.start_command} placeholder="python manage.py runserver 0.0.0.0:{port}" onChange={e => setForm({ ...form, start_command: e.target.value })} />
                </label>
            </div>}
            <button className="btn btn-primary btn-sm" disabled={busy || active || !!anotherActive || !workerOnline} type="submit"><Upload size={14} /> Save and Run</button>
        </form></details>}
        {session && <>
            <strong>{session.name}</strong>
            <dl style={{ display: 'grid', gridTemplateColumns: 'max-content minmax(0, 1fr)', gap: '8px 16px', margin: '12px 0', overflowWrap: 'anywhere' }}>
                <dt>Runtime</dt><dd>{runtimeLabel(session.project_type)}</dd>
                <dt>Deployment ID</dt><dd>{session.deployment_id}</dd>
                <dt>Health</dt><dd>{session.health_status}</dd>
                {isAdmin && <><dt>Container</dt><dd>{session.container_status || 'Not created'}</dd></>}
                <dt>Started</dt><dd>{showTime(session.started_at)}</dd>
                <dt>Expires</dt><dd>{showTime(session.expires_at)}</dd>
                <dt>Remaining</dt><dd>{Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}</dd>
                {canOpen && <><dt>Public URL</dt><dd><a href={session.preview_url} target="_blank" rel="noreferrer">{session.preview_url}</a></dd></>}
            </dl>
            {canOpen && session.preview_url.includes('.trycloudflare.com/') && <p className="text-sm text-muted" style={{ marginBottom: 12 }}>This Cloudflare link is accessible online while the system is running. Restarting creates a new temporary link.</p>}
        </>}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
            {canOpen && <a className="btn btn-ghost btn-sm" href={session.preview_url} target="_blank" rel="noreferrer"><Server size={14} /> Open Website</a>}
            {isAdmin && <>
                <button className="btn btn-ghost btn-sm" disabled={busy || !active || session?.status === 'stopping'} onClick={() => action('stop')}><Square size={14} /> Stop / Cancel</button>
                <button className="btn btn-ghost btn-sm" disabled={busy || !session || pending.includes(session?.status) || !!anotherActive || !workerOnline} onClick={() => action('restart')}><RefreshCw size={14} /> Restart</button>
                <button className="btn btn-ghost btn-sm" disabled={busy} onClick={load}>Refresh Logs</button>
            </>}
        </div>
        {isAdmin && systems.length > 0 && <div style={{ display: 'grid', gap: 8, marginBottom: 16 }}>
            <strong>Saved configurations</strong>
            {systems.map(system => <div key={system.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <span>{system.name} · {runtimeLabel(system.project_type)} · #{system.id}{system.is_default && <span className="badge badge-green" style={{ marginLeft: 8 }}>Approved default</span>}</span>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-ghost btn-sm" disabled={busy || active || !!anotherActive || !workerOnline} onClick={() => action('restart', system.id)}><Play size={13} /> Run</button>
                    <button className="btn btn-ghost btn-sm" disabled={busy || pending.includes(system.status) || system.status === 'running'} onClick={() => deleteSaved(system)}><Trash2 size={13} /> Delete</button>
                </div>
            </div>)}
        </div>}
        {isAdmin && session?.error_message && <p role="alert" style={{ color: 'var(--danger)' }}>{session.error_message}</p>}
        {isAdmin && <><strong>Deployment Logs</strong><pre style={{ minHeight: 160, maxHeight: 320, overflow: 'auto', whiteSpace: 'pre-wrap', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, padding: 12, fontSize: '0.8rem' }}>{logs || 'No logs yet.'}</pre></>}
    </div>
}
