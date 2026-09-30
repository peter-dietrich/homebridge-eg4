import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { EG4Client } from '../eg4/client.js';
import { discoverEG4 } from '../eg4/discovery.js';
import { sanitizeForSharing } from '../eg4/sanitize.js';
import { DEFAULT_BASE_URL } from '../settings.js';

const username = process.env.EG4_USERNAME;
const password = process.env.EG4_PASSWORD;
const baseUrl = process.env.EG4_BASE_URL ?? DEFAULT_BASE_URL;
const output = process.env.EG4_DISCOVERY_OUTPUT ?? 'eg4-discovery-sanitized.json';

if (!username || !password) {
  console.error(
    [
      'Missing EG4 credentials.',
      '',
      'Copy .env.example to .env and set:',
      '  EG4_USERNAME=...',
      '  EG4_PASSWORD=...',
      '',
      'Then run:',
      '  npm run discover',
    ].join('\n'),
  );
  process.exitCode = 1;
} else {
  try {
    const client = new EG4Client({
      username,
      password,
      baseUrl,
      debug: (message) => {
        if (process.env.EG4_DEBUG === '1') {
          console.log(`[debug] ${message}`);
        }
      },
    });

    const discovery = await discoverEG4(client);
    const sanitized = sanitizeForSharing(discovery);
    const outputPath = resolve(process.cwd(), output);

    await writeFile(
      outputPath,
      `${JSON.stringify(sanitized, null, 2)}\n`,
      'utf8',
    );

    console.log('');
    console.log('Discovery complete.');
    console.log(`Sanitized report written to: ${outputPath}`);
    console.log('');
    console.log('The report masks serial numbers and common personal fields.');
    console.log('Review it before sharing anyway; this is development software.');
  } catch (error) {
    console.error('');
    console.error(
      `Discovery failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  }
}
