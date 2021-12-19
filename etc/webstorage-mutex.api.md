## API Report File for "webstorage-mutex"

> Do not edit this file. It is a report generated by [API Extractor](https://api-extractor.com/).

```ts

// @public
export function mutex<R>(callback: () => R, options?: MutexOptions): Promise<R>;

// @public (undocumented)
export interface MutexOptions {
    delayTime: number;
    // (undocumented)
    lockPrefix: string;
    // (undocumented)
    repeatInterval: number;
    // (undocumented)
    repeatTimeout: number;
}

```