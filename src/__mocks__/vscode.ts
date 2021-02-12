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
        lineCount: 1,
        getText: jest.fn(),
    }
});

const CancellationTokenSource = jest.fn().mockImplementation(() => {
    return {
        isCancellationRequested: false,
        onCancellationRequested: jest.fn()
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
    CancellationTokenSource,
    Uri,
    MockTextDocument,
    Range,
    Diagnostic,
    DiagnosticSeverity,
    CodeAction,
    CodeActionKind,
    TextEdit,
    workspace,
    languages,
};
