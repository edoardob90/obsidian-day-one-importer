import { FileManager, TFile } from 'obsidian';
import { DayOneImporterSettings } from './main';
import { DayOneItem } from './schema';
import { formatDateWithOffset, formatLocation, formatWeather } from './utils';

export async function writeTargetFrontMatter(
	file: TFile,
	item: DayOneItem,
	settings: DayOneImporterSettings,
	fileManager: FileManager,
	journalTag: string,
	inlineTags: string[]
) {
	await fileManager.processFrontMatter(file, (frontMatter) => {
		// date: ISO with timezone offset
		frontMatter['date'] = formatDateWithOffset(
			item.creationDate,
			item.timeZone
		);

		// modified: only if different from creationDate
		if (item.modifiedDate !== item.creationDate) {
			frontMatter['modified'] = formatDateWithOffset(
				item.modifiedDate,
				item.timeZone
			);
		}

		// coordinates
		if (
			item.location?.latitude !== undefined &&
			item.location?.longitude !== undefined
		) {
			if (settings.separateCoordinateFields) {
				frontMatter['coordinates'] = [
					String(item.location.latitude),
					String(item.location.longitude),
				];
			} else {
				frontMatter['coordinates'] =
					`${item.location.latitude},${item.location.longitude}`;
			}
		}

		// location: human-readable string
		const loc = formatLocation(item.location);
		if (loc) {
			frontMatter['location'] = loc;
		}

		// weather
		const weather = formatWeather(item.weather);
		if (weather) {
			frontMatter['weather'] = weather;
		}

		// favorite (replaces "starred")
		frontMatter['favorite'] = item.starred ?? false;

		// uuid
		frontMatter['uuid'] = item.uuid;

		// tags: merge journal tag + Day One tags + inline tags, deduplicated and sorted
		const allTags = new Set<string>();
		allTags.add(journalTag);
		if (item.tags) {
			item.tags.forEach((t) => allTags.add(t));
		}
		inlineTags.forEach((t) => allTags.add(t));
		frontMatter['tags'] = Array.from(allTags).sort();
	});
}
