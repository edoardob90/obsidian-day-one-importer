import {
	AbstractInputSuggest,
	App,
	normalizePath,
	Notice,
	PluginSettingTab,
	Setting,
	TFolder,
	sanitizeHTMLToDom,
} from 'obsidian';
import DayOneImporter from './main';
import { TagStyle } from './main';
import { isIllegalFileName, ILLEGAL_FILENAME_CHARACTERS } from './utils';

const ILLEGAL_FILENAME_CHARACTERS_FOR_NOTICE = [...ILLEGAL_FILENAME_CHARACTERS];

class FolderSuggest extends AbstractInputSuggest<TFolder> {
	private onSelectFolder: ((value: string) => void) | null = null;

	setOnSelect(cb: (value: string) => void): this {
		this.onSelectFolder = cb;
		return this;
	}

	getSuggestions(query: string): TFolder[] {
		const folders: TFolder[] = [];
		const collect = (folder: TFolder) => {
			if (
				folder.path &&
				folder.path.toLowerCase().contains(query.toLowerCase())
			) {
				folders.push(folder);
			}
			for (const child of folder.children) {
				if (child instanceof TFolder) {
					collect(child);
				}
			}
		};
		collect(this.app.vault.getRoot());
		return folders;
	}

	renderSuggestion(folder: TFolder, el: HTMLElement): void {
		el.setText(folder.path || '/');
	}

	selectSuggestion(folder: TFolder): void {
		this.setValue(folder.path);
		if (this.onSelectFolder) {
			this.onSelectFolder(folder.path);
		}
		this.close();
	}
}

export class SettingsTab extends PluginSettingTab {
	plugin: DayOneImporter;

	constructor(app: App, plugin: DayOneImporter) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Day One import folder')
			.setDesc(
				`Root folder containing Day One exports. The plugin searches recursively for JSON files in all subfolders. You can extract one or more Day One zip exports here — assets (photos, videos, etc.) are left in place and referenced by Obsidian automatically.`
			)
			.addText((text) => {
				const save = async (value: string) => {
					this.plugin.settings.inDirectory = value.trim().replace(/\/$/, '');
					await this.plugin.saveSettings();
				};
				new FolderSuggest(this.app, text.inputEl).setOnSelect(save);
				text
					.setPlaceholder('Example: folder1/folder2')
					.setValue(this.plugin.settings.inDirectory)
					.onChange(save);
			});

