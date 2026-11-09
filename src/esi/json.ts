import JSONbig from "json-bigint";

const parser = JSONbig({ storeAsString: true, strict: true });

export function parseEsiJson<T>(rawBody: string): T {
  return parser.parse(rawBody) as T;
}
