import React, { useCallback } from 'react';
import { useStore } from '../store/useStore';
import { Clock, Trash2, X, RotateCcw } from 'lucide-react';

export default function HistoryPanel() {
    const { state, dispatch, getActiveTab } = useStore();

    const restoreHistory = useCallback(
        (item) => {
            const activeTab = getActiveTab();
            dispatch({
                type: 'UPDATE_TAB',
                payload: {
                    id: activeTab.id,
                    updates: {
                        query: item.query,
                        variables: item.variables || '{}',
                        headers: item.headers || '{}',
                        name: item.operationName || 'Restored',
                    },
                },
            });
            if (item.endpoint && item.endpoint !== state.endpoint) {
                dispatch({ type: 'SET_ENDPOINT', payload: item.endpoint });
            }
            dispatch({
                type: 'ADD_TOAST',
                payload: { type: 'info', message: 'Query restored from history' },
            });
        },
        [dispatch, getActiveTab, state.endpoint]
    );

    const formatTime = (ts) => {
        const d = new Date(ts);
        const now = new Date();
        const diff = now - d;
        if (diff < 60000) return 'Just now';
        if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
        return d.toLocaleDateString();
    };

    return (
        <div className="history-panel">
            <div className="panel-header">
                <div className="panel-header-title">
                    <Clock size={14} />
                    <span>History</span>
                </div>
                <div className="panel-header-actions">
                    {state.history.length > 0 && (
                        <button
                            className="panel-icon-btn"
                            onClick={() => dispatch({ type: 'CLEAR_HISTORY' })}
                            title="Clear all history"
                        >
                            <Trash2 size={13} />
                        </button>
                    )}
                    <button
                        className="panel-icon-btn"
                        onClick={() => dispatch({ type: 'TOGGLE_HISTORY' })}
                        title="Close history"
                    >
                        <X size={14} />
                    </button>
                </div>
            </div>

            <div className="history-list">
                {state.history.length === 0 ? (
                    <div className="empty-state" style={{ padding: 32 }}>
                        <Clock size={32} />
                        <div className="empty-state-title">No History</div>
                        <div className="empty-state-text">
                            Executed queries will appear here.
                        </div>
                    </div>
                ) : (
                    state.history.map((item, idx) => (
                        <div
                            key={idx}
                            className="history-item"
                            onClick={() => restoreHistory(item)}
                        >
                            <div className="history-item-header">
                                <span className="history-item-name">
                                    {item.operationName || 'Anonymous'}
                                </span>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <span className="history-item-time">
                                        {formatTime(item.timestamp)}
                                    </span>
                                    <button
                                        className="history-item-delete"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            dispatch({ type: 'DELETE_HISTORY_ITEM', payload: idx });
                                        }}
                                        title="Delete"
                                    >
                                        <X size={10} />
                                    </button>
                                </div>
                            </div>
                            <div className="history-item-endpoint">{item.endpoint}</div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
