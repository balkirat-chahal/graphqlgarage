import React, { useRef, useCallback, useEffect, useState } from 'react';
import Editor from '@monaco-editor/react';
import { useStore } from '../store/useStore';
import {
    registerGraphQLLanguage,
    createCompletionProvider,
    createHoverProvider,
} from '../lib/graphqlLanguage';
import {
    executeQuery,
    extractOperationName,
    prettifyQuery,
} from '../lib/introspection';
import {
    Play,
    Plus,
    X,
    Sparkles,
    Copy,
    Keyboard,
} from 'lucide-react';

export default function QueryEditor() {
    const { state, dispatch, getActiveTab } = useStore();
    const editorRef = useRef(null);
    const monacoRef = useRef(null);
    const completionDisposableRef = useRef(null);
    const hoverDisposableRef = useRef(null);
    const [showShortcuts, setShowShortcuts] = useState(false);

    const activeTab = getActiveTab();

    // Handle Monaco mount
    const handleEditorDidMount = useCallback(
        (editor, monaco) => {
            editorRef.current = editor;
            monacoRef.current = monaco;

            registerGraphQLLanguage(monaco);

            // Set theme
            monaco.editor.setTheme(
                state.theme === 'dark' ? 'graphql-dark' : 'graphql-light'
            );

            // Keyboard shortcuts
            editor.addAction({
                id: 'execute-query',
                label: 'Execute Query',
                keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter],
                run: () => handleExecute(),
            });

            editor.addAction({
                id: 'prettify-query',
                label: 'Prettify Query',
                keybindings: [
                    monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyP,
                ],
                run: () => handlePrettify(),
            });

            // Register completion provider if schema exists
            if (state.schema) {
                registerProviders(monaco, state.schema);
            }
        },
        [state.schema, state.theme]
    );

    // Update providers when schema changes
    useEffect(() => {
        if (monacoRef.current && state.schema) {
            registerProviders(monacoRef.current, state.schema);
        }
    }, [state.schema]);

    // Update theme
    useEffect(() => {
        if (monacoRef.current) {
            monacoRef.current.editor.setTheme(
                state.theme === 'dark' ? 'graphql-dark' : 'graphql-light'
            );
        }
    }, [state.theme]);

    const registerProviders = useCallback((monaco, schema) => {
        // Dispose previous providers
        if (completionDisposableRef.current) {
            completionDisposableRef.current.dispose();
        }
        if (hoverDisposableRef.current) {
            hoverDisposableRef.current.dispose();
        }

        const completionProvider = createCompletionProvider(schema);
        if (completionProvider) {
            completionDisposableRef.current =
                monaco.languages.registerCompletionItemProvider(
                    'graphql',
                    completionProvider
                );
        }

        const hoverProvider = createHoverProvider(schema);
        if (hoverProvider) {
            hoverDisposableRef.current =
                monaco.languages.registerHoverProvider('graphql', hoverProvider);
        }
    }, []);

    const handleExecute = useCallback(async () => {
        const tab = getActiveTab();
        if (!state.endpoint || state.isExecuting) return;

        dispatch({ type: 'SET_EXECUTING', payload: true });
        dispatch({ type: 'CLEAR_RESPONSE' });

        try {
            const result = await executeQuery(
                state.endpoint,
                tab.query,
                tab.variables,
                tab.headers
            );

            dispatch({
                type: 'SET_RESPONSE',
                payload: result,
            });

            // Add to history
            dispatch({
                type: 'ADD_HISTORY_ITEM',
                payload: {
                    timestamp: Date.now(),
                    operationName: extractOperationName(tab.query),
                    endpoint: state.endpoint,
                    query: tab.query,
                    variables: tab.variables,
                    headers: tab.headers,
                },
            });
        } catch (err) {
            dispatch({
                type: 'SET_RESPONSE',
                payload: {
                    data: { error: err.message },
                    status: 0,
                    time: 0,
                    size: 0,
                },
            });
            dispatch({
                type: 'ADD_TOAST',
                payload: { type: 'error', message: err.message },
            });
        }
    }, [state.endpoint, state.isExecuting, dispatch, getActiveTab]);

    const handlePrettify = useCallback(() => {
        const tab = getActiveTab();
        try {
            const pretty = prettifyQuery(tab.query);
            dispatch({
                type: 'UPDATE_TAB',
                payload: { id: tab.id, updates: { query: pretty } },
            });
            dispatch({
                type: 'ADD_TOAST',
                payload: { type: 'success', message: 'Query formatted' },
            });
        } catch (err) {
            dispatch({
                type: 'ADD_TOAST',
                payload: { type: 'error', message: err.message },
            });
        }
    }, [dispatch, getActiveTab]);

    const handleCopy = useCallback(() => {
        const tab = getActiveTab();
        navigator.clipboard.writeText(tab.query);
        dispatch({
            type: 'ADD_TOAST',
            payload: { type: 'success', message: 'Query copied to clipboard' },
        });
    }, [dispatch, getActiveTab]);

    return (
        <div className="editor-area">
            {/* Tab bar */}
            <div className="tab-bar">
                {state.tabs.map((tab) => (
                    <div
                        key={tab.id}
                        className={`tab ${tab.id === state.activeTabId ? 'active' : ''}`}
                        onClick={() => dispatch({ type: 'SET_ACTIVE_TAB', payload: tab.id })}
                    >
                        <span>{tab.name}</span>
                        {state.tabs.length > 1 && (
                            <button
                                className="tab-close"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    dispatch({ type: 'CLOSE_TAB', payload: tab.id });
                                }}
                            >
                                <X size={10} />
                            </button>
                        )}
                    </div>
                ))}
                <button
                    className="tab-add"
                    onClick={() => dispatch({ type: 'ADD_TAB' })}
                    title="New tab"
                >
                    <Plus size={14} />
                </button>
            </div>

            {/* Editor toolbar */}
            <div className="editor-toolbar">
                <div className="editor-toolbar-left">
                    <button className="editor-action-btn" onClick={handlePrettify} title="Prettify (Ctrl+Shift+P)">
                        <Sparkles size={13} />
                        <span>Prettify</span>
                    </button>
                    <button className="editor-action-btn" onClick={handleCopy} title="Copy query">
                        <Copy size={13} />
                        <span>Copy</span>
                    </button>
                    <button
                        className="editor-action-btn"
                        onClick={() => setShowShortcuts(!showShortcuts)}
                        title="Keyboard shortcuts"
                    >
                        <Keyboard size={13} />
                    </button>
                </div>
                <div className="editor-toolbar-right">
                    <button
                        className="run-btn editor-action-btn"
                        onClick={handleExecute}
                        disabled={!state.endpoint || state.isExecuting}
                        title="Execute (Ctrl+Enter)"
                    >
                        {state.isExecuting ? (
                            <div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                        ) : (
                            <Play size={14} fill="currentColor" />
                        )}
                        <span>Run</span>
                    </button>
                </div>
            </div>

            {showShortcuts && (
                <div
                    style={{
                        padding: '8px 14px',
                        background: 'var(--bg-tertiary)',
                        borderBottom: '1px solid var(--surface-border)',
                        display: 'flex',
                        gap: 16,
                        flexWrap: 'wrap',
                        fontSize: 11,
                        color: 'var(--text-secondary)',
                    }}
                >
                    <span>
                        <kbd className="kbd">Ctrl</kbd>+<kbd className="kbd">Enter</kbd> Execute
                    </span>
                    <span>
                        <kbd className="kbd">Ctrl</kbd>+<kbd className="kbd">Shift</kbd>+<kbd className="kbd">P</kbd>{' '}
                        Prettify
                    </span>
                    <span>
                        <kbd className="kbd">Ctrl</kbd>+<kbd className="kbd">Space</kbd> Autocomplete
                    </span>
                </div>
            )}

            {/* Main editor */}
            <div style={{ flex: 1, overflow: 'hidden' }}>
                <Editor
                    language="graphql"
                    theme={state.theme === 'dark' ? 'graphql-dark' : 'graphql-light'}
                    value={activeTab?.query || ''}
                    onChange={(value) => {
                        dispatch({
                            type: 'UPDATE_TAB',
                            payload: { id: activeTab.id, updates: { query: value || '' } },
                        });
                    }}
                    onMount={handleEditorDidMount}
                    options={{
                        minimap: { enabled: false },
                        fontSize: 14,
                        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                        fontLigatures: true,
                        lineNumbers: 'on',
                        renderLineHighlight: 'line',
                        scrollBeyondLastLine: false,
                        smoothScrolling: true,
                        cursorBlinking: 'smooth',
                        cursorSmoothCaretAnimation: 'on',
                        padding: { top: 12 },
                        tabSize: 2,
                        wordWrap: 'on',
                        automaticLayout: true,
                        suggestOnTriggerCharacters: true,
                        quickSuggestions: true,
                        formatOnPaste: true,
                        bracketPairColorization: { enabled: true },
                        guides: {
                            bracketPairs: true,
                            indentation: true,
                        },
                    }}
                />
            </div>

            {/* Bottom pane: Variables / Headers */}
            <div className="bottom-tabs">
                <button
                    className={`bottom-tab ${state.activeBottomTab === 'variables' ? 'active' : ''}`}
                    onClick={() => dispatch({ type: 'SET_BOTTOM_TAB', payload: 'variables' })}
                >
                    Variables
                </button>
                <button
                    className={`bottom-tab ${state.activeBottomTab === 'headers' ? 'active' : ''}`}
                    onClick={() => dispatch({ type: 'SET_BOTTOM_TAB', payload: 'headers' })}
                >
                    Headers
                </button>
            </div>
            <div style={{ height: 120, overflow: 'hidden' }}>
                <Editor
                    language="json"
                    theme={state.theme === 'dark' ? 'graphql-dark' : 'graphql-light'}
                    value={
                        state.activeBottomTab === 'variables'
                            ? activeTab?.variables || '{}'
                            : activeTab?.headers || '{}'
                    }
                    onChange={(value) => {
                        const key =
                            state.activeBottomTab === 'variables' ? 'variables' : 'headers';
                        dispatch({
                            type: 'UPDATE_TAB',
                            payload: {
                                id: activeTab.id,
                                updates: { [key]: value || '' },
                            },
                        });
                    }}
                    options={{
                        minimap: { enabled: false },
                        fontSize: 13,
                        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                        lineNumbers: 'off',
                        renderLineHighlight: 'none',
                        scrollBeyondLastLine: false,
                        padding: { top: 8 },
                        tabSize: 2,
                        wordWrap: 'on',
                        automaticLayout: true,
                        folding: false,
                        glyphMargin: false,
                    }}
                />
            </div>
        </div>
    );
}
