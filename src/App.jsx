import React, { useState, useCallback } from 'react';
import {
  Panel,
  Group as PanelGroup,
  Separator as PanelResizeHandle,
} from 'react-resizable-panels';
import { useStore } from './store/useStore';
import { introspectSchema } from './lib/introspection';
import DocsPanel from './components/DocsPanel';
import QueryEditor from './components/QueryEditor';
import ResponsePanel from './components/ResponsePanel';
import HistoryPanel from './components/HistoryPanel';
import SchemaViewer from './components/SchemaViewer';
import {
  Sun,
  Moon,
  BookOpen,
  Clock,
  Code2,
  Wifi,
  WifiOff,
  Loader2,
  Unplug,
  AlertCircle,
  X,
  Braces,
} from 'lucide-react';

export default function App() {
  const { state, dispatch } = useStore();
  const [urlInput, setUrlInput] = useState(state.endpoint);
  const [activeView, setActiveView] = useState('docs'); // docs, schema, history

  const handleConnect = useCallback(async () => {
    if (!urlInput.trim()) return;
    dispatch({ type: 'SET_ENDPOINT', payload: urlInput.trim() });
    dispatch({ type: 'SET_CONNECTION_STATUS', payload: 'connecting' });

    try {
      const result = await introspectSchema(urlInput.trim());
      dispatch({ type: 'SET_SCHEMA', payload: result });
      dispatch({
        type: 'ADD_TOAST',
        payload: {
          type: 'success',
          message: `Connected! Schema loaded with ${Object.keys(result.schema.getTypeMap()).length} types.`,
        },
      });
    } catch (err) {
      dispatch({ type: 'SET_CONNECTION_ERROR', payload: err.message });
      dispatch({
        type: 'ADD_TOAST',
        payload: { type: 'error', message: `Connection failed: ${err.message}` },
      });
    }
  }, [urlInput, dispatch]);

  const handleDisconnect = useCallback(() => {
    dispatch({ type: 'CLEAR_SCHEMA' });
    dispatch({
      type: 'ADD_TOAST',
      payload: { type: 'info', message: 'Disconnected from endpoint' },
    });
  }, [dispatch]);

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (state.connectionStatus === 'connected') {
          handleDisconnect();
        } else {
          handleConnect();
        }
      }
    },
    [handleConnect, handleDisconnect, state.connectionStatus]
  );

  const toggleTheme = useCallback(() => {
    dispatch({
      type: 'SET_THEME',
      payload: state.theme === 'dark' ? 'light' : 'dark',
    });
  }, [state.theme, dispatch]);

  const getStatusIcon = () => {
    switch (state.connectionStatus) {
      case 'connected':
        return <Wifi size={14} />;
      case 'connecting':
        return <Loader2 size={14} className="spin-icon" />;
      case 'error':
        return <AlertCircle size={14} />;
      default:
        return <WifiOff size={14} />;
    }
  };

  const renderLeftPanel = () => {
    switch (activeView) {
      case 'schema':
        return <SchemaViewer activeView={activeView} setActiveView={setActiveView} />;
      case 'history':
        return <HistoryPanel activeView={activeView} setActiveView={setActiveView} />;
      case 'explore':
      case 'docs':
      default:
        return <DocsPanel activeView={activeView} setActiveView={setActiveView} />;
    }
  };

  return (
    <div className="app-layout">
      {/* Toolbar */}
      <div className="toolbar">
        <div className="toolbar-brand">
          <Braces size={20} />
          <span>GraphQL Playground</span>
        </div>

        {/* URL Bar */}
        <div className="url-bar">
          <div className="url-method">POST</div>
          <input
            type="text"
            placeholder="https://your-graphql-endpoint.com/graphql"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          {state.connectionStatus === 'connected' ? (
            <button
              className="connect-btn connected"
              onClick={handleDisconnect}
            >
              <div className="status-dot connected" />
              Connected
            </button>
          ) : (
            <button
              className="connect-btn"
              onClick={handleConnect}
              disabled={state.connectionStatus === 'connecting' || !urlInput.trim()}
            >
              {state.connectionStatus === 'connecting' ? (
                <>
                  <div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                  Connecting...
                </>
              ) : (
                <>
                  {getStatusIcon()}
                  Connect
                </>
              )}
            </button>
          )}
        </div>

        {/* Toolbar actions */}
        <div className="toolbar-actions">
          <button
            className={`toolbar-btn ${(activeView === 'docs' || activeView === 'explore' || activeView === 'schema') && state.docsOpen ? 'active' : ''}`}
            onClick={() => {
              if (activeView === 'docs' || activeView === 'explore' || activeView === 'schema') {
                dispatch({ type: 'TOGGLE_DOCS' });
              } else {
                setActiveView('docs');
                if (!state.docsOpen) dispatch({ type: 'TOGGLE_DOCS' });
              }
            }}
            title="Documentation (Ctrl+D)"
          >
            <BookOpen size={16} />
          </button>

          <button
            className={`toolbar-btn ${activeView === 'history' ? 'active' : ''}`}
            onClick={() => {
              if (activeView === 'history') {
                setActiveView('docs');
              } else {
                setActiveView('history');
                if (!state.docsOpen) dispatch({ type: 'TOGGLE_DOCS' });
              }
            }}
            title="History"
          >
            <Clock size={16} />
          </button>
          <div
            style={{
              width: 1,
              height: 24,
              background: 'var(--surface-border)',
              margin: '0 4px',
            }}
          />
          <button className="toolbar-btn" onClick={toggleTheme} title="Toggle theme">
            {state.theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="panels-container">
        <PanelGroup direction="horizontal">
          {/* Left panel (docs/schema/history) */}
          {state.docsOpen && (
            <>
              <Panel defaultSize="30" minSize="18" maxSize="55">
                {renderLeftPanel()}
              </Panel>
              <PanelResizeHandle />
            </>
          )}

          {/* Center: Editor */}
          <Panel defaultSize={state.docsOpen ? "38" : "55"} minSize="25">
            <QueryEditor />
          </Panel>

          <PanelResizeHandle />

          {/* Right: Response */}
          <Panel defaultSize="35" minSize="20">
            <ResponsePanel />
          </Panel>
        </PanelGroup>
      </div>

      {/* Toast notifications */}
      <div className="toast-container">
        {state.toasts.map((toast) => (
          <div key={toast.id} className={`toast ${toast.type}`}>
            {toast.type === 'error' && <AlertCircle size={16} style={{ color: 'var(--accent-error)', flexShrink: 0 }} />}
            {toast.type === 'success' && (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent-success)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            )}
            {toast.type === 'info' && (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent-info)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
            )}
            <span style={{ flex: 1 }}>{toast.message}</span>
            <button
              onClick={() => dispatch({ type: 'REMOVE_TOAST', payload: toast.id })}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                padding: 0,
                flexShrink: 0,
              }}
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>

      <style>{`
        .spin-icon {
          animation: spin 1s linear infinite;
        }
      `}</style>
    </div>
  );
}
