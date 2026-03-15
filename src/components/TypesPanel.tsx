import { useMemo, useCallback } from 'react';
import Editor from '@monaco-editor/react';
import { useStore } from '@/store/useStore';
import { Code2, Copy, Download } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { cn } from '@/lib/utils';
import type { LeftPanelView } from '@/types/view';
import {
    GraphQLSchema,
    GraphQLType,
    GraphQLNamedType,
    isEnumType,
    isInputObjectType,
    isInterfaceType,
    isListType,
    isNonNullType,
    isObjectType,
    isScalarType,
    isUnionType,
} from 'graphql';

interface TypesPanelProps {
    activeView?: LeftPanelView;
    setActiveView: React.Dispatch<React.SetStateAction<LeftPanelView>>;
}

const SCALAR_MAP: Record<string, string> = {
    String: 'string',
    ID: 'string',
    Int: 'number',
    Float: 'number',
    Boolean: 'boolean',
};

const isBuiltInScalar = (name: string) => Object.prototype.hasOwnProperty.call(SCALAR_MAP, name);

const printDescription = (description?: string, indent = ''): string[] => {
    if (!description) return [];
    const lines = description.split('\n').map((line) => line.trim()).filter(Boolean);
    if (lines.length === 0) return [];
    if (lines.length === 1) {
        return [`${indent}/** ${lines[0]} */`];
    }
    return [
        `${indent}/**`,
        ...lines.map((line) => `${indent} * ${line}`),
        `${indent} */`,
    ];
};

const typeToTs = (type: GraphQLType): string => {
    if (isNonNullType(type)) {
        return typeToTsNonNull(type.ofType);
    }
    return `${typeToTsNonNull(type)} | null`;
};

const typeToTsNonNull = (type: GraphQLType): string => {
    if (isListType(type)) {
        return `Array<${typeToTs(type.ofType)}>`;
    }
    if (isScalarType(type)) {
        return SCALAR_MAP[type.name] ?? type.name;
    }
    if (
        isEnumType(type) ||
        isInputObjectType(type) ||
        isObjectType(type) ||
        isInterfaceType(type) ||
        isUnionType(type)
    ) {
        return type.name;
    }
    return 'unknown';
};

const generateTypeScriptTypes = (schema: GraphQLSchema): string => {
    const typeMap = schema.getTypeMap();
    const types = Object.values(typeMap)
        .filter((type) => !type.name.startsWith('__'))
        .sort((a, b) => a.name.localeCompare(b.name));

    const lines: string[] = [];
    lines.push('/* eslint-disable */');
    lines.push('// Generated from GraphQL schema');
    lines.push('');

    const customScalars = types.filter(
        (type): type is GraphQLNamedType & { description?: string } =>
            isScalarType(type) && !isBuiltInScalar(type.name)
    );

    if (customScalars.length > 0) {
        lines.push('// Custom scalars');
        customScalars.forEach((scalar) => {
            lines.push(...printDescription(scalar.description));
            lines.push(`export type ${scalar.name} = unknown;`);
            lines.push('');
        });
    }

    const emitInterface = (
        name: string,
        fields: Record<string, { type: GraphQLType; description?: string }>,
        inputMode: boolean
    ) => {
        lines.push(`export interface ${name} {`);
        const entries = Object.entries(fields);
        if (entries.length === 0) {
            lines.push('}');
            lines.push('');
            return;
        }
        entries.forEach(([fieldName, field]) => {
            lines.push(...printDescription(field.description, '  '));
            const required = isNonNullType(field.type);
            const optional = inputMode && !required ? '?' : '';
            lines.push(`  ${fieldName}${optional}: ${typeToTs(field.type)};`);
        });
        lines.push('}');
        lines.push('');
    };

    types.forEach((type) => {
        if (isScalarType(type)) {
            if (isBuiltInScalar(type.name)) {
                return;
            }
            return;
        }

        if (isEnumType(type)) {
            lines.push(...printDescription(type.description));
            const values = type.getValues().map((value) => `'${value.name}'`);
            lines.push(`export type ${type.name} = ${values.length > 0 ? values.join(' | ') : 'never'};`);
            lines.push('');
            return;
        }

        if (isUnionType(type)) {
            lines.push(...printDescription(type.description));
            const unionTypes = type.getTypes().map((member) => member.name);
            lines.push(`export type ${type.name} = ${unionTypes.length > 0 ? unionTypes.join(' | ') : 'never'};`);
            lines.push('');
            return;
        }

        if (isInputObjectType(type)) {
            lines.push(...printDescription(type.description));
            emitInterface(
                type.name,
                Object.fromEntries(
                    Object.entries(type.getFields()).map(([fieldName, field]) => [
                        fieldName,
                        { type: field.type, description: field.description },
                    ])
                ),
                true
            );
            return;
        }

        if (isObjectType(type) || isInterfaceType(type)) {
            lines.push(...printDescription(type.description));
            emitInterface(
                type.name,
                Object.fromEntries(
                    Object.entries(type.getFields()).map(([fieldName, field]) => [
                        fieldName,
                        { type: field.type, description: field.description },
                    ])
                ),
                false
            );
        }
    });

    return lines.join('\n').trim() + '\n';
};

