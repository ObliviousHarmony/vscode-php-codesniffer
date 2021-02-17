import { TextDocument, workspace, Uri as vsCodeUri } from 'vscode';
import { MockTextDocument, Uri } from '../__mocks__/vscode';
import { mocked } from 'ts-jest/utils';
import { Configuration, StandardType } from '../configuration';

describe('Configuration', () => {
    let mockDocument: TextDocument;
    let configuration: Configuration;

    beforeAll(() => {
        // Create a mock implementation that can create joined paths.
        mocked(Uri.joinPath).mockImplementation((uri: vsCodeUri, ...pathSegments: string[]) => {
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

            const path = uriSegments.join('/');
            return {
                path: path,
                fsPath: path,
                toString: () => path
            };
        });
    });

    beforeEach(() => {
        mockDocument = new MockTextDocument();
        configuration = new Configuration(workspace);
    });

    afterEach(() => {
        mocked(workspace.getConfiguration).mockClear();
        mocked(workspace.getWorkspaceFolder).mockClear();
    });

    it('should read and cache configuration for document', async () => {
        const mockConfiguration = { get: jest.fn() };
        mocked(workspace).getConfiguration.mockReturnValue(mockConfiguration as never);

        mockConfiguration.get.mockImplementation((key) => {
            switch (key) {
                case 'standard': return StandardType.Disabled;
                case 'executable': return 'test.exec';
                case 'autoExecutable': return false;
            }

            fail('An unexpected configuration key of ' + key + ' was received.')
        });

        const result = await configuration.get(mockDocument);

        expect(workspace.getConfiguration).toHaveBeenCalledWith('phpCodeSniffer', mockDocument);
        expect(result).toMatchObject({
            executable: 'test.exec',
            standard: StandardType.Disabled,
            workingDirectory: 'test/file'
        });

        // Make sure that a subsequent fetch loads a cached instance.
        const cached = await configuration.get(mockDocument);

        expect(workspace.getConfiguration).toHaveBeenCalledTimes(1);
        expect(cached).toMatchObject(result);
    });

    it('should read filesystem for executable when enabled', async () => {
        const mockConfiguration = { get: jest.fn() };
        mocked(workspace).getConfiguration.mockReturnValue(mockConfiguration as never);

        const workspaceUri = new Uri();
        workspaceUri.path = 'test';
        workspaceUri.fsPath = 'test';
        mocked(workspace).getWorkspaceFolder.mockReturnValue({ uri: workspaceUri } as never);

        // We will traverse from the file directory up.
        mocked(workspace.fs.stat).mockImplementation((uri) => {
            switch (uri.path) {
                case 'test/file/vendor/bin/phpcs': return Promise.reject(new Error('No file found'));
                case 'test/vendor/bin/phpcs': {
                    const ret = new Uri();
                    ret.path = 'test';
                    ret.fsPath = 'test';
                    return Promise.resolve(ret);
                }
            }

            throw new Error('Invalid path: ' + uri.path);
        });

        mockConfiguration.get.mockImplementation((key) => {
            switch (key) {
                case 'standard': return StandardType.Disabled;
                case 'executable': return 'test.exec';
                case 'autoExecutable': return true;
            }

            fail('An unexpected configuration key of ' + key + ' was received.')
        });

        const result = await configuration.get(mockDocument);

        expect(workspace.getConfiguration).toHaveBeenCalledWith('phpCodeSniffer', mockDocument);
        expect(result).toMatchObject({
            executable: 'test/vendor/bin/phpcs',
            standard: StandardType.Disabled,
            workingDirectory: 'test'
        });

        // Make sure that a subsequent fetch loads a cached instance.
        const cached = await configuration.get(mockDocument);

        expect(workspace.getConfiguration).toHaveBeenCalledTimes(1);
        expect(cached).toMatchObject(result);
    });
});
