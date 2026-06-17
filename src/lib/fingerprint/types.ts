declare const brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [brand]: B };

export type Salt = Brand<string, 'Salt'>;
export type Fingerprint = Brand<string, 'Fingerprint'>;
