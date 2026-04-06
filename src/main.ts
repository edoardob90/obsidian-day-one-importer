import {
	Events,
	Modal,
	Plugin,
	Notice,
	Setting,
	TFolder,
	TFile,
} from 'obsidian';
import { SettingsTab } from './settings-tab';
import { UuidMapStoreImpl } from './uuid-map';
import { ImportResult, resolveInternalLinks } from './utils';
import { importJson } from './import-json';
import { normalizeEntries } from './normalize';
import { DateTime } from 'luxon';

export type TagStyle =
	| 'camelCase'
	| 'PascalCase'
	| 'snake_case'
	| 'kebab-case'
	| undefined;

export interface DayOneImporterSettings {
	inDirectory: string;
	filePattern: string;
	filePatternMode: 'include' | 'exclude';
	outDirectory: string;
	dateBasedFileNames: boolean;
	dateBasedFileNameFormat: string;
	dateBasedAllDayFileNameFormat: string;
	localizedDateMode: 'none' | 'event' | 'local';
	ignoreExistingFiles: boolean;
	separateCoordinateFields: boolean;
	enableInternalLinks: boolean;
	tagStyle?: TagStyle;
	journalTagPrefix: string;
	normalizeScanFolder: string;
	normalizeConflictResolution: 'keep-migrated' | 'keep-imported';
}

export const DEFAULT_SETTINGS: DayOneImporterSettings = {
	inDirectory: 'day-one-in',
	filePattern: '',
	filePatternMode: 'include',
	outDirectory: 'day-one-out',
	dateBasedFileNames: false,
	dateBasedFileNameFormat: 'yyyy-MM-dd HHmmss',
	dateBasedAllDayFileNameFormat: 'yyyy-MM-dd',
	localizedDateMode: 'none',
	ignoreExistingFiles: false,
	separateCoordinateFields: false,
	enableInternalLinks: false,
	tagStyle: undefined,
	journalTagPrefix: '',
	normalizeScanFolder: '',
	normalizeConflictResolution: 'keep-migrated',
};

class ConfirmModal extends Modal {
	private message: string;
	private onConfirm: () => void;

	constructor(
		app: import('obsidian').App,
		message: string,
		onConfirm: () => void
	) {
		super(app);
		this.message = message;
		this.onConfirm = onConfirm;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl('p', { text: this.message });

		new Setting(contentEl)
			.addButton((btn) =>
				btn
					.setButtonText('Continue')
					.setCta()
					.onClick(() => {
						this.close();
						this.onConfirm();
					})
			)
			.addButton((btn) =>
				btn.setButtonText('Cancel').onClick(() => this.close())
			);
	}

	onClose() {
		this.contentEl.empty();
	}
}

export default class DayOneImporter extends Plugin {
	settings!: DayOneImporterSettings;
	importEvents = new Events();
	uuidMapStore!: UuidMapStoreImpl;

