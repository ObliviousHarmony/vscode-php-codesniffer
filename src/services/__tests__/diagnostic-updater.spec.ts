import {
	Diagnostic,
	DiagnosticCollection,
	workspace,
	window,
	Range,
	DiagnosticSeverity,
	CodeActionKind,
} from 'vscode';
import { CodeAction, CodeActionCollection } from '../../types';
import { Configuration, StandardType } from '../../services/configuration';
import { WorkerPool } from '../../phpcs-report/worker-pool';
import { DiagnosticUpdater } from '../diagnostic-updater';
import {
	MockDiagnosticCollection,
	MockTextDocument,
} from '../../__mocks__/vscode';
import { mocked } from 'ts-jest/utils';
import { Worker } from '../../phpcs-report/worker';
import { ReportType, Response } from '../../phpcs-report/response';
import { Logger } from '../../services/logger';
import { LinterStatus } from '../linter-status';

jest.mock('../../phpcs-report/report-files', () => {
	return {
		Dependencies: {
			VSCodeFile: 'VSCodeFile.php',
			VSCodeFixer: 'VSCodeFixer.php',
			VSCodeReport: 'VSCodeReport.php',
		},
		ReportFiles: {
			Diagnostic: 'Diagnostic.php',
			CodeAction: 'CodeAction.php',
			Format: 'Format.php',
		},
	};
});
jest.mock('../logger');
jest.mock('../linter-status');
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
	let mockConfiguration: Configuration;
	let mockWorkerPool: WorkerPool;
	let mockLinterStatus: LinterStatus;
	let mockDiagnosticCollection: DiagnosticCollection;
	let mockCodeActionCollection: CodeActionCollection;
	let diagnosticUpdater: DiagnosticUpdater;

	beforeEach(() => {
		mockLogger = new Logger(window);
		mockConfiguration = new Configuration(workspace);
		mockWorkerPool = new WorkerPool(1);
		mockLinterStatus = new LinterStatus(window);
		mockDiagnosticCollection = new MockDiagnosticCollection();
		mockCodeActionCollection = new CodeActionCollection();

		diagnosticUpdater = new DiagnosticUpdater(
			mockLogger,
			mockConfiguration,
			mockWorkerPool,
			mockLinterStatus,
			mockDiagnosticCollection,
			mockCodeActionCollection
		);
	});

	it('should update diagnostics and code actions', async (done) => {
		const document = new MockTextDocument();
		document.fileName = 'test-document';

		const mockWorker = new Worker();
		mocked(mockWorkerPool).waitForAvailable.mockImplementation(
			(workerKey) => {
				expect(workerKey).toBe('diagnostic:test-document');
				return Promise.resolve(mockWorker);
			}
		);
		mocked(mockConfiguration).get.mockResolvedValue({
			workingDirectory: 'test-dir',
			executable: 'phpcs-test',
			ignorePatterns: [],
			standard: StandardType.PSR12,
		});
		mocked(mockWorker).execute.mockImplementation((request) => {
			expect(request).toMatchObject({
				type: ReportType.Diagnostic,
				options: {
					workingDirectory: 'test-dir',
					executable: 'phpcs-test',
					standard: StandardType.PSR12,
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

			// Wait for the updater to process the result before completing the test.
			setTimeout(() => {
				expect(mockDiagnosticCollection.set).toHaveBeenCalled();
				expect(mockCodeActionCollection.set).toHaveBeenCalled();
				done();
			}, 5);

			return Promise.resolve(response);
		});

		diagnosticUpdater.update(document);
	});

	it('should respect ignore patterns', () => {
		const document = new MockTextDocument();
		document.fileName = 'test-document';

		mocked(mockConfiguration).get.mockResolvedValue({
			workingDirectory: 'test-dir',
			executable: 'phpcs-test',
			ignorePatterns: [new RegExp('.*/file/.*')],
			lintAction: LintAction.Change,
			standard: StandardType.PSR12,
		});

		return diagnosticUpdater.update(document);
	});
});
