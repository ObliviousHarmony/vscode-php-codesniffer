import { workspace } from 'vscode';
import { Uri } from '../../__mocks__/vscode';
import { WorkspaceLocator } from '../workspace-locator';

describe('WorkspaceLocator', () => {
	let workspaceLocator: WorkspaceLocator;

	beforeEach(() => {
		workspaceLocator = new WorkspaceLocator(workspace);
	});

	afterEach(() => {
		jest.mocked(workspace).getWorkspaceFolder.mockReset();

        // @ts-ignore
        workspace.workspaceFolders = undefined;
	});

	it('should find workspace folder for uri', () => {
		const workspaceUri = new Uri();
		workspaceUri.path = 'test';
		workspaceUri.fsPath = 'test';
		jest.mocked(workspace).getWorkspaceFolder.mockReturnValue({
			uri: workspaceUri,
		} as never);

		const testUri = new Uri();
		testUri.path = 'test/test.php';
		testUri.fsPath = 'test/test.php';

		const folder = workspaceLocator.getWorkspaceFolderOrDefault(testUri);

		expect(folder.fsPath).toEqual('test');
	});

	it('should default to first workspace when uri has no workspace folder', () => {
		const workspaceUri = new Uri();
		workspaceUri.path = 'test/default';
		workspaceUri.fsPath = 'test/default';
        // @ts-ignore
        workspace.workspaceFolders = [
			{
				uri: workspaceUri,
			} as never,
		];

		const testUri = new Uri();
		testUri.path = 'test/test.php';
		testUri.fsPath = 'test/test.php';

		const folder = workspaceLocator.getWorkspaceFolderOrDefault(testUri);

		expect(folder.fsPath).toEqual('test/default');
	});

	it('should fall back to folder containing uri when there are no workspaces', () => {
		jest.mocked(workspace).getWorkspaceFolder.mockReturnValue(undefined);

		const testUri = new Uri();
		testUri.path = 'test/fallback/test.php';
		testUri.fsPath = 'test/fallback/test.php';

		const folder = workspaceLocator.getWorkspaceFolderOrDefault(testUri);

		expect(folder.fsPath).toEqual('test/fallback');
	});
});
