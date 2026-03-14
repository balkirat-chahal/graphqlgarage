import React, { useCallback, useMemo, useState } from 'react';
import Editor from '@monaco-editor/react';
import { useStore } from '../store/useStore';
import { generateSnippets } from '../lib/snippets';
import {
    Clock,
    Copy,
    Download,
    CheckCircle,
    XCircle,
    Zap,
    FileText,
    Code2,
    Play
} from 'lucide-react';

export default function ResponsePanel() {
    const { state, dispatch, getActiveTab } = useStore();
    const [activeView, setActiveView] = useState('response'); // 'response' | 'code'
    const [codeLanguage, setCodeLanguage] = useState('javascript'); // 'javascript'|'curl'|'python'|'php'|'csharp'

    const formattedResponse = useMemo(() => {
        if (!state.response) return '';
        try {
            return JSON.stringify(state.response, null, 2);
        } catch {
            return String(state.response);
        }
    }, [state.response]);

    const hasErrors = useMemo(() => {
        return state.response?.errors && state.response.errors.length > 0;
    }, [state.response]);

    const handleCopy = useCallback(() => {
        navigator.clipboard.writeText(formattedResponse);
        dispatch({
            type: 'ADD_TOAST',
            payload: { type: 'success', message: 'Response copied to clipboard' },
        });
    }, [formattedResponse, dispatch]);

    const handleDownload = useCallback(() => {
        const blob = new Blob([formattedResponse], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `response-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }, [formattedResponse]);

    const formatSize = (bytes) => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    const snippets = useMemo(() => {
        if (activeView !== 'code') return null;
        const activeTab = getActiveTab();
        if (!activeTab) return null;
        return generateSnippets(
            state.endpoint || '',
            activeTab.query,
            activeTab.variables,
            activeTab.headers
        );
    }, [activeView, getActiveTab, state.endpoint]);

    const activeSnippet = snippets ? snippets[codeLanguage] : '';

    return (
        <div className="response-panel">
            <div className="panel-header">
                <div className="panel-header-title" style={{ display: 'flex', background: 'var(--surface-sunken)', borderRadius: 6, padding: 2, gap: 2 }}>
                    <button
                        onClick={() => setActiveView('response')}
                        style={{
                            padding: '4px 10px', border: 'none',
                            background: activeView === 'response' ? 'var(--surface-raised)' : 'transparent',
                            color: activeView === 'response' ? 'var(--text-primary)' : 'var(--text-muted)',
                            borderRadius: 4, fontSize: 12, cursor: 'pointer',
                            fontWeight: activeView === 'response' ? 500 : 400,
                            display: 'flex', alignItems: 'center', gap: 4
                        }}
                    >
                        <FileText size={12} /> Response
                    </button>
                    <button
                        onClick={() => setActiveView('code')}
                        style={{
                            padding: '4px 10px', border: 'none',
                            background: activeView === 'code' ? 'var(--surface-raised)' : 'transparent',
                            color: activeView === 'code' ? 'var(--text-primary)' : 'var(--text-muted)',
                            borderRadius: 4, fontSize: 12, cursor: 'pointer',
                            fontWeight: activeView === 'code' ? 500 : 400,
                            display: 'flex', alignItems: 'center', gap: 4
                        }}
                    >
                        <Code2 size={12} /> Code
                    </button>
                </div>
                <div className="panel-header-actions">
                    {activeView === 'response' && state.response && (
                        <>
                            <button
                                className="panel-icon-btn"
                                onClick={handleCopy}
                                title="Copy response"
                            >
                                <Copy size={13} />
                            </button>
                            <button
                                className="panel-icon-btn"
                                onClick={handleDownload}
                                title="Download response"
                            >
                                <Download size={13} />
                            </button>
                        </>
                    )}
                    {activeView === 'code' && snippets && (
                        <button
                            className="panel-icon-btn"
                            onClick={() => {
                                navigator.clipboard.writeText(activeSnippet);
                                dispatch({ type: 'ADD_TOAST', payload: { type: 'success', message: 'Snippet copied' } });
                            }}
                            title="Copy snippet"
                        >
                            <Copy size={13} />
                        </button>
                    )}
                </div>
            </div>

            {/* Response metadata */}
            {activeView === 'response' && state.response && (
                <div className="response-meta">
                    <div className="response-meta-item">
                        {state.responseStatus >= 200 && state.responseStatus < 300 ? (
                            <CheckCircle size={12} style={{ color: 'var(--accent-success)' }} />
                        ) : (
                            <XCircle size={12} style={{ color: 'var(--accent-error)' }} />
                        )}
                        <span className="response-meta-label">Status</span>
                        <span
                            className={`response-meta-value ${state.responseStatus >= 200 && state.responseStatus < 300
                                ? 'success'
                                : 'error'
                                }`}
                        >
                            {state.responseStatus || 'ERR'}
                        </span>
                    </div>
                    <div className="response-meta-item">
                        <Clock size={12} style={{ color: 'var(--text-muted)' }} />
                        <span className="response-meta-label">Time</span>
                        <span className="response-meta-value" style={{ color: getTimeColor(state.responseTime) }}>
                            {state.responseTime}ms
                        </span>
                    </div>
                    <div className="response-meta-item">
                        <Zap size={12} style={{ color: 'var(--text-muted)' }} />
                        <span className="response-meta-label">Size</span>
                        <span className="response-meta-value" style={{ color: 'var(--text-primary)' }}>
                            {formatSize(state.responseSize || 0)}
                        </span>
                    </div>
                    {hasErrors && (
                        <div
                            className="response-meta-item"
                            style={{
                                marginLeft: 'auto',
                                background: 'rgba(242, 85, 85, 0.1)',
                                padding: '2px 8px',
                                borderRadius: 4,
                            }}
                        >
                            <XCircle size={12} style={{ color: 'var(--accent-error)' }} />
                            <span style={{ color: 'var(--accent-error)', fontSize: 11, fontWeight: 600 }}>
                                {state.response.errors.length} Error{state.response.errors.length > 1 ? 's' : ''}
                            </span>
                        </div>
                    )}
                </div>
            )}

            {/* Code snippets language selector */}
            {activeView === 'code' && (
                <div className="response-meta" style={{ gap: 4 }}>
                    {[
                        { id: 'javascript', label: 'JavaScript (Fetch)' },
                        { id: 'curl', label: 'cURL' },
                        { id: 'python', label: 'Python (Requests)' },
                        { id: 'php', label: 'PHP (cURL)' },
                        { id: 'csharp', label: 'C# (HttpClient)' },
                    ].map(lang => (
                        <button
                            key={lang.id}
                            onClick={() => setCodeLanguage(lang.id)}
                            style={{
                                padding: '4px 10px', border: 'none', background: 'transparent',
                                color: codeLanguage === lang.id ? 'var(--text-primary)' : 'var(--text-muted)',
                                borderRadius: 4, fontSize: 12, cursor: 'pointer',
                                fontWeight: codeLanguage === lang.id ? 500 : 400,
                                borderBottom: codeLanguage === lang.id ? '2px solid var(--accent-primary)' : '2px solid transparent',
                                borderBottomLeftRadius: 0, borderBottomRightRadius: 0
                            }}
                        >
                            {lang.label}
                        </button>
                    ))}
                </div>
            )}

            {/* Response body */}
            <div className="response-body">
                {activeView === 'response' ? (
                    state.isExecuting ? (
                        <div className="empty-state">
                            <div className="spinner" />
                            <div className="empty-state-title">Executing query...</div>
                        </div>
                    ) : state.response ? (
                        <Editor
                            language="json"
                            theme={state.theme === 'dark' ? 'graphql-dark' : 'graphql-light'}
                            value={formattedResponse}
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
                                foldingStrategy: 'indentation',
                            }}
                        />
                    ) : (
                        <div className="empty-state">
                            <Play size={40} />
                            <div className="empty-state-title">No Response Yet</div>
                            <div className="empty-state-text">
                                Write a query and click Run or press{' '}
                                <kbd className="kbd">Ctrl</kbd>+<kbd className="kbd">Enter</kbd> to
                                execute it.
                            </div>
                        </div>
                    )
                ) : (
                    // Code view
                    <Editor
                        language={codeLanguage === 'csharp' ? 'csharp' : codeLanguage === 'php' ? 'php' : codeLanguage === 'curl' ? 'shell' : codeLanguage === 'python' ? 'python' : 'javascript'}
                        theme={state.theme === 'dark' ? 'graphql-dark' : 'graphql-light'}
                        value={activeSnippet}
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
                )}
            </div>
        </div>
    );
}

function getTimeColor(ms) {
    if (ms < 200) return 'var(--accent-success)';
    if (ms < 1000) return 'var(--accent-warning)';
    return 'var(--accent-error)';
}
