import React, { createContext, useContext, useReducer, useCallback, useEffect } from 'react';

const StoreContext = createContext(null);

const DEFAULT_TAB = {
  id: 'tab-1',
  name: 'Query 1',
  query: `# Welcome to GraphQL Playground!\n# Start by entering your GraphQL endpoint above and clicking Connect.\n# Then write your query here and press Ctrl+Enter to execute.\n\nquery {\n  \n}\n`,
  variables: '{}',
  headers: '{}',
};

const initialState = {
  endpoint: localStorage.getItem('gql-endpoint') || '',
  schema: null,
  schemaSDL: null,
  introspectionResult: null,
  connectionStatus: 'disconnected', // disconnected, connecting, connected, error
  connectionError: null,
  tabs: [{ ...DEFAULT_TAB }],
  activeTabId: 'tab-1',
  response: null,
  responseStatus: null,
  responseTime: null,
  responseSize: null,
  isExecuting: false,
  history: JSON.parse(localStorage.getItem('gql-history') || '[]'),
  theme: localStorage.getItem('gql-theme') || 'dark',
  docsOpen: true,
  historyOpen: false,
  activeBottomTab: 'variables', // variables, headers
  toasts: [],
};

function reducer(state, action) {
  switch (action.type) {
    case 'SET_ENDPOINT':
      localStorage.setItem('gql-endpoint', action.payload);
      return { ...state, endpoint: action.payload };

    case 'SET_CONNECTION_STATUS':
      return { ...state, connectionStatus: action.payload, connectionError: null };

    case 'SET_CONNECTION_ERROR':
      return { ...state, connectionStatus: 'error', connectionError: action.payload };

    case 'SET_SCHEMA':
      return {
        ...state,
        schema: action.payload.schema,
        schemaSDL: action.payload.sdl,
        introspectionResult: action.payload.introspection,
        connectionStatus: 'connected',
      };

    case 'CLEAR_SCHEMA':
      return {
        ...state,
        schema: null,
        schemaSDL: null,
        introspectionResult: null,
        connectionStatus: 'disconnected',
      };

    case 'SET_ACTIVE_TAB':
      return { ...state, activeTabId: action.payload };

    case 'ADD_TAB': {
      const newId = `tab-${Date.now()}`;
      const newTab = {
        ...DEFAULT_TAB,
        id: newId,
        name: `Query ${state.tabs.length + 1}`,
      };
      return { ...state, tabs: [...state.tabs, newTab], activeTabId: newId };
    }

    case 'CLOSE_TAB': {
      if (state.tabs.length <= 1) return state;
      const idx = state.tabs.findIndex((t) => t.id === action.payload);
      const newTabs = state.tabs.filter((t) => t.id !== action.payload);
      let newActive = state.activeTabId;
      if (state.activeTabId === action.payload) {
        newActive = newTabs[Math.min(idx, newTabs.length - 1)].id;
      }
      return { ...state, tabs: newTabs, activeTabId: newActive };
    }

    case 'UPDATE_TAB': {
      const tabs = state.tabs.map((t) =>
        t.id === action.payload.id ? { ...t, ...action.payload.updates } : t
      );
      return { ...state, tabs };
    }

    case 'SET_RESPONSE':
      return {
        ...state,
        response: action.payload.data,
        responseStatus: action.payload.status,
        responseTime: action.payload.time,
        responseSize: action.payload.size,
        isExecuting: false,
      };

    case 'SET_EXECUTING':
      return { ...state, isExecuting: action.payload };

    case 'CLEAR_RESPONSE':
      return {
        ...state,
        response: null,
        responseStatus: null,
        responseTime: null,
        responseSize: null,
      };

    case 'ADD_HISTORY_ITEM': {
      const history = [action.payload, ...state.history].slice(0, 50);
      localStorage.setItem('gql-history', JSON.stringify(history));
      return { ...state, history };
    }

    case 'DELETE_HISTORY_ITEM': {
      const history = state.history.filter((_, i) => i !== action.payload);
      localStorage.setItem('gql-history', JSON.stringify(history));
      return { ...state, history };
    }

    case 'CLEAR_HISTORY': {
      localStorage.setItem('gql-history', '[]');
      return { ...state, history: [] };
    }

    case 'SET_THEME':
      localStorage.setItem('gql-theme', action.payload);
      return { ...state, theme: action.payload };

    case 'TOGGLE_DOCS':
      return { ...state, docsOpen: !state.docsOpen };

    case 'TOGGLE_HISTORY':
      return { ...state, historyOpen: !state.historyOpen };

    case 'SET_BOTTOM_TAB':
      return { ...state, activeBottomTab: action.payload };

    case 'ADD_TOAST': {
      const toast = { id: Date.now(), ...action.payload };
      return { ...state, toasts: [...state.toasts, toast] };
    }

    case 'REMOVE_TOAST':
      return { ...state, toasts: state.toasts.filter((t) => t.id !== action.payload) };

    default:
      return state;
  }
}

export function StoreProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  // Apply theme
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', state.theme);
  }, [state.theme]);

  // Toast auto-dismiss
  useEffect(() => {
    if (state.toasts.length > 0) {
      const timer = setTimeout(() => {
        dispatch({ type: 'REMOVE_TOAST', payload: state.toasts[0].id });
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [state.toasts]);

  const getActiveTab = useCallback(() => {
    return state.tabs.find((t) => t.id === state.activeTabId) || state.tabs[0];
  }, [state.tabs, state.activeTabId]);

  return (
    <StoreContext.Provider value={{ state, dispatch, getActiveTab }}>
      {children}
    </StoreContext.Provider>
  );
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used within StoreProvider');
  return ctx;
}
