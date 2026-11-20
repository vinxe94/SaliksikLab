import { ShieldCheck } from 'lucide-react'

export default function WorkspaceFooter() {
    return (
        <footer className="dashboard-footer">
            <div><ShieldCheck size={23} aria-hidden="true" /><span>Built for the academic community.</span><span className="dashboard-footer-brand">Tukiva Research Repository</span></div>
            <p>Discover. Contribute. Make a difference.</p>
        </footer>
    )
}
