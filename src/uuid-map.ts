import type DayOneImporter from './main';

const UUID_MAP_KEY = 'uuidMap';

export interface UuidMapStore {
	read(): Promise<Record<string, string>>;
	write(map: Record<string, string>): Promise<void>;
	clear(): Promise<void>;
}

export class UuidMapStoreImpl implements UuidMapStore {
	private plugin: DayOneImporter;

	constructor(plugin: DayOneImporter) {
		this.plugin = plugin;
	}

	async read(): Promise<Record<string, string>> {
		const data = await this.plugin.loadData();
		return data?.[UUID_MAP_KEY] ?? {};
	}

	async write(map: Record<string, string>): Promise<void> {
		const data = (await this.plugin.loadData()) ?? {};
		data[UUID_MAP_KEY] = map;
		await this.plugin.saveData(data);
	}

	async clear(): Promise<void> {
		const data = (await this.plugin.loadData()) ?? {};
		delete data[UUID_MAP_KEY];
		await this.plugin.saveData(data);
	}
}
