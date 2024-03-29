const uriToString = (uri: any): string => {
	let str = uri.scheme + '://' + uri.path;
	if (uri.query) {
		str += '?' + uri.query;
	}
	if (uri.fragment) {
		str += '#' + uri.fragment;
	}
	return str;
};
const Uri: any = jest.fn().mockImplementation(() => {
	const created = {
		scheme: 'file',
		authority: '',
		path: 'test/file/path.php',
		query: '',
		fragment: '',
		fsPath: 'test/file/path.php',
		toString: () => uriToString(created),
	};
	return created;
});

Uri.joinPath = jest
	.fn()
	.mockImplementation((uri: any, ...pathSegments: string[]) => {
		const uriSegments = uri.path.split('/');

		for (const seg of pathSegments) {
			if (seg === '.') {
				continue;
			}

			if (seg === '..') {
				uriSegments.pop();
				continue;
			}

			uriSegments.push(seg);
		}

		if (uriSegments.length <= 0) {
			uriSegments.push(process.platform === 'win32' ? 'c:/' : '/');
		}

		const path = uriSegments.join('/');

		const created = {
			scheme: uri.scheme,
			authority: '',
			fragment: '',
			path: path,
			query: '',
			fsPath: path,
			toString: () => uriToString(created),
		};
		return created;
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
		validatePosition: jest.fn(),
	};
});

const MockCancellationToken = jest.fn().mockImplementation(() => {
	const listeners: (() => void)[] = [];
	const obj = {
		isCancellationRequested: false,
		onCancellationRequested: (listener: () => void) => {
			listeners.push(listener);
			return { dispose: jest.fn() };
		},
		mockCancel: () => {
			obj.isCancellationRequested = true;
			listeners.forEach((callback) => callback());
		},
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
		dispose: jest.fn(),
	};
});

const Range = jest
	.fn()
	.mockImplementation(
		(
			startLine: number,
			startCharacter: number,
			endLine: number,
			endCharacter: number
		) => {
			return {
				start: {
					line: startLine,
					character: startCharacter,
				},
				end: {
					line: endLine,
					character: endCharacter,
				},
			};
		}
	);

const Diagnostic = jest
	.fn()
	.mockImplementation((range, message: string, severity) => {
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
		dispose: jest.fn(),
	};
});

const CodeActionKind = {
	QuickFix: { value: 'quickfix' },
};

const CodeAction = jest.fn().mockImplementation((title, kind) => {
	return { title, kind };
});

const TextEdit = jest.fn().mockImplementation((range, newContent) => {
	return { range, newContent };
});

class FileSystemError extends Error {
	public readonly code: string;

	public constructor(messageOrUri: string | typeof Uri) {
		super(messageOrUri.toString());

		this.code = '';
	}
}

const workspace = {
	onDidChangeConfiguration: jest.fn(),
	onDidChangeWorkspaceFolders: jest.fn(),
	getWorkspaceFolder: jest.fn(),
	getConfiguration: jest.fn(),
	fs: {
		readFile: jest.fn(),
		stat: jest.fn(),
	},
};

const languages = {
	registerCodeActionsProvider: jest.fn(),
	registerDocumentFormattingEditProvider: jest.fn(),
	registerDocumentRangeFormattingEditProvider: jest.fn(),
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
	FileSystemError,
	workspace,
	languages,
};
