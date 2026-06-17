export type SecretType = 'known-key' | 'private-key' | 'env-credential' | 'pii';

export interface Detection {
  type: SecretType;
  label: string;
  match: string;
  start: number; // inclusive index into source text
  end: number; // exclusive index into source text
}
