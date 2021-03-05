import { resolve as resolvePath } from 'path';
import * as child_process from 'child_process';
import { Request } from '../request';
import { ReportType } from '../response';
import { WorkerPool } from '../worker-pool';
import { StandardType } from '../../services/configuration';
import { CancellationError } from 'vscode';
import { MockCancellationToken } from '../../__mocks__/vscode';

// We need to mock the report files because Webpack is being used to bundle them.
jest.mock('../report-files', () => {
    const phpcsDir = resolvePath(__dirname, '..', '..', '..', 'phpcs-reports');
    const includesDir = resolvePath(phpcsDir, 'includes');

    return {
        Dependencies: {
            VSCodeFile: resolvePath(includesDir, 'VSCodeFile.php'),
            VSCodeFixer: resolvePath(includesDir, 'VSCodeFixer.php'),
            VSCodeReport: resolvePath(includesDir, 'VSCodeReport.php'),
        },
        ReportFiles: {
            Diagnostic: resolvePath(phpcsDir, 'Diagnostic.php'),
            CodeAction: resolvePath(phpcsDir, 'CodeAction.php'),
            Format: resolvePath(phpcsDir, 'Format.php'),
        }
    }
});

describe('Worker/WorkerPool Integration', () => {
    let phpcsPath: string;

    beforeAll(() => {
        phpcsPath = resolvePath(__dirname, '..', '..', '..', 'vendor', 'bin', 'phpcs');

        try {
            child_process.execFileSync(phpcsPath, ['--version']);
        } catch (e) {
            throw new Error('This test requires `composer install` to be ran.')
        }
    });

    test('should free worker after completion', () => {
        const pool = new WorkerPool(1);

        const promise = pool.waitForAvailable('test')
            .then((worker) => {
                const request: Request<ReportType.Diagnostic> = {
                    type: ReportType.Diagnostic,
                    documentPath: 'Test.php',
                    documentContent: '<?php class Test {}',
                    options: {
                        workingDirectory: __dirname,
                        executable: phpcsPath,
                        standard: StandardType.PSR12
                    },
                    data: null
                }

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

        const promise = pool.waitForAvailable('test')
            .then((worker) => {
                const request: Request<ReportType.Diagnostic> = {
                    type: ReportType.Diagnostic,
                    documentPath: 'Test.php',
                    documentContent: '<?php class Test {}',
                    options: {
                        workingDirectory: __dirname,
                        executable: phpcsPath,
                        standard: StandardType.PSR12
                    },
                    data: null
                }

                const promise = worker.execute(request);
                expect(pool.freeCount).toBe(0);
                return promise;
            });
        pool.waitForAvailable('test2', cancellationToken)
            .catch((e) => {
                expect(e).toBeInstanceOf(CancellationError);
            });

        cancellationToken.mockCancel();

        // Make sure the expectations above are ran.
        expect.assertions(2);

        // Complete the first promise so that the worker becomes available.
        await promise;
    });
});
