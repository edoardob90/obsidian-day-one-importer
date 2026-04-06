import { Notice, TFile, TFolder, Vault } from 'obsidian';
import { DayOneImporterSettings } from './main';
import { UuidMapStore } from './uuid-map';
import { resolveInternalLinks } from './utils';

export async function resolveInternalLinksInNotes(
	vault: Vault,
	settings: DayOneImporterSettings,
	uuidMapStore: UuidMapStore
): Promise<void> {
	let uuidMap: Record<string, string> = {};
	try {
		uuidMap = await uuidMapStore.read();
	} catch (e) {
		new Notice(
			'No UUID map found. Make sure you have imported with internal links enabled.'
		);
		return;
	}

	if (Object.keys(uuidMap).length === 0) {
		new Notice(
			'UUID map is empty. Make sure you have imported with internal links enabled.'
		);
		return;
	}

	const folder = vault.getAbstractFileByPath(settings.outDirectory);
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
		const content = await vault.cachedRead(note);
		const result = resolveInternalLinks(content, uuidMap);

		if (result.text !== content) {
			await vault.modify(note, result.text);
			updatedNotes++;
		}

		totalResolvedLinks += result.resolvedCount;
		totalLinks += result.totalCount;
	}

	if (totalLinks > 0) {
		new Notice(
			`Resolved ${totalResolvedLinks} out of ${totalLinks} internal links across ${updatedNotes} notes.`
		);
	} else {
		new Notice('No Day One internal links found in any notes.');
	}
}
