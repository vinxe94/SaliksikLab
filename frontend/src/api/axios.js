import axios from 'axios'

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api'

const api = axios.create({
    baseURL: API_BASE_URL,
    headers: { 'Content-Type': 'application/json' },
})

export const apiUrl = (path) => {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`
    return `${API_BASE_URL.replace(/\/$/, '')}${normalizedPath}`
}

// Guard against multiple simultaneous token refreshes
let isRefreshing = false
let failedQueue = []

const processQueue = (error, token = null) => {
    failedQueue.forEach(prom => {
        if (error) prom.reject(error)
        else prom.resolve(token)
    })
    failedQueue = []
}

api.interceptors.request.use((config) => {
    const token = localStorage.getItem('access_token')
    if (token) config.headers.Authorization = `Bearer ${token}`
    return config
})

api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const original = error.config

        if (error.response?.status === 401 && !original._retry) {
            const refresh = localStorage.getItem('refresh_token')
            if (!refresh) {
                // No refresh token at all — redirect to login
                localStorage.clear()
                window.location.href = '/login'
                return Promise.reject(error)
            }

            if (isRefreshing) {
                // Queue this request until the in-progress refresh completes
                return new Promise((resolve, reject) => {
                    failedQueue.push({ resolve, reject })
                }).then(token => {
                    original.headers.Authorization = `Bearer ${token}`
                    return api(original)
                }).catch(err => Promise.reject(err))
            }

            original._retry = true
            isRefreshing = true

            try {
                const { data } = await axios.post(apiUrl('/auth/refresh/'), { refresh })
                const newToken = data.access
                localStorage.setItem('access_token', newToken)
                api.defaults.headers.common['Authorization'] = `Bearer ${newToken}`
                original.headers.Authorization = `Bearer ${newToken}`
                processQueue(null, newToken)
                return api(original)
            } catch (refreshError) {
                processQueue(refreshError, null)
                localStorage.clear()
                window.location.href = '/login'
                return Promise.reject(refreshError)
            } finally {
                isRefreshing = false
            }
        }

        return Promise.reject(error)
    }
)

export default api
