import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { GraphQLSchema } from 'graphql'
import type { GraphQLResponse, IntrospectionSchemaResult } from '@/lib/introspection'

export interface Tab {
    id: string
    name: string
    query: string
    variables: string
    headers: string
}

export interface HistoryItem {
    id: string
    operationName?: string
    endpoint: string
    query: string
    variables: string
    headers: string
    timestamp: number
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'
export type Theme = 'dark' | 'light'
export type BottomTab = 'variables' | 'headers'

interface AppState {
    endpoint: string
    schema: GraphQLSchema | null
    schemaSDL: string | null
    introspectionResult: IntrospectionSchemaResult['introspection'] | null
    connectionStatus: ConnectionStatus
    connectionError: string | null
    tabs: Tab[]
    activeTabId: string
    response: GraphQLResponse | null
    responseStatus: number | null
    responseTime: number | null
    responseSize: number | null
    isExecuting: boolean
    history: HistoryItem[]
    theme: Theme
    docsOpen: boolean
    activeBottomTab: BottomTab

    // Actions
    setEndpoint: (endpoint: string) => void
    setConnectionStatus: (status: ConnectionStatus) => void
    setConnectionError: (error: string | null) => void
    setSchema: (payload: IntrospectionSchemaResult) => void
    clearSchema: () => void
    setActiveTab: (id: string) => void
    addTab: () => void
    closeTab: (id: string) => void
    updateTab: (id: string, updates: Partial<Tab>) => void
    setResponse: (payload: { data: GraphQLResponse; status: number; time: number; size: number }) => void
    setExecuting: (executing: boolean) => void
    clearResponse: () => void
    addHistoryItem: (item: HistoryItem) => void
    deleteHistoryItem: (index: number) => void
    clearHistory: () => void
    setTheme: (theme: Theme) => void
    toggleDocs: () => void
    setBottomTab: (tab: BottomTab) => void
    getActiveTab: () => Tab
}

const DEFAULT_TAB: Tab = {
    id: 'tab-1',
    name: 'Query 1',
    query: `# Welcome to GraphQL Playground!\n# Start by entering your GraphQL endpoint above and clicking Connect.\n# Then write your query here and press Ctrl+Enter to execute.\n\nquery {\n  \n}\n`,
    variables: '{}',
    headers: '{}',
}

export const useStore = create<AppState>()(
    persist(
        (set, get) => ({
            endpoint: '',
            schema: null,
            schemaSDL: null,
            introspectionResult: null,
            connectionStatus: 'disconnected',
            connectionError: null,
            tabs: [{ ...DEFAULT_TAB }],
            activeTabId: 'tab-1',
            response: null,
            responseStatus: null,
            responseTime: null,
            responseSize: null,
            isExecuting: false,
            history: [],
            theme: 'dark',
            docsOpen: true,
            activeBottomTab: 'variables',

            setEndpoint: (endpoint) => set({ endpoint }),
            setConnectionStatus: (status) => set({ connectionStatus: status, connectionError: null }),
            setConnectionError: (error) => set({ connectionStatus: 'error', connectionError: error }),
            setSchema: (payload) => set({
                schema: payload.schema,
                schemaSDL: payload.sdl,
                introspectionResult: payload.introspection,
                connectionStatus: 'connected',
                connectionError: null,
            }),
            clearSchema: () => set({
                schema: null,
                schemaSDL: null,
                introspectionResult: null,
                connectionStatus: 'disconnected',
                connectionError: null,
            }),
            setActiveTab: (id) => set({ activeTabId: id }),
            addTab: () => {
                const state = get()
                const newId = `tab-${Date.now()}`
                const newTab = {
                    ...DEFAULT_TAB,
                    id: newId,
                    name: `Query ${state.tabs.length + 1}`,
                }
                set({ tabs: [...state.tabs, newTab], activeTabId: newId })
            },
            closeTab: (id) => {
                const state = get()
                if (state.tabs.length <= 1) return
                const idx = state.tabs.findIndex((t) => t.id === id)
                const newTabs = state.tabs.filter((t) => t.id !== id)
                let newActive = state.activeTabId
                if (state.activeTabId === id) {
                    newActive = newTabs[Math.min(idx, newTabs.length - 1)].id
                }
                set({ tabs: newTabs, activeTabId: newActive })
            },
            updateTab: (id, updates) => {
                const state = get()
                const tabs = state.tabs.map((t) =>
                    t.id === id ? { ...t, ...updates } : t
                )
                set({ tabs })
            },
            setResponse: (payload) => set({
                response: payload.data,
                responseStatus: payload.status,
                responseTime: payload.time,
                responseSize: payload.size,
                isExecuting: false
            }),
            setExecuting: (payload) => set({ isExecuting: payload }),
            clearResponse: () => set({
                response: null,
                responseStatus: null,
                responseTime: null,
                responseSize: null
            }),
            addHistoryItem: (item) => {
                const history = [item, ...get().history].slice(0, 50)
                set({ history })
            },
            deleteHistoryItem: (index) => {
                const history = get().history.filter((_, i) => i !== index)
                set({ history })
            },
            clearHistory: () => set({ history: [] }),
            setTheme: (theme) => set({ theme }),
            toggleDocs: () => set({ docsOpen: !get().docsOpen }),
            setBottomTab: (tab) => set({ activeBottomTab: tab }),
            getActiveTab: () => {
                const state = get()
                return state.tabs.find((t) => t.id === state.activeTabId) || state.tabs[0]
            }
        }),
        {
            name: 'gql-playground-storage',
            partialize: (state) => ({
                endpoint: state.endpoint,
                history: state.history,
                theme: state.theme,
            }),
        }
    )
)