		new Setting(containerEl)
			.setName('File pattern (regex)')
			.setDesc(
				'Filter which JSON files to process by filename (not path). Uses a regular expression matched against each file name. Leave empty to process all JSON files found.'
			)
			.addText((text) =>
				text
					.setPlaceholder('e.g. Journal\\.json')
					.setValue(this.plugin.settings.filePattern || '')
					.onChange(async (value) => {
						this.plugin.settings.filePattern = value.trim();
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('Pattern mode')
			.setDesc(
				'Include: only import files matching the pattern. Exclude: skip files matching the pattern.'
			)
			.addDropdown((dropdown) =>
				dropdown
					.addOption('include', 'Include matching')
					.addOption('exclude', 'Exclude matching')
					.setValue(this.plugin.settings.filePatternMode)
					.onChange(async (value) => {
						this.plugin.settings.filePatternMode = value as
							| 'include'
							| 'exclude';
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('Out directory')
			.setDesc(
				'Directory to create imported files in. Can be an existing folder or a new path — it will be created automatically during import.'
			)
			.addText((text) => {
				const save = async (value: string) => {
					this.plugin.settings.outDirectory = normalizePath(value);
					await this.plugin.saveSettings();
				};
				new FolderSuggest(this.app, text.inputEl).setOnSelect(save);
				text
					.setPlaceholder('day-one-out')
					.setValue(this.plugin.settings.outDirectory)
					.onChange(save);
			});

		new Setting(containerEl)
			.setName('Ignore existing files')
			.setDesc(
				'If disabled then conflicting file names will be logged as failures, otherwise they will be ignored.'
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.ignoreExistingFiles)
					.onChange(async (value) => {
						this.plugin.settings.ignoreExistingFiles = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('Internal links')
			.setDesc(
				'Enable/disable replacing Day One internal links (dayone://view?entryId=UUID) with Obsidian links.'
			)
			.setHeading();

		new Setting(containerEl)
			.setName('Enable internal links resolving')
			.setDesc(
				'When enabled, Day One internal links will be resolved during import. Use the "Resolve internal links" command to resolve links in already-imported notes.'
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enableInternalLinks)
					.onChange(async (value) => {
						this.plugin.settings.enableInternalLinks = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl).setName('File name').setHeading();

		new Setting(containerEl)
			.setName('Date-based file names (may cause collisions)')
			.setDesc(
				sanitizeHTMLToDom(
					`Use entry's creation date as the file name. This may cause collisions and files to be overwritten if two entries have the same creation date/time.
				If this option is disabled then the entry's UUID will be used as the file name. This guarantees no collisions.
				Uses Luxon date formatting tokens (<a href='https://moment.github.io/luxon/#/formatting?id=table-of-tokens'>reference table</a>).`
				)
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.dateBasedFileNames)
					.onChange(async (value) => {
						this.plugin.settings.dateBasedFileNames = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('Date-based file name format')
			.addMomentFormat((timeFormat) =>
				timeFormat
					.setValue(this.plugin.settings.dateBasedFileNameFormat.toString())
					.setPlaceholder('yyyy-MM-dd HH:mm:ss')
					.onChange(async (value) => {
						if (value !== '') {
							if (isIllegalFileName(value)) {
								new Notice(
									`File name cannot contain any of the following characters: ${ILLEGAL_FILENAME_CHARACTERS_FOR_NOTICE.join('')} or unpaired square brackets`
								);
							} else {
								this.plugin.settings.dateBasedFileNameFormat =
									normalizePath(value);
								await this.plugin.saveSettings();
							}
						}
					})
			);

		new Setting(containerEl)
			.setName('Date-based file name format (all day entries)')
			.addMomentFormat((timeFormat) =>
				timeFormat
					.setValue(
						this.plugin.settings.dateBasedAllDayFileNameFormat.toString()
					)
					.setPlaceholder('yyyy-MM-dd')
					.onChange(async (value) => {
						if (value !== '') {
							if (isIllegalFileName(value)) {
								new Notice(
									`File name cannot contain any of the following characters: ${ILLEGAL_FILENAME_CHARACTERS_FOR_NOTICE.join('')} or unpaired square brackets`
								);
							} else {
								this.plugin.settings.dateBasedAllDayFileNameFormat =
									normalizePath(value);
								await this.plugin.saveSettings();
							}
						}
					})
			);

		new Setting(containerEl).setName('Frontmatter').setHeading();

		new Setting(containerEl)
			.setName('Separate coordinate fields')
			.setDesc(
				'If enabled then latitude and longitude will be stored in separate fields in the frontmatter, otherwise they will be combined into a single field.'
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.separateCoordinateFields)
					.onChange(async (value) => {
						this.plugin.settings.separateCoordinateFields = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('Tag style')
			.setDesc(
				`Obsidian doesn't support tags with spaces. 
				You can choose the tag style for tags in frontmatter. 
				If you leave them as-is, you might end up with multi-word tags split into separate tags.`
			)
			.addDropdown((dropdown) =>
				dropdown
					.addOption('', 'Leave as-is')
					.addOption('camelCase', 'camelCase')
					.addOption('PascalCase', 'PascalCase')
					.addOption('snake_case', 'snake_case')
					.addOption('kebab-case', 'kebab-case')
					.setValue(this.plugin.settings.tagStyle ?? '')
					.onChange(async (value) => {
						this.plugin.settings.tagStyle =
							value === '' ? undefined : (value as TagStyle);
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl).setName('Journal tag').setHeading();

		new Setting(containerEl)
			.setName('Journal tag prefix')
			.setDesc(
				'Prefix for the auto-generated journal tag (e.g. "journal/" produces "journal/my-journal/2025/09"). Leave empty for no prefix.'
			)
			.addText((text) =>
				text
					.setPlaceholder('')
					.setValue(this.plugin.settings.journalTagPrefix)
					.onChange(async (value) => {
						this.plugin.settings.journalTagPrefix = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl).setName('Normalize').setHeading();

		new Setting(containerEl)
			.setName('Normalize scan folder')
			.setDesc(
				'Folder to scan when running "Normalize entries" command. Leave empty to scan the entire vault.'
			)
			.addText((text) => {
				const save = async (value: string) => {
					this.plugin.settings.normalizeScanFolder = value.trim();
					await this.plugin.saveSettings();
				};
				new FolderSuggest(this.app, text.inputEl).setOnSelect(save);
				text
					.setPlaceholder('e.g. _migrate')
					.setValue(this.plugin.settings.normalizeScanFolder)
					.onChange(save);
			});

		new Setting(containerEl)
			.setName('When a migrated file matches an imported entry')
			.setDesc(
				'If a file in the scan folder has a UUID that was already imported, choose which version to keep.'
			)
			.addDropdown((dropdown) =>
				dropdown
					.addOption('keep-migrated', 'Keep migrated (may have edits)')
					.addOption('keep-imported', 'Keep imported (raw Day One)')
					.setValue(this.plugin.settings.normalizeConflictResolution)
					.onChange(async (value) => {
						this.plugin.settings.normalizeConflictResolution = value as
							| 'keep-migrated'
							| 'keep-imported';
						await this.plugin.saveSettings();
					})
			);
	}
}
