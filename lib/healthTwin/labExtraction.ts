export interface LabParameterInsertRow {
    twin_id: string;
    source_id: string;
    parameter_name: string;
    parameter_value: number;
    unit: string;
    recorded_at: string;
}

export class LabExtractionError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'LabExtractionError';
    }
}

function parseJsonResponse(raw: unknown): unknown {
    if (typeof raw !== 'string') return raw;

    try {
        return JSON.parse(raw);
    } catch {
        throw new LabExtractionError('Lab report extraction returned malformed JSON.');
    }
}

/**
 * Normalizes the response shapes currently returned by the lab-processing
 * workflow while preserving support for a bare array of biomarker objects.
 */
export function extractLabParameterCandidates(raw: unknown): unknown[] {
    const parsed = parseJsonResponse(raw);
    if (parsed === null || parsed === undefined) {
        throw new LabExtractionError('Lab report extraction returned no data.');
    }

    // n8n commonly returns a one-item wrapper array. If the array is instead
    // the biomarker list itself, the fallback below returns the full array.
    let current: unknown = Array.isArray(parsed) ? parsed[0] : parsed;

    for (let depth = 0; depth < 10; depth += 1) {
        if (!current || typeof current !== 'object' || Array.isArray(current)) break;

        const record = current as Record<string, unknown>;
        if (Object.prototype.hasOwnProperty.call(record, 'parameters')) {
            if (!Array.isArray(record.parameters)) {
                throw new LabExtractionError('Lab report extraction returned a malformed parameters field.');
            }
            return record.parameters;
        }

        if (Object.prototype.hasOwnProperty.call(record, 'body')) {
            current = record.body;
            continue;
        }

        if (Object.prototype.hasOwnProperty.call(record, 'output')) {
            current = record.output;
            continue;
        }

        break;
    }

    if (Array.isArray(current)) return current;
    if (Array.isArray(parsed)) return parsed;

    throw new LabExtractionError('Lab report extraction did not contain a parameters array.');
}

export function parseLabNumericValue(value: unknown, parameterName: string): number {
    if (typeof value === 'number') {
        if (Number.isFinite(value)) return value;
        throw new LabExtractionError(`Biomarker "${parameterName}" has an invalid numeric value.`);
    }

    if (typeof value !== 'string') {
        throw new LabExtractionError(`Biomarker "${parameterName}" has an invalid numeric value.`);
    }

    const trimmed = value.trim();
    const commaFormatIsValid = !trimmed.includes(',')
        || /^[+-]?(?:\d{1,3}(?:,\d{3})+)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(trimmed);
    const normalized = trimmed.replace(/,/g, '');
    const isNumeric = commaFormatIsValid
        && /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(normalized);
    const parsed = isNumeric ? Number(normalized) : Number.NaN;

    if (!Number.isFinite(parsed)) {
        throw new LabExtractionError(`Biomarker "${parameterName}" has an invalid numeric value.`);
    }

    return parsed;
}

export function parseLabRecordedAt(value: unknown, fallbackDate: Date): string {
    if (typeof value !== 'string' || !value.trim()) return fallbackDate.toISOString();

    let normalized = value.trim();
    const dmyMatch = normalized.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
    if (dmyMatch) {
        const day = dmyMatch[1].padStart(2, '0');
        const month = dmyMatch[2].padStart(2, '0');
        normalized = `${dmyMatch[3]}-${month}-${day}`;
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
        normalized = `${normalized}T00:00:00.000Z`;
    }

    const timestamp = Date.parse(normalized);
    return Number.isNaN(timestamp) ? fallbackDate.toISOString() : new Date(timestamp).toISOString();
}

export function normalizeLabParameterRows(
    raw: unknown,
    context: { twinId: string; sourceId: string },
    fallbackDate = new Date(),
): LabParameterInsertRow[] {
    const candidates = extractLabParameterCandidates(raw);
    if (candidates.length === 0) {
        throw new LabExtractionError('Lab report extraction returned no biomarkers.');
    }

    return candidates.map((candidate, index) => {
        if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
            throw new LabExtractionError(`Lab report extraction returned a malformed biomarker at position ${index + 1}.`);
        }

        const parameter = candidate as Record<string, unknown>;
        const parameterName = typeof parameter.parameter_name === 'string'
            ? parameter.parameter_name.trim()
            : '';
        if (!parameterName) {
            throw new LabExtractionError(`Lab report extraction returned a biomarker without a name at position ${index + 1}.`);
        }

        return {
            twin_id: context.twinId,
            source_id: context.sourceId,
            parameter_name: parameterName,
            parameter_value: parseLabNumericValue(parameter.parameter_value, parameterName),
            unit: typeof parameter.unit === 'string' ? parameter.unit : '',
            recorded_at: parseLabRecordedAt(parameter.recorded_at, fallbackDate),
        };
    });
}
