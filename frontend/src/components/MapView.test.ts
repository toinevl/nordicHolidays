import { beforeEach, describe, expect, it, vi } from 'vitest'

// Hoisted so the vi.mock factory (hoisted itself) can reference them.
const maplibreStubs = vi.hoisted(() => {
  const mapStub = {
    getCanvas: () => ({ addEventListener: () => {}, getContext: () => ({}) }),
    on: () => {},
    once: () => {},
    addSource: () => {},
    addLayer: () => {},
    getLayer: () => null,
    getSource: () => null,
    removeSource: () => {},
    removeLayer: () => {},
    setPaintProperty: () => {},
    flyTo: () => {},
    remove: () => {},
    isSourceLoaded: () => false,
  }
  return {
    mapStub,
    Map: class {
      constructor(_opts: unknown) {
        void _opts
        Object.assign(this, mapStub)
      }
    },
    Marker: class {
      private el: HTMLElement
      constructor(opts: { element: HTMLElement }) {
        this.el = opts.element
      }
      setLngLat() { return this }
      addTo() {
        // Mirror the real Marker: the element becomes a DOM overlay inside the
        // map container.
        document.getElementById('map-test')?.appendChild(this.el)
        return this
      }
    },
  }
})

/**
 * Create a mock WebGLRenderingContext that reports OES_texture_float
 * availability. Used to simulate different browser WebGL capabilities.
 */
function createMockWebGLContext(hasFloatExtension = true): WebGLRenderingContext {
  const ext = hasFloatExtension
    ? { } // fake extension object
    : null
  return {
    getExtension: (name: string) => (name.includes('OES_texture_float') ? ext : null),
    // stub out other required WebGL methods
    getContextAttributes: () => ({}),
    isContextLost: () => false,
    getBufferParameter: () => 0,
    getError: () => 0,
    getUniform: () => null,
    getUniformLocation: () => null,
    getVertexAttrib: () => null,
    getVertexAttribOffset: () => 0,
    uniform1f: () => {},
    uniform2f: () => {},
    uniform3f: () => {},
    uniform4f: () => {},
    uniformMatrix4fv: () => {},
    enable: () => {},
    disable: () => {},
    clear: () => {},
    drawArrays: () => {},
    drawElements: () => {},
    createShader: () => null,
    shaderSource: () => {},
    compileShader: () => {},
    createProgram: () => null,
    attachShader: () => {},
    linkProgram: () => {},
    useProgram: () => {},
    createBuffer: () => null,
    bindBuffer: () => {},
    bufferData: () => {},
    createTexture: () => null,
    bindTexture: () => {},
    texImage2D: () => {},
    texParameteri: () => {},
    activeTexture: () => {},
    viewport: () => {},
    scissor: () => {},
    blendFunc: () => {},
    depthFunc: () => {},
    stencilFunc: () => {},
    colorMask: () => {},
    cullFace: () => {},
    frontFace: () => {},
    polygonOffset: () => {},
    pixelStorei: () => {},
    generateMipmap: () => {},
    framebufferTexture2D: () => {},
    bindFramebuffer: () => {},
    checkFramebufferStatus: () => 0,
    createFramebuffer: () => null,
    createRenderbuffer: () => null,
    bindRenderbuffer: () => {},
    renderbufferStorage: () => {},
    getFramebufferAttachmentParameter: () => null,
    getTexLevelParameter: () => 0,
    getTexParameter: () => 0,
    getShaderParameter: () => false,
    getShaderInfoLog: () => '',
    getProgramInfoLog: () => '',
    getAttachedShader: () => null,
    detachShader: () => {},
    deleteShader: () => {},
    deleteProgram: () => {},
    deleteTexture: () => {},
    deleteBuffer: () => {},
    deleteFramebuffer: () => {},
    deleteRenderbuffer: () => {},
    finish: () => {},
    flush: () => {},
  } as unknown as WebGLRenderingContext
}

function createMockWebGL2Context(hasFloatExtension = true): WebGL2RenderingContext {
  const gl = createMockWebGLContext(hasFloatExtension) as unknown as WebGL2RenderingContext
  // WebGL2-specific stubs
  gl.getInternalformativ = () => {}
  gl.getBufferSubData = () => new Uint8Array(0)
  gl.getUniformIndices = () => []
  gl.getActiveUniforms = () => []
  gl.getActiveUniformBlockParameter = () => 0
  gl.getUniformBlockIndex = () => 0
  gl.uniformBlockBinding = () => {}
  gl.drawArraysInstanced = () => {}
  gl.drawElementsInstanced = () => {}
  gl.vertexAttribDivisor = () => {}
  gl.bindVertexArray = () => {}
  gl.createVertexArray = () => null
  gl.deleteVertexArray = () => {}
  return gl
}

