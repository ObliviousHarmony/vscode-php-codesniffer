import * as child_process from 'child_process';
import { resolve as resolvePath } from 'path';
import { CancellationError } from 'vscode';
import { MockCancellationToken } from '../../__mocks__/vscode';
import { Request } from '../request';
import { ReportType } from '../response';
import { Worker } from '../worker';

// We need to mock the report files because Webpack is being used to bundle them.
describe('Worker', () => {
	let phpcsPath: string;

	beforeAll(() => {
		// Make sure the test knows where the real assets are located.
		process.env.ASSETS_PATH = resolvePath(
			__dirname,
			'..',
			'..',
			'..',
			'assets'
		);

		phpcsPath = resolvePath(
			__dirname,
			'..',
			'..',
			'..',
			'vendor',
			'bin',
			process.platform === 'win32' ? 'phpcs.bat' : 'phpcs'
		);

		try {
			child_process.execFileSync(phpcsPath, ['--version']);
		} catch (e) {
			throw new Error(
				'PHPCS could not be found at "' +
					phpcsPath +
					'". Have you ran `composer install`?'
			);
		}
	});

	it('should complete empty reports', async () => {
		const worker = new Worker();

		const request: Request<ReportType.Diagnostic> = {
			type: ReportType.Diagnostic,
			workingDirectory: __dirname,
			documentPath: 'Test.php',
			documentContent: '',
			options: {
				workingDirectory: __dirname,
				executable: phpcsPath,
				standard: 'PSR12',
			},
			data: null,
		};

		const response = await worker.execute(request);

		expect(response).toHaveProperty('type', ReportType.Diagnostic);
		expect(response).toHaveProperty('report');
		expect(response.report).toBeUndefined();
	});

	it('should execute diagnostic requests', async () => {
		const worker = new Worker();

		const request: Request<ReportType.Diagnostic> = {
			type: ReportType.Diagnostic,
			workingDirectory: __dirname,
			documentPath: 'Test.php',
			documentContent: '<?php class Test {}',
			options: {
				workingDirectory: __dirname,
				executable: phpcsPath,
				standard: 'PSR12',
			},
			data: null,
		};

		const response = await worker.execute(request);

		expect(response).toHaveProperty('type', ReportType.Diagnostic);
		expect(response).toHaveProperty('report');
		expect(response.report).not.toBeUndefined();
		expect(response.report).toHaveProperty('diagnostics');
		expect(response.report).toHaveProperty('codeActions');
	});

	it('should execute code action requests', async () => {
		const worker = new Worker();

		const request: Request<ReportType.CodeAction> = {
			type: ReportType.CodeAction,
			workingDirectory: __dirname,
			documentPath: 'Test.php',
			documentContent: '<?php class Test {}',
			options: {
				workingDirectory: __dirname,
				executable: phpcsPath,
				standard: 'PSR12',
			},
			data: {
				code: 'PSR12.Files.OpenTag.NotAlone',
				line: 0,
				character: 0,
			},
		};

		const response = await worker.execute(request);

		expect(response).toHaveProperty('type', ReportType.CodeAction);
		expect(response).toHaveProperty('report');
		expect(response.report).toHaveProperty('edits');
		expect(response.report?.edits).toMatchObject([
			{
				range: {
					start: {
						line: 0,
						character: 0,
					},
					end: {
						line: 0,
						character: 6,
					},
				},
			},
		]);
	});

	it('should execute format requests', async () => {
		const worker = new Worker();

		const request: Request<ReportType.Format> = {
			type: ReportType.Format,
			workingDirectory: __dirname,
			documentPath: 'Test.php',
			documentContent: '<?php class Test {}',
			options: {
				workingDirectory: __dirname,
				executable: phpcsPath,
				standard: 'PSR12',
			},
			data: {},
		};

		const response = await worker.execute(request);

		expect(response).toHaveProperty('type', ReportType.Format);
		expect(response).toHaveProperty('report');
		expect(response.report).toHaveProperty('content');
	});

	it('should support execute cancellation', async () => {
		const worker = new Worker();

		const request: Request<ReportType.Diagnostic> = {
			type: ReportType.Diagnostic,
			workingDirectory: __dirname,
			documentPath: 'Test.php',
			documentContent: '<?php class Test {}',
			options: {
				workingDirectory: __dirname,
				executable: phpcsPath,
				standard: 'PSR12',
			},
			data: null,
		};
		const cancellationToken = new MockCancellationToken();

		const promise = worker.execute(request, cancellationToken);

		// Cancel the worker's execution.
		cancellationToken.mockCancel();

		return expect(promise).rejects.toStrictEqual(new CancellationError());
	});

	it('should support active change callback', async () => {
		const onActiveChanged = jest.fn();

		const worker = new Worker(onActiveChanged);

		const request: Request<ReportType.Diagnostic> = {
			type: ReportType.Diagnostic,
			workingDirectory: __dirname,
			documentPath: 'Test.php',
			documentContent: '<?php class Test {}',
			options: {
				workingDirectory: __dirname,
				executable: phpcsPath,
				standard: 'PSR12',
			},
			data: null,
		};

		await worker.execute(request);

		expect(onActiveChanged).toHaveBeenCalledTimes(2);
		expect(onActiveChanged).toHaveBeenLastCalledWith(worker);
	});

	it('should support executables with spaces', async () => {
		const worker = new Worker();

		const request: Request<ReportType.Diagnostic> = {
			type: ReportType.Diagnostic,
			workingDirectory: __dirname,
			documentPath: 'Test.php',
			documentContent: '<?php class Test {}',
			options: {
				workingDirectory: __dirname,
				// Since we use custom reports, adding `-s` for sources won't break anything.
				executable: phpcsPath + ' -s',
				standard: 'PSR12',
			},
			data: null,
		};

		const response = await worker.execute(request);

		expect(response).toHaveProperty('type', ReportType.Diagnostic);
		expect(response).toHaveProperty('report');
		expect(response.report).not.toBeUndefined();
	});
});
