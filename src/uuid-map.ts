import { Plugin } from 'obsidian';

const UUID_MAP_FILENAME = 'uuids.json';

export interface UuidMapStore {
	read(): Promise<Record<string, string>>;
	write(map: Record<string, string>): Promise<void>;
}

export class UuidMapStoreImpl implements UuidMapStore {
	constructor(private plugin: Plugin) {}

	private getUuidMapPath(): string {
		// Use manifest.dir which points to the actual plugin folder
		const dir = this.plugin.manifest.dir;
		if (!dir) {
			throw new Error('Plugin directory not available');
		}
		return `${dir}/${UUID_MAP_FILENAME}`;
	}

	async read(): Promise<Record<string, string>> {
		const filePath = this.getUuidMapPath();
		const data = await this.plugin.app.vault.adapter.read(filePath);
		return JSON.parse(data);
	}

	async write(map: Record<string, string>): Promise<void> {
		const filePath = this.getUuidMapPath();
		const data = JSON.stringify(map, null, 2);
		await this.plugin.app.vault.adapter.write(filePath, data);
	}
}
