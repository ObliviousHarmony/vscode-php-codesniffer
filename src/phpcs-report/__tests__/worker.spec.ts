import * as child_process from 'child_process';
import { resolve as resolvePath } from 'path';
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

    it('should complete empty reports', (done) => {
        const worker = new Worker();

        const request: Request<ReportType.Diagnostic> = {
            type: ReportType.Diagnostic,
            documentContent: '',
            options: {
                workingDirectory: __dirname,
                executable: phpcsPath,
                standard: 'psr12'
            },
            data: null,
            onComplete: (response) => {
                expect(response).toHaveProperty('type', ReportType.Diagnostic);
                expect(response).toHaveProperty('report');
                expect(response.report).toBeUndefined();
                done();
            }
        }
        worker.execute(request);
    });

    it('should execute diagnostic requests', (done) => {
        const worker = new Worker();

        const request: Request<ReportType.Diagnostic> = {
            type: ReportType.Diagnostic,
            documentContent: '<?php class Test {}',
            options: {
                workingDirectory: __dirname,
                executable: phpcsPath,
                standard: 'psr12'
            },
            data: null,
            onComplete: (response) => {
                expect(response).toHaveProperty('type', ReportType.Diagnostic);
                expect(response).toHaveProperty('report');
                expect(response.report).not.toBeUndefined();
                expect(response.report).toHaveProperty('diagnostics');
                expect(response.report).toHaveProperty('codeActions');
                done();
            }
        }
        worker.execute(request);
    });

    it('should execute code action requests', (done) => {
        const worker = new Worker();

        const request: Request<ReportType.CodeAction> = {
            type: ReportType.CodeAction,
            documentContent: '<?php class Test {}',
            options: {
                workingDirectory: __dirname,
                executable: phpcsPath,
                standard: 'psr12'
            },
            data: {
                code: 'PSR12.Files.OpenTag.NotAlone',
                line: 0,
                character: 0
            },
            onComplete: (response) => {
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
                done();
            }
        }
        worker.execute(request);
    });

    it('should execute format requests', (done) => {
        const worker = new Worker();

        const request: Request<ReportType.Format> = {
            type: ReportType.Format,
            documentContent: '<?php class Test {}',
            options: {
                workingDirectory: __dirname,
                executable: phpcsPath,
                standard: 'psr12'
            },
            data: {},
            onComplete: (response) => {
                expect(response).toHaveProperty('type', ReportType.Format);
                expect(response).toHaveProperty('report');
                expect(response.report).toHaveProperty('content');
                done();
            }
        }
        worker.execute(request);
    });

    it('should support execute cancellation', (done) => {
        const worker = new Worker();

        const mockOnComplete = jest.fn();
        const request: Request<ReportType.Diagnostic> = {
            type: ReportType.Diagnostic,
            documentContent: '<?php class Test {}',
            options: {
                workingDirectory: __dirname,
                executable: phpcsPath,
                standard: 'psr12'
            },
            data: null,
            onComplete: mockOnComplete
        }
        const cancellationToken = new MockCancellationToken();
        worker.execute(request, cancellationToken);

        // Cancel the worker's execution.
        cancellationToken.isCancellationRequested = true;

        // Let the event loop run so that we can process the cancellation.
        setTimeout(() => {
            expect(mockOnComplete).not.toHaveBeenCalled();
            expect(cancellationToken.onCancellationRequested).toHaveBeenCalled();
            expect(worker.isActive).toBe(false);
            done();
        }, 150);
    });

    it('should support active change callback', (done) => {
        const onActiveChanged = jest.fn();

        const worker = new Worker(onActiveChanged);

        const request: Request<ReportType.Diagnostic> = {
            type: ReportType.Diagnostic,
            documentContent: '<?php class Test {}',
            options: {
                workingDirectory: __dirname,
                executable: phpcsPath,
                standard: 'psr12'
            },
            data: null,
            onComplete: () => {
                // Wait for it to call the other handlers.
                setTimeout(() => {
                    expect(onActiveChanged).toHaveBeenCalledTimes(2);
                    expect(onActiveChanged).toHaveBeenLastCalledWith(worker);
                    done();
                }, 10);
            }
        }
        worker.execute(request);
        expect(onActiveChanged).toHaveBeenCalledWith(worker);
    });
});
