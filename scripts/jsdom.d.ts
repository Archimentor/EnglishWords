declare module 'jsdom' {
  export interface JSDOMOptions {
    url?: string
    runScripts?: 'dangerously' | 'outside-only'
    pretendToBeVisual?: boolean
    virtualConsole?: VirtualConsole
    beforeParse?: (window: Window & typeof globalThis) => void
  }

  export class VirtualConsole {
    on(event: 'jsdomError', listener: (error: Error) => void): this
  }

  export class JSDOM {
    constructor(input?: string, options?: JSDOMOptions)
    readonly window: Window & typeof globalThis
  }
}