	async onload() {
		await this.loadSettings();
		this.uuidMapStore = new UuidMapStoreImpl(this);
		this.addSettingTab(new SettingsTab(this.app, this));

		this.addCommand({
			id: 'import-day-one',
			name: 'Import from Day One',
			callback: () => {
				new ConfirmModal(
					this.app,
					`This will import Day One entries into "${this.settings.outDirectory}". This will modify your vault data.`,
					async () => {
						try {
							const res = await importJson(
								this.app.vault,
								this.settings,
								this.app.fileManager,
								this.importEvents,
								this.uuidMapStore
							);
							await this.handleImportResult(res);
						} catch (err) {
							new Notice(err instanceof Error ? err.message : String(err));
						}
					}
				).open();
			},
		});

		this.addCommand({
			id: 'resolve-internal-links',
			name: 'Resolve internal links',
			callback: () => {
				new ConfirmModal(
					this.app,
					`This will scan notes in "${this.settings.outDirectory}" and resolve Day One internal links. This will modify your vault data.`,
					async () => {
						await this.resolveInternalLinksInNotes();
					}
				).open();
			},
		});

		this.addCommand({
			id: 'normalize-entries',
			name: 'Normalize entries',
			callback: () => {
				const folder = this.settings.normalizeScanFolder || 'entire vault';
				new ConfirmModal(
					this.app,
					`This will normalize entries in "${folder}". Files may be moved, modified, or deleted. This will modify your vault data.`,
					async () => {
						try {
							const res = await normalizeEntries(
								this.app.vault,
								this.app.fileManager,
								this.settings,
								this.uuidMapStore
							);
							new Notice(
								`Normalize results:\n` +
									`Deleted: ${res.deleted}\nNormalized: ${res.normalized}\nSkipped: ${res.skipped}\nErrors: ${res.errors.length}` +
									(res.renameFailures > 0
										? `\nRename failures: ${res.renameFailures}`
										: '')
							);
						} catch (err) {
							new Notice(err instanceof Error ? err.message : String(err));
						}
					}
				).open();
			},
		});
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async resolveInternalLinksInNotes(): Promise<void> {
		if (!this.settings.enableInternalLinks) {
			new Notice('Internal link resolving is disabled in settings.');
			return;
		}
		let uuidMap: Record<string, string> = {};
		try {
			uuidMap = await this.uuidMapStore.read();
		} catch {
			new Notice(
				'No UUID map found. Make sure you have imported entries first.'
			);
			return;
		}
		const folder = this.app.vault.getAbstractFileByPath(
			this.settings.outDirectory
		);
		if (!folder || !(folder instanceof TFolder)) {
			new Notice('Output directory does not exist.');
			return;
		}
		const notes = folder.children.filter(
			(f) => f instanceof TFile && f.extension === 'md'
		) as TFile[];

		let totalResolvedLinks = 0;
		let totalLinks = 0;
		let updatedNotes = 0;

		for (const note of notes) {
			const content = await this.app.vault.cachedRead(note);
			const result = resolveInternalLinks(content, uuidMap);

			if (result.text !== content) {
				await this.app.vault.modify(note, result.text);
				updatedNotes++;
			}

			totalResolvedLinks += result.resolvedCount;
			totalLinks += result.totalCount;
		}

		if (totalLinks === 0) {
			new Notice(
				`Scanned ${notes.length} notes in "${this.settings.outDirectory}" — no Day One internal links found.`
			);
		} else if (totalResolvedLinks === 0) {
			new Notice(
				`Found ${totalLinks} Day One links in ${notes.length} notes, but none could be resolved. The linked entries may not have been imported yet — try importing all journals first, then resolve again.`
			);
		} else {
			new Notice(
				`Resolved ${totalResolvedLinks} of ${totalLinks} links across ${updatedNotes} notes.` +
					(totalResolvedLinks < totalLinks
						? ` ${totalLinks - totalResolvedLinks} links could not be resolved (target entries not imported).`
						: '')
			);
		}
	}

	async handleImportResult(res: ImportResult) {
		new Notice(
			`Import results:\n` +
				`Successful: ${res.successCount}\nFailed: ${res.failures.length}\nInvalid: ${res.invalidEntries.length}\nIgnored: ${res.ignoreCount}`
		);

		res.failures.forEach((failure) => {
			if (failure.entry) {
				new Notice(
					`Entry ${failure.entry.uuid} failed to import. ${failure.reason}`
				);
			} else {
				new Notice(
					`A file or directory-related failure occurred during import: ${failure.reason}`
				);
			}
		});

		let errorFileContent: string = '';

		if (res.invalidEntries.length > 0) {
			errorFileContent += res.invalidEntries
				.map((invalidEntry) => {
					const entryId = invalidEntry.entryId || 'N/A';
					const creationDate = invalidEntry.creationDate
						? DateTime.fromISO(invalidEntry.creationDate).toFormat(
								'yyyy-MM-dd HH:mm:ss'
							)
						: 'N/A';
					return `- ${entryId} - ${creationDate}\n  - ${JSON.stringify(invalidEntry.reason)}`;
				})
				.join('\n');
		}

		if (res.failures.length > 0) {
			errorFileContent += res.failures
				.filter((failure) => failure.entry)
				.map((failure) => {
					const uuid = failure.entry?.uuid || 'N/A';
					const creationDate = failure.entry?.creationDate
						? DateTime.fromISO(failure.entry.creationDate).toFormat(
								'yyyy-MM-dd HH:mm:ss'
							)
						: 'N/A';
					return `- ${uuid} - ${creationDate}\n  - ${failure.reason}`;
				})
				.join('\n');
		}

		if (errorFileContent.length > 0) {
			await this.app.vault.create(
				`${this.settings.outDirectory}/Failed Imports ${Date.now()}.md`,
				errorFileContent
			);
		}
	}
}
