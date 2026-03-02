/**
 * LanguageContext — Multilingual interface support for SaliksikLab.
 * 
 * Supported locales:
 *   'en'  — English
 *   'fil' — Filipino (Tagalog)
 * 
 * Usage:
 *   const { t, locale, setLocale } = useLanguage()
 *   <p>{t('dashboard.welcome')}</p>
 */

import { createContext, useContext, useState, useCallback } from 'react'
import PropTypes from 'prop-types'

// ── Translation strings ────────────────────────────────────────────────────────
const TRANSLATIONS = {
    en: {
        // Navigation
        'nav.dashboard': 'Dashboard',
        'nav.repository': 'Repository',
        'nav.upload': 'Upload',
        'nav.admin': 'Admin',
        'nav.profile': 'Profile',
        'nav.logout': 'Logout',
        'nav.codelab': 'Code Lab',

        // Dashboard
        'dashboard.welcome': 'Welcome back',
        'dashboard.subtitle': 'Research Management System',
        'dashboard.myUploads': 'My Uploads',
        'dashboard.approved': 'Approved',
        'dashboard.pending': 'Pending',
        'dashboard.rejected': 'Rejected',

        // Repository
        'repo.title': 'Research Repository',
        'repo.search': 'Search research outputs...',
        'repo.filter': 'Filter',
        'repo.noResults': 'No research outputs found.',
        'repo.viewDetails': 'View Details',
        'repo.download': 'Download',
        'repo.approved': 'Approved',
        'repo.pending': 'Awaiting Approval',
        'repo.rejected': 'Rejected',

        // Upload
        'upload.title': 'Upload Research Output',
        'upload.dragDrop': 'Drag & drop files here or click to browse',
        'upload.submit': 'Submit for Review',
        'upload.abstract': 'Abstract',
        'upload.keywords': 'Keywords',
        'upload.author': 'Author(s)',
        'upload.adviser': 'Adviser',
        'upload.year': 'Year',
        'upload.type': 'Output Type',
        'upload.department': 'Department / College',
        'upload.course': 'Course / Program',

        // Code Lab
        'code.title': 'Code Lab',
        'code.subtitle': 'Write, compile, and run code in Python, Java, or C++',
        'code.language': 'Language',
        'code.editor': 'Code Editor',
        'code.stdin': 'Standard Input (stdin)',
        'code.stdinPlaceholder': 'Provide input for your program here...',
        'code.run': 'Run Code',
        'code.running': 'Running...',
        'code.output': 'Output',
        'code.stderr': 'Errors / Compiler Output',
        'code.execTime': 'Execution time',
        'code.exitCode': 'Exit code',
        'code.status.success': 'Success',
        'code.status.error': 'Error',
        'code.status.timeout': 'Timed Out',
        'code.history': 'Run History',
        'code.clearEditor': 'Clear Editor',
        'code.loadSample': 'Load Sample',
        'code.sandbox': 'Secure Sandbox',
        'code.sandboxInfo': 'Code runs in an isolated environment with a 10-second time limit and 128 MB memory cap.',

        // Translation
        'translate.title': 'Translate Abstract',
        'translate.toFilipino': 'Translate to Filipino',
        'translate.toEnglish': 'Translate to English',
        'translate.translating': 'Translating...',
        'translate.result': 'Translation',
        'translate.cached': '(from cache)',
        'translate.error': 'Translation unavailable',
        'translate.original': 'Original',
        'translate.translated': 'Translated',
        'translate.aiPowered': 'AI-Powered Translation',

        // General
        'general.loading': 'Loading...',
        'general.error': 'An error occurred.',
        'general.save': 'Save',
        'general.cancel': 'Cancel',
        'general.close': 'Close',
        'general.copy': 'Copy to Clipboard',
        'general.copied': 'Copied!',
        'general.language': 'Language',
    },

    fil: {
        // Navigation
        'nav.dashboard': 'Dashboard',
        'nav.repository': 'Repositoryo',
        'nav.upload': 'Mag-upload',
        'nav.admin': 'Admin',
        'nav.profile': 'Profil',
        'nav.logout': 'Mag-logout',
        'nav.codelab': 'Code Lab',

        // Dashboard
        'dashboard.welcome': 'Maligayang pagbabalik',
        'dashboard.subtitle': 'Sistema ng Pamamahala ng Pananaliksik',
        'dashboard.myUploads': 'Aking mga Na-upload',
        'dashboard.approved': 'Naaprubahan',
        'dashboard.pending': 'Nakabinbin',
        'dashboard.rejected': 'Tinanggihan',

        // Repository
        'repo.title': 'Repositoryo ng Pananaliksik',
        'repo.search': 'Maghanap ng pananaliksik...',
        'repo.filter': 'Salain',
        'repo.noResults': 'Walang nahanap na resulta.',
        'repo.viewDetails': 'Tingnan ang Detalye',
        'repo.download': 'I-download',
        'repo.approved': 'Naaprubahan',
        'repo.pending': 'Naghihintay ng Pag-apruba',
        'repo.rejected': 'Tinanggihan',

        // Upload
        'upload.title': 'Mag-upload ng Output ng Pananaliksik',
        'upload.dragDrop': 'I-drag at i-drop ang mga file dito o mag-click upang mag-browse',
        'upload.submit': 'Isumite para sa Pagsusuri',
        'upload.abstract': 'Abstrak',
        'upload.keywords': 'Mga Susi na Salita',
        'upload.author': 'May-akda',
        'upload.adviser': 'Tagapayo',
        'upload.year': 'Taon',
        'upload.type': 'Uri ng Output',
        'upload.department': 'Departamento / Kolehiyo',
        'upload.course': 'Kurso / Programa',

        // Code Lab
        'code.title': 'Code Lab',
        'code.subtitle': 'Sumulat, mag-compile, at magpatakbo ng code sa Python, Java, o C++',
        'code.language': 'Wika ng Programa',
        'code.editor': 'Code Editor',
        'code.stdin': 'Standard Input (stdin)',
        'code.stdinPlaceholder': 'Magbigay ng input para sa iyong programa dito...',
        'code.run': 'Patakbuhin',
        'code.running': 'Pinapatakbo...',
        'code.output': 'Output',
        'code.stderr': 'Mga Error / Compiler Output',
        'code.execTime': 'Oras ng pagpapatakbo',
        'code.exitCode': 'Exit code',
        'code.status.success': 'Matagumpay',
        'code.status.error': 'May Error',
        'code.status.timeout': 'Nag-timeout',
        'code.history': 'Kasaysayan ng Pagpapatakbo',
        'code.clearEditor': 'Burahin ang Editor',
        'code.loadSample': 'Mag-load ng Sample',
        'code.sandbox': 'Ligtas na Sandbox',
        'code.sandboxInfo': 'Ang code ay pinapatakbo sa isang isolated na kapaligiran na may limitasyong 10 segundo at 128 MB ng memorya.',

        // Translation
        'translate.title': 'Isalin ang Abstrak',
        'translate.toFilipino': 'Isalin sa Filipino',
        'translate.toEnglish': 'Isalin sa Ingles',
        'translate.translating': 'Isinasalin...',
        'translate.result': 'Pagsasalin',
        'translate.cached': '(mula sa cache)',
        'translate.error': 'Hindi available ang pagsasalin',
        'translate.original': 'Orihinal',
        'translate.translated': 'Isinalin',
        'translate.aiPowered': 'Pagsasalin na Pinapagana ng AI',

        // General
        'general.loading': 'Naglo-load...',
        'general.error': 'Nagkaroon ng error.',
        'general.save': 'I-save',
        'general.cancel': 'Kanselahin',
        'general.close': 'Isara',
        'general.copy': 'Kopyahin sa Clipboard',
        'general.copied': 'Nakopya!',
        'general.language': 'Wika',
    },
}

const LanguageContext = createContext(null)

export function LanguageProvider({ children }) {
    const [locale, setLocale] = useState(
        () => localStorage.getItem('saliksik_locale') || 'en'
    )

    const changeLocale = useCallback((newLocale) => {
        setLocale(newLocale)
        localStorage.setItem('saliksik_locale', newLocale)
    }, [])

    /** Translate a key, optionally interpolating {variable} placeholders. */
    const t = useCallback((key, vars = {}) => {
        const dict = TRANSLATIONS[locale] || TRANSLATIONS['en']
        let str = dict[key] ?? TRANSLATIONS['en'][key] ?? key
        Object.entries(vars).forEach(([k, v]) => {
            str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), v)
        })
        return str
    }, [locale])

    return (
        <LanguageContext.Provider value={{ locale, setLocale: changeLocale, t, TRANSLATIONS }}>
            {children}
        </LanguageContext.Provider>
    )
}

LanguageProvider.propTypes = { children: PropTypes.node }

// eslint-disable-next-line react-refresh/only-export-components
export const useLanguage = () => useContext(LanguageContext)
