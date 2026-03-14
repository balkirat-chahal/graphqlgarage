import React, { useState, useMemo, useCallback } from 'react';
import { useStore } from '../store/useStore';
import {
    parseSchemaForDocs,
    getTypeString,
    getBaseTypeName,
    buildQueryForField,
} from '../lib/introspection';
import {
    Search,
    ChevronRight,
    BookOpen,
    Zap,
    RefreshCw,
    Hash,
    Box,
    ArrowLeft,
    Copy,
    AlertTriangle,
    Type,
} from 'lucide-react';

const SECTION_CONFIG = {
    queries: { label: 'Queries', colorClass: 'badge-query', icon: Zap },
    mutations: { label: 'Mutations', colorClass: 'badge-mutation', icon: RefreshCw },
    subscriptions: { label: 'Subscriptions', colorClass: 'badge-subscription', icon: Zap },
    types: { label: 'Types', colorClass: 'badge-type', icon: Box },
    inputs: { label: 'Inputs', colorClass: 'badge-input', icon: Box },
    enums: { label: 'Enums', colorClass: 'badge-enum', icon: Hash },
    scalars: { label: 'Scalars', colorClass: 'badge-scalar', icon: Type },
};

export default function DocsPanel({ activeView = 'docs', setActiveView }) {
    const { state, dispatch, getActiveTab } = useStore();
    const [search, setSearch] = useState('');
    const [expandedSections, setExpandedSections] = useState({
        queries: true,
        mutations: true,
        subscriptions: true,
        types: false,
        inputs: false,
        enums: false,
        scalars: false,
    });
    const [navigationStack, setNavigationStack] = useState([]);
    const [selectedType, setSelectedType] = useState(null);
    const [selectedField, setSelectedField] = useState(null);

    const docs = useMemo(() => {
        if (!state.schema) return null;
        return parseSchemaForDocs(state.schema);
    }, [state.schema]);

    const filteredDocs = useMemo(() => {
        if (!docs) return null;
        if (!search.trim()) return docs;

        const lowerSearch = search.toLowerCase();
        const result = {};
        for (const [key, items] of Object.entries(docs)) {
            if (Array.isArray(items)) {
                result[key] = items.filter((item) => {
                    const name = item.name || '';
                    const desc = item.description || '';
                    return (
                        name.toLowerCase().includes(lowerSearch) ||
                        desc.toLowerCase().includes(lowerSearch)
                    );
                });
            }
        }
        return result;
    }, [docs, search]);

    const navigateToType = useCallback(
        (typeName) => {
            if (!state.schema) return;
            const type = state.schema.getType(typeName);
            if (type) {
                setNavigationStack((prev) => [...prev, { type: selectedType, field: selectedField }]);
                setSelectedType(type);
                setSelectedField(null);
                setSearch('');
            }
        },
        [state.schema, selectedType, selectedField]
    );

    const navigateToField = useCallback(
        (field) => {
            if (!field) return;
            setNavigationStack((prev) => [...prev, { type: selectedType, field: selectedField }]);
            setSelectedField(field);
            setSearch('');
        },
        [selectedType, selectedField]
    );

    const goBack = useCallback(() => {
        setNavigationStack((prev) => {
            if (prev.length === 0) {
                setSelectedType(null);
                setSelectedField(null);
                return [];
            }
            const newStack = [...prev];
            const previous = newStack.pop();
            setSelectedType(previous?.type || null);
            setSelectedField(previous?.field || null);
            return newStack;
        });
    }, []);

    const goHome = useCallback(() => {
        setNavigationStack([]);
        setSelectedType(null);
        setSelectedField(null);
    }, []);

    const toggleSection = useCallback((section) => {
        setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
    }, []);

    const insertQuery = useCallback(
        (field, operationType) => {
            const query = buildQueryForField(field, operationType);
            const activeTab = getActiveTab();
            dispatch({
                type: 'UPDATE_TAB',
                payload: {
                    id: activeTab.id,
                    updates: { query, name: field.name },
                },
            });
            dispatch({
                type: 'ADD_TOAST',
                payload: { type: 'info', message: `Inserted ${field.name} query` },
            });
        },
        [dispatch, getActiveTab]
    );

    if (!state.schema) {
        return (
            <div className="docs-panel">
                <div className="panel-header">
                    <div className="panel-header-title" style={{ display: 'flex', background: 'var(--surface-sunken)', borderRadius: 6, padding: 2, gap: 2 }}>
                        <button
                            onClick={() => setActiveView && setActiveView('docs')}
                            style={{
                                padding: '4px 10px', border: 'none',
                                background: activeView === 'docs' ? 'var(--surface-raised)' : 'transparent',
                                color: activeView === 'docs' ? 'var(--text-primary)' : 'var(--text-muted)',
                                borderRadius: 4, fontSize: 12, cursor: 'pointer',
                                fontWeight: activeView === 'docs' ? 500 : 400
                            }}
                        >Docs</button>
                        <button
                            onClick={() => setActiveView && setActiveView('explore')}
                            style={{
                                padding: '4px 10px', border: 'none',
                                background: activeView === 'explore' ? 'var(--surface-raised)' : 'transparent',
                                color: activeView === 'explore' ? 'var(--text-primary)' : 'var(--text-muted)',
                                borderRadius: 4, fontSize: 12, cursor: 'pointer',
                                fontWeight: activeView === 'explore' ? 500 : 400
                            }}
                        >Explore</button>
                        <button
                            onClick={() => setActiveView && setActiveView('schema')}
                            style={{
                                padding: '4px 10px', border: 'none',
                                background: activeView === 'schema' ? 'var(--surface-raised)' : 'transparent',
                                color: activeView === 'schema' ? 'var(--text-primary)' : 'var(--text-muted)',
                                borderRadius: 4, fontSize: 12, cursor: 'pointer',
                                fontWeight: activeView === 'schema' ? 500 : 400
                            }}
                        >SDL</button>
                    </div>
                </div>
                <div className="empty-state">
                    <BookOpen size={40} />
                    <div className="empty-state-title">No Schema Loaded</div>
                    <div className="empty-state-text">
                        Enter a GraphQL endpoint and click Connect to load the schema documentation.
                    </div>
                </div>
            </div>
        );
    }

    // Field detail view
    if (selectedField) {
        return (
            <div className="docs-panel">
                <div className="panel-header">
                    <div className="panel-header-title" style={{ display: 'flex', background: 'var(--surface-sunken)', borderRadius: 6, padding: 2, gap: 2 }}>
                        <button
                            onClick={() => setActiveView && setActiveView('docs')}
                            style={{
                                padding: '4px 10px', border: 'none',
                                background: activeView === 'docs' ? 'var(--surface-raised)' : 'transparent',
                                color: activeView === 'docs' ? 'var(--text-primary)' : 'var(--text-muted)',
                                borderRadius: 4, fontSize: 12, cursor: 'pointer',
                                fontWeight: activeView === 'docs' ? 500 : 400
                            }}
                        >Docs</button>
                        <button
                            onClick={() => setActiveView && setActiveView('explore')}
                            style={{
                                padding: '4px 10px', border: 'none',
                                background: activeView === 'explore' ? 'var(--surface-raised)' : 'transparent',
                                color: activeView === 'explore' ? 'var(--text-primary)' : 'var(--text-muted)',
                                borderRadius: 4, fontSize: 12, cursor: 'pointer',
                                fontWeight: activeView === 'explore' ? 500 : 400
                            }}
                        >Explore</button>
                        <button
                            onClick={() => setActiveView && setActiveView('schema')}
                            style={{
                                padding: '4px 10px', border: 'none',
                                background: activeView === 'schema' ? 'var(--surface-raised)' : 'transparent',
                                color: activeView === 'schema' ? 'var(--text-primary)' : 'var(--text-muted)',
                                borderRadius: 4, fontSize: 12, cursor: 'pointer',
                                fontWeight: activeView === 'schema' ? 500 : 400
                            }}
                        >SDL</button>
                    </div>
                </div>
                <div className="docs-breadcrumb">
                    <span className="docs-breadcrumb-item" onClick={goHome}>
                        Root
                    </span>
                    {navigationStack.map((item, i) => {
                        const name = item?.field?.name || item?.type?.name;
                        if (!name) return null;
                        return (
                            <React.Fragment key={i}>
                                <ChevronRight size={10} className="docs-breadcrumb-sep" />
                                <span
                                    className="docs-breadcrumb-item"
                                    onClick={() => {
                                        setNavigationStack((prev) => prev.slice(0, i));
                                        setSelectedType(item.type || null);
                                        setSelectedField(item.field || null);
                                    }}
                                >
                                    {name}
                                </span>
                            </React.Fragment>
                        );
                    })}
                    <ChevronRight size={10} className="docs-breadcrumb-sep" />
                    <span className="docs-breadcrumb-item active">{selectedField.name}</span>
                </div>
                <div className="docs-content">
                    <div className="docs-type-detail">
                        <div style={{ marginBottom: 12 }}>
                            <button
                                onClick={goBack}
                                style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', color: 'var(--accent-primary)', cursor: 'pointer', fontSize: 12, fontFamily: 'var(--font-sans)', padding: '4px 0' }}
                            >
                                <ArrowLeft size={14} /> Back
                            </button>
                        </div>
                        <div className="docs-type-header">
                            <span className="docs-type-name">{selectedField.name}</span>
                            <span className="docs-type-kind badge-query" style={{ padding: '3px 8px', borderRadius: 4 }}>
                                Field
                            </span>
                        </div>
                        {selectedField.description && (
                            <div className="docs-type-description">{selectedField.description}</div>
                        )}

                        {/* Field Type */}
                        <div className="docs-fields-title" style={{ marginTop: 24, marginBottom: 8, fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>Return Type</div>
                        <div className="docs-field-item">
                            <span
                                className="docs-field-type"
                                style={{ color: 'var(--type-type)', fontSize: 14, cursor: 'pointer' }}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    const baseName = getBaseTypeName(selectedField.type);
                                    if (baseName) navigateToType(baseName);
                                }}
                            >
                                {getTypeString(selectedField.type)}
                            </span>
                        </div>

                        {/* Field Args */}
                        {selectedField.args && selectedField.args.length > 0 && (
                            <>
                                <div className="docs-fields-title" style={{ marginTop: 24, marginBottom: 8, fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>Arguments</div>
                                {selectedField.args.map((arg) => (
                                    <div key={arg.name} className="docs-arg-item" style={{ marginBottom: 12 }}>
                                        <span className="docs-arg-name" style={{ fontSize: 14 }}>{arg.name}</span>
                                        <span style={{ color: 'var(--text-muted)', margin: '0 4px' }}>:</span>
                                        <span
                                            className="docs-arg-type"
                                            style={{ cursor: 'pointer' }}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                const baseName = getBaseTypeName(arg.type);
                                                if (baseName) navigateToType(baseName);
                                            }}
                                        >
                                            {getTypeString(arg.type)}
                                        </span>
                                        {arg.defaultValue !== undefined && arg.defaultValue !== null && (
                                            <span className="docs-arg-default"> = {
                                                typeof arg.defaultValue === 'object'
                                                    ? JSON.stringify(arg.defaultValue)
                                                    : String(arg.defaultValue)
                                            }</span>
                                        )}
                                        {arg.description && (
                                            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 8, marginTop: 4 }}>
                                                {arg.description}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    // Type detail view
    if (selectedType) {
        return (
            <div className="docs-panel">
                <div className="panel-header">
                    <div className="panel-header-title" style={{ display: 'flex', background: 'var(--surface-sunken)', borderRadius: 6, padding: 2, gap: 2 }}>
                        <button
                            onClick={() => setActiveView && setActiveView('docs')}
                            style={{
                                padding: '4px 10px', border: 'none',
                                background: activeView === 'docs' ? 'var(--surface-raised)' : 'transparent',
                                color: activeView === 'docs' ? 'var(--text-primary)' : 'var(--text-muted)',
                                borderRadius: 4, fontSize: 12, cursor: 'pointer',
                                fontWeight: activeView === 'docs' ? 500 : 400
                            }}
                        >Docs</button>
                        <button
                            onClick={() => setActiveView && setActiveView('explore')}
                            style={{
                                padding: '4px 10px', border: 'none',
                                background: activeView === 'explore' ? 'var(--surface-raised)' : 'transparent',
                                color: activeView === 'explore' ? 'var(--text-primary)' : 'var(--text-muted)',
                                borderRadius: 4, fontSize: 12, cursor: 'pointer',
                                fontWeight: activeView === 'explore' ? 500 : 400
                            }}
                        >Explore</button>
                        <button
                            onClick={() => setActiveView && setActiveView('schema')}
                            style={{
                                padding: '4px 10px', border: 'none',
                                background: activeView === 'schema' ? 'var(--surface-raised)' : 'transparent',
                                color: activeView === 'schema' ? 'var(--text-primary)' : 'var(--text-muted)',
                                borderRadius: 4, fontSize: 12, cursor: 'pointer',
                                fontWeight: activeView === 'schema' ? 500 : 400
                            }}
                        >SDL</button>
                    </div>
                </div>
                <div className="docs-breadcrumb">
                    <span className="docs-breadcrumb-item" onClick={goHome}>
                        Root
                    </span>
                    {navigationStack.map((item, i) => {
                        const name = item?.field?.name || item?.type?.name;
                        if (!name) return null;
                        return (
                            <React.Fragment key={i}>
                                <ChevronRight size={10} className="docs-breadcrumb-sep" />
                                <span
                                    className="docs-breadcrumb-item"
                                    onClick={() => {
                                        setNavigationStack((prev) => prev.slice(0, i));
                                        setSelectedType(item.type || null);
                                        setSelectedField(item.field || null);
                                    }}
                                >
                                    {name}
                                </span>
                            </React.Fragment>
                        );
                    })}
                    <ChevronRight size={10} className="docs-breadcrumb-sep" />
                    <span className="docs-breadcrumb-item active">{selectedType.name}</span>
                </div>
                <div className="docs-content">
                    <div className="docs-type-detail">
                        <div style={{ marginBottom: 12 }}>
                            <button
                                onClick={goBack}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 4,
                                    background: 'none',
                                    border: 'none',
                                    color: 'var(--accent-primary)',
                                    cursor: 'pointer',
                                    fontSize: 12,
                                    fontFamily: 'var(--font-sans)',
                                    padding: '4px 0',
                                }}
                            >
                                <ArrowLeft size={14} /> Back
                            </button>
                        </div>

                        <div className="docs-type-header">
                            <span className="docs-type-name">{selectedType.name}</span>
                            <span
                                className={`docs-type-kind ${getBadgeClass(selectedType)}`}
                                style={{ padding: '3px 8px', borderRadius: 4 }}
                            >
                                {selectedType.constructor.name.replace('GraphQL', '').replace('Type', '')}
                            </span>
                        </div>

                        {selectedType.description && (
                            <div className="docs-type-description">{selectedType.description}</div>
                        )}

                        {/* Fields */}
                        {typeof selectedType.getFields === 'function' && (
                            <>
                                <div className="docs-fields-title">Fields</div>
                                {Object.values(selectedType.getFields()).map((field) => (
                                    <div key={field.name} className="docs-field-item">
                                        <div className="docs-field-header">
                                            <span
                                                className="docs-field-name"
                                                style={{ cursor: activeView === 'explore' ? 'pointer' : 'default' }}
                                                onClick={() => activeView === 'explore' && navigateToField(field)}
                                            >
                                                {field.name}
                                            </span>
                                            {field.args && field.args.length > 0 && (
                                                <span className="docs-field-args">
                                                    ({field.args.map((a) => a.name).join(', ')})
                                                </span>
                                            )}
                                            <span style={{ marginLeft: 'auto' }}>
                                                <span
                                                    className="docs-field-type"
                                                    style={{ color: 'var(--type-type)' }}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        const baseName = getBaseTypeName(field.type);
                                                        if (baseName) navigateToType(baseName);
                                                    }}
                                                >
                                                    {getTypeString(field.type)}
                                                </span>
                                            </span>
                                        </div>
                                        {field.description && (
                                            <div className="docs-field-description">{field.description}</div>
                                        )}
                                        {field.isDeprecated && (
                                            <div className="docs-field-deprecated">
                                                <AlertTriangle size={12} />
                                                <span>Deprecated: {field.deprecationReason || 'No reason provided'}</span>
                                            </div>
                                        )}
                                        {field.args && field.args.length > 0 && (
                                            <div style={{ marginTop: 6 }}>
                                                {field.args.map((arg) => (
                                                    <div key={arg.name} className="docs-arg-item">
                                                        <span className="docs-arg-name">{arg.name}</span>
                                                        <span style={{ color: 'var(--text-muted)', margin: '0 4px' }}>:</span>
                                                        <span
                                                            className="docs-arg-type"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                const baseName = getBaseTypeName(arg.type);
                                                                if (baseName) navigateToType(baseName);
                                                            }}
                                                        >
                                                            {getTypeString(arg.type)}
                                                        </span>
                                                        {arg.defaultValue !== undefined && arg.defaultValue !== null && (
                                                            <span className="docs-arg-default"> = {
                                                                typeof arg.defaultValue === 'object'
                                                                    ? JSON.stringify(arg.defaultValue)
                                                                    : String(arg.defaultValue)
                                                            }</span>
                                                        )}
                                                        {arg.description && (
                                                            <div
                                                                style={{
                                                                    fontSize: 11,
                                                                    color: 'var(--text-muted)',
                                                                    marginLeft: 8,
                                                                    marginTop: 2,
                                                                }}
                                                            >
                                                                {arg.description}
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </>
                        )}

                        {/* Enum values */}
                        {selectedType.getValues && (
                            <>
                                <div className="docs-fields-title">Values</div>
                                {selectedType.getValues().map((val) => (
                                    <div key={val.name} className="docs-enum-value">
                                        <span className="docs-enum-name">{val.name}</span>
                                        {val.description && (
                                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                                — {val.description}
                                            </span>
                                        )}
                                        {val.isDeprecated && (
                                            <span style={{ fontSize: 11, color: 'var(--accent-warning)' }}>
                                                (deprecated)
                                            </span>
                                        )}
                                    </div>
                                ))}
                            </>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    // Main docs list view
    return (
        <div className="docs-panel">
            <div className="panel-header">
                <div className="panel-header-title" style={{ display: 'flex', background: 'var(--surface-sunken)', borderRadius: 6, padding: 2, gap: 2 }}>
                    <button
                        onClick={() => setActiveView && setActiveView('docs')}
                        style={{
                            padding: '4px 10px', border: 'none',
                            background: activeView === 'docs' ? 'var(--surface-raised)' : 'transparent',
                            color: activeView === 'docs' ? 'var(--text-primary)' : 'var(--text-muted)',
                            borderRadius: 4, fontSize: 12, cursor: 'pointer',
                            fontWeight: activeView === 'docs' ? 500 : 400
                        }}
                    >Docs</button>
                    <button
                        onClick={() => setActiveView && setActiveView('explore')}
                        style={{
                            padding: '4px 10px', border: 'none',
                            background: activeView === 'explore' ? 'var(--surface-raised)' : 'transparent',
                            color: activeView === 'explore' ? 'var(--text-primary)' : 'var(--text-muted)',
                            borderRadius: 4, fontSize: 12, cursor: 'pointer',
                            fontWeight: activeView === 'explore' ? 500 : 400
                        }}
                    >Explore</button>
                    <button
                        onClick={() => setActiveView && setActiveView('schema')}
                        style={{
                            padding: '4px 10px', border: 'none',
                            background: activeView === 'schema' ? 'var(--surface-raised)' : 'transparent',
                            color: activeView === 'schema' ? 'var(--text-primary)' : 'var(--text-muted)',
                            borderRadius: 4, fontSize: 12, cursor: 'pointer',
                            fontWeight: activeView === 'schema' ? 500 : 400
                        }}
                    >SDL</button>
                </div>
                <div className="panel-header-actions">
                    <span
                        style={{
                            fontSize: 10,
                            color: 'var(--text-muted)',
                            fontFamily: 'var(--font-mono)',
                        }}
                    >
                        {docs
                            ? `${docs.queries.length}Q ${docs.mutations.length}M ${docs.types.length}T`
                            : ''}
                    </span>
                </div>
            </div>

            <div className="docs-search">
                <div className="docs-search-input">
                    <Search size={13} />
                    <input
                        type="text"
                        placeholder="Search types, fields..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
            </div>

            <div className="docs-content">
                {filteredDocs &&
                    Object.entries(SECTION_CONFIG).map(([key, config]) => {
                        const items = filteredDocs[key];
                        if (!items || items.length === 0) return null;
                        const SectionIcon = config.icon;
                        const isExpanded = expandedSections[key] || search.trim().length > 0;

                        return (
                            <div key={key} className="docs-section">
                                <div
                                    className="docs-section-header"
                                    onClick={() => toggleSection(key)}
                                >
                                    <SectionIcon
                                        size={12}
                                        style={{ color: getColorForSection(key) }}
                                    />
                                    <span
                                        className="docs-section-label"
                                        style={{ color: getColorForSection(key) }}
                                    >
                                        {config.label}
                                    </span>
                                    <span className="docs-section-count">{items.length}</span>
                                    <ChevronRight
                                        size={12}
                                        className={`docs-section-chevron ${isExpanded ? 'open' : ''}`}
                                    />
                                </div>
                                {isExpanded &&
                                    items.map((item) => (
                                        <div
                                            key={item.name}
                                            className="docs-item"
                                            onClick={() => {
                                                if (
                                                    key === 'queries' ||
                                                    key === 'mutations' ||
                                                    key === 'subscriptions'
                                                ) {
                                                    if (activeView === 'explore') {
                                                        navigateToField(item);
                                                    } else {
                                                        insertQuery(
                                                            item,
                                                            key === 'mutations'
                                                                ? 'mutation'
                                                                : key === 'subscriptions'
                                                                    ? 'subscription'
                                                                    : 'query'
                                                        );
                                                    }
                                                } else {
                                                    navigateToType(item.name);
                                                }
                                            }}
                                            title={item.description || ''}
                                        >
                                            <span className="docs-item-name">{item.name}</span>
                                            {(key === 'queries' ||
                                                key === 'mutations' ||
                                                key === 'subscriptions') && (
                                                    <span
                                                        style={{
                                                            fontSize: 10,
                                                            color: 'var(--text-muted)',
                                                            fontFamily: 'var(--font-mono)',
                                                            marginLeft: 'auto',
                                                        }}
                                                    >
                                                        {getTypeString(item.type)}
                                                    </span>
                                                )}
                                        </div>
                                    ))}
                            </div>
                        );
                    })}
            </div>
        </div>
    );
}

function getColorForSection(key) {
    const colors = {
        queries: 'var(--type-query)',
        mutations: 'var(--type-mutation)',
        subscriptions: 'var(--type-subscription)',
        types: 'var(--type-type)',
        inputs: 'var(--type-input)',
        enums: 'var(--type-enum)',
        scalars: 'var(--type-scalar)',
    };
    return colors[key] || 'var(--text-secondary)';
}

function getBadgeClass(type) {
    const name = type.constructor.name;
    if (name.includes('Enum')) return 'badge-enum';
    if (name.includes('Input')) return 'badge-input';
    if (name.includes('Scalar')) return 'badge-scalar';
    return 'badge-type';
}
