import { homedir } from 'os';

/**
 * Expands a leading `~` to the user's home directory.
 *
 * Only a tilde at the very start of the path, followed by a separator or the
 * end of the string, is treated as a home reference. A tilde anywhere else is
 * left alone: on Windows an ordinary absolute path routinely contains one, as
 * 8.3 short names look like `C:\Users\BRENDA~1\AppData\Local\Temp`. Replacing
 * that tilde turns a valid path into nonsense.
 *
 * Both separators are accepted, so `~/key.json` and `~\key.json` behave the
 * same way for anyone typing a Windows-style path.
 */
export function expandHome(path: string): string {
    return path.replace(/^~(?=$|[\\/])/, homedir());
}
