import {
	Diagnostic,
	DiagnosticCollection,
	workspace,
	window,
	Range,
	DiagnosticSeverity,
	CodeActionKind,
} from 'vscode';
import { resolve as resolvePath } from 'path';
import { CodeAction, CodeActionCollection } from '../../types';
import { Configuration, LintAction } from '../../services/configuration';
import { WorkerPool } from '../../phpcs-report/worker-pool';
import { DiagnosticUpdater } from '../diagnostic-updater';
import {
	MockDiagnosticCollection,
	MockTextDocument,
	Uri,
} from '../../__mocks__/vscode';
import { PHPCSError, Worker } from '../../phpcs-report/worker';
import { ReportType, Response } from '../../phpcs-report/response';
import { Logger } from '../../services/logger';
import { LinterStatus } from '../linter-status';
import { WorkspaceLocator } from '../workspace-locator';

jest.mock('../logger');
jest.mock('../linter-status');
jest.mock('../workspace-locator');
jest.mock('../configuration');
jest.mock('../../phpcs-report/worker');
jest.mock('../../phpcs-report/worker-pool');
jest.mock('../../types', () => {
	return {
		CodeAction: jest.fn().mockImplementation((title, kind) => {
			return { title, kind };
		}),
		CodeActionCollection: jest.fn().mockImplementation(() => {
			return {
				set: jest.fn(),
				delete: jest.fn(),
			};
		}),
	};
});

describe('DiagnosticUpdater', () => {
	let mockLogger: Logger;
	let mockWorkspaceLocator: WorkspaceLocator;
	let mockConfiguration: Configuration;
	let mockWorkerPool: WorkerPool;
	let mockLinterStatus: LinterStatus;
	let mockDiagnosticCollection: DiagnosticCollection;
	let mockCodeActionCollection: CodeActionCollection;
	let diagnosticUpdater: DiagnosticUpdater;

	beforeEach(() => {
		// Make sure the test knows where the real assets are located.
		process.env.ASSETS_PATH = resolvePath(
			__dirname,
			'..',
			'..',
			'..',
			'assets'
		);

		mockLogger = new Logger(window);
		mockWorkspaceLocator = new WorkspaceLocator(workspace);
		mockConfiguration = new Configuration(workspace, mockWorkspaceLocator);
		mockWorkerPool = new WorkerPool(1);
		mockLinterStatus = new LinterStatus(window);
		mockDiagnosticCollection = new MockDiagnosticCollection();
		mockCodeActionCollection = new CodeActionCollection();

		diagnosticUpdater = new DiagnosticUpdater(
			mockLogger,
			mockWorkspaceLocator,
			mockConfiguration,
			mockWorkerPool,
			mockLinterStatus,
			mockDiagnosticCollection,
			mockCodeActionCollection
		);
	});

	it('should update diagnostics and code actions', (done) => {
		const document = new MockTextDocument();
		document.fileName = 'test-document';

		const mockWorker = new Worker();
		jest.mocked(mockWorkerPool).waitForAvailable.mockImplementation(
			(workerKey) => {
				expect(workerKey).toBe('diagnostic:test-document');
				return Promise.resolve(mockWorker);
			}
		);
		const workspaceUri = new Uri();
		workspaceUri.path = 'test-dir';
		workspaceUri.fsPath = 'test-dir';
		jest.mocked(
			mockWorkspaceLocator
		).getWorkspaceFolderOrDefault.mockReturnValue(workspaceUri);
		jest.mocked(mockConfiguration).get.mockResolvedValue({
			executable: 'phpcs-test',
			exclude: [],
			lintAction: LintAction.Change,
			standard: 'PSR12',
		});
		jest.mocked(mockWorker).execute.mockImplementation((request) => {
			expect(request).toMatchObject({
				type: ReportType.Diagnostic,
				workingDirectory: 'test-dir',
				options: {
					executable: 'phpcs-test',
					standard: 'PSR12',
				},
			});

			const response: Response<ReportType.Diagnostic> = {
				type: ReportType.Diagnostic,
				report: {
					diagnostics: [
						new Diagnostic(
							new Range(0, 1, 2, 3),
							'Test',
							DiagnosticSeverity.Error
						),
					],
					codeActions: [
						new CodeAction('Test', CodeActionKind.QuickFix),
					],
				},
			};

			return Promise.resolve(response);
		});

		// Wait for the updater to process the result before completing the test.
		setTimeout(() => {
			expect(mockDiagnosticCollection.set).toHaveBeenCalled();
			expect(mockCodeActionCollection.set).toHaveBeenCalled();
			done();
		}, 5);

		diagnosticUpdater.update(document, LintAction.Force);
	});

	it('should log PHPCS errors', (done) => {
		const document = new MockTextDocument();
		document.fileName = 'test-document';

		const mockWorker = new Worker();
		jest.mocked(mockWorkerPool).waitForAvailable.mockImplementation(
			(workerKey) => {
				expect(workerKey).toBe('diagnostic:test-document');
				return Promise.resolve(mockWorker);
			}
		);
		const workspaceUri = new Uri();
		workspaceUri.path = 'test-dir';
		workspaceUri.fsPath = 'test-dir';
		jest.mocked(
			mockWorkspaceLocator
		).getWorkspaceFolderOrDefault.mockReturnValue(workspaceUri);
		jest.mocked(mockConfiguration).get.mockResolvedValue({
			executable: 'phpcs-test',
			exclude: [],
			lintAction: LintAction.Change,
			standard: 'PSR12',
		});
		jest.mocked(mockWorker).execute.mockImplementation((request) => {
			expect(request).toMatchObject({
				type: ReportType.Diagnostic,
				workingDirectory: 'test-dir',
				options: {
					executable: 'phpcs-test',
					standard: 'PSR12',
				},
			});

			throw new PHPCSError('Test Failure', 'Test Failure');
		});

		// Wait for the updater to process the result before completing the test.
		setTimeout(() => {
			expect(mockLogger.error).toHaveBeenCalled();
			done();
		}, 5);

		diagnosticUpdater.update(document, LintAction.Force);
	});

	it('should respect exclude patterns', () => {
		const document = new MockTextDocument();
		document.fileName = 'test-document';

		jest.mocked(mockConfiguration).get.mockResolvedValue({
			executable: 'phpcs-test',
			exclude: [new RegExp('.*/file/.*')],
			lintAction: LintAction.Change,
			standard: 'PSR12',
		});

		return diagnosticUpdater.update(document, LintAction.Force);
	});

	it('should not update on change when configured to save', () => {
		const document = new MockTextDocument();
		document.fileName = 'test-document';

		jest.mocked(mockConfiguration).get.mockResolvedValue({
			executable: 'phpcs-test',
			exclude: [],
			lintAction: LintAction.Save,
			standard: 'PSR12',
		});

		return diagnosticUpdater.update(document, LintAction.Change);
	});
});
