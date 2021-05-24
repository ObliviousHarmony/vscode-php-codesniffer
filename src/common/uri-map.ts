import { Uri } from 'vscode';

/**
 * A map for storing data keyed by a Uri.
 */
export class UriMap<V> extends Map<string, V> {
	public has(key: Uri): boolean;
	public has(key: string): boolean;
	public has(key: Uri | string): boolean {
		if (key instanceof Uri) {
			key = key.toString();
		}

		return super.has(key);
	}

	public set(key: Uri, value: V): this;
	public set(key: string, value: V): this;
	public set(key: Uri | string, value: V): this {
		if (key instanceof Uri) {
			key = key.toString();
		}

		return super.set(key, value);
	}

	public get(key: Uri): V | undefined;
	public get(key: string): V | undefined;
	public get(key: Uri | string): V | undefined {
		if (key instanceof Uri) {
			key = key.toString();
		}

		return super.get(key);
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
