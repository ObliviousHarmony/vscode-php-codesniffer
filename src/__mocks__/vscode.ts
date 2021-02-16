const Uri = jest.fn().mockImplementation(() => {
    return {
        fsPath: 'test/path.php'
    };
});

const MockTextDocument = jest.fn().mockImplementation(() => {
    return {
        uri: new Uri(),
        fileName: 'Test',
        isUntitled: false,
        languageId: 'php',
        version: 0,
        isDirty: false,
        isClosed: false,
        save: jest.fn(),
        eol: 1, // EndOfLine.LF
        lineCount: 1,
        lineAt: jest.fn(),
        offsetAt: jest.fn(),
        positionAt: jest.fn(),
        getText: jest.fn(),
        getWordRangeAtPosition: jest.fn(),
        validateRange: jest.fn(),
        validatePosition: jest.fn()
    };
});

const MockCancellationToken = jest.fn().mockImplementation(() => {
    const listeners: (() => void)[] = [];
    const obj = {
        isCancellationRequested: false,
        onCancellationRequested: (listener: () => void) => {
            listeners.push(listener);
            return { dispose: jest.fn() }
        },
        mockCancel: () => {
            obj.isCancellationRequested = true;
            listeners.forEach((callback) => callback());
        }
    };

    return obj;
});

class CancellationError extends Error {
    public constructor() {
        super();
    }
}

const CancellationTokenSource = jest.fn().mockImplementation(() => {
    return {
        token: new MockCancellationToken(),
        cancel: jest.fn(),
        dispose: jest.fn()
    };
});

const Range = jest.fn().mockImplementation(
    (startLine: number, startCharacter: number, endLine: number, endCharacter: number ) => {
        return {
            start: {
                line: startLine,
                character: startCharacter
            },
            end: {
                line: endLine,
                character: endCharacter
            }
        };
    }
);

const Diagnostic = jest.fn().mockImplementation((range, message: string, severity ) => {
    return { range, message, severity };
});

const DiagnosticSeverity = { Error: 0, Warning: 1, Information: 2, Hint: 3 };

const MockDiagnosticCollection = jest.fn().mockImplementation(() => {
    return {
        name: 'Test',
        set: jest.fn(),
        delete: jest.fn(),
        clear: jest.fn(),
        forEach: jest.fn(),
        get: jest.fn(),
        has: jest.fn(),
        dispose: jest.fn()
    };
});

const CodeActionKind = {
    QuickFix: { value: 'quickfix' }
};

const CodeAction = jest.fn().mockImplementation((title, kind) => {
    return { title, kind };
});

const TextEdit = jest.fn().mockImplementation((range, newContent) => {
    return { range, newContent };
});

const workspace = {
    onDidChangeConfiguration: jest.fn(),
    onDidChangeWorkspaceFolders: jest.fn(),
    getWorkspaceFolder: jest.fn(),
    getConfiguration: jest.fn()
};

const languages = {
    registerCodeActionsProvider: jest.fn(),
    registerDocumentFormattingEditProvider: jest.fn(),
    registerDocumentRangeFormattingEditProvider: jest.fn()
};

export {
    MockCancellationToken,
    CancellationTokenSource,
    CancellationError,
    Uri,
    MockTextDocument,
    Range,
    Diagnostic,
    DiagnosticSeverity,
    MockDiagnosticCollection,
    CodeAction,
    CodeActionKind,
    TextEdit,
    workspace,
    languages,
};