// Intercepts BOTH the static type import and the dynamic `import('maplibre-gl')`
// inside MapView.ts — the smoke test below proves the lazy path resolves.
vi.mock('maplibre-gl', () => ({
  default: { Map: maplibreStubs.Map, Marker: maplibreStubs.Marker },
  Map: maplibreStubs.Map,
  Marker: maplibreStubs.Marker,
}))

import { MapView } from './MapView'

/**
 * #24 (part 2) dynamic-import smoke: MapView used to pull maplibre-gl in
 * statically at module load; it now must keep working with the library behind
 * `await import()` — construction stays synchronous, init resolves, and the
 * map is actually created (no fallback message).
 */
describe('MapView dynamic import (#24)', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="map-test"></div>'
    vi.restoreAllMocks()
  })

  it('creates the map via the lazily imported module (whenReady resolves true)', async () => {
    // jsdom has no WebGL — make isWebGLAvailable() pass so the import path runs.
    // Provide a mock context that reports OES_texture_float available so the
    // enhanced isWebGLAvailable() returns true and the lazy import path runs.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(createMockWebGLContext(true) as RenderingContext)
    const view = new MapView('map-test', () => {})
    const ok = await view.whenReady()
    expect(ok).toBe(true)
    // Map instance created from the mocked module — no fallback message.
    expect(document.querySelector('#map-test .map-message')).toBeNull()
    expect(document.querySelector('#map-test .map-legend')).not.toBeNull()
    view.teardown()
  })

  it('shows the visible fallback and resolves false when WebGL is unavailable (chunk never needed)', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    const view = new MapView('map-test', () => {})
    const ok = await view.whenReady()
    expect(ok).toBe(false)
    expect(document.querySelector('#map-test .map-message')).not.toBeNull()
    view.teardown()
  })

  it('shows fallback when WebGL context lacks OES_texture_float (Firefox false-positive)', async () => {
    // Simulate Firefox: getContext("webgl2") returns a context, but it lacks
    // OES_texture_float, so isWebGLAvailable() should return false and fallback
    // should trigger. We mock the canvas getContext to return a context without
    // the float extension.
    const mockCtx = createMockWebGLContext(/*hasFloatExtension=*/ false)
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(mockCtx)
    const view = new MapView('map-test', () => {})
    const ok = await view.whenReady()
    expect(ok).toBe(false)
    // Fallback should be visible because WebGL is effectively unavailable.
    expect(document.querySelector('#map-test .map-message')).not.toBeNull()
    view.teardown()
  })

  it('shows fallback when WebGL2 context lacks OES_texture_float', async () => {
    // Same test for WebGL2 explicitly — Firefox may report WebGL2 but without
    // the required extension.
    const mockCtx2 = createMockWebGL2Context(/*hasFloatExtension=*/ false)
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(mockCtx2)
    const view = new MapView('map-test', () => {})
    const ok = await view.whenReady()
    expect(ok).toBe(false)
    expect(document.querySelector('#map-test .map-message')).not.toBeNull()
    view.teardown()
  })

  it('creates the map via the lazily imported module when WebGL has float extension', async () => {
    // When OES_texture_float IS available (normal desktop Chrome/Edge), the import
    // path should proceed normally.
    const mockCtx = createMockWebGLContext(/*hasFloatExtension=*/ true)
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(mockCtx)
    const view = new MapView('map-test', () => {})
    const ok = await view.whenReady()
    expect(ok).toBe(true)
    expect(document.querySelector('#map-test .map-message')).toBeNull()
    expect(document.querySelector('#map-test .map-legend')).not.toBeNull()
    view.teardown()
  })

  it('replaceStops before the chunk arrives still renders markers once init settles', async () => {
    // Provide a mock context that reports OES_texture_float available so the
    // enhanced isWebGLAvailable() returns true and the lazy import path runs.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(createMockWebGLContext(true) as RenderingContext)
    const view = new MapView('map-test', () => {})
    // Stops feed in BEFORE the async init completes (the #map-page deep-link race).
    view.replaceStops([{
      id: 1, days: '1', dates: '', dest: 'Västra Götaland', region: 'Västra Götaland',
      coords: [11.97, 57.71], tags: [], nights: 2, desc: '', highlights: [],
      from: '', km: 0, time: '', zoom: 12, pitch: 45, bearing: 0,
    }])
    const ok = await view.whenReady()
    expect(ok).toBe(true)
    // Marker is a DOM overlay — it must exist after init replays the stops.
    expect(document.querySelector('#map-test .map-marker')).not.toBeNull()
    view.teardown()
  })
})
