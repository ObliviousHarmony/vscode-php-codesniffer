import { Uri } from 'vscode';

/**
 * A set for storing Uris.
 */
export class UriSet extends Set<string> {
	public has(key: Uri): boolean;
	public has(key: string): boolean;
	public has(key: Uri | string): boolean {
		if (key instanceof Uri) {
			key = key.toString();
		}

		return super.has(key);
	}

	public add(key: Uri): this;
	public add(key: string): this;
	public add(key: Uri | string): this {
		if (key instanceof Uri) {
			key = key.toString();
		}

		return super.add(key);
	}

	public delete(key: Uri): boolean;
	public delete(key: string): boolean;
	public delete(key: Uri | string): boolean {
		if (key instanceof Uri) {
			key = key.toString();
		}

		return super.delete(key);
	}
}
