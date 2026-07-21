import { config, isDemoMode } from '../config';
import { demoDirectory } from '../demo';
import type { ContactsDirectory, DirectoryPerson, UserProfile } from '../types';


export async function fetchContactsDirectory(
  profile: UserProfile,
): Promise<ContactsDirectory> {
  if (isDemoMode()) return demoDirectory(profile);

  const res = await fetch(`${config.apiBaseUrl}/contacts?id=${encodeURIComponent(profile.id)}`);
  if (!res.ok) throw new Error(`Contacts API error: ${res.status}`);
  return res.json();
}

/** Flattens every person in the directory into an id → name lookup. */
export function buildNameMap(directory: ContactsDirectory): Record<string, string> {
  const map: Record<string, string> = {};
  const add = (p: DirectoryPerson) => {
    map[p.id] = p.name;
  };
  directory.people?.forEach(add);
  directory.groups?.forEach((g) => g.members.forEach(add));
  directory.maintainers?.forEach(add);
  directory.roommates?.forEach(add);
  return map;
}
