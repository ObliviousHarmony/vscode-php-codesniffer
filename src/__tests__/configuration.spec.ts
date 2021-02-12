import { TextDocument, workspace } from 'vscode';
import { MockTextDocument } from '../__mocks__/vscode';
import { mocked } from 'ts-jest/utils';
import { Configuration, StandardType } from '../configuration';

describe('Configuration', () => {
    let mockDocument: TextDocument;
    let configuration: Configuration;

    beforeEach(() => {
        mockDocument = new MockTextDocument();
        configuration = new Configuration(workspace);
    });

    it('should read and cache configuration for document', () => {
        const mockConfiguration = { get: jest.fn() };
        mocked(workspace).getConfiguration.mockReturnValue(mockConfiguration as never);

        mockConfiguration.get.mockImplementation((key) => {
            switch (key) {
                case 'standard': return StandardType.Disabled;
                case 'executable': return 'test.exec';
            }

            fail('An unexpected configuration key of ' + key + ' was received.')
        });

        const result = configuration.get(mockDocument);

        expect(workspace.getConfiguration).toHaveBeenCalledWith('phpCodeSniffer', mockDocument);
        expect(result).toMatchObject({
            executable: 'test.exec',
            standard: StandardType.Disabled,
            workingDirectory: 'test/path.php'
        });

        // Make sure that a subsequent fetch loads a cached instance.
        const cached = configuration.get(mockDocument);

        expect(workspace.getConfiguration).toHaveBeenCalledTimes(1);
        expect(cached).toMatchObject(result);
    });
});
