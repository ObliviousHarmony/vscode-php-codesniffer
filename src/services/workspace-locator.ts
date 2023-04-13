import { Uri, workspace as vsCodeWorkspace } from 'vscode';

export class WorkspaceLocator {
	/**
	 * The workspace we will locate things in.
	 */
	private readonly workspace: typeof vsCodeWorkspace;

	/**
	 * Constructor.
	 *
	 * @param {workspace} workspace The workspace we are handling.
	 */
	public constructor(workspace: typeof vsCodeWorkspace) {
		this.workspace = workspace;
	}

	/**
	 * Fetches the workspace folder of a uri or the folder immediately enclosing it.
	 *
	 * @param {Uri} uri The uri to look for.
	 */
	public getWorkspaceFolderOrDefault(uri: Uri): Uri {
		const folder = this.workspace.getWorkspaceFolder(uri);
		if (folder) {
			return folder.uri;
		}

		// Default to the first workspace when the uri is not associated with one.
		if (
			this.workspace.workspaceFolders &&
			this.workspace.workspaceFolders.length > 0
		) {
			return this.workspace.workspaceFolders[0].uri;
		}

		// When we can't infer a path just use the folder of the uri.
		return Uri.joinPath(uri, '..');
	}
}
