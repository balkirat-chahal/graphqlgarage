import React, { useCallback } from 'react';
import Editor from '@monaco-editor/react';
import { useStore } from '../store/useStore';
import { Code2, Copy, Download } from 'lucide-react';

export default function SchemaViewer({ activeView = 'schema', setActiveView }) {
    const { state, dispatch } = useStore();

    const handleCopy = useCallback(() => {
        if (state.schemaSDL) {
            navigator.clipboard.writeText(state.schemaSDL);
            dispatch({
                type: 'ADD_TOAST',
                payload: { type: 'success', message: 'Schema SDL copied to clipboard' },
            });
        }
    }, [state.schemaSDL, dispatch]);

    const handleDownload = useCallback(() => {
        if (state.schemaSDL) {
            const blob = new Blob([state.schemaSDL], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'schema.graphql';
            a.click();
            URL.revokeObjectURL(url);
        }
    }, [state.schemaSDL]);

    return (
        <div className="schema-viewer">
            <div className="panel-header">
                <div className="panel-header-title" style={{ display: 'flex', background: 'var(--surface-sunken)', borderRadius: 6, padding: 2, gap: 2 }}>
                    <button
                        onClick={() => setActiveView && setActiveView('docs')}
                        style={{
                            padding: '4px 10px',
                            border: 'none',
                            background: activeView === 'docs' ? 'var(--surface-raised)' : 'transparent',
                            color: activeView === 'docs' ? 'var(--text-primary)' : 'var(--text-muted)',
                            borderRadius: 4,
                            fontSize: 12,
                            cursor: 'pointer',
                            fontWeight: activeView === 'docs' ? 500 : 400,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4
                        }}
                    >
                        Docs
                    </button>
                    <button
                        onClick={() => setActiveView && setActiveView('explore')}
                        style={{
                            padding: '4px 10px',
                            border: 'none',
                            background: activeView === 'explore' ? 'var(--surface-raised)' : 'transparent',
                            color: activeView === 'explore' ? 'var(--text-primary)' : 'var(--text-muted)',
                            borderRadius: 4,
                            fontSize: 12,
                            cursor: 'pointer',
                            fontWeight: activeView === 'explore' ? 500 : 400,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4
                        }}
                    >
                        Explore
                    </button>
                    <button
                        onClick={() => setActiveView && setActiveView('schema')}
                        style={{
                            padding: '4px 10px',
                            border: 'none',
                            background: activeView === 'schema' ? 'var(--surface-raised)' : 'transparent',
                            color: activeView === 'schema' ? 'var(--text-primary)' : 'var(--text-muted)',
                            borderRadius: 4,
                            fontSize: 12,
                            cursor: 'pointer',
                            fontWeight: activeView === 'schema' ? 500 : 400,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4
                        }}
                    >
                        SDL
                    </button>
                </div>
                <div className="panel-header-actions">
                    <button className="panel-icon-btn" onClick={handleCopy} title="Copy SDL">
                        <Copy size={13} />
                    </button>
                    <button className="panel-icon-btn" onClick={handleDownload} title="Download SDL">
                        <Download size={13} />
                    </button>
                </div>
            </div>
            <div style={{ flex: 1, overflow: 'hidden' }}>
                {state.schemaSDL ? (
                    <Editor
                        language="graphql"
                        theme={state.theme === 'dark' ? 'graphql-dark' : 'graphql-light'}
                        value={state.schemaSDL}
                        options={{
                            readOnly: true,
                            minimap: { enabled: false },
                            fontSize: 13,
                            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                            lineNumbers: 'on',
                            renderLineHighlight: 'none',
                            scrollBeyondLastLine: false,
                            smoothScrolling: true,
                            padding: { top: 12 },
                            wordWrap: 'on',
                            automaticLayout: true,
                            folding: true,
                        }}
                    />
                ) : (
                    <div className="empty-state">
                        <Code2 size={40} />
                        <div className="empty-state-title">No Schema</div>
                        <div className="empty-state-text">
                            Connect to a GraphQL endpoint to view the schema SDL.
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