export default function TypesPanel({ activeView = 'types', setActiveView }: TypesPanelProps) {
    const store = useStore();
    const { toast } = useToast();

    const generatedTypes = useMemo(() => {
        if (!store.schema) return '';
        return generateTypeScriptTypes(store.schema);
    }, [store.schema]);

    const handleCopy = useCallback(() => {
        if (!generatedTypes) return;
        navigator.clipboard.writeText(generatedTypes);
        toast({
            title: "Copied",
            description: "TypeScript types copied to clipboard.",
        });
    }, [generatedTypes, toast]);

    const handleDownload = useCallback(() => {
        if (!generatedTypes) return;
        const blob = new Blob([generatedTypes], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'schema-types.ts';
        a.click();
        URL.revokeObjectURL(url);
    }, [generatedTypes]);

    if (!store.schema) {
        return (
            <div className="flex flex-col h-full bg-card border-r">
                <div className="flex items-center justify-between px-3 h-11 border-b shrink-0">
                    <div className="flex bg-muted/50 p-0.5 rounded-md gap-0.5">
                        <button
                            onClick={() => setActiveView('docs')}
                            className={cn(
                                "px-3 py-1 text-[11px] font-semibold rounded-sm transition-all",
                                activeView === 'docs'
                                    ? "bg-background text-foreground shadow-sm"
                                    : "text-muted-foreground hover:text-foreground"
                            )}
                        >
                            Docs
                        </button>
                        <button
                            onClick={() => setActiveView('explore')}
                            className={cn(
                                "px-3 py-1 text-[11px] font-semibold rounded-sm transition-all",
                                activeView === 'explore'
                                    ? "bg-background text-foreground shadow-sm"
                                    : "text-muted-foreground hover:text-foreground"
                            )}
                        >
                            Explore
                        </button>
                        <button
                            onClick={() => setActiveView('types')}
                            className={cn(
                                "px-3 py-1 text-[11px] font-semibold rounded-sm transition-all",
                                activeView === 'types'
                                    ? "bg-background text-foreground shadow-sm"
                                    : "text-muted-foreground hover:text-foreground"
                            )}
                        >
                            Types
                        </button>
                        <button
                            onClick={() => setActiveView('schema')}
                            className={cn(
                                "px-3 py-1 text-[11px] font-semibold rounded-sm transition-all",
                                activeView === 'schema'
                                    ? "bg-background text-foreground shadow-sm"
                                    : "text-muted-foreground hover:text-foreground"
                            )}
                        >
                            SDL
                        </button>
                    </div>
                </div>
                <div className="flex flex-col items-center justify-center h-full p-8 text-center gap-4 opacity-40 grayscale">
                    <Code2 size={48} />
                    <div className="space-y-1">
                        <h3 className="text-lg font-bold">No Schema</h3>
                        <p className="text-sm">
                            Connect to a GraphQL endpoint to generate TypeScript types.
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-card border-r">
            <div className="flex items-center justify-between px-3 h-11 border-b shrink-0">
                <div className="flex bg-muted/50 p-0.5 rounded-md gap-0.5">
                    <button
                        onClick={() => setActiveView('docs')}
                        className={cn(
                            "px-3 py-1 text-[11px] font-semibold rounded-sm transition-all",
                            activeView === 'docs'
                                ? "bg-background text-foreground shadow-sm"
                                : "text-muted-foreground hover:text-foreground"
                        )}
                    >
                        Docs
                    </button>
                    <button
                        onClick={() => setActiveView('explore')}
                        className={cn(
                            "px-3 py-1 text-[11px] font-semibold rounded-sm transition-all",
                            activeView === 'explore'
                                ? "bg-background text-foreground shadow-sm"
                                : "text-muted-foreground hover:text-foreground"
                        )}
                    >
                        Explore
                    </button>
                    <button
                        onClick={() => setActiveView('types')}
                        className={cn(
                            "px-3 py-1 text-[11px] font-semibold rounded-sm transition-all",
                            activeView === 'types'
                                ? "bg-background text-foreground shadow-sm"
                                : "text-muted-foreground hover:text-foreground"
                        )}
                    >
                        Types
                    </button>
                    <button
                        onClick={() => setActiveView('schema')}
                        className={cn(
                            "px-3 py-1 text-[11px] font-semibold rounded-sm transition-all",
                            activeView === 'schema'
                                ? "bg-background text-foreground shadow-sm"
                                : "text-muted-foreground hover:text-foreground"
                        )}
                    >
                        SDL
                    </button>
                </div>
                <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleCopy} title="Copy types">
                        <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleDownload} title="Download types">
                        <Download className="h-3.5 w-3.5" />
                    </Button>
                </div>
            </div>

            <div className="flex-1 min-h-0 relative">
                <Editor
                    language="typescript"
                    theme={store.theme === 'dark' ? 'graphql-dark' : 'graphql-light'}
                    value={generatedTypes}
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
            </div>
        </div>
    );
}
