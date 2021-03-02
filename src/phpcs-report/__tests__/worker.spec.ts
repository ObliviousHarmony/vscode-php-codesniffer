import * as child_process from 'child_process';
import { resolve as resolvePath } from 'path';
import { CancellationError } from 'vscode';
import { StandardType } from '../../configuration';
import { MockCancellationToken } from '../../__mocks__/vscode';
import { Request } from '../request';
import { ReportType } from '../response';
import { Worker } from '../worker';

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

describe('Worker', () => {
    let phpcsPath: string;

    beforeAll(() => {
        phpcsPath = resolvePath(__dirname, '..', '..', '..', 'vendor', 'bin', 'phpcs');

        try {
            child_process.execFileSync(phpcsPath, ['--version']);
        } catch (e) {
            throw new Error('This test requires `composer install` to be ran.')
        }
    });

    it('should complete empty reports', async () => {
        const worker = new Worker();

        const request: Request<ReportType.Diagnostic> = {
            type: ReportType.Diagnostic,
            documentPath: 'Test.php',
            documentContent: '',
            options: {
                workingDirectory: __dirname,
                executable: phpcsPath,
                standard: StandardType.PSR12
            },
            data: null
        }

        const response = await worker.execute(request);

        expect(response).toHaveProperty('type', ReportType.Diagnostic);
        expect(response).toHaveProperty('report');
        expect(response.report).toBeUndefined();
    });

    it('should execute diagnostic requests', async () => {
        const worker = new Worker();

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
            documentPath: 'Test.php',
            documentContent: '<?php class Test {}',
            options: {
                workingDirectory: __dirname,
                executable: phpcsPath,
                standard: StandardType.PSR12
            },
            data: {
                code: 'PSR12.Files.OpenTag.NotAlone',
                line: 0,
                character: 0
            }
        }

        const response = await worker.execute(request);

        expect(response).toHaveProperty('type', ReportType.CodeAction);
        expect(response).toHaveProperty('report');
        expect(response.report).toHaveProperty('edits');
        expect(response.report?.edits).toMatchObject([
            {
                range: {
                    start: {
                        line: 0,
                        character: 0
                    },
                    end: {
                        line: 0,
                        character: 6
                    }
                }
            }
        ]);
    });

    it('should execute format requests', async () => {
        const worker = new Worker();

        const request: Request<ReportType.Format> = {
            type: ReportType.Format,
            documentPath: 'Test.php',
            documentContent: '<?php class Test {}',
            options: {
                workingDirectory: __dirname,
                executable: phpcsPath,
                standard: StandardType.PSR12
            },
            data: {}
        }

        const response = await worker.execute(request);

        expect(response).toHaveProperty('type', ReportType.Format);
        expect(response).toHaveProperty('report');
        expect(response.report).toHaveProperty('content');
    });

    it('should support execute cancellation', async () => {
        const worker = new Worker();

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
            documentPath: 'Test.php',
            documentContent: '<?php class Test {}',
            options: {
                workingDirectory: __dirname,
                executable: phpcsPath,
                standard: StandardType.PSR12
            },
            data: null
        }

        await worker.execute(request);

        expect(onActiveChanged).toHaveBeenCalledTimes(2);
        expect(onActiveChanged).toHaveBeenLastCalledWith(worker);
    });
});
