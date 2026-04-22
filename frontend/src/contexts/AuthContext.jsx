import { createContext, useContext, useState, useEffect } from 'react'
import PropTypes from 'prop-types'
import api from '../api/axios'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null)
    const [loading, setLoading] = useState(true)

    const refreshUser = async () => {
        const { data } = await api.get('/auth/me/')
        setUser(data)
        return data
    }

    useEffect(() => {
        const token = localStorage.getItem('access_token')
        if (token) {
            refreshUser().catch(() => {
                localStorage.clear()
            }).finally(() => setLoading(false))
        } else {
            setLoading(false)
        }
    }, [])

    const login = async (email, password) => {
        const { data } = await api.post('/auth/login/', { email, password })
        setSession(data)
        return data.user
    }

    const register = async (payload) => {
        const { data } = await api.post('/auth/register/', payload)
        setSession(data)
        return data.user
    }

    const setSession = (data) => {
        localStorage.setItem('access_token', data.access)
        localStorage.setItem('refresh_token', data.refresh)
        setUser(data.user)
    }

    const logout = () => {
        localStorage.clear()
        setUser(null)
    }

    return (
        <AuthContext.Provider value={{ user, login, register, logout, loading, refreshUser }}>
            {children}
        </AuthContext.Provider>
    )
}
AuthProvider.propTypes = { children: PropTypes.node }

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext)
