import { resolve as resolvePath } from 'path';
import * as child_process from 'child_process';
import { Request } from '../request';
import { ReportType } from '../response';
import { WorkerPool } from '../worker-pool';
import { StandardType } from '../../services/configuration';
import { CancellationError } from 'vscode';
import { MockCancellationToken } from '../../__mocks__/vscode';

// We need to mock the report files because Webpack is being used to bundle them.
describe('Worker/WorkerPool Integration', () => {
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
			console.log(e);
			throw new Error(
				'PHPCS could not be found at "' +
					phpcsPath +
					'". Have you ran `composer install`?'
			);
		}
	});

	test('should free worker after completion', () => {
		const pool = new WorkerPool(1);

		const promise = pool.waitForAvailable('test').then((worker) => {
			const request: Request<ReportType.Diagnostic> = {
				type: ReportType.Diagnostic,
				documentPath: 'Test.php',
				documentContent: '<?php class Test {}',
				options: {
					workingDirectory: __dirname,
					executable: phpcsPath,
					standard: StandardType.PSR12,
				},
				data: null,
			};

			const promise = worker.execute(request);
			expect(pool.freeCount).toBe(0);
			return promise;
		});

		return promise.then(() => {
			expect(pool.freeCount).toBe(1);
		});
	});

	test('should cancel worker process', async () => {
		const pool = new WorkerPool(1);

		const cancellationToken = new MockCancellationToken();

		const promise = pool.waitForAvailable('test').then((worker) => {
			const request: Request<ReportType.Diagnostic> = {
				type: ReportType.Diagnostic,
				documentPath: 'Test.php',
				documentContent: '<?php class Test {}',
				options: {
					workingDirectory: __dirname,
					executable: phpcsPath,
					standard: StandardType.PSR12,
				},
				data: null,
			};

			const promise = worker.execute(request);
			expect(pool.freeCount).toBe(0);
			return promise;
		});
		pool.waitForAvailable('test2', cancellationToken).catch((e) => {
			expect(e).toBeInstanceOf(CancellationError);
		});

		cancellationToken.mockCancel();

		// Make sure the expectations above are ran.
		expect.assertions(2);

		// Complete the first promise so that the worker becomes available.
		await promise;
	});
});
