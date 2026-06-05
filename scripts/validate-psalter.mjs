// Validate psalter.json against psalter.schema.json using Ajv.
// Exits non-zero on validation failure.
import { readFileSync } from 'node:fs';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const schema = JSON.parse(readFileSync(new URL('../psalter.schema.json', import.meta.url), 'utf8'));
const data   = JSON.parse(readFileSync(new URL('../psalter.json',        import.meta.url), 'utf8'));

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(schema);

if (!validate(data)) {
    for (const err of validate.errors ?? []) {
        console.error(`${err.instancePath || '/'} ${err.message}`);
    }
    console.error(`\nFAILED: ${validate.errors?.length ?? 0} schema error(s).`);
    process.exit(1);
}

console.log(`OK: ${data.settings.length} settings validated.`);
